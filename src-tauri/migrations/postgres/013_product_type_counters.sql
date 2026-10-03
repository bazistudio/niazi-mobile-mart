-- Migration 013: Product Type Counters for Permanent M/P/A Product Numbering
-- Ensures concurrency-safe, non-overlapping atomic counters for product SKUs.

CREATE TABLE IF NOT EXISTS product_type_counters (
    prefix TEXT PRIMARY KEY, -- 'M' (Mobile), 'P' (Parts), 'A' (Accessories)
    next_value BIGINT NOT NULL DEFAULT 1
);

INSERT INTO product_type_counters (prefix, next_value) VALUES
    ('M', 1),
    ('P', 1),
    ('A', 1)
ON CONFLICT (prefix) DO NOTHING;
