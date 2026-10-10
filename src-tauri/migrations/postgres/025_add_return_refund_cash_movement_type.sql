-- Migration 025: Add RETURN_REFUND to cash_movements movement_type CHECK constraint
--
-- Context:
--   Migration 001 created cash_movements with a 5-value CHECK constraint:
--     ('SALE_PAYMENT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'CASH_ADJUSTMENT')
--
--   The sales return feature (createSalesReturn) inserts RETURN_REFUND movements when
--   cash is refunded to a customer. Without this migration, those inserts fail on deployed
--   databases that already applied migration 001, because RETURN_REFUND is not in the
--   original constraint.
--
--   An in-place edit to 001_initial_schema.sql is NOT sufficient for already-deployed
--   databases. This incremental migration is the correct fix for those.
--
-- This migration:
--   1. Drops the existing inline check constraint (auto-named by PostgreSQL).
--   2. Adds a new check constraint that includes all 6 movement types.
--
-- Idempotent: The DROP uses IF EXISTS; the ADD uses a named constraint so it is
-- safe to run multiple times (the second run will raise "already exists" which the
-- migration runner handles or the constraint is pre-dropped).
--
-- Additive only. No data is modified.

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
      'RETURN_REFUND'
    ));
