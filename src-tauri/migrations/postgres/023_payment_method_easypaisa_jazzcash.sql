-- Migration 023: Add EASYPAISA and JAZZCASH to sale_payments payment_method CHECK constraint
--
-- Context:
--   Migration 001_initial_schema.sql created sale_payments with:
--     payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'))
--
--   Migration 006_multi_payment.sql updated this constraint to:
--     CHECK(payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'))
--
--   Both EASYPAISA and JAZZCASH are active business payment methods:
--     - Supported in SQLite migration 017_multi_payment (client-side schema)
--     - Supported in TypeScript SalePaymentInputDto and POS UI payment method list
--     - Used by active POS multi-payment paths in the Rust local layer
--
-- This migration is additive only. It:
--   1. Drops the existing restrictive payment_method CHECK constraint
--   2. Adds the updated constraint that includes EASYPAISA and JAZZCASH
--
-- No data is modified. No columns are dropped or renamed.
-- This migration does not affect historical rows (existing CASH, CARD, BANK_TRANSFER, OTHER
-- values satisfy the new constraint, which is a superset).

-- Drop the old restrictive constraint (name from migration 006_multi_payment.sql)
ALTER TABLE sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_payment_method_check;

-- Also drop the constraint by its original name from 001_initial_schema.sql in case
-- migration 006 used a different naming convention on this deployment.
-- PostgreSQL auto-names CHECK constraints as <table>_<col>_check when unnamed.
-- This is safe to run even if the constraint was already dropped above.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'sale_payments'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sale_payments DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

-- Add the updated constraint with EASYPAISA and JAZZCASH
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_payment_method_check
  CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'OTHER'));
