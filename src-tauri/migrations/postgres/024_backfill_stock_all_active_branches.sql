-- Migration 024: Backfill zero-quantity stock guard rows for all products × all active branches
--
-- Context:
--   Migration 019 backfilled stock rows only for the hardcoded main branch
--   (00000000-0000-0000-0000-000000000002). Multi-branch deployments have additional
--   active branches that may have no stock row for existing products, causing sales at
--   those branches to fail at the stock lookup step with "stock row not found" instead
--   of a correct "insufficient stock" conflict.
--
-- This migration:
--   1. Inserts a zero-quantity stock row for every (product, active_branch) pair that
--      does not already have a stock row.
--   2. Uses ON CONFLICT DO NOTHING so it is safe to re-run and does not touch rows
--      that already have stock.
--
-- No data is modified. No existing quantities are altered.
-- Additive only.

INSERT INTO stock (product_id, branch_id, quantity, updated_at)
SELECT p.id, b.id, 0, NOW()::text
FROM products p
CROSS JOIN branches b
WHERE b.is_active = 1
ON CONFLICT (product_id, branch_id) DO NOTHING;
