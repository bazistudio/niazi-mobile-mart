-- Migration 043: HR Schema Corrections
-- Aligns database schema with frontend contract gaps identified in audit.
--
-- Changes:
--   1. staff_attendance.status CHECK  → add HALF_DAY, WEEKLY_OFF
--   2. payroll_periods                → add period_month (INT), period_year (INT)
--   3. salary_records.status CHECK    → rename PARTIAL → PARTIALLY_PAID
--   4. staff_salary_configs.salary_type CHECK → add COMMISSION_PERCENTAGE
--   5. staff_salary_configs           → add commission_percentage NUMERIC(5,2)
--   6. staff_advances                 → add requested_date TEXT, disbursement_method TEXT
--
-- All changes are idempotent (safe to re-run).
-- NO data destruction. All existing rows remain valid.
-- DO NOT execute against production without a schema backup.

BEGIN;

-- ─── 1. staff_attendance.status: extend CHECK to include HALF_DAY, WEEKLY_OFF ─

-- PostgreSQL does not support ALTER CONSTRAINT directly on a named CHECK.
-- Strategy: drop the old CHECK, add a new one that is a superset.

ALTER TABLE staff_attendance
  DROP CONSTRAINT IF EXISTS staff_attendance_status_check;

ALTER TABLE staff_attendance
  ADD CONSTRAINT staff_attendance_status_check
    CHECK (status IN (
      'PRESENT',
      'LATE',
      'ABSENT',
      'HALF_DAY',
      'LEAVE',
      'HOLIDAY',
      'WEEKLY_OFF',
      'OFF'
    ));

-- ─── 2. payroll_periods: add period_month and period_year columns ───────────

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS period_month INT,
  ADD COLUMN IF NOT EXISTS period_year  INT;

-- Back-fill from existing period_start where columns are NULL.
-- period_start is stored as TEXT in ISO 8601 format (YYYY-MM-DD).
UPDATE payroll_periods
SET
  period_month = EXTRACT(MONTH FROM period_start::date)::int,
  period_year  = EXTRACT(YEAR  FROM period_start::date)::int
WHERE period_month IS NULL
  AND period_start IS NOT NULL
  AND period_start ~ '^\d{4}-\d{2}-\d{2}';

-- ─── 3. salary_records.status: rename PARTIAL → PARTIALLY_PAID ──────────────

-- Migrate any existing PARTIAL rows first, then replace the CHECK.
UPDATE salary_records
  SET status = 'PARTIALLY_PAID'
WHERE status = 'PARTIAL';

ALTER TABLE salary_records
  DROP CONSTRAINT IF EXISTS salary_records_status_check;

ALTER TABLE salary_records
  ADD CONSTRAINT salary_records_status_check
    CHECK (status IN (
      'DRAFT',
      'APPROVED',
      'PARTIALLY_PAID',
      'PAID',
      'CANCELLED'
    ));

-- ─── 4. staff_salary_configs.salary_type: add COMMISSION_PERCENTAGE ─────────

ALTER TABLE staff_salary_configs
  DROP CONSTRAINT IF EXISTS staff_salary_configs_salary_type_check;

ALTER TABLE staff_salary_configs
  ADD CONSTRAINT staff_salary_configs_salary_type_check
    CHECK (salary_type IN (
      'MONTHLY',
      'DAILY',
      'HOURLY',
      'COMMISSION_PERCENTAGE'
    ));

-- ─── 5. staff_salary_configs: add commission_percentage column ──────────────

ALTER TABLE staff_salary_configs
  ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN staff_salary_configs.commission_percentage IS
  'Percentage of sales revenue paid as salary. Used when salary_type = COMMISSION_PERCENTAGE. '
  'Stored as a plain percentage value (e.g. 5.00 = 5%). '
  'Payroll engine does NOT auto-calculate commission — amount must be entered manually.';

-- ─── 6. staff_advances: add requested_date and disbursement_method ───────────

ALTER TABLE staff_advances
  ADD COLUMN IF NOT EXISTS requested_date     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disbursement_method TEXT DEFAULT NULL;

COMMENT ON COLUMN staff_advances.requested_date IS
  'ISO 8601 date (YYYY-MM-DD) when the advance was requested. '
  'May differ from created_at if entered retroactively.';

COMMENT ON COLUMN staff_advances.disbursement_method IS
  'Payment method used to disburse the advance (e.g. CASH, BANK_TRANSFER, CHEQUE). '
  'Set at disbursement time by the disbursing admin.';

-- Back-fill requested_date from created_at for existing rows where it is NULL.
UPDATE staff_advances
  SET requested_date = LEFT(created_at, 10)
WHERE requested_date IS NULL
  AND created_at IS NOT NULL;

COMMIT;
