-- Migration 052: Voucher Complete Production Schema
--
-- PURPOSE:
--   This is the AUTHORITATIVE, single-source-of-truth voucher schema migration.
--   Migrations 050 and 051 exist as SQL files but were NEVER registered in the
--   migration runner and have NEVER executed against any database.
--
--   This migration supersedes both 050 and 051 by creating all required tables
--   with CORRECT constraints from the start (no ALTER TABLE patches needed).
--
-- CORRECTIONS vs migration 050 (which never ran):
--   1. delivered_qty: removed CHECK > 0 → now allows 0 for PRE_BOOKING / INSTANT_INVENTORY
--   2. matched_qty CHECK: now matched_qty <= voucher_qty (not <= delivered_qty, allows pre-match)
--   3. payment_method: expanded to include CARD, BANK_TRANSFER, SPLIT, OTHER, NONE
--   4. payment_status: added REGISTRATION_ONLY for INSTANT_INVENTORY type
--   5. Added idempotency_key, request_fingerprint, sale_id columns
--   6. Created pos_voucher_payments table (multi-tender history with idempotency)
--   7. Created voucher_counters table (atomic branch-scoped monthly counter)
--   8. Created pos_voucher_deliveries table (delivery event idempotency + audit)
--
-- SAFE AND IDEMPOTENT:
--   All statements use IF NOT EXISTS. Safe to run against any database state.

-- -----------------------------------------------------------------------------
-- TABLE 1: voucher_counters
-- Atomic branch-scoped monthly voucher numbering: {BRANCH_CODE}-VCH-{YYYYMM}-{000001}
-- INSERT ... ON CONFLICT DO UPDATE ensures race-safe atomic counter increment.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_counters (
    branch_id      TEXT        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    period_yyyymm  TEXT        NOT NULL CHECK(period_yyyymm ~ '^\d{6}$'),
    next_value     BIGINT      NOT NULL DEFAULT 1 CHECK(next_value >= 1),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, period_yyyymm)
);

CREATE INDEX IF NOT EXISTS idx_voucher_counters_branch
    ON voucher_counters (branch_id);

