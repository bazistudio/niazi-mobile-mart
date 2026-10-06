-- Migration 011: Terminal-scoped Invoice Counters
-- Adapted for online Postgres architecture to allow terminal-prefixed invoice sequences.
CREATE TABLE IF NOT EXISTS terminal_invoice_counters (
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    period_yyyymm TEXT NOT NULL CHECK(length(period_yyyymm) = 6),
    next_value BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (branch_id, terminal_id, period_yyyymm)
);
