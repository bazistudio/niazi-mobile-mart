-- Migration 012: Product Category to Type Foundation (Idempotent)
-- Prepares the database schema for the Product Domain rename from Category to Type.

-- 1. Rename categories table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'categories' AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'product_types' AND table_schema = 'public'
    ) THEN
        ALTER TABLE categories RENAME TO product_types;
    END IF;
END $$;

-- 2. Rename products foreign key column if category_id exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'category_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'type_id'
    ) THEN
        ALTER TABLE products RENAME COLUMN category_id TO type_id;
    END IF;
END $$;

-- 3. Rename products index
ALTER INDEX IF EXISTS idx_products_category_id RENAME TO idx_products_type_id;

-- 4. Rename public_rates column if category exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'public_rates' AND column_name = 'category'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'public_rates' AND column_name = 'type'
    ) THEN
        ALTER TABLE public_rates RENAME COLUMN category TO type;
    END IF;
END $$;
