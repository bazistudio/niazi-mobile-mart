-- Migration 047: HR Attendance Foundation
--
-- Purpose:
--   Extends staff_attendance with branch_id (for branch-level context in
--   manual attendance records) and creates the v_attendance_monthly_summary
--   view consumed by getAnnualAttendanceSummary() in hr.attendance.service.ts.
--
-- Context:
--   Migration 042 created staff_attendance without a branch_id column.
--   hr.attendance.service.ts fetches branch_id from users and stores it
--   with each manual attendance record.
--   The view is an optimised read path; the service falls back to an inline
--   GROUP BY query if the view is unavailable.
--
-- Safety:
--   - Additive only: no existing columns dropped or existing data removed.
--   - ADD COLUMN IF NOT EXISTS: safe to re-run.
--   - Existing rows backfilled from users.branch_id (NULL when user has no branch).
--   - CREATE OR REPLACE VIEW: safe to re-run.
--
-- Ordering: Must follow 046_repair_notifications.sql.

-- ── 1. Add branch_id to staff_attendance ─────────────────────────────────────

ALTER TABLE staff_attendance
  ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL;

-- Back-fill from users.branch_id for existing attendance rows
UPDATE staff_attendance sa
SET branch_id = u.branch_id
FROM users u
WHERE sa.user_id = u.id
  AND sa.branch_id IS NULL
  AND u.branch_id IS NOT NULL;

-- ── 2. Monthly summary view ───────────────────────────────────────────────────
-- Used by getAnnualAttendanceSummary() as the primary query path.
-- Aggregates staff_attendance by user/year/month for the annual summary panel.

CREATE OR REPLACE VIEW v_attendance_monthly_summary AS
SELECT
  user_id,
  organization_id,
  EXTRACT(YEAR  FROM attendance_date::date)::INT AS year,
  EXTRACT(MONTH FROM attendance_date::date)::INT AS month,
  COUNT(*)::INT                                                                              AS total_records,
  COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE'))::INT                                 AS present_days,
  COUNT(*) FILTER (WHERE status = 'ABSENT')::INT                                            AS absent_days,
  COUNT(*) FILTER (WHERE status = 'LATE')::INT                                              AS late_days,
  COUNT(*) FILTER (WHERE status IN ('LEAVE','HALF_DAY'))::INT                               AS leave_days,
  COALESCE(SUM(worked_minutes)             FILTER (WHERE worked_minutes             IS NOT NULL), 0)::INT AS total_worked_minutes,
  COALESCE(SUM(late_minutes)               FILTER (WHERE late_minutes > 0),                       0)::INT AS total_late_minutes,
  COALESCE(SUM(approved_overtime_minutes)  FILTER (WHERE approved_overtime_minutes  IS NOT NULL), 0)::INT AS total_overtime_minutes
FROM staff_attendance
GROUP BY
  user_id,
  organization_id,
  EXTRACT(YEAR  FROM attendance_date::date),
  EXTRACT(MONTH FROM attendance_date::date);
