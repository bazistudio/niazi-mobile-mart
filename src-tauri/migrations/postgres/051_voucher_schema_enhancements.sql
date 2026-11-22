-- Migration 051: Direct Advance Voucher Schema Enhancements
--
-- Purpose:
-- Enhances Migration 050 (`pos_direct_vouchers` and `pos_voucher_inventory_matches`)
-- to support full production accounting, multi-tender payments, zero-delivery pre-bookings,
-- registration-only INSTANT_INVENTORY workflows, atomic branch-scoped voucher numbering,
-- and idempotency protection.
--
-- Safe and Idempotent:
-- Uses IF EXISTS / IF NOT EXISTS and non-destructive constraint updates.

-- -----------------------------------------------------------------------------
-- 1. Relax delivered_qty & matched_qty on pos_direct_vouchers for PRE_BOOKING
--    and INSTANT_INVENTORY registration-only workflows
-- -----------------------------------------------------------------------------
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_delivered_qty_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_delivered_qty_check
    CHECK (delivered_qty >= 0 AND delivered_qty <= voucher_qty);

-- Fix VCH-01: Allow inventory matching before physical handover for PRE_BOOKING
-- (In migration 050, matched_qty <= delivered_qty forced delivery before matching)
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_matched_qty_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_matched_qty_check
    CHECK (matched_qty >= 0 AND matched_qty <= voucher_qty);

-- Allow payment_method to record NONE (for INSTANT_INVENTORY registration-only),
-- SPLIT (when multiple lines exist in pos_voucher_payments), CARD, BANK_TRANSFER, OTHER
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_payment_method_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_payment_method_check
    CHECK (payment_method IN (
        'CASH',
        'CARD',
        'BANK',
        'BANK_TRANSFER',
        'EASYPAISA',
        'JAZZCASH',
        'CREDIT',
        'SPLIT',
        'OTHER',
        'NONE'
    ));

-- Allow payment_status to record REGISTRATION_ONLY for INSTANT_INVENTORY
ALTER TABLE pos_direct_vouchers
    DROP CONSTRAINT IF EXISTS pos_direct_vouchers_payment_status_check;

ALTER TABLE pos_direct_vouchers
    ADD CONSTRAINT pos_direct_vouchers_payment_status_check
    CHECK (payment_status IN (
        'PAID',
        'ON_ACCOUNT',
        'PARTIALLY_PAID',
        'UNPAID',
        'REGISTRATION_ONLY'
    ));

-- -----------------------------------------------------------------------------
-- 2. Add idempotency, request fingerprint, and optional sale linkage
-- -----------------------------------------------------------------------------
ALTER TABLE pos_direct_vouchers
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_direct_vouchers_idempotency
    ON pos_direct_vouchers (branch_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_sale_id
    ON pos_direct_vouchers (sale_id)
    WHERE sale_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. pos_voucher_payments — Multi-tender & subsequent payment history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_payments (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id               TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    voucher_id              TEXT NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    payment_method          VARCHAR(20) NOT NULL CHECK(payment_method IN (
                                'CASH',
                                'CARD',
                                'BANK_TRANSFER',
                                'EASYPAISA',
                                'JAZZCASH',
                                'OTHER'
                            )),
    amount                  BIGINT NOT NULL CHECK(amount > 0),
    reference_number        TEXT,
    notes                   TEXT,
    cash_movement_id        TEXT REFERENCES cash_movements(id) ON DELETE SET NULL,
    customer_ledger_id      TEXT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    is_reversed             BOOLEAN NOT NULL DEFAULT FALSE,
    reversed_by_payment_id  TEXT REFERENCES pos_voucher_payments(id) ON DELETE SET NULL,
    idempotency_key         TEXT,
    performed_by            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_voucher_id
    ON pos_voucher_payments (voucher_id);

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_org_branch
    ON pos_voucher_payments (organization_id, branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_voucher_payments_idempotency
    ON pos_voucher_payments (voucher_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. voucher_counters — Concurrency-safe branch-scoped monthly voucher numbers
--    Format: <BRANCH_CODE>-VCH-<YYYYMM>-<000001>
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_counters (
    branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    period_yyyymm   VARCHAR(10) NOT NULL,
    next_value      BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (branch_id, period_yyyymm)
);

-- -----------------------------------------------------------------------------
-- 5. pos_voucher_deliveries — Delivery event tracking & idempotency protection (VCH-03)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_deliveries (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    voucher_id          TEXT NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    quantity_delivered  INT NOT NULL CHECK(quantity_delivered > 0),
    customer_ledger_id  TEXT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    idempotency_key     TEXT NOT NULL,
    request_fingerprint TEXT,
    performed_by        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    UNIQUE (voucher_id, idempotency_key)
);

-- Ensure request_fingerprint column exists even if table was created by an earlier uncommitted draft
ALTER TABLE pos_voucher_deliveries
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_voucher_deliveries_voucher_id
    ON pos_voucher_deliveries (voucher_id);
