-- Migration 030: Introduce Central Warehouse as a first-class system inventory location
--
-- Design decision: The Central Warehouse is seeded as a system branch in the existing
-- `branches` table with a dedicated well-known UUID and code = 'WAREHOUSE'.
--
-- Rationale:
--   * stock.branch_id REFERENCES branches(id) — changing this FK is risky on live data.
--   * stock_movements.branch_id and stock_transfers.source/destination_branch_id also
--     FK to branches. A new inventory_locations table would require altering all three.
--   * Seeding a system branch preserves all existing FK constraints, atomic transfer
--     semantics, movement audit queries, and locking patterns without any FK migration.
--   * Authorization (see server.ts / auth.ts) distinguishes the warehouse from retail
--     branches: only org-admins may receive into it; POS checkout is bound to JWT
--     branch_id which is never the warehouse for ordinary branch users.
--   * This mirrors the existing pattern for Main Branch
--     (id = '00000000-0000-0000-0000-000000000002', code = 'MAIN').
--
-- Safe existing-data strategy:
--   * The warehouse row is inserted with ON CONFLICT (id) DO NOTHING — idempotent.
--   * No existing stock rows are moved or duplicated.
--   * Main Branch on-hand stock is preserved exactly as-is.
--   * Warehouse starts at zero inventory and receives stock only through explicit receipts
--     or authorized opening-balance operations performed after this migration is applied.
--   * Existing branch balances, movement history, and sales history are untouched.
--
-- The well-known warehouse UUID:
--   '00000000-0000-0000-0000-000000000003'
--   This continues the seeded-system-entity convention (org = ...0001, main = ...0002).
--
-- NOTE: Do not run against production / Cloud SQL without a separately authorized
-- deployment phase. This file is prepared and ready for review.

-- 1. Seed Central Warehouse system branch
INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Central Warehouse',
    'WAREHOUSE',
    1,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Add a is_warehouse flag column to branches so application code can distinguish
--    the warehouse system branch from retail branches without relying on magic UUIDs
--    or brittle code = 'WAREHOUSE' checks.
--    Default 0 (false) for all existing branches; only the warehouse row gets 1.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_warehouse INT NOT NULL DEFAULT 0;

-- 3. Mark the Central Warehouse system branch
UPDATE branches
   SET is_warehouse = 1
 WHERE id = '00000000-0000-0000-0000-000000000003';

-- 4. Ensure Main Branch is explicitly flagged as NOT a warehouse (idempotent safety)
UPDATE branches
   SET is_warehouse = 0
 WHERE id = '00000000-0000-0000-0000-000000000002';

-- 5. Create index for efficient warehouse/branch distinction queries
CREATE INDEX IF NOT EXISTS idx_branches_is_warehouse ON branches(is_warehouse);
