-- Migration 036: Update products_composite_identity_key to include company_id
--
-- Business Requirement:
-- Allow creating products with different specifications (including Company).
-- Only reject product creation when ALL specifications match exactly:
-- (type_id / category_id, normalized_name, brand_id, unit_id, quality_id, color_id, company_id).
--
-- Safe and transactional:
-- Replaces existing 6-tuple unique constraint with 7-tuple unique constraint.

DO $$
BEGIN
    -- 1. Drop the legacy composite constraint if present
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_composite_identity_key'
    ) THEN
        ALTER TABLE products DROP CONSTRAINT products_composite_identity_key;
    END IF;

    -- 2. Add the updated composite unique constraint with NULLS NOT DISTINCT including company_id
    ALTER TABLE products ADD CONSTRAINT products_composite_identity_key
    UNIQUE NULLS NOT DISTINCT (type_id, normalized_name, brand_id, unit_id, quality_id, color_id, company_id);
END $$;
