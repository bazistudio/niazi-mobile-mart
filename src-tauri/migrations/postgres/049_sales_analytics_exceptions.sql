-- Migration 049: Sales Analytics Exception Persistence
-- Additive migration: creates the sales_analytics_exceptions table for
-- storing accounting anomalies detected by the analytics engine.
-- Safe to re-run: protected by IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS sales_analytics_exceptions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id TEXT        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id       TEXT        REFERENCES branches(id) ON DELETE CASCADE,
  category        VARCHAR(50) NOT NULL
    CHECK (category IN (
      'MISSING_ENTRY', 'INCORRECT_ENTRY', 'INVENTORY_LOSS',
      'PROFIT_ANOMALY', 'PAYMENT_ANOMALY'
    )),
  severity        VARCHAR(20) NOT NULL
    CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  source_type     VARCHAR(50) NOT NULL
    CHECK (source_type IN ('SALE', 'SALE_LINE', 'REPAIR', 'MOBILE', 'STOCK', 'CASH')),
  source_id       VARCHAR(100) NOT NULL,
  source_ref      VARCHAR(100),
  expected_amount BIGINT,
  actual_amount   BIGINT,
  difference      BIGINT,
  rule_code       VARCHAR(50) NOT NULL,
  explanation     TEXT        NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'REVIEWING', 'RESOLVED', 'FALSE_POSITIVE')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_sa_exceptions_org_branch
  ON sales_analytics_exceptions (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_sa_exceptions_status
  ON sales_analytics_exceptions (status);

CREATE INDEX IF NOT EXISTS idx_sa_exceptions_source_type
  ON sales_analytics_exceptions (source_type);
