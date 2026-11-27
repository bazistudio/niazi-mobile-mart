-- Migration 056: Reconcile cash_movements movement_type CHECK constraint
-- 
-- Restores repair and exchange transaction types that were accidentally omitted
-- when Migration 042 redefined the constraint for HR payroll transaction types.
--
-- Supported Types:
--   - 001_initial_schema.sql:
--       'SALE_PAYMENT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'CASH_ADJUSTMENT'
--   - 025_add_return_refund_cash_movement_type.sql:
--       'RETURN_REFUND'
--   - 038_repair_transaction_pipeline.sql:
--       'EXCHANGE_REFUND', 'REPAIR_ADVANCE', 'REPAIR_SETTLEMENT'
--   - 042_hr_payroll_foundation.sql:
--       'STAFF_ADVANCE', 'STAFF_SALARY'
--
-- Total: 11 Canonical Movement Types.
--
-- SAFETY & COMPATIBILITY GUARANTEES:
--   - Transactional DDL: Entire constraint replacement runs atomically.
--   - Idempotent: Uses DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT.
--   - Zero data loss: Schema metadata update only; existing rows are unchanged.
--   - Strictly non-destructive: Expands permitted domain values to include all historical
--     and active application types without removing any existing valid types.

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
      'STAFF_ADVANCE',
      'STAFF_SALARY',
      'REPAIR_ADVANCE',
      'REPAIR_SETTLEMENT'
    ));
