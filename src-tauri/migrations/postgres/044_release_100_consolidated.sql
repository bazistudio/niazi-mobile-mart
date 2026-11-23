-- Migration 044: Release 100 Consolidated Schema Updates
--
-- Consolidated migration file for Release 100 phases.
-- All statements are strictly idempotent (IF NOT EXISTS) and preserve 100% of existing data.
-- DO NOT execute automatically until final release stage approval.
--
-- ============================================================================
-- PHASE 7: EXPENSE IMPROVEMENTS (QUANTITY & UNIT PRICE SUPPORT)
-- ============================================================================
-- Adds optional quantity and unit_price columns to expenses table.
-- Preserves all existing expense records:
--   - Existing rows default to quantity = 1
--   - Existing rows backfill unit_price = amount where unit_price IS NULL

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS quantity   INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price BIGINT DEFAULT NULL;

-- Backfill existing records safely so unit_price reflects the lump-sum amount when quantity is 1
UPDATE expenses
SET
  quantity   = COALESCE(quantity, 1),
  unit_price = COALESCE(unit_price, amount)
WHERE unit_price IS NULL;

COMMENT ON COLUMN expenses.quantity IS
  'Number of units purchased for this expense (defaults to 1 for lump-sum expenses).';

COMMENT ON COLUMN expenses.unit_price IS
  'Per-unit cost in whole PKR rupees (amount = quantity * unit_price when unit pricing is used).';

-- ============================================================================
-- PHASE 8: SUPPLIER DEMAND MANAGEMENT (PROCUREMENT WORKFLOW)
-- ============================================================================
-- Adds persistent demand orders so procurement lists survive app closure,
-- logout, and device restart.
-- All statements are strictly idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- NOTE: purchases, purchase_lines, and purchase_number counter already exist
--       in migration 001. The balance_after constraint was already relaxed in
--       migration 027. Only new structures are added here.

