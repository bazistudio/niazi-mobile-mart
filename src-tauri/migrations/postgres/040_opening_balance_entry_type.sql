-- Migration 040: Add OPENING_BALANCE entry type and balance_as_of metadata
--
-- Purpose:
--   Supports the customer opening-balance feature.  Administrators (org-admin
--   role only) can record a single historical opening balance for a customer
--   that has no prior ledger activity, anchoring the ledger at a verified
--   cutoff date from the legacy POS.
--
-- Changes:
--   1. Replaces the entry_type CHECK constraint on customer_ledger_entries to
--      add 'OPENING_BALANCE' while preserving the four existing valid types:
--      SALE, PAYMENT, ADJUSTMENT, RETURN.
--   2. Adds a nullable TEXT column balance_as_of for the historical cutoff date
--      (ISO-8601 calendar date, e.g. '2024-12-31').  NULL for all other entry
--      types; set only on OPENING_BALANCE entries.
--   3. Adds a partial unique index that enforces at most one OPENING_BALANCE
--      entry per customer at the database level, preventing any duplicate
--      opening-balance posting regardless of application retries.
--
-- Safety notes:
--   * All three statements are additive; no existing row or column is removed
--     or changed.
--   * The constraint replacement (DROP … IF EXISTS / ADD) is the same safe
--     pattern used by migration 032.  The DROP succeeds even if the constraint
--     was previously renamed or is absent.
--   * The partial unique index uses a WHERE clause, so it does not restrict
--     SALE, PAYMENT, ADJUSTMENT, or RETURN entries in any way.
--   * balance_as_of is nullable and has no default, so existing rows are
--     unaffected (column value = NULL for all of them after the migration).
--   * Do NOT execute this migration against production outside a scheduled,
--     reviewed, and communicated deployment window.
--
-- Rollback warning:
--   Reversing this migration requires the DOWN block below AND the removal of
--   any OPENING_BALANCE rows first.  Attempting the DROP CONSTRAINT rollback
--   while OPENING_BALANCE rows exist will violate the restored constraint and
--   cause the rollback to fail.  Plan the rollback window accordingly.
--
-- Deployment ordering:
--   Must follow 039_mobile_sellers_registry.sql.
--   Backend code that posts OPENING_BALANCE entries must be deployed AFTER
--   this migration has been applied.

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TABLE customer_ledger_entries
  DROP CONSTRAINT IF EXISTS customer_ledger_entries_entry_type_check;

ALTER TABLE customer_ledger_entries
  ADD CONSTRAINT customer_ledger_entries_entry_type_check
    CHECK (entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT', 'RETURN', 'OPENING_BALANCE'));

ALTER TABLE customer_ledger_entries
  ADD COLUMN IF NOT EXISTS balance_as_of TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customer_ledger_entries_opening_balance_unique
  ON customer_ledger_entries (customer_id)
  WHERE entry_type = 'OPENING_BALANCE';

-- ─── DOWN (rollback — will fail if any OPENING_BALANCE rows exist) ───────────
-- DROP INDEX IF EXISTS customer_ledger_entries_opening_balance_unique;
--
-- ALTER TABLE customer_ledger_entries
--   DROP COLUMN IF EXISTS balance_as_of;
--
-- ALTER TABLE customer_ledger_entries
--   DROP CONSTRAINT IF EXISTS customer_ledger_entries_entry_type_check;
--
-- ALTER TABLE customer_ledger_entries
--   ADD CONSTRAINT customer_ledger_entries_entry_type_check
--     CHECK (entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT', 'RETURN'));
