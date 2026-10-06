-- Migration 012: Product Category to Type Foundation
-- Prepares the database schema for the Product Domain rename from Category to Type.

-- 1. Rename categories table
ALTER TABLE categories RENAME TO product_types;

-- 2. Rename products foreign key column
ALTER TABLE products RENAME COLUMN category_id TO type_id;

-- 3. Rename products index
ALTER INDEX IF EXISTS idx_products_category_id RENAME TO idx_products_type_id;

-- 4. Rename public_rates column
ALTER TABLE public_rates RENAME COLUMN category TO type;

-- (Note: expense_categories remains untouched as it belongs to the cash management domain)
