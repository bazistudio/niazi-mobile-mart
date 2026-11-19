-- Migration 048: HR Configurable Policy Settings Foundation & Audit Log
--
-- Purpose:
--   Establishes the database foundation for configurable HR policy settings
--   (working hours, late thresholds, absence conversions, and overtime rules).
--   Supports organization-wide defaults and branch-specific policy overrides
--   with effective dating and an immutable audit log.
--
-- Context:
--   - Replaces hardcoded application constants with administrator-configurable policies.
--   - Replaces client-side browser localStorage storage with authoritative PostgreSQL persistence.
--   - Follows canonical table conventions (UUIDs as 36-char TEXT, ISO 8601 UTC timestamps as TEXT).
--   - Concurrency and overlap protections enforced at database & application layers.
--
-- Safety:
--   - Additive only: creates 2 new tables and indexes.
--   - Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
--   - Strictly zero data destruction.
--
-- Ordering: Must follow 047_hr_attendance_foundation.sql.

-- ── 1. HR Policy Settings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_policy_settings (
    id                          TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id                   TEXT REFERENCES branches(id) ON DELETE CASCADE,
    -- Core policy parameters
    standard_shift_minutes      INTEGER NOT NULL DEFAULT 660 CHECK(standard_shift_minutes > 0),
    late_threshold_minutes      INTEGER NOT NULL DEFAULT 20 CHECK(late_threshold_minutes >= 0),
    lates_for_absence           INTEGER NOT NULL DEFAULT 3 CHECK(lates_for_absence > 0),
    monthly_working_days        INTEGER NOT NULL DEFAULT 26 CHECK(monthly_working_days > 0),
    overtime_multiplier         NUMERIC(4,2) NOT NULL DEFAULT 1.50 CHECK(overtime_multiplier >= 1.00),
    overtime_eligible_monthly   BOOLEAN NOT NULL DEFAULT TRUE,
    half_day_deduction_factor   NUMERIC(4,2) NOT NULL DEFAULT 0.50 CHECK(half_day_deduction_factor >= 0.00 AND half_day_deduction_factor <= 1.00),
    -- Effective date boundaries: YYYY-MM-DD
    effective_from              TEXT NOT NULL CHECK(effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
    effective_to                TEXT CHECK(effective_to IS NULL OR (effective_to ~ '^\d{4}-\d{2}-\d{2}$' AND effective_to >= effective_from)),
    -- Metadata
    created_by                  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

-- Index for tenant and branch resolution
CREATE INDEX IF NOT EXISTS idx_hr_policy_settings_org_branch
    ON hr_policy_settings(organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_hr_policy_settings_dates
    ON hr_policy_settings(effective_from, effective_to);

-- Ensure only ONE currently active (open-ended) policy exists per organization default (branch_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_policy_active_org_default
    ON hr_policy_settings(organization_id)
    WHERE branch_id IS NULL AND effective_to IS NULL;

-- Ensure only ONE currently active (open-ended) policy exists per branch override
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_policy_active_branch_override
    ON hr_policy_settings(organization_id, branch_id)
    WHERE branch_id IS NOT NULL AND effective_to IS NULL;

-- ── 2. HR Policy Audit Log (Immutable History) ────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_policy_audit_log (
    id                          TEXT PRIMARY KEY CHECK(length(id) = 36),
    policy_id                   TEXT NOT NULL REFERENCES hr_policy_settings(id) ON DELETE RESTRICT,
    organization_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id                   TEXT REFERENCES branches(id) ON DELETE SET NULL,
    action                      TEXT NOT NULL CHECK(action IN ('CREATE', 'UPDATE', 'RETIRE')),
    old_values_json             TEXT,
    new_values_json             TEXT NOT NULL,
    changed_by                  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    changed_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_policy_audit_policy
    ON hr_policy_audit_log(policy_id);

CREATE INDEX IF NOT EXISTS idx_hr_policy_audit_org
    ON hr_policy_audit_log(organization_id, changed_at);