-- ============================================================================
-- 8.0  IDEMPOTENCY KEY — purchases table
-- ============================================================================
-- Adds an optional client-generated idempotency_key column to purchases.
-- Frontend sends a UUID per submission attempt. If a purchase with the same
-- key already exists, completePurchase() returns the existing result instead
-- of creating a duplicate. This prevents double-recording on network retries.
-- Column is nullable so all historical rows remain valid.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(36) DEFAULT NULL;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_purchases_idempotency_key
  ON purchases(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN purchases.idempotency_key IS
  'Optional client-generated UUID submitted per request attempt.
   Prevents double-recording on HTTP retries. Unique when non-null.';

COMMENT ON COLUMN purchases.request_fingerprint IS
  'SHA-256 hex prefix (first 64 chars) of the canonicalised purchase request payload.
   Used with idempotency_key to detect same-key/different-payload conflicts (HTTP 409).
   Computed server-side from: supplier_id, branch_id, sorted product lines (product_id,
   quantity, unit_cost), total_amount, and payment details. Nullable for historical rows.';

-- ============================================================================
-- 8.1  Ensure demand_number counter row exists
-- ============================================================================
INSERT INTO counters (name, value)
VALUES ('demand_number', 0)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 8.2  supplier_demands — persistent demand / purchase order headers
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_demands (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_number          VARCHAR(20)   NOT NULL UNIQUE,
  supplier_id            TEXT          REFERENCES suppliers(id) ON DELETE SET NULL,
  customer_id            TEXT          REFERENCES customers(id) ON DELETE SET NULL,
  branch_id              TEXT          NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status                 VARCHAR(30)   NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  total_estimated_amount BIGINT        NOT NULL DEFAULT 0
                           CHECK (total_estimated_amount >= 0),
  notes                  TEXT,
  created_by             VARCHAR(255),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_demands_supplier_id
  ON supplier_demands(supplier_id);

CREATE INDEX IF NOT EXISTS idx_supplier_demands_branch_id
  ON supplier_demands(branch_id);

CREATE INDEX IF NOT EXISTS idx_supplier_demands_status
  ON supplier_demands(status);

CREATE INDEX IF NOT EXISTS idx_supplier_demands_created_at
  ON supplier_demands(created_at DESC);

COMMENT ON TABLE supplier_demands IS
  'Persistent procurement demand orders created from low-stock selections.
   Lifecycle: DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED / CANCELLED.';

-- ============================================================================
-- 8.3  supplier_demand_items — line items for each demand order
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_demand_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id            UUID        NOT NULL REFERENCES supplier_demands(id) ON DELETE CASCADE,
  product_id           TEXT        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  requested_quantity   BIGINT      NOT NULL CHECK (requested_quantity > 0),
  received_quantity    BIGINT      NOT NULL DEFAULT 0
                         CHECK (received_quantity >= 0),
  estimated_unit_cost  BIGINT      NOT NULL DEFAULT 0
                         CHECK (estimated_unit_cost >= 0),
  actual_unit_cost     BIGINT,
  estimated_line_total BIGINT      GENERATED ALWAYS AS
                         (requested_quantity * estimated_unit_cost) STORED,
  actual_line_total    BIGINT,
  fulfilled_purchase_id TEXT       REFERENCES purchases(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A product can appear only once per demand order
  CONSTRAINT uq_demand_item_product UNIQUE (demand_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_demand_items_demand_id
  ON supplier_demand_items(demand_id);

CREATE INDEX IF NOT EXISTS idx_supplier_demand_items_product_id
  ON supplier_demand_items(product_id);

COMMENT ON TABLE supplier_demand_items IS
  'Line items for supplier_demands. received_quantity tracks partial fulfillment.
   actual_unit_cost is set when goods arrive and may differ from estimated_unit_cost.';

COMMENT ON COLUMN supplier_demand_items.fulfilled_purchase_id IS
  'Set when this demand item is fulfilled via a purchase invoice (purchases.id).';

-- ============================================================================
-- 8.4  Trigger: auto-update updated_at on supplier_demands
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_supplier_demands_updated_at'
  ) THEN
    CREATE TRIGGER trg_supplier_demands_updated_at
      BEFORE UPDATE ON supplier_demands
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_supplier_demand_items_updated_at'
  ) THEN
    CREATE TRIGGER trg_supplier_demand_items_updated_at
      BEFORE UPDATE ON supplier_demand_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ============================================================================
-- PHASE 9: HR STAFF SALARY & REPAIR MECHANIC COMMISSION CONFIGURATION
-- ============================================================================
-- Adds commission_percentage column and 'COMMISSION_PERCENTAGE' salary_type
-- support to staff_salary_configs so repair mechanics and staff compensation
-- configurations persist cleanly without constraint violations.

ALTER TABLE staff_salary_configs
  ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) DEFAULT NULL;

ALTER TABLE staff_salary_configs
  DROP CONSTRAINT IF EXISTS staff_salary_configs_salary_type_check;

ALTER TABLE staff_salary_configs
  ADD CONSTRAINT staff_salary_configs_salary_type_check
  CHECK (salary_type IN ('MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION_PERCENTAGE'));

ALTER TABLE staff_salary_configs
  DROP CONSTRAINT IF EXISTS chk_salary_rate_present;

ALTER TABLE staff_salary_configs
  ADD CONSTRAINT chk_salary_rate_present
  CHECK (
    monthly_salary IS NOT NULL
    OR daily_rate IS NOT NULL
    OR hourly_rate IS NOT NULL
    OR commission_percentage IS NOT NULL
  );

COMMENT ON COLUMN staff_salary_configs.commission_percentage IS
  'Commission / profit-share percentage (0-100) for repair mechanics on net repair profit.';

-- Also extend salary_records.salary_type_snapshot CHECK to include COMMISSION_PERCENTAGE.
-- Migration 042 defines this column with CHECK(salary_type_snapshot IN ('MONTHLY', 'DAILY', 'HOURLY'))
-- which would reject payroll rows generated for commission-only mechanics.
-- Neither migration 043 nor any prior correction addressed this column.
ALTER TABLE salary_records
  DROP CONSTRAINT IF EXISTS salary_records_salary_type_snapshot_check;

ALTER TABLE salary_records
  ADD CONSTRAINT salary_records_salary_type_snapshot_check
  CHECK (salary_type_snapshot IN ('MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION_PERCENTAGE'));

