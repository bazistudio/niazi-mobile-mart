-- Migration 042: HR & Payroll Foundation
--
-- Purpose:
--   Creates the complete HR, payroll, attendance, shift, and advance ledger
--   schema for Niazi Mobile Mart. All tables are additive — no existing tables
--   are dropped or truncated. Existing tables are only extended via ALTER.
--
-- Tables created (new):
--   staff_shift_templates       — reusable named shift definitions
--   staff_shift_assignments     — employee shift schedule with effective dates
--   staff_salary_configs        — versioned salary configs (effective_from / effective_to)
--   staff_attendance            — first-login-triggered daily attendance records
--   attendance_corrections      — immutable audit trail for attendance corrections
--   payroll_periods             — org-wide payroll period lifecycle
--   salary_records              — per-employee payroll calculation snapshot
--   salary_payments             — individual payment events against salary_records
--   staff_advances              — approved advance disbursement requests
--   staff_advance_transactions  — immutable ledger for advance cash flows
--
-- Tables altered (existing):
--   cash_movements              — movement_type constraint extended to include
--                                 STAFF_ADVANCE and STAFF_SALARY
--
-- Conventions followed (matching existing migrations):
--   - TEXT PRIMARY KEY CHECK(length(id) = 36)  UUIDs stored as text
--   - NUMERIC(12,2) for monetary values (not BIGINT — HR uses fractional PKR)
--   - TEXT NOT NULL for all timestamps (ISO 8601 UTC strings)
--   - ON DELETE RESTRICT for financial FK references
--   - Idempotent: all CREATE TABLE ... IF NOT EXISTS; DROP CONSTRAINT IF EXISTS
--
-- Deployment ordering:
--   Must follow 041_mobile_pos_sales_integration.sql
--   Backend HR code must be deployed AFTER this migration is applied.
--
-- Safety notes:
--   * No existing rows are modified or deleted.
--   * All new tables start empty.
--   * The cash_movements constraint extension is the only change to an
--     existing table; it uses the same DROP/ADD pattern as migrations 025 and 040.
--   * Do NOT apply this migration to production outside a reviewed deployment window.
--
-- Rollback warning:
--   Reversing requires dropping all ten new tables (in reverse FK order) and
--   reverting the cash_movements constraint. Any HR data inserted after this
--   migration must be removed first. The DOWN block is commented out below.

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- ── 1. Extend cash_movements.movement_type to cover HR transactions ───────────

ALTER TABLE cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_movement_type_check;

ALTER TABLE cash_movements
  ADD CONSTRAINT cash_movements_movement_type_check
    CHECK (movement_type IN (
      'SALE_PAYMENT',
      'CUSTOMER_PAYMENT',
      'SUPPLIER_PAYMENT',
      'EXPENSE',
      'CASH_ADJUSTMENT',
      'RETURN_REFUND',
      'STAFF_ADVANCE',
      'STAFF_SALARY'
    ));

-- ── 2. Shift Templates — reusable named shift definitions ─────────────────────

