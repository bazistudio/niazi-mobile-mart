-- Migration 027: Relax balance_after CHECK constraint on ledger tables
-- Purpose (DEF-04): The CHECK(balance_after >= 0) constraint prevents valid business
-- operations including customer advance payments, supplier overpayments, and credit
-- balances. The application already computes signed balances
-- (balance = SUM(debit) - SUM(credit)) and displays them with CR/DR notation.
-- The constraint must be removed to allow negative balance_after values for these cases.
--
-- Accounting semantics preserved:
--   customer_ledger_entries: SALE increases debit (receivable); PAYMENT increases credit.
--     Positive balance = customer owes shop; Negative = customer has advance/credit.
--   supplier_ledger_entries: PURCHASE increases debit (payable); PAYMENT increases credit.
--     Positive balance = shop owes supplier; Negative = supplier owes shop (overpayment).
--
-- Rollback safety warning:
--   The DOWN migration re-adds the CHECK(balance_after >= 0) constraint.
--   If any rows have balance_after < 0 at rollback time, the rollback WILL FAIL.
--   Do not roll back this migration after any advance payments or overpayments have
--   been recorded.
--
-- Historical data: This migration does not modify existing rows.
-- Production: DO NOT EXECUTE against production; prepare only.

-- UP

ALTER TABLE customer_ledger_entries
  DROP CONSTRAINT IF EXISTS customer_ledger_entries_balance_after_check;

ALTER TABLE supplier_ledger_entries
  DROP CONSTRAINT IF EXISTS supplier_ledger_entries_balance_after_check;

-- Ensure balance_after remains NOT NULL (was already set, but confirm)
ALTER TABLE customer_ledger_entries
  ALTER COLUMN balance_after SET NOT NULL;

ALTER TABLE supplier_ledger_entries
  ALTER COLUMN balance_after SET NOT NULL;

-- DOWN (rollback — will fail if negative balances exist)
-- ALTER TABLE customer_ledger_entries
--   ADD CONSTRAINT customer_ledger_entries_balance_after_check CHECK (balance_after >= 0);
-- ALTER TABLE supplier_ledger_entries
--   ADD CONSTRAINT supplier_ledger_entries_balance_after_check CHECK (balance_after >= 0);