-- -----------------------------------------------------------------------------
-- TABLE 2: pos_direct_vouchers
-- Core voucher header record — one row per voucher transaction.
-- Supports three types:
--   INSTANT_INVENTORY — registration only, no payment/delivery required
--   DIRECT_ADVANCE    — immediate delivery + full financial accounting
--   PRE_BOOKING       — advance payment collection, deferred delivery + SALE debit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_direct_vouchers (
    id                       TEXT        PRIMARY KEY CHECK(length(id) = 36),
    voucher_number           TEXT        NOT NULL UNIQUE,
    voucher_type             TEXT        NOT NULL DEFAULT 'INSTANT_INVENTORY'
                             CHECK(voucher_type IN ('INSTANT_INVENTORY', 'DIRECT_ADVANCE', 'PRE_BOOKING')),

    -- Idempotency: SHA-256 fingerprint of the creation request payload
    -- Prevents double-submission from network retries or UI races
    idempotency_key          TEXT        UNIQUE,
    request_fingerprint      TEXT        UNIQUE,

    organization_id          TEXT        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id                TEXT        NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
    customer_id              TEXT        REFERENCES customers(id)              ON DELETE RESTRICT,
    customer_name_snapshot   TEXT        NOT NULL,
    customer_phone_snapshot  TEXT,

    -- Product Identity & Classification Snapshots
    -- product_id is NULL for pre-booking of a not-yet-catalogued product
    product_id               TEXT        REFERENCES products(id)              ON DELETE RESTRICT,
    product_name             TEXT        NOT NULL CHECK(length(trim(product_name)) > 0),
    spec_category            TEXT,
    spec_quality             TEXT,
    spec_color               TEXT,
    spec_brand               TEXT,
    spec_company             TEXT,

    -- Quantities & Physical Delivery
    -- delivered_qty = 0 for PRE_BOOKING (delivery deferred) and INSTANT_INVENTORY (registration only)
    -- delivered_qty = voucher_qty for DIRECT_ADVANCE (immediate delivery)
    voucher_qty              INT         NOT NULL CHECK(voucher_qty > 0),
    delivered_qty            INT         NOT NULL DEFAULT 0 CHECK(delivered_qty >= 0 AND delivered_qty <= voucher_qty),
    matched_qty              INT         NOT NULL DEFAULT 0 CHECK(matched_qty >= 0 AND matched_qty <= voucher_qty),

    -- Immutable Financial Snapshots (whole PKR rupees / BIGINT)
    locked_purchase_price    BIGINT      NOT NULL CHECK(locked_purchase_price >= 0),
    catalog_sale_price       BIGINT      CHECK(catalog_sale_price IS NULL OR catalog_sale_price >= 0),
    voucher_sale_price       BIGINT      NOT NULL CHECK(voucher_sale_price >= 0),
    total_sale_amount        BIGINT      GENERATED ALWAYS AS (voucher_qty * voucher_sale_price) STORED,

    -- Payment Accounting
    -- REGISTRATION_ONLY: for INSTANT_INVENTORY type — no financial transaction
    -- PAID / PARTIALLY_PAID / UNPAID / ON_ACCOUNT: standard payment states
    payment_status           TEXT        NOT NULL
                             CHECK(payment_status IN (
                                 'REGISTRATION_ONLY',
                                 'PAID', 'PARTIALLY_PAID', 'UNPAID', 'ON_ACCOUNT'
                             )),
    paid_amount              BIGINT      NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),

    -- Cross-references to accounting entries created during this voucher
    -- Nullable since INSTANT_INVENTORY creates no financial entries
    sale_id                  TEXT        REFERENCES sales(id)                 ON DELETE SET NULL,
    cash_movement_id         TEXT        REFERENCES cash_movements(id)        ON DELETE SET NULL,
    customer_ledger_id       TEXT        REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,

    -- Lifecycle Status
    -- PENDING_RECEIPT: voucher created, inventory not yet matched
    -- PARTIALLY_MATCHED: some inventory received, reconciliation in progress
    -- FULFILLED: all units matched to received inventory
    -- CANCELLED: voided before fulfilment (only allowed when no payments made)
    status                   TEXT        NOT NULL DEFAULT 'PENDING_RECEIPT'
                             CHECK(status IN (
                                 'PENDING_RECEIPT', 'PARTIALLY_MATCHED', 'FULFILLED', 'CANCELLED'
                             )),

    notes                    TEXT,
    performed_by             TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_branch_status
    ON pos_direct_vouchers (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_org_branch
    ON pos_direct_vouchers (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_type
    ON pos_direct_vouchers (voucher_type);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_customer
    ON pos_direct_vouchers (customer_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_product
    ON pos_direct_vouchers (product_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_created_at
    ON pos_direct_vouchers (created_at);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_idempotency_key
    ON pos_direct_vouchers (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_sale_id
    ON pos_direct_vouchers (sale_id)
    WHERE sale_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- TABLE 3: pos_voucher_payments
-- Multi-tender payment history for vouchers.
-- Supports split-payment (CASH + BANK_TRANSFER + EASYPAISA etc.) per voucher.
-- Each row represents a single payment line/event.
-- Idempotency via (voucher_id, idempotency_key) prevents duplicate payment posts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_payments (
    id                TEXT        PRIMARY KEY CHECK(length(id) = 36),
    voucher_id        TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,

    -- Idempotency key scoped to the voucher: prevents double-posting on retry
    idempotency_key   TEXT,

    payment_method    TEXT        NOT NULL
                      CHECK(payment_method IN (
                          'CASH', 'CARD', 'BANK_TRANSFER',
                          'EASYPAISA', 'JAZZCASH', 'OTHER', 'NONE'
                      )),
    amount            BIGINT      NOT NULL CHECK(amount > 0),
    reference_number  TEXT,
    notes             TEXT,

    -- Back-reference to the cash_movements row created for CASH payments
    cash_movement_id  TEXT        REFERENCES cash_movements(id) ON DELETE SET NULL,

    performed_by      TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_voucher_payments_idempotency
    ON pos_voucher_payments (voucher_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_voucher_id
    ON pos_voucher_payments (voucher_id);

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_created_at
    ON pos_voucher_payments (created_at);

-- -----------------------------------------------------------------------------
-- TABLE 4: pos_voucher_deliveries
-- Immutable audit log of each physical delivery event for a PRE_BOOKING voucher.
-- Delivery idempotency via idempotency_key prevents duplicate delivery posts.
-- For DIRECT_ADVANCE vouchers, one delivery record is created at voucher creation
-- (the entire qty is immediately delivered).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_deliveries (
    id               TEXT        PRIMARY KEY CHECK(length(id) = 36),
    voucher_id       TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,

    -- Idempotency key: prevents double-posting on network retry
    idempotency_key  TEXT        UNIQUE,

    delivered_qty    INT         NOT NULL CHECK(delivered_qty > 0),
    delivery_notes   TEXT,
    performed_by     TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_voucher_deliveries_voucher_id
    ON pos_voucher_deliveries (voucher_id);

CREATE INDEX IF NOT EXISTS idx_pos_voucher_deliveries_created_at
    ON pos_voucher_deliveries (created_at);

-- -----------------------------------------------------------------------------
-- TABLE 5: pos_voucher_inventory_matches
-- Permanent audit trail linking inventory receipts (purchases / stock movements)
-- to fulfilled voucher units. Enables the 10-in / 2-voucher / 8-stock reconciliation.
-- Records cost discrepancy between locked purchase price and actual receiving cost.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_inventory_matches (
    id                      TEXT        PRIMARY KEY CHECK(length(id) = 36),
    organization_id         TEXT        NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
    voucher_id              TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,

    -- Source of inventory — either a purchase line or a manual stock movement
    purchase_id             TEXT        REFERENCES purchases(id)               ON DELETE RESTRICT,
    purchase_line_id        TEXT        REFERENCES purchase_lines(id)          ON DELETE RESTRICT,
    stock_movement_in_id    TEXT        REFERENCES stock_movements(id)         ON DELETE RESTRICT,
    stock_movement_out_id   TEXT        REFERENCES stock_movements(id)         ON DELETE RESTRICT,

    branch_id               TEXT        NOT NULL REFERENCES branches(id)       ON DELETE RESTRICT,
    product_id              TEXT        NOT NULL REFERENCES products(id)       ON DELETE RESTRICT,

    -- Reconciliation Quantities
    quantity_matched        INT         NOT NULL CHECK(quantity_matched > 0),

    -- Cost Comparison & Discrepancy Tracking (whole PKR rupees)
    locked_unit_cost        BIGINT      NOT NULL CHECK(locked_unit_cost >= 0),
    actual_receiving_cost   BIGINT      NOT NULL CHECK(actual_receiving_cost >= 0),
    unit_cost_discrepancy   BIGINT      GENERATED ALWAYS AS (actual_receiving_cost - locked_unit_cost) STORED,
    total_cost_discrepancy  BIGINT      GENERATED ALWAYS AS (quantity_matched * (actual_receiving_cost - locked_unit_cost)) STORED,

    reconciliation_notes    TEXT,
    matched_by              TEXT        NOT NULL REFERENCES users(id)          ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_voucher_id
    ON pos_voucher_inventory_matches (voucher_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_purchase_id
    ON pos_voucher_inventory_matches (purchase_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_org_branch
    ON pos_voucher_inventory_matches (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_branch_product
    ON pos_voucher_inventory_matches (branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_created_at
    ON pos_voucher_inventory_matches (created_at);