CREATE TABLE IF NOT EXISTS staff_shift_templates (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name                    TEXT NOT NULL CHECK(length(trim(name)) > 0),
    -- Shift times stored as HH:MM 24-hour strings (e.g. '10:00', '21:00')
    shift_start_time        TEXT NOT NULL,
    shift_end_time          TEXT NOT NULL,
    -- Total nominal minutes of the shift (e.g. 660 for 11 hours)
    shift_duration_minutes  INTEGER NOT NULL CHECK(shift_duration_minutes > 0),
    -- Configurable break duration (UNRESOLVED: whether 11h includes break)
    -- Default 0 means unresolved — owner must confirm before payroll calculation
    break_duration_minutes  INTEGER NOT NULL DEFAULT 0 CHECK(break_duration_minutes >= 0),
    -- Late threshold: minutes after shift_start_time before marking late
    late_threshold_minutes  INTEGER NOT NULL DEFAULT 20 CHECK(late_threshold_minutes >= 0),
    -- Working days bitmask: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    -- Stored as JSON array e.g. '[1,2,3,4,5,6]' for Mon-Sat
    working_days_json       TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_org ON staff_shift_templates(organization_id);

-- ── 3. Shift Assignments — employee shift schedule with effective dates ────────

CREATE TABLE IF NOT EXISTS staff_shift_assignments (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    shift_template_id       TEXT NOT NULL REFERENCES staff_shift_templates(id) ON DELETE RESTRICT,
    effective_from          TEXT NOT NULL,   -- YYYY-MM-DD
    effective_to            TEXT,            -- YYYY-MM-DD, NULL = currently active
    assigned_by             TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_user ON staff_shift_assignments(user_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_org  ON staff_shift_assignments(organization_id);

-- Ensure non-overlapping shift assignments per user
-- (business-layer uniqueness: only one active assignment per user at any time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_assignments_active_user
    ON staff_shift_assignments(user_id)
    WHERE effective_to IS NULL;

-- ── 4. Salary Configs — versioned, effective-dated salary records ─────────────

CREATE TABLE IF NOT EXISTS staff_salary_configs (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Salary type: MONTHLY | DAILY | HOURLY
    salary_type             TEXT NOT NULL CHECK(salary_type IN ('MONTHLY', 'DAILY', 'HOURLY')),
    monthly_salary          NUMERIC(12,2),   -- populated when salary_type = MONTHLY
    daily_rate              NUMERIC(12,2),   -- populated when salary_type = DAILY
    hourly_rate             NUMERIC(12,2),   -- populated when salary_type = HOURLY
    -- Overtime multiplier (default 1.5 — owner confirmed)
    overtime_multiplier     NUMERIC(4,2) NOT NULL DEFAULT 1.50
                                CHECK(overtime_multiplier >= 1.0),
    -- Effective date range; effective_to NULL means currently active
    effective_from          TEXT NOT NULL,   -- YYYY-MM-DD
    effective_to            TEXT,            -- YYYY-MM-DD, NULL = currently active
    -- Who created this config and when
    configured_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,

    -- At least one rate must be set
    CONSTRAINT chk_salary_rate_present CHECK (
        monthly_salary IS NOT NULL OR daily_rate IS NOT NULL OR hourly_rate IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_salary_configs_user    ON staff_salary_configs(user_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_salary_configs_org     ON staff_salary_configs(organization_id);

-- Ensure only one active (open-ended) config per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_configs_active_user
    ON staff_salary_configs(user_id)
    WHERE effective_to IS NULL;

-- ── 5. Staff Attendance — first-login-triggered daily attendance ───────────────

CREATE TABLE IF NOT EXISTS staff_attendance (
    id                          TEXT PRIMARY KEY CHECK(length(id) = 36),
    user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Local date in Asia/Karachi (YYYY-MM-DD)
    attendance_date             TEXT NOT NULL,
    -- Authoritative UTC ISO 8601 timestamp of first successful login
    first_login_at              TEXT NOT NULL,
    -- Checkout timestamp (NULL = not yet checked out / unverified)
    checked_out_at              TEXT,
    -- Snapshot of shift config at the time of attendance recording
    shift_start_time_snapshot   TEXT,
    shift_duration_minutes_snap INTEGER,
    late_threshold_minutes_snap INTEGER,
    break_duration_minutes_snap INTEGER NOT NULL DEFAULT 0,
    -- Attendance status: PRESENT | LATE | ABSENT | LEAVE | HOLIDAY | OFF
    status                      TEXT NOT NULL
                                    CHECK(status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'HOLIDAY', 'OFF'))
                                    DEFAULT 'PRESENT',
    -- Minutes late (0 if on time)
    late_minutes                INTEGER NOT NULL DEFAULT 0 CHECK(late_minutes >= 0),
    -- Verified worked minutes (NULL until checkout is confirmed)
    worked_minutes              INTEGER,
    -- Approved overtime minutes (requires explicit approval — not auto-calculated)
    approved_overtime_minutes   INTEGER,
    -- Whether this record was auto-generated (login) or manually entered
    source                      TEXT NOT NULL CHECK(source IN ('LOGIN', 'MANUAL', 'ABSENCE_AUTO'))
                                    DEFAULT 'LOGIN',
    -- Manual entry / correction reference
    recorded_by                 TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- Notes for absence or manual entries
    notes                       TEXT,
    -- Payroll period this record was consumed by (NULL = not yet processed)
    payroll_period_id           TEXT,  -- FK added after payroll_periods table created below
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

-- Idempotency: exactly one attendance record per user per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_date
    ON staff_attendance(user_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_org_date  ON staff_attendance(organization_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_month ON staff_attendance(user_id, attendance_date);

-- ── 6. Attendance Corrections — immutable audit trail ────────────────────────

CREATE TABLE IF NOT EXISTS attendance_corrections (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    attendance_id       TEXT NOT NULL REFERENCES staff_attendance(id) ON DELETE RESTRICT,
    -- Snapshots of what changed
    field_name          TEXT NOT NULL,   -- e.g. 'status', 'late_minutes', 'checked_out_at'
    old_value           TEXT,
    new_value           TEXT,
    correction_reason   TEXT NOT NULL CHECK(length(trim(correction_reason)) > 0),
    corrected_by        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    corrected_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance
    ON attendance_corrections(attendance_id);

-- ── 7. Payroll Periods — org-wide payroll lifecycle ───────────────────────────

CREATE TABLE IF NOT EXISTS payroll_periods (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Human-readable label e.g. 'November 2026'
    label               TEXT NOT NULL CHECK(length(trim(label)) > 0),
    period_start        TEXT NOT NULL,   -- YYYY-MM-DD
    period_end          TEXT NOT NULL,   -- YYYY-MM-DD
    -- Status lifecycle: DRAFT → APPROVED → PAID → CLOSED
    status              TEXT NOT NULL
                            CHECK(status IN ('DRAFT', 'APPROVED', 'PAID', 'CLOSED'))
                            DEFAULT 'DRAFT',
    -- Accumulation reset policy (UNRESOLVED — keep configurable until owner confirms)
    -- MONTHLY | PAYROLL_PERIOD | CARRY_FORWARD
    late_reset_policy   TEXT NOT NULL DEFAULT 'MONTHLY'
                            CHECK(late_reset_policy IN ('MONTHLY', 'PAYROLL_PERIOD', 'CARRY_FORWARD')),
    created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

-- Prevent duplicate open periods for the same org+date range
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periods_org_range
    ON payroll_periods(organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_org_status
    ON payroll_periods(organization_id, status);

-- Now add the deferred FK from staff_attendance.payroll_period_id
ALTER TABLE staff_attendance
    ADD COLUMN IF NOT EXISTS payroll_period_id_fk TEXT
        REFERENCES payroll_periods(id) ON DELETE SET NULL;

-- ── 8. Salary Records — per-employee payroll calculation snapshot ─────────────

CREATE TABLE IF NOT EXISTS salary_records (
    id                              TEXT PRIMARY KEY CHECK(length(id) = 36),
    payroll_period_id               TEXT NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
    user_id                         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id                 TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Salary config snapshot at calculation time
    salary_config_id                TEXT REFERENCES staff_salary_configs(id) ON DELETE RESTRICT,
    salary_type_snapshot            TEXT NOT NULL CHECK(salary_type_snapshot IN ('MONTHLY', 'DAILY', 'HOURLY')),
    base_salary_snapshot            NUMERIC(12,2) NOT NULL CHECK(base_salary_snapshot >= 0),
    -- Attendance summary
    total_working_days              INTEGER NOT NULL DEFAULT 0,
    present_days                    INTEGER NOT NULL DEFAULT 0,
    absent_days                     INTEGER NOT NULL DEFAULT 0,
    late_count                      INTEGER NOT NULL DEFAULT 0,
    -- Late-to-absence conversion (floor(late_count / 3))
    late_absence_equivalents        INTEGER NOT NULL DEFAULT 0,
    -- Calculation inputs
    absence_deduction               NUMERIC(12,2) NOT NULL DEFAULT 0,
    overtime_minutes                INTEGER NOT NULL DEFAULT 0,
    overtime_amount                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonus_amount                    NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Advance recovery (snapshot of recovery amount for this period)
    advance_recovery_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Manual adjustments (positive = bonus, negative = deduction)
    manual_adjustment_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    manual_adjustment_note          TEXT,
    -- Computed totals
    gross_salary                    NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions                NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_payable                     NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Payment tracking
    total_paid                      NUMERIC(12,2) NOT NULL DEFAULT 0,
    remaining_payable               NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Status: DRAFT | APPROVED | PAID | PARTIAL | CANCELLED
    status                          TEXT NOT NULL
                                        CHECK(status IN ('DRAFT', 'APPROVED', 'PAID', 'PARTIAL', 'CANCELLED'))
                                        DEFAULT 'DRAFT',
    approved_by                     TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at                     TEXT,
    created_by                      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at                      TEXT NOT NULL,
    updated_at                      TEXT NOT NULL
);

-- One salary record per user per payroll period
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_records_period_user
    ON salary_records(payroll_period_id, user_id);

CREATE INDEX IF NOT EXISTS idx_salary_records_user   ON salary_records(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_records_org    ON salary_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_records_status ON salary_records(status);

-- ── 9. Salary Payments — individual payment events ────────────────────────────

CREATE TABLE IF NOT EXISTS salary_payments (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    salary_record_id    TEXT NOT NULL REFERENCES salary_records(id) ON DELETE RESTRICT,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    payment_amount      NUMERIC(12,2) NOT NULL CHECK(payment_amount > 0),
    payment_method      TEXT NOT NULL CHECK(payment_method IN (
                            'CASH', 'BANK_TRANSFER', 'CHEQUE', 'EASYPAISA', 'JAZZCASH', 'OTHER'
                        )),
    payment_date        TEXT NOT NULL,   -- YYYY-MM-DD
    reference_number    TEXT,            -- cheque/transfer reference
    notes               TEXT,
    -- Linked cash_movement_id when payment_method = CASH
    cash_movement_id    TEXT REFERENCES cash_movements(id) ON DELETE RESTRICT,
    -- Reversal tracking (immutable: a reversed payment spawns a new reversal record)
    is_reversed         INTEGER NOT NULL DEFAULT 0 CHECK(is_reversed IN (0, 1)),
    reversal_of         TEXT REFERENCES salary_payments(id) ON DELETE RESTRICT,
    reversed_at         TEXT,
    reversed_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
    reversal_reason     TEXT,
    processed_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_record ON salary_payments(salary_record_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_user   ON salary_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_org    ON salary_payments(organization_id, payment_date);

-- ── 10. Staff Advances — approved advance disbursement requests ───────────────

CREATE TABLE IF NOT EXISTS staff_advances (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Requested amount
    requested_amount    NUMERIC(12,2) NOT NULL CHECK(requested_amount > 0),
    -- Disbursed amount (may differ from requested; NULL until disbursed)
    disbursed_amount    NUMERIC(12,2),
    reason              TEXT NOT NULL CHECK(length(trim(reason)) > 0),
    -- Status: PENDING | APPROVED | DISBURSED | FULLY_RECOVERED | CANCELLED
    status              TEXT NOT NULL
                            CHECK(status IN ('PENDING', 'APPROVED', 'DISBURSED', 'FULLY_RECOVERED', 'CANCELLED'))
                            DEFAULT 'PENDING',
    -- Approval
    requested_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TEXT,
    -- Disbursement
    disbursed_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
    disbursed_at        TEXT,
    -- Linked cash movement when paid in cash
    cash_movement_id    TEXT REFERENCES cash_movements(id) ON DELETE RESTRICT,
    -- Outstanding balance (maintained by trigger-equivalent logic in service)
    outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_advances_user   ON staff_advances(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_org    ON staff_advances(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_status ON staff_advances(status);

-- ── 11. Staff Advance Transactions — immutable ledger ────────────────────────

CREATE TABLE IF NOT EXISTS staff_advance_transactions (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    advance_id          TEXT NOT NULL REFERENCES staff_advances(id) ON DELETE RESTRICT,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Transaction type: DISBURSEMENT | RECOVERY | MANUAL_REPAYMENT | ADJUSTMENT | REVERSAL
    transaction_type    TEXT NOT NULL
                            CHECK(transaction_type IN (
                                'DISBURSEMENT', 'RECOVERY', 'MANUAL_REPAYMENT',
                                'ADJUSTMENT', 'REVERSAL'
                            )),
    -- Amount: positive = money out to employee (DISBURSEMENT), negative = recovery
    amount              NUMERIC(12,2) NOT NULL,
    -- Running balance after this transaction
    balance_after       NUMERIC(12,2) NOT NULL,
    -- Link to salary_record when this is a payroll deduction recovery
    -- Strictly typed FK (not plain TEXT — Phase 1.2 requirement)
    salary_record_id    TEXT REFERENCES salary_records(id) ON DELETE RESTRICT,
    -- Link to cash_movement when cash is involved
    cash_movement_id    TEXT REFERENCES cash_movements(id) ON DELETE RESTRICT,
    -- Reversal tracking: a reversal creates a new row referencing the reversed row
    reversal_of         TEXT REFERENCES staff_advance_transactions(id) ON DELETE RESTRICT,
    notes               TEXT,
    created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adv_transactions_advance ON staff_advance_transactions(advance_id);
CREATE INDEX IF NOT EXISTS idx_adv_transactions_user    ON staff_advance_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_adv_transactions_salary  ON staff_advance_transactions(salary_record_id);

-- ── 12. HR change_log entries — HR events use existing audit infrastructure ───
-- No separate hr_audit_logs table; HR events are recorded in the existing
-- change_log table (created in migration 003_add_change_log.sql).
-- event_type values: HR_SALARY_CONFIG_SET, HR_PAYROLL_APPROVED, HR_SALARY_PAID,
--                    HR_ADVANCE_DISBURSED, HR_ADVANCE_RECOVERED, HR_ATTENDANCE_CORRECTED

-- ─── DOWN (rollback — will fail if any HR data rows exist) ───────────────────
-- DROP INDEX IF EXISTS idx_adv_transactions_salary;
-- DROP INDEX IF EXISTS idx_adv_transactions_user;
-- DROP INDEX IF EXISTS idx_adv_transactions_advance;
-- DROP TABLE IF EXISTS staff_advance_transactions;
-- DROP TABLE IF EXISTS staff_advances;
-- DROP INDEX IF EXISTS idx_salary_payments_org;
-- DROP INDEX IF EXISTS idx_salary_payments_user;
-- DROP INDEX IF EXISTS idx_salary_payments_record;
-- DROP TABLE IF EXISTS salary_payments;
-- DROP INDEX IF EXISTS idx_salary_records_status;
-- DROP INDEX IF EXISTS idx_salary_records_org;
-- DROP INDEX IF EXISTS idx_salary_records_user;
-- DROP INDEX IF EXISTS idx_salary_records_period_user;
-- DROP TABLE IF EXISTS salary_records;
-- ALTER TABLE staff_attendance DROP COLUMN IF EXISTS payroll_period_id_fk;
-- DROP INDEX IF EXISTS idx_payroll_periods_org_status;
-- DROP INDEX IF EXISTS idx_payroll_periods_org_range;
-- DROP TABLE IF EXISTS payroll_periods;
-- DROP TABLE IF EXISTS attendance_corrections;
-- DROP INDEX IF EXISTS idx_attendance_user_month;
-- DROP INDEX IF EXISTS idx_attendance_org_date;
-- DROP INDEX IF EXISTS idx_attendance_user_date;
-- DROP TABLE IF EXISTS staff_attendance;
-- DROP INDEX IF EXISTS idx_salary_configs_active_user;
-- DROP INDEX IF EXISTS idx_salary_configs_org;
-- DROP INDEX IF EXISTS idx_salary_configs_user;
-- DROP TABLE IF EXISTS staff_salary_configs;
-- DROP INDEX IF EXISTS idx_shift_assignments_active_user;
-- DROP INDEX IF EXISTS idx_shift_assignments_org;
-- DROP INDEX IF EXISTS idx_shift_assignments_user;
-- DROP TABLE IF EXISTS staff_shift_assignments;
-- DROP INDEX IF EXISTS idx_shift_templates_org;
-- DROP TABLE IF EXISTS staff_shift_templates;
-- ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_movement_type_check;
-- ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_movement_type_check
--   CHECK (movement_type IN (
--     'SALE_PAYMENT','CUSTOMER_PAYMENT','SUPPLIER_PAYMENT',
--     'EXPENSE','CASH_ADJUSTMENT','RETURN_REFUND'
--   ));
