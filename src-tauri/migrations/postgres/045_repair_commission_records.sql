-- =============================================================================
-- Migration 045 — Repair Commission Records
-- =============================================================================
-- Creates the repair_commission_records table for permanent audit-safe storage
-- of mechanic commission and organization profit-share calculations.
--
-- Every completed repair job produces exactly one commission record (via
-- ON CONFLICT (repair_job_id) DO NOTHING idempotency guard).
--
-- calc_status values:
--   CALCULATED   — commission successfully calculated; org and mechanic shares set
--   NO_TECHNICIAN — job had no technician_id; both shares are 0
--   NO_CONFIG    — technician has no active COMMISSION_PERCENTAGE salary config
--   SHORTFALL    — customer charge < protected value; commissionable pool is 0
--   ZERO_POOL    — customer charge exactly equals protected value; pool is 0
--
-- Financial columns store whole PKR rupees (BIGINT, non-negative).
-- mechanic_pct_snapshot and org_pct_snapshot are NUMERIC(5,2) snapshots at
-- calculation time for full auditability even if HR config changes later.
-- =============================================================================

CREATE TABLE IF NOT EXISTS repair_commission_records (
    id                      TEXT        PRIMARY KEY CHECK(length(id) = 36),
    repair_job_id           UUID        NOT NULL REFERENCES repair_jobs(id) ON DELETE RESTRICT,
    branch_id               TEXT        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    organization_id         TEXT        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    technician_id           TEXT        REFERENCES users(id) ON DELETE SET NULL,

    -- Invoice snapshot
    invoice_number          TEXT        NOT NULL DEFAULT '',

    -- Calculation status
    calc_status             TEXT        NOT NULL
                                CHECK(calc_status IN ('CALCULATED','NO_TECHNICIAN','NO_CONFIG','SHORTFALL','ZERO_POOL')),

    -- Input amounts (whole PKR)
    final_charge            BIGINT      NOT NULL DEFAULT 0 CHECK(final_charge >= 0),
    protected_org_value     BIGINT      NOT NULL DEFAULT 0 CHECK(protected_org_value >= 0),
    commissionable_amount   BIGINT      NOT NULL DEFAULT 0 CHECK(commissionable_amount >= 0),

    -- Percentage snapshots at calculation time
    mechanic_pct_snapshot   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(mechanic_pct_snapshot >= 0 AND mechanic_pct_snapshot <= 100),
    org_pct_snapshot        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(org_pct_snapshot >= 0 AND org_pct_snapshot <= 100),

    -- Resulting shares (whole PKR)
    org_commission          BIGINT      NOT NULL DEFAULT 0 CHECK(org_commission >= 0),
    mechanic_commission     BIGINT      NOT NULL DEFAULT 0 CHECK(mechanic_commission >= 0),

    -- Shortfall (positive when final_charge < protected_org_value)
    shortfall               BIGINT      NOT NULL DEFAULT 0 CHECK(shortfall >= 0),

    -- Timing and attribution
    delivered_at            TEXT        NOT NULL DEFAULT '',
    created_by              TEXT        REFERENCES users(id) ON DELETE SET NULL,
    created_at              TEXT        NOT NULL DEFAULT '',

    -- Idempotency: one record per repair job
    CONSTRAINT uq_repair_commission_job UNIQUE (repair_job_id)
);

-- Index for mechanic earnings lookup (HR reporting, payroll integration)
CREATE INDEX IF NOT EXISTS idx_rcr_technician
    ON repair_commission_records(technician_id);

-- Index for org/branch financial reporting
CREATE INDEX IF NOT EXISTS idx_rcr_branch
    ON repair_commission_records(branch_id);

CREATE INDEX IF NOT EXISTS idx_rcr_org
    ON repair_commission_records(organization_id);

-- Index for status filtering (admin dashboards)
CREATE INDEX IF NOT EXISTS idx_rcr_status
    ON repair_commission_records(calc_status);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_rcr_delivered_at
    ON repair_commission_records(delivered_at);

COMMENT ON TABLE repair_commission_records IS
    'Permanent audit record of mechanic commission and org profit-share for each completed repair job.';

COMMENT ON COLUMN repair_commission_records.protected_org_value IS
    'Sum of (qty x products.sale_price) for all catalog parts used. Authoritative DB value, not client snapshot.';

COMMENT ON COLUMN repair_commission_records.commissionable_amount IS
    'MAX(0, final_charge - protected_org_value). The pool split between org and mechanic.';

COMMENT ON COLUMN repair_commission_records.mechanic_pct_snapshot IS
    'Snapshot of staff_salary_configs.commission_percentage at time of delivery.';

COMMENT ON COLUMN repair_commission_records.org_pct_snapshot IS
    'Derived as 100 - mechanic_pct_snapshot. Stored for auditability.';

COMMENT ON COLUMN repair_commission_records.org_commission IS
    'floor(commissionable_amount * org_pct_snapshot / 100). Org gets floor; mechanic gets exact remainder.';

COMMENT ON COLUMN repair_commission_records.mechanic_commission IS
    'commissionable_amount - org_commission. Exact remainder after org floor.';

COMMENT ON COLUMN repair_commission_records.shortfall IS
    'MAX(0, protected_org_value - final_charge). Positive when customer charge is below protected value.';
