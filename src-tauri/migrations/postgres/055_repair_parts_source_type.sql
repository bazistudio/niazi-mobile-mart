-- Migration 055: Add source_type to repair_parts
-- Fixes P0 defect FIND-012: PostgreSQL error 42703 (undefined_column) on repair parts operations.
--
-- Background:
--   repair.repo.ts unconditionally reads and writes rp.source_type (lines 242, 1038)
--   but no prior migration (001–054) defines this column in repair_parts.
--   This omission causes all repair-part read and insert operations to fail at runtime.
--
-- Safety properties:
--   - ADD COLUMN IF NOT EXISTS: safe to run multiple times (idempotent/retry-safe).
--   - DEFAULT 'OWN_STOCK': existing rows are backfilled automatically by PostgreSQL.
--   - NOT NULL with DEFAULT: no existing row becomes invalid; new rows without an
--     explicit value receive 'OWN_STOCK' at the database level.
--   - Supported values: 'OWN_STOCK' (product-linked part) and 'MARKET_PURCHASE'
--     (non-product / externally sourced part), matching repair.repo.ts line 83.
--   - No index added: source_type is low-cardinality (2 values); no demonstrated
--     query-plan requirement justifies an index at this stage.
--   - No CHECK constraint added: omitted to allow future value extensions without
--     a schema migration; application-layer enforcement exists in repair.repo.ts.
--   - Does not alter, rename, or remove any existing column.
--   - Does not affect any other table.

ALTER TABLE repair_parts
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'OWN_STOCK';
