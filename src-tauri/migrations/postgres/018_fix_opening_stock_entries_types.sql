-- Migration 018: Align opening_stock_entries column types with core text-based entity IDs
-- Idempotent, safe forward-only repair migration.
--
-- Migration 014 defined opening_stock_entries using native UUID types (id, organization_id, branch_id, product_id, performed_by),
-- whereas 001_initial_schema.sql defines all entity IDs (organizations.id, branches.id, products.id, users.id) as TEXT (36-character UUID strings).
--
-- This migration converts column types to TEXT to ensure full compatibility across PostgreSQL engines and application repositories.

CREATE TABLE IF NOT EXISTS opening_stock_entries (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity BIGINT NOT NULL,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    reference_number VARCHAR(100),
    performed_by TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

-- For instances where opening_stock_entries was already created with UUID or TIMESTAMP columns:
DO $$
BEGIN
    -- 1. Convert id to TEXT if it is UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;

    -- 2. Convert organization_id to TEXT if it is UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'organization_id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN organization_id TYPE TEXT USING organization_id::text;
    END IF;

    -- 3. Convert branch_id to TEXT if it is UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'branch_id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN branch_id TYPE TEXT USING branch_id::text;
    END IF;

    -- 4. Convert product_id to TEXT if it is UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'product_id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN product_id TYPE TEXT USING product_id::text;
    END IF;

    -- 5. Convert performed_by to TEXT if it is UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'performed_by' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN performed_by TYPE TEXT USING performed_by::text;
    END IF;

    -- 6. Convert created_at to TEXT if it is timestamp
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'opening_stock_entries' AND column_name = 'created_at' AND data_type LIKE '%timestamp%'
    ) THEN
        ALTER TABLE opening_stock_entries ALTER COLUMN created_at TYPE TEXT USING created_at::text;
    END IF;
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_opening_stock_product ON opening_stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_opening_stock_branch ON opening_stock_entries(branch_id);
