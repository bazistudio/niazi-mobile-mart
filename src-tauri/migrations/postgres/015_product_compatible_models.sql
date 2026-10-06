-- Migration 015: Product Compatible Models Schema
-- Enables 1:N mapping of replacement spare parts to compatible device models

CREATE TABLE IF NOT EXISTS product_compatible_models (
    id VARCHAR(100) PRIMARY KEY,
    product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    model_name VARCHAR(150) NOT NULL,
    normalized_model VARCHAR(150) NOT NULL,
    brand_id VARCHAR(100) REFERENCES brands(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compatible_models_product ON product_compatible_models(product_id);
CREATE INDEX IF NOT EXISTS idx_compatible_models_normalized ON product_compatible_models(normalized_model);

-- Optional Trigram extension for fast fuzzy/substring searching if supported
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_compatible_models_trgm ON product_compatible_models USING gin (normalized_model gin_trgm_ops);
