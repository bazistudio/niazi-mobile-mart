-- Migration 053: Voucher Schema Forward Reconciliation & Data Preservation
--
-- PURPOSE:
--   Forward-only reconciliation for databases that have already applied migration 052
--   (or intermediate schemas) to bring all voucher tables into 100% canonical alignment
--   with `backend/src/repositories/voucher.repo.ts`.
--
-- GUARANTEES:
--   1. Reconciles `pos_voucher_deliveries` quantity column (`delivered_qty` -> `quantity_delivered`)
--      with strict conflict detection. If conflicting non-NULL values exist, halts migration.
--   2. Deterministically backfills `pos_voucher_payments` (`organization_id`, `branch_id`) from
--      parent `pos_direct_vouchers` and enforces NOT NULL after verification.
--   3. Detects and blocks execution on orphan payments or parent mismatch.
--   4. Drops obsolete global unique constraints on `idempotency_key` and `request_fingerprint`
--      inherited from original migration 052.
--   5. Establishes proper scoped unique indexes:
--      - `pos_direct_vouchers`: (branch_id, idempotency_key) WHERE idempotency_key IS NOT NULL
--      - `pos_voucher_deliveries`: (voucher_id, idempotency_key)
--      - `pos_voucher_payments`: (voucher_id, idempotency_key) WHERE idempotency_key IS NOT NULL
--   6. Enforces canonical 10-value CHECK constraint on `pos_direct_vouchers.payment_method`.
--
-- TRANSACTION SAFETY:
--   - No explicit BEGIN / COMMIT statements (transaction owned by TypeScript runner).
--   - No CREATE INDEX CONCURRENTLY (prohibited inside transaction blocks).
--   - Fully idempotent: safe on fresh databases, pre-existing 051 databases, and 052 databases.

-- -----------------------------------------------------------------------------
-- SECTION 1: Defensive Canonical Table Foundations (IF NOT EXISTS)
-- Guarantees table existence for all 5 canonical voucher tables.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_counters (
    branch_id      TEXT        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    period_yyyymm  TEXT        NOT NULL CHECK(period_yyyymm ~ '^\d{6}$'),
    next_value     BIGINT      NOT NULL DEFAULT 1 CHECK(next_value >= 1),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, period_yyyymm)
);

CREATE TABLE IF NOT EXISTS pos_direct_vouchers (
    id                       TEXT        PRIMARY KEY CHECK(length(id) = 36),
    voucher_number           TEXT        NOT NULL UNIQUE,
    voucher_type             TEXT        NOT NULL DEFAULT 'INSTANT_INVENTORY'
                             CHECK(voucher_type IN ('INSTANT_INVENTORY', 'DIRECT_ADVANCE', 'PRE_BOOKING')),
    organization_id          TEXT        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id                TEXT        NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
    customer_id              TEXT        REFERENCES customers(id)              ON DELETE RESTRICT,
    customer_name_snapshot   TEXT        NOT NULL,
    customer_phone_snapshot  TEXT,
    product_id               TEXT        REFERENCES products(id)              ON DELETE RESTRICT,
    product_name             TEXT        NOT NULL CHECK(length(trim(product_name)) > 0),
    spec_category            TEXT,
    spec_quality             TEXT,
    spec_color               TEXT,
    spec_brand               TEXT,
    spec_company             TEXT,
    voucher_qty              INT         NOT NULL CHECK(voucher_qty > 0),
    delivered_qty            INT         NOT NULL DEFAULT 0 CHECK(delivered_qty >= 0 AND delivered_qty <= voucher_qty),
    matched_qty              INT         NOT NULL DEFAULT 0 CHECK(matched_qty >= 0 AND matched_qty <= voucher_qty),
    locked_purchase_price    BIGINT      NOT NULL CHECK(locked_purchase_price >= 0),
    catalog_sale_price       BIGINT      CHECK(catalog_sale_price IS NULL OR catalog_sale_price >= 0),
    voucher_sale_price       BIGINT      NOT NULL CHECK(voucher_sale_price >= 0),
    total_sale_amount        BIGINT      GENERATED ALWAYS AS (voucher_qty * voucher_sale_price) STORED,
    payment_method           TEXT        NOT NULL DEFAULT 'NONE'
                             CHECK(payment_method IN (
                                 'CASH', 'CARD', 'BANK', 'BANK_TRANSFER',
                                 'EASYPAISA', 'JAZZCASH', 'CREDIT', 'SPLIT',
                                 'OTHER', 'NONE'
                             )),
    payment_status           TEXT        NOT NULL
                             CHECK(payment_status IN (
                                 'REGISTRATION_ONLY',
                                 'PAID', 'PARTIALLY_PAID', 'UNPAID', 'ON_ACCOUNT'
                             )),
    paid_amount              BIGINT      NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    sale_id                  TEXT        REFERENCES sales(id)                 ON DELETE SET NULL,
    cash_movement_id         TEXT        REFERENCES cash_movements(id)        ON DELETE SET NULL,
    customer_ledger_id       TEXT        REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    status                   TEXT        NOT NULL DEFAULT 'PENDING_RECEIPT'
                             CHECK(status IN (
                                 'PENDING_RECEIPT', 'PARTIALLY_MATCHED', 'FULFILLED', 'CANCELLED'
                             )),
    notes                    TEXT,
    performed_by             TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key          TEXT,
    request_fingerprint      TEXT
);

