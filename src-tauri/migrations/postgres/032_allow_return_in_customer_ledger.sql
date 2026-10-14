-- Migration 032: Allow 'RETURN' entry_type in customer_ledger_entries
-- Purpose (DEF-SALE-04): returns.repo.ts inserts entry_type = 'RETURN' when crediting
-- a sales return to a customer's ledger. The original CHECK constraint on
-- customer_ledger_entries only permitted ('SALE', 'PAYMENT', 'ADJUSTMENT').
-- This migration extends the constraint to also allow 'RETURN', preventing a
-- PostgreSQL check constraint violation that aborts the entire returns transaction.
--
-- Safety: The constraint change is purely additive (adding a permitted value).
-- No existing rows are modified. The migration is forward-only.
--
-- Rollback warning: Re-adding the stricter constraint will fail if any rows
-- with entry_type = 'RETURN' exist. Do not roll back after returns have been recorded.
--
-- Production deployment ordering: No data dependency. Safe to apply at any time
-- before the next sales return is processed.

-- UP

ALTER TABLE customer_ledger_entries
  DROP CONSTRAINT IF EXISTS customer_ledger_entries_entry_type_check;

ALTER TABLE customer_ledger_entries
  ADD CONSTRAINT customer_ledger_entries_entry_type_check
    CHECK (entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT', 'RETURN'));

-- DOWN (rollback — will fail if any RETURN rows exist)
-- ALTER TABLE customer_ledger_entries
--   DROP CONSTRAINT IF EXISTS customer_ledger_entries_entry_type_check;
-- ALTER TABLE customer_ledger_entries
--   ADD CONSTRAINT customer_ledger_entries_entry_type_check
--     CHECK (entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT'));
