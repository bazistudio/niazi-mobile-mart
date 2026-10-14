-- Migration 034: Correct sale_idempotency_keys column types
-- FINDING-04 (forensic audit of commit 45a9332):
--
-- Migration 033 declared branch_id and sale_id as UUID, but the entire
-- existing schema (branches.id, sales.id, users.id) uses
-- TEXT PRIMARY KEY CHECK(length(id) = 36).
--
-- PostgreSQL raises "operator does not exist: text = uuid" on any join between
-- sales.id (TEXT) and sale_idempotency_keys.sale_id (UUID). The idempotency
-- advisory-lock queries and sale lookup queries are all broken in environments
-- where migration 033 was applied before this fix.
--
-- This forward-only migration alters those two columns from UUID to TEXT(36)
-- to match the rest of the schema. It is safe to apply to environments where
-- 033 already ran with the wrong types.
--
-- For fresh environments where 033 was not yet applied, 033 was corrected
-- directly to use TEXT(36), so 034 must handle the case where the table
-- already has the correct types. We use a conditional ALTER that is a no-op
-- when the column is already TEXT.
--
-- Decision on sale_id foreign key:
-- A FK to sales(id) is NOT added because idempotency records must be retained
-- after a sale is voided (soft-deleted) to prevent replaying the original
-- submission. The sale row is never hard-deleted; voided sales remain in the
-- table. An FK ON DELETE RESTRICT would prevent adding it safely without
-- auditing every voiding code path. Consistent type without FK is the correct
-- choice per the existing repository lifecycle.

-- UP

DO $$
BEGIN
  -- Alter branch_id only if it is currently UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_idempotency_keys'
      AND column_name = 'branch_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE sale_idempotency_keys
      ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;
    ALTER TABLE sale_idempotency_keys
      ADD CONSTRAINT sale_idempotency_keys_branch_id_length CHECK(length(branch_id) = 36);
  END IF;

  -- Alter sale_id only if it is currently UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_idempotency_keys'
      AND column_name = 'sale_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE sale_idempotency_keys
      ALTER COLUMN sale_id TYPE TEXT USING sale_id::TEXT;
    ALTER TABLE sale_idempotency_keys
      ADD CONSTRAINT sale_idempotency_keys_sale_id_length CHECK(length(sale_id) = 36);
  END IF;
END
$$;

-- If the table does not yet exist (033 was never applied), nothing to do here —
-- 033 will create it with the correct TEXT types.

-- DOWN
-- (reversing UUID → TEXT is intentionally not provided; roll forward)
