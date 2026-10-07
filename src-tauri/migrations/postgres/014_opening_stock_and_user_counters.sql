-- Migration 014: Opening Stock Entries and User Invoice Counters Schema
-- Enables audit logging for initial opening stock and user-specific monthly invoice counters

CREATE TABLE IF NOT EXISTS opening_stock_entries (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity BIGINT NOT NULL,
    unit_cost BIGINT NOT NULL DEFAULT 0,
    reference_number VARCHAR(100),
    performed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opening_stock_product ON opening_stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_opening_stock_branch ON opening_stock_entries(branch_id);

CREATE TABLE IF NOT EXISTS user_invoice_counters (
    branch_id UUID NOT NULL,
    user_id UUID NOT NULL,
    period_yyyymm VARCHAR(10) NOT NULL,
    next_value BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (branch_id, user_id, period_yyyymm)
);