CREATE TABLE IF NOT EXISTS pos_voucher_payments (
    id                  TEXT        PRIMARY KEY CHECK(length(id) = 36),
    organization_id     TEXT        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id           TEXT        NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
    voucher_id          TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    idempotency_key     TEXT,
    payment_method      TEXT        NOT NULL
                        CHECK(payment_method IN (
                            'CASH', 'CARD', 'BANK_TRANSFER',
                            'EASYPAISA', 'JAZZCASH', 'OTHER', 'NONE'
                        )),
    amount              BIGINT      NOT NULL CHECK(amount > 0),
    reference_number    TEXT,
    notes               TEXT,
    cash_movement_id    TEXT        REFERENCES cash_movements(id) ON DELETE SET NULL,
    customer_ledger_id  TEXT        REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    is_reversed         BOOLEAN     NOT NULL DEFAULT FALSE,
    performed_by        TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_voucher_deliveries (
    id                  TEXT        PRIMARY KEY CHECK(length(id) = 36),
    voucher_id          TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    idempotency_key     TEXT        NOT NULL,
    quantity_delivered  INT         NOT NULL CHECK(quantity_delivered > 0),
    customer_ledger_id  TEXT        REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    request_fingerprint TEXT,
    delivery_notes      TEXT,
    performed_by        TEXT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (voucher_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS pos_voucher_inventory_matches (
    id                      TEXT        PRIMARY KEY CHECK(length(id) = 36),
    organization_id         TEXT        NOT NULL REFERENCES organizations(id)   ON DELETE RESTRICT,
    voucher_id              TEXT        NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    purchase_id             TEXT        REFERENCES purchases(id)               ON DELETE RESTRICT,
    purchase_line_id        TEXT        REFERENCES purchase_lines(id)          ON DELETE RESTRICT,
    stock_movement_in_id    TEXT        REFERENCES stock_movements(id)         ON DELETE RESTRICT,
    stock_movement_out_id   TEXT        REFERENCES stock_movements(id)         ON DELETE RESTRICT,
    branch_id               TEXT        NOT NULL REFERENCES branches(id)       ON DELETE RESTRICT,
    product_id              TEXT        NOT NULL REFERENCES products(id)       ON DELETE RESTRICT,
    quantity_matched        INT         NOT NULL CHECK(quantity_matched > 0),
    locked_unit_cost        BIGINT      NOT NULL CHECK(locked_unit_cost >= 0),
    actual_receiving_cost   BIGINT      NOT NULL CHECK(actual_receiving_cost >= 0),
    unit_cost_discrepancy   BIGINT      GENERATED ALWAYS AS (actual_receiving_cost - locked_unit_cost) STORED,
    total_cost_discrepancy  BIGINT      GENERATED ALWAYS AS (quantity_matched * (actual_receiving_cost - locked_unit_cost)) STORED,
    reconciliation_notes    TEXT,
    matched_by              TEXT        NOT NULL REFERENCES users(id)          ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- SECTION 2: `pos_direct_vouchers` Reconciliation & Obsolete Constraint Cleanup
-- -----------------------------------------------------------------------------
-- Ensure required columns exist
ALTER TABLE pos_direct_vouchers
    ADD COLUMN IF NOT EXISTS voucher_type TEXT NOT NULL DEFAULT 'INSTANT_INVENTORY'
        CHECK(voucher_type IN ('INSTANT_INVENTORY', 'DIRECT_ADVANCE', 'PRE_BOOKING')),
    ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL;

-- Reconcile payment_method check constraint
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_payment_method_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_payment_method_check
        CHECK (payment_method IN (
            'CASH', 'CARD', 'BANK', 'BANK_TRANSFER',
            'EASYPAISA', 'JAZZCASH', 'CREDIT', 'SPLIT',
            'OTHER', 'NONE'
        ));

-- Reconcile quantity check constraints
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_delivered_qty_check,
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_matched_qty_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_delivered_qty_check
        CHECK (delivered_qty >= 0 AND delivered_qty <= voucher_qty),
    ADD CONSTRAINT pos_direct_vouchers_matched_qty_check
        CHECK (matched_qty >= 0 AND matched_qty <= voucher_qty);

-- Drop obsolete global uniqueness constraints created by original migration 052
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_idempotency_key_key,
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_request_fingerprint_key;

DROP INDEX IF EXISTS idx_pos_direct_vouchers_idempotency_key;

-- Preflight duplicate check before creating scoped idempotency index
DO $$
DECLARE
    v_dup_vch_count INT;
BEGIN
    SELECT COUNT(*) INTO v_dup_vch_count
    FROM (
        SELECT branch_id, idempotency_key
        FROM pos_direct_vouchers
        WHERE idempotency_key IS NOT NULL
        GROUP BY branch_id, idempotency_key
        HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_vch_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % branch-scoped duplicate idempotency_key collisions in pos_direct_vouchers. Migration 053 halted to protect data integrity.', v_dup_vch_count;
    END IF;
END $$;

-- Canonical branch-scoped idempotency unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_direct_vouchers_idempotency
    ON pos_direct_vouchers (branch_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Branch-scoped request fingerprint lookup index (NON-UNIQUE)
CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_fingerprint
    ON pos_direct_vouchers (branch_id, request_fingerprint)
    WHERE request_fingerprint IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 3: `pos_voucher_deliveries` Quantity Reconciliation & Constraint Cleanup
-- -----------------------------------------------------------------------------
-- Handle quantity column migration with conflict detection
DO $$
DECLARE
    v_conflict_count INT;
BEGIN
    -- State B: Only delivered_qty exists -> rename to canonical quantity_delivered
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pos_voucher_deliveries' AND column_name = 'delivered_qty'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pos_voucher_deliveries' AND column_name = 'quantity_delivered'
    ) THEN
        ALTER TABLE pos_voucher_deliveries RENAME COLUMN delivered_qty TO quantity_delivered;

    -- States C, D, E: Both columns exist -> inspect for conflict
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pos_voucher_deliveries' AND column_name = 'delivered_qty'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pos_voucher_deliveries' AND column_name = 'quantity_delivered'
    ) THEN
        -- State E: Contradictory non-NULL values
        SELECT COUNT(*) INTO v_conflict_count
        FROM pos_voucher_deliveries
        WHERE delivered_qty IS NOT NULL
          AND quantity_delivered IS NOT NULL
          AND delivered_qty <> quantity_delivered;

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % row(s) in pos_voucher_deliveries with conflicting values between delivered_qty and quantity_delivered. Migration 053 halted to prevent data loss.', v_conflict_count;
        END IF;

        -- State D: Backfill canonical column where NULL
        UPDATE pos_voucher_deliveries
        SET quantity_delivered = delivered_qty
        WHERE quantity_delivered IS NULL AND delivered_qty IS NOT NULL;

        -- State C: Safely drop legacy column
        ALTER TABLE pos_voucher_deliveries DROP COLUMN delivered_qty;
    END IF;
END $$;

-- Ensure missing columns exist
ALTER TABLE pos_voucher_deliveries
    ADD COLUMN IF NOT EXISTS quantity_delivered INT CHECK(quantity_delivered > 0),
    ADD COLUMN IF NOT EXISTS customer_ledger_id TEXT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

-- Enforce NOT NULL on quantity_delivered
ALTER TABLE pos_voucher_deliveries
    ALTER COLUMN quantity_delivered SET NOT NULL;

-- Drop obsolete global uniqueness constraint created by original migration 052
ALTER TABLE pos_voucher_deliveries
    DROP CONSTRAINT IF EXISTS pos_voucher_deliveries_idempotency_key_key;

-- Preflight duplicate check before creating scoped delivery idempotency index
DO $$
DECLARE
    v_dup_del_count INT;
BEGIN
    SELECT COUNT(*) INTO v_dup_del_count
    FROM (
        SELECT voucher_id, idempotency_key
        FROM pos_voucher_deliveries
        GROUP BY voucher_id, idempotency_key
        HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_del_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % duplicate (voucher_id, idempotency_key) collisions in pos_voucher_deliveries. Migration 053 halted to protect data integrity.', v_dup_del_count;
    END IF;
END $$;

-- Canonical voucher-scoped delivery idempotency unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_voucher_deliveries_scoped_idempotency
    ON pos_voucher_deliveries (voucher_id, idempotency_key);

-- -----------------------------------------------------------------------------
-- SECTION 4: `pos_voucher_payments` Backfill, Integrity Guards & NOT NULL
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_orphan_count INT;
    v_mismatch_count INT;
    v_dup_pay_count INT;
BEGIN
    -- Ensure columns exist as nullable initially
    ALTER TABLE pos_voucher_payments
        ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS customer_ledger_id TEXT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE;

    -- 1. Guard against orphan payment records (payments referencing non-existent voucher)
    SELECT COUNT(*) INTO v_orphan_count
    FROM pos_voucher_payments p
    LEFT JOIN pos_direct_vouchers v ON v.id = p.voucher_id
    WHERE v.id IS NULL;

    IF v_orphan_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % orphan record(s) in pos_voucher_payments with no matching parent voucher. Cannot backfill organization/branch.', v_orphan_count;
    END IF;

    -- 2. Guard against pre-existing conflicting organization/branch values
    SELECT COUNT(*) INTO v_mismatch_count
    FROM pos_voucher_payments p
    JOIN pos_direct_vouchers v ON v.id = p.voucher_id
    WHERE (p.organization_id IS NOT NULL AND p.organization_id <> v.organization_id)
       OR (p.branch_id IS NOT NULL AND p.branch_id <> v.branch_id);

    IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % payment record(s) with organization_id or branch_id conflicting with parent voucher.', v_mismatch_count;
    END IF;

    -- 3. Deterministic backfill from parent voucher
    UPDATE pos_voucher_payments p
    SET organization_id = v.organization_id,
        branch_id = v.branch_id
    FROM pos_direct_vouchers v
    WHERE p.voucher_id = v.id
      AND (p.organization_id IS NULL OR p.branch_id IS NULL);

    -- 4. Enforce NOT NULL on organization_id and branch_id
    ALTER TABLE pos_voucher_payments
        ALTER COLUMN organization_id SET NOT NULL,
        ALTER COLUMN branch_id SET NOT NULL;

    -- 5. Preflight duplicate check for payment idempotency
    SELECT COUNT(*) INTO v_dup_pay_count
    FROM (
        SELECT voucher_id, idempotency_key
        FROM pos_voucher_payments
        WHERE idempotency_key IS NOT NULL
        GROUP BY voucher_id, idempotency_key
        HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_pay_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % duplicate (voucher_id, idempotency_key) collisions in pos_voucher_payments. Migration 053 halted to protect data integrity.', v_dup_pay_count;
    END IF;
END $$;

-- Scoped payment idempotency unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_voucher_payments_idempotency
    ON pos_voucher_payments (voucher_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
