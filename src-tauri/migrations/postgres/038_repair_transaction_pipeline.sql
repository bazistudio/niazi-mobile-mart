-- Migration 038: Repair Booking & Finish Job Transaction Pipeline
-- Extends the repair domain to support atomic booking, stock consumption at part-commit,
-- cash-session-aware payments, customer ledger credit, and delivery/settlement.
--
-- SAFETY NOTES:
--   - All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS — idempotent on re-run.
--   - The cash_movements.movement_type constraint ALTER drops only the old check and
--     replaces it with an expanded one. No existing values are removed.
--   - No data is deleted or modified.
--   - Do NOT apply this migration to the production database until Phase A is reviewed
--     and approved by the repository owner.
--
-- Type compatibility (verified against 001_initial_schema.sql):
--   cash_sessions.id       TEXT CHECK(length=36)  → session_id TEXT
--   cash_movements.id      TEXT CHECK(length=36)  → cash_movement_id TEXT
--   stock_movements.id     TEXT CHECK(length=36)  → stock_movement_id TEXT
--   users.id               TEXT                   → delivered_by TEXT, performed_by TEXT
--   branches.id            TEXT                   → branch_id TEXT

-- ─── 1. Extend cash_movements.movement_type to include repair values ───────────
-- PostgreSQL requires DROP + ADD to change a CHECK constraint.
-- We add REPAIR_ADVANCE (advance at booking) and REPAIR_SETTLEMENT (final at delivery).
-- All existing values are retained.

ALTER TABLE cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_movement_type_check;

ALTER TABLE cash_movements
  ADD CONSTRAINT cash_movements_movement_type_check
    CHECK (movement_type IN (
      'SALE_PAYMENT',
      'CUSTOMER_PAYMENT',
      'SUPPLIER_PAYMENT',
      'EXPENSE',
      'CASH_ADJUSTMENT',
      'RETURN_REFUND',
      'EXCHANGE_REFUND',
      'REPAIR_ADVANCE',
      'REPAIR_SETTLEMENT'
    ));

-- ─── 2. Extend repair_jobs with delivery and settlement columns ────────────────

ALTER TABLE repair_jobs
  ADD COLUMN IF NOT EXISTS invoice_number    TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at      TEXT,
  ADD COLUMN IF NOT EXISTS delivered_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (settlement_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CREDIT'));

-- Unique constraint on invoice_number: prevents duplicate delivery invoices.
-- Uses a partial index (WHERE NOT NULL) because most jobs start with no invoice_number.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_jobs_invoice_number_unique
  ON repair_jobs(invoice_number)
  WHERE invoice_number IS NOT NULL;

-- ─── 3. Extend repair_payments with cash session and branch linkage ────────────
-- session_id and cash_movement_id are TEXT (not UUID) to match
-- cash_sessions.id TEXT and cash_movements.id TEXT in 001_initial_schema.sql.

ALTER TABLE repair_payments
  ADD COLUMN IF NOT EXISTS session_id       TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_movement_id TEXT REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id        TEXT REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by     TEXT REFERENCES users(id) ON DELETE SET NULL;

-- ─── 4. Extend repair_parts with stock tracking ────────────────────────────────
-- stock_movement_id is TEXT (not UUID) to match stock_movements.id TEXT.

ALTER TABLE repair_parts
  ADD COLUMN IF NOT EXISTS stock_deducted    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_movement_id TEXT REFERENCES stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id         TEXT REFERENCES branches(id) ON DELETE SET NULL;

-- ─── 5. Repair invoice counter table ──────────────────────────────────────────
-- Separate from user_invoice_counters (which has a composite PK on branch+user+period
-- and is incompatible with repair's simpler branch-scoped sequential numbering).
-- Provides atomic, race-safe repair invoice allocation per branch.

CREATE TABLE IF NOT EXISTS repair_invoice_counters (
  branch_id  TEXT    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  next_value BIGINT  NOT NULL DEFAULT 1,
  PRIMARY KEY (branch_id)
);

-- ─── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_repair_jobs_settlement
  ON repair_jobs(settlement_status, branch_id);

CREATE INDEX IF NOT EXISTS idx_repair_jobs_delivered
  ON repair_jobs(branch_id, status)
  WHERE status = 'DELIVERED';

CREATE INDEX IF NOT EXISTS idx_repair_payments_session
  ON repair_payments(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_repair_payments_branch
  ON repair_payments(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_repair_parts_stock
  ON repair_parts(product_id, branch_id, stock_deducted);
