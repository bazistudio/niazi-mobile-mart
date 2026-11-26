-- Migration 054: Release 100 Accounts Foundation & Schema Reconciliation
--
-- PURPOSE:
--   1. Establishes the business payment accounts foundation (`business_accounts` and `account_ledger_entries`)
--      supporting digital payment methods (JazzCash, EasyPaisa, Bank accounts).
--   2. Adds nullable `account_id` foreign keys (UUID) to core transaction tables: `sale_payments`, `expenses`,
--      `purchases`, and `pos_voucher_payments`.
--   3. Reconciles `pos_direct_vouchers.remaining_qty` to canonical customer delivery obligation formula:
--      `remaining_qty = voucher_qty - delivered_qty` (replacing obsolete Migration 050 formula `delivered_qty - matched_qty`).
--   4. Reconciles `pos_voucher_payments.reversed_by_payment_id` for payment reversal audit tracking.
--   5. Links POS sales with advance vouchers via `sales.voucher_id` and `pos_voucher_deliveries.sale_id`.
--
-- SAFE AND IDEMPOTENT:
--   - Compatible with PostgreSQL 14+.
--   - Uses IF NOT EXISTS and defensive DO blocks.
--   - Zero explicit transaction control (BEGIN / COMMIT / ROLLBACK) — transaction owned by migration runner.

-- -----------------------------------------------------------------------------
-- SECTION 1: Business Accounts Foundation
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id             TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name                  TEXT NOT NULL CHECK(length(trim(name)) > 0),
    account_type          VARCHAR(30) NOT NULL CHECK(account_type IN ('JAZZCASH', 'EASYPAISA', 'BANK')),
    account_holder_name   TEXT NOT NULL CHECK(length(trim(account_holder_name)) > 0),
    account_number        TEXT NOT NULL CHECK(length(trim(account_number)) > 0),
    iban                  TEXT,
    bank_name             TEXT,
    opening_balance       BIGINT NOT NULL DEFAULT 0,
    currency              VARCHAR(10) NOT NULL DEFAULT 'PKR',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_by            TEXT REFERENCES users(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_business_accounts_org_type_number UNIQUE (organization_id, account_type, account_number)
);

CREATE INDEX IF NOT EXISTS idx_business_accounts_org_active
    ON business_accounts (organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_business_accounts_branch
    ON business_accounts (branch_id)
    WHERE branch_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 2: Account Ledger Entries Foundation
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS account_ledger_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    account_id            UUID NOT NULL REFERENCES business_accounts(id) ON DELETE RESTRICT,
    branch_id             TEXT REFERENCES branches(id) ON DELETE SET NULL,
    entry_type            VARCHAR(50) NOT NULL CHECK(entry_type IN (
                              'OPENING_BALANCE', 'POS_INFLOW', 'WITHDRAWAL',
                              'EXPENSE_PAYMENT', 'PURCHASE_PAYMENT', 'TRANSFER_IN',
                              'TRANSFER_OUT', 'MANUAL_ADJUSTMENT'
                          )),
    direction             VARCHAR(10) NOT NULL CHECK(direction IN ('IN', 'OUT')),
    amount                BIGINT NOT NULL CHECK(amount > 0),
    balance_after         BIGINT NOT NULL,
    reference_type        VARCHAR(50),
    reference_number      TEXT,
    description           TEXT,
    performed_by          TEXT REFERENCES users(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_ledger_entries_account_created
    ON account_ledger_entries (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_ledger_entries_org_type
    ON account_ledger_entries (organization_id, entry_type);

CREATE INDEX IF NOT EXISTS idx_account_ledger_entries_ref
    ON account_ledger_entries (reference_type, reference_number)
    WHERE reference_type IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 3: Payment Account Linkages (account_id FK)
-- -----------------------------------------------------------------------------

ALTER TABLE sale_payments
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES business_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_account_id
    ON sale_payments (account_id)
    WHERE account_id IS NOT NULL;

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES business_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_account_id
    ON expenses (account_id)
    WHERE account_id IS NOT NULL;

ALTER TABLE purchases
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES business_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_account_id
    ON purchases (account_id)
    WHERE account_id IS NOT NULL;

ALTER TABLE pos_voucher_payments
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES business_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_account_id
    ON pos_voucher_payments (account_id)
    WHERE account_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 4: Reconcile `pos_direct_vouchers.remaining_qty`
-- Replaces old/flawed Migration 050 formula (delivered_qty - matched_qty) with
-- canonical customer delivery obligation formula (voucher_qty - delivered_qty).
-- Handles both existing legacy databases and fresh databases cleanly.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    -- If remaining_qty already exists from Migration 050, drop it cleanly
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'pos_direct_vouchers'
          AND column_name = 'remaining_qty'
    ) THEN
        ALTER TABLE pos_direct_vouchers DROP COLUMN remaining_qty;
    END IF;

    -- Add canonical generated column reflecting true undelivered units owed to customer
    ALTER TABLE pos_direct_vouchers
        ADD COLUMN remaining_qty INT GENERATED ALWAYS AS (voucher_qty - delivered_qty) STORED;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 5: Reconcile `pos_voucher_payments.reversed_by_payment_id`
-- -----------------------------------------------------------------------------

ALTER TABLE pos_voucher_payments
    ADD COLUMN IF NOT EXISTS reversed_by_payment_id TEXT REFERENCES pos_voucher_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_voucher_payments_reversed_by
    ON pos_voucher_payments (reversed_by_payment_id)
    WHERE reversed_by_payment_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 6: Cross-Linkage Between Sales and Vouchers
-- -----------------------------------------------------------------------------

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS voucher_id TEXT REFERENCES pos_direct_vouchers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_voucher_id
    ON sales (voucher_id)
    WHERE voucher_id IS NOT NULL;

ALTER TABLE pos_voucher_deliveries
    ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_voucher_deliveries_sale_id
    ON pos_voucher_deliveries (sale_id)
    WHERE sale_id IS NOT NULL;
