-- Migration 021: stock_transfers audit table
-- Supports P4 (real branch-to-branch stock transfers) and P7 (branch-scoped audit trail).
-- Additive only. Safe to run multiple times (idempotent CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS stock_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  source_branch_id      UUID  NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  destination_branch_id UUID  NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  quantity        BIGINT      NOT NULL CHECK (quantity > 0),
  reason          TEXT,
  notes           TEXT,
  performed_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT        NOT NULL
);

-- Index for audit queries by branch (source or destination)
CREATE INDEX IF NOT EXISTS idx_stock_transfers_source_branch
  ON stock_transfers (source_branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_destination_branch
  ON stock_transfers (destination_branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_product
  ON stock_transfers (product_id, created_at DESC);
