-- 005_product_identity_and_normalization.sql
-- V1.2.12 Phase 2: Add normalized_name and composite identity uniqueness to products table

ALTER TABLE products ADD COLUMN IF NOT EXISTS normalized_name TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_id TEXT REFERENCES qualities(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_id TEXT REFERENCES colors(id);

-- Backfill normalized_name using space-collapsing lowercase normalization
UPDATE products
SET normalized_name = regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
WHERE normalized_name = '' OR normalized_name IS NULL;

-- Create composite unique constraint with NULLS NOT DISTINCT (company_id excluded from identity)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_composite_identity_key'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT products_composite_identity_key
        UNIQUE NULLS NOT DISTINCT (category_id, normalized_name, brand_id, unit_id, quality_id, color_id);
    END IF;
END $$;
