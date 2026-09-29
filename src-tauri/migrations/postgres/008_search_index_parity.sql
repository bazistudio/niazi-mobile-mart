-- 008_search_index_parity.sql
-- Database Foundation: PostgreSQL search-index parity (H-1 / H-2)
--
-- Context
--   SQLite uses COLLATE NOCASE on name/display_name indexes for
--   case-insensitive search and ordering.  PostgreSQL has no equivalent
--   collation modifier, so the correct native approach is a functional
--   B-tree index on lower(column).
--
-- Query patterns (verified from repository source)
--   parties:     ILIKE '%pattern%'  +  ORDER BY lower(display_name) ASC
--   customers:   ILIKE '%pattern%'  +  ORDER BY name ASC
--   suppliers:   ILIKE '%pattern%'  +  ORDER BY name ASC
--
-- Index strategy
--   * lower() functional indexes support ORDER BY lower(col) and any
--     future equality check using lower(col) = lower(?).
--   * ILIKE with a leading wildcard ('%pattern%') cannot use any B-tree
--     index; at current single-shop scale this is acceptable.  pg_trgm
--     GIN indexes are a future optimisation path if search volume grows.
--   * Existing plain indexes are PRESERVED (they serve exact-match and
--     prefix-pattern queries).
--
-- Safety
--   * Purely ADDITIVE: no DROP, no column change.
--   * IDEMPOTENT: IF NOT EXISTS guards every statement.
--   * Non-blocking on small tables at current shop scale.

CREATE INDEX IF NOT EXISTS idx_parties_display_name_lower
    ON parties (lower(display_name));

CREATE INDEX IF NOT EXISTS idx_customers_name_lower
    ON customers (lower(name));

CREATE INDEX IF NOT EXISTS idx_suppliers_name_lower
    ON suppliers (lower(name));
