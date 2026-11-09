/**
 * HR Repository — PostgreSQL data access for HR & Payroll domain.
 *
 * All queries reference the tables created in migration 042_hr_payroll_foundation.sql.
 * This file is the single SQL authority for the HR domain; no SQL lives in routes or service.
 *
 * Monetary type: NUMERIC(12,2) — stored as string from pg, parsed to number in service.
 * IDs: UUID v4 strings, 36 chars.
 * Timestamps: ISO 8601 UTC strings (TEXT columns in DB).
 */

import { Pool, PoolClient } from 'pg';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StaffSalaryConfigRow {
  id: string;
  user_id: string;
  organization_id: string;
  salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY' | 'COMMISSION_PERCENTAGE';
  commission_percentage: string | null;
  monthly_salary: string | null;
  daily_rate: string | null;
  hourly_rate: string | null;
  overtime_multiplier: string;
  effective_from: string;
  effective_to: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  shift_start_time: string;
  shift_end_time: string;
  shift_duration_minutes: number;
  break_duration_minutes: number;
  late_threshold_minutes: number;
  working_days_json: string;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendanceRow {
  id: string;
  user_id: string;
  organization_id: string;
  attendance_date: string;
  first_login_at: string;
  checked_out_at: string | null;
  shift_start_time_snapshot: string | null;
  shift_duration_minutes_snap: number | null;
  late_threshold_minutes_snap: number | null;
  break_duration_minutes_snap: number;
  status: string;
  late_minutes: number;
  worked_minutes: number | null;
  approved_overtime_minutes: number | null;
  source: string;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollPeriodRow {
  id: string;
  organization_id: string;
  label: string;
  period_start: string;
  period_end: string;
  /** Added by migration 043 — may be NULL for rows created before the migration */
  period_month: number | null;
  /** Added by migration 043 — may be NULL for rows created before the migration */
  period_year: number | null;
  status: string;
  late_reset_policy: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryRecordRow {
  id: string;
  payroll_period_id: string;
  user_id: string;
  organization_id: string;
  salary_config_id: string | null;
  salary_type_snapshot: string;
  base_salary_snapshot: string;
  total_working_days: number;
  present_days: number;
  absent_days: number;
  late_count: number;
  late_absence_equivalents: number;
  absence_deduction: string;
  overtime_minutes: number;
  overtime_amount: string;
  bonus_amount: string;
  advance_recovery_amount: string;
  manual_adjustment_amount: string;
  manual_adjustment_note: string | null;
  gross_salary: string;
  total_deductions: string;
  net_payable: string;
  total_paid: string;
  remaining_payable: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAdvanceRow {
  id: string;
  user_id: string;
  organization_id: string;
  requested_amount: string;
  disbursed_amount: string | null;
  reason: string;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  cash_movement_id: string | null;
  outstanding_balance: string;
  requested_date: string | null;
  disbursement_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAdvanceTransactionRow {
  id: string;
  advance_id: string;
  user_id: string;
  organization_id: string;
  transaction_type: string;
  amount: string;
  balance_after: string;
  salary_record_id: string | null;
  cash_movement_id: string | null;
  reversal_of: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

/**
 * Record first-login attendance for today (Asia/Karachi date).
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 * Returns the inserted row, or null if already exists for today.
 */
export async function recordLoginAttendance(
  pool: Pool,
  params: {
    id: string;
    user_id: string;
    organization_id: string;
    attendance_date: string;      // YYYY-MM-DD in Asia/Karachi
    first_login_at: string;       // ISO 8601 UTC
    shift_start_time_snapshot: string | null;
    late_threshold_minutes_snap: number;
    break_duration_minutes_snap: number;
    status: 'PRESENT' | 'LATE';
    late_minutes: number;
    now_utc: string;
  }
): Promise<StaffAttendanceRow | null> {
  const result = await pool.query<StaffAttendanceRow>(
    `INSERT INTO staff_attendance (
       id, user_id, organization_id, attendance_date, first_login_at,
       shift_start_time_snapshot, late_threshold_minutes_snap, break_duration_minutes_snap,
       status, late_minutes, source, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'LOGIN',$11,$11)
     ON CONFLICT (user_id, attendance_date) DO NOTHING
     RETURNING *`,
    [
      params.id,
      params.user_id,
      params.organization_id,
      params.attendance_date,
      params.first_login_at,
      params.shift_start_time_snapshot,
      params.late_threshold_minutes_snap,
      params.break_duration_minutes_snap,
      params.status,
      params.late_minutes,
      params.now_utc,
    ]
  );
  return result.rows[0] ?? null;
}

/**
 * Get attendance records for a user in a given month.
 */
export async function getAttendanceForUserMonth(
  pool: Pool,
  user_id: string,
  year: number,
  month: number
): Promise<StaffAttendanceRow[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const result = await pool.query<StaffAttendanceRow>(
    `SELECT *,
            first_login_at                AS check_in_at,
            checked_out_at               AS check_out_at,
            shift_duration_minutes_snap  AS shift_duration_minutes
     FROM staff_attendance
     WHERE user_id = $1
       AND attendance_date >= $2
       AND attendance_date <= $3
     ORDER BY attendance_date ASC`,
    [user_id, startDate, endDate]
  );
  return result.rows;
}

/**
 * Get attendance summary (counts) for a user in a given period.
 */
export async function getAttendanceSummary(
  pool: Pool,
  user_id: string,
  period_start: string,
  period_end: string
): Promise<{
  total_days: number;
  present_days: number;
  absent_days: number;
  late_count: number;
}> {
  const result = await pool.query<{
    present_days: string;
    absent_days: string;
    late_count: string;
    total_days: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE')) AS present_days,
       COUNT(*) FILTER (WHERE status = 'ABSENT') AS absent_days,
       COUNT(*) FILTER (WHERE status = 'LATE') AS late_count,
       COUNT(*) AS total_days
     FROM staff_attendance
     WHERE user_id = $1
       AND attendance_date >= $2
       AND attendance_date <= $3`,
    [user_id, period_start, period_end]
  );
  const row = result.rows[0];
  return {
    total_days: parseInt(row?.total_days ?? '0', 10),
    present_days: parseInt(row?.present_days ?? '0', 10),
    absent_days: parseInt(row?.absent_days ?? '0', 10),
    late_count: parseInt(row?.late_count ?? '0', 10),
  };
}

// ─── Salary Config ────────────────────────────────────────────────────────────

/**
 * Get active (open-ended) salary config for a user.
 */
export async function getActiveSalaryConfig(
  pool: Pool,
  user_id: string
): Promise<StaffSalaryConfigRow | null> {
  const result = await pool.query<StaffSalaryConfigRow>(
    `SELECT * FROM staff_salary_configs
     WHERE user_id = $1 AND effective_to IS NULL
     LIMIT 1`,
    [user_id]
  );
  return result.rows[0] ?? null;
}

/**
 * Get salary config history for a user (all versions, newest first).
 */
export async function getSalaryConfigHistory(
  pool: Pool,
  user_id: string
): Promise<StaffSalaryConfigRow[]> {
  const result = await pool.query<StaffSalaryConfigRow>(
    `SELECT * FROM staff_salary_configs
     WHERE user_id = $1
     ORDER BY effective_from DESC`,
    [user_id]
  );
  return result.rows;
}

/**
 * Close the current active salary config (set effective_to = today) and
 * insert a new one — all in one transaction.
 */
export async function setSalaryConfig(
  client: PoolClient,
  params: {
    new_id: string;
    user_id: string;
    organization_id: string;
    salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY' | 'COMMISSION_PERCENTAGE';
    monthly_salary: number | null;
    daily_rate: number | null;
    hourly_rate: number | null;
    overtime_multiplier: number;
    commission_percentage: number | null;
    effective_from: string;   // YYYY-MM-DD
    configured_by: string;
    now_utc: string;
  }
): Promise<StaffSalaryConfigRow> {
  // Close previous active config (set effective_to = day before effective_from)
  await client.query(
    `UPDATE staff_salary_configs
     SET effective_to = ($1::date - INTERVAL '1 day')::text, updated_at = $2
     WHERE user_id = $3 AND effective_to IS NULL`,
    [params.effective_from, params.now_utc, params.user_id]
  );

  const result = await client.query<StaffSalaryConfigRow>(
    `INSERT INTO staff_salary_configs (
       id, user_id, organization_id, salary_type,
       monthly_salary, daily_rate, hourly_rate, overtime_multiplier,
       commission_percentage,
       effective_from, effective_to, configured_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$12)
     RETURNING *`,
    [
      params.new_id,
      params.user_id,
      params.organization_id,
      params.salary_type,
      params.monthly_salary,
      params.daily_rate,
      params.hourly_rate,
      params.overtime_multiplier,
      params.commission_percentage,
      params.effective_from,
      params.configured_by,
      params.now_utc,
    ]
  );
  return result.rows[0];
}

// ─── Shift Templates ──────────────────────────────────────────────────────────

export async function listShiftTemplates(
  pool: Pool,
  organization_id: string
): Promise<ShiftTemplateRow[]> {
  const result = await pool.query<ShiftTemplateRow>(
    `SELECT * FROM staff_shift_templates
     WHERE organization_id = $1 AND is_active = 1
     ORDER BY name ASC`,
    [organization_id]
  );
  return result.rows;
}

export async function createShiftTemplate(
  pool: Pool,
  params: {
    id: string;
    organization_id: string;
    name: string;
    shift_start_time: string;
    shift_end_time: string;
    shift_duration_minutes: number;
    break_duration_minutes: number;
    late_threshold_minutes: number;
    working_days_json: string;
    created_by: string;
    now_utc: string;
  }
): Promise<ShiftTemplateRow> {
  const result = await pool.query<ShiftTemplateRow>(
    `INSERT INTO staff_shift_templates (
       id, organization_id, name, shift_start_time, shift_end_time,
       shift_duration_minutes, break_duration_minutes, late_threshold_minutes,
       working_days_json, is_active, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$11)
     RETURNING *`,
    [
      params.id,
      params.organization_id,
      params.name,
      params.shift_start_time,
      params.shift_end_time,
      params.shift_duration_minutes,
      params.break_duration_minutes,
      params.late_threshold_minutes,
      params.working_days_json,
      params.created_by,
      params.now_utc,
    ]
  );
  return result.rows[0];
}

/**
 * Get the active shift template for a user on a given date.
 * Returns null if no shift assignment exists.
 */
export async function getActiveShiftForUser(
  pool: Pool,
  user_id: string,
  date: string
): Promise<ShiftTemplateRow | null> {
  const result = await pool.query<ShiftTemplateRow>(
    `SELECT t.* FROM staff_shift_templates t
     INNER JOIN staff_shift_assignments a ON a.shift_template_id = t.id
     WHERE a.user_id = $1
       AND a.effective_from <= $2
       AND (a.effective_to IS NULL OR a.effective_to >= $2)
     LIMIT 1`,
    [user_id, date]
  );
  return result.rows[0] ?? null;
}

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export async function createPayrollPeriod(
  pool: Pool,
  params: {
    id: string;
    organization_id: string;
    label: string;
    period_start: string;
    period_end: string;
    late_reset_policy: string;
    created_by: string;
    now_utc: string;
  }
): Promise<PayrollPeriodRow> {
  const result = await pool.query<PayrollPeriodRow>(
    `INSERT INTO payroll_periods (
       id, organization_id, label, period_start, period_end,
       status, late_reset_policy, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$8)
     RETURNING *`,
    [
      params.id,
      params.organization_id,
      params.label,
      params.period_start,
      params.period_end,
      params.late_reset_policy,
      params.created_by,
      params.now_utc,
    ]
  );
  return result.rows[0];
}

export async function listPayrollPeriods(
  pool: Pool,
  organization_id: string
): Promise<PayrollPeriodRow[]> {
  const result = await pool.query<PayrollPeriodRow>(
    `SELECT * FROM payroll_periods
     WHERE organization_id = $1
     ORDER BY period_start DESC`,
    [organization_id]
  );
  return result.rows;
}

export async function getPayrollPeriodById(
  pool: Pool,
  id: string
): Promise<PayrollPeriodRow | null> {
  const result = await pool.query<PayrollPeriodRow>(
    `SELECT * FROM payroll_periods WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function approvePayrollPeriod(
  pool: Pool,
  id: string,
  approved_by: string,
  now_utc: string
): Promise<PayrollPeriodRow | null> {
  const result = await pool.query<PayrollPeriodRow>(
    `UPDATE payroll_periods
     SET status = 'APPROVED', approved_by = $2, approved_at = $3, updated_at = $3
     WHERE id = $1 AND status = 'DRAFT'
     RETURNING *`,
    [id, approved_by, now_utc]
  );
  return result.rows[0] ?? null;
}

// ─── Salary Records ───────────────────────────────────────────────────────────

export async function upsertSalaryRecord(
  client: PoolClient,
  params: {
    id: string;
    payroll_period_id: string;
    user_id: string;
    organization_id: string;
    salary_config_id: string | null;
    salary_type_snapshot: string;
    base_salary_snapshot: number;
    total_working_days: number;
    present_days: number;
    absent_days: number;
    late_count: number;
    late_absence_equivalents: number;
    absence_deduction: number;
    overtime_minutes: number;
    overtime_amount: number;
    bonus_amount: number;
    advance_recovery_amount: number;
    manual_adjustment_amount: number;
    manual_adjustment_note: string | null;
    gross_salary: number;
    total_deductions: number;
    net_payable: number;
    created_by: string;
    now_utc: string;
  }
): Promise<SalaryRecordRow> {
  const result = await client.query<SalaryRecordRow>(
    `INSERT INTO salary_records (
       id, payroll_period_id, user_id, organization_id, salary_config_id,
       salary_type_snapshot, base_salary_snapshot,
       total_working_days, present_days, absent_days, late_count, late_absence_equivalents,
       absence_deduction, overtime_minutes, overtime_amount,
       bonus_amount, advance_recovery_amount,
       manual_adjustment_amount, manual_adjustment_note,
       gross_salary, total_deductions, net_payable,
       total_paid, remaining_payable, status,
       created_by, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
       0,$22,'DRAFT',$23,$24,$24
     )
     ON CONFLICT (payroll_period_id, user_id) DO UPDATE SET
       salary_type_snapshot   = EXCLUDED.salary_type_snapshot,
       base_salary_snapshot   = EXCLUDED.base_salary_snapshot,
       total_working_days     = EXCLUDED.total_working_days,
       present_days           = EXCLUDED.present_days,
       absent_days            = EXCLUDED.absent_days,
       late_count             = EXCLUDED.late_count,
       late_absence_equivalents = EXCLUDED.late_absence_equivalents,
       absence_deduction      = EXCLUDED.absence_deduction,
       overtime_minutes       = EXCLUDED.overtime_minutes,
       overtime_amount        = EXCLUDED.overtime_amount,
       bonus_amount           = EXCLUDED.bonus_amount,
       advance_recovery_amount = EXCLUDED.advance_recovery_amount,
       manual_adjustment_amount = EXCLUDED.manual_adjustment_amount,
       manual_adjustment_note = EXCLUDED.manual_adjustment_note,
       gross_salary           = EXCLUDED.gross_salary,
       total_deductions       = EXCLUDED.total_deductions,
       net_payable            = EXCLUDED.net_payable,
       remaining_payable      = EXCLUDED.net_payable,
       updated_at             = EXCLUDED.updated_at
     WHERE salary_records.status = 'DRAFT'
     RETURNING *`,
    [
      params.id,
      params.payroll_period_id,
      params.user_id,
      params.organization_id,
      params.salary_config_id,
      params.salary_type_snapshot,
      params.base_salary_snapshot,
      params.total_working_days,
      params.present_days,
      params.absent_days,
      params.late_count,
      params.late_absence_equivalents,
      params.absence_deduction,
      params.overtime_minutes,
      params.overtime_amount,
      params.bonus_amount,
      params.advance_recovery_amount,
      params.manual_adjustment_amount,
      params.manual_adjustment_note,
      params.gross_salary,
      params.total_deductions,
      params.net_payable,
      params.created_by,
      params.now_utc,
    ]
  );
  return result.rows[0];
}

export async function getSalaryRecordsByPeriod(
  pool: Pool,
  payroll_period_id: string
): Promise<SalaryRecordRow[]> {
  const result = await pool.query<SalaryRecordRow>(
    `SELECT
       sr.*,
       sr.payroll_period_id              AS period_id,
       u.name                            AS full_name,
       u.branch_id,
       sr.base_salary_snapshot           AS base_salary,
       sr.advance_recovery_amount        AS advance_deduction,
       sr.net_payable                    AS gross_payable,
       sr.total_paid                     AS paid_amount,
       sr.remaining_payable              AS remaining_amount
     FROM salary_records sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.payroll_period_id = $1
     ORDER BY u.name ASC`,
    [payroll_period_id]
  );
  return result.rows;
}

/**
 * Lock the salary record for payment processing.
 * Uses SELECT ... FOR UPDATE to prevent concurrent modifications.
 */
export async function lockSalaryRecordForPayment(
  client: PoolClient,
  id: string
): Promise<SalaryRecordRow | null> {
  const result = await client.query<SalaryRecordRow>(
    `SELECT * FROM salary_records WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function updateSalaryRecordPayment(
  client: PoolClient,
  id: string,
  payment_amount: number,
  now_utc: string
): Promise<SalaryRecordRow | null> {
  const result = await client.query<SalaryRecordRow>(
    `UPDATE salary_records SET
       total_paid         = total_paid + $2,
       remaining_payable  = remaining_payable - $2,
       status = CASE
         WHEN (remaining_payable - $2) <= 0 THEN 'PAID'
         ELSE 'PARTIALLY_PAID'
       END,
       updated_at = $3
     WHERE id = $1
     RETURNING *`,
    [id, payment_amount, now_utc]
  );
  return result.rows[0] ?? null;
}

// ─── Staff Advances ───────────────────────────────────────────────────────────

export async function createAdvanceRequest(
  pool: Pool,
  params: {
    id: string;
    user_id: string;
    organization_id: string;
    requested_amount: number;
    reason: string;
    requested_by: string;
    requested_date: string | null;
    now_utc: string;
  }
): Promise<StaffAdvanceRow> {
  const result = await pool.query<StaffAdvanceRow>(
    `INSERT INTO staff_advances (
       id, user_id, organization_id, requested_amount, reason,
       status, requested_by, outstanding_balance,
       requested_date, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'PENDING',$6,0,$7,$8,$8)
     RETURNING *`,
    [
      params.id,
      params.user_id,
      params.organization_id,
      params.requested_amount,
      params.reason,
      params.requested_by,
      params.requested_date ?? params.now_utc.slice(0, 10),
      params.now_utc,
    ]
  );
  return result.rows[0];
}

export async function getAdvancesForUser(
  pool: Pool,
  user_id: string,
  organization_id: string
): Promise<StaffAdvanceRow[]> {
  const result = await pool.query<StaffAdvanceRow>(
    `SELECT *,
            requested_amount                              AS amount,
            outstanding_balance                           AS outstanding_amount,
            COALESCE(disbursed_amount, '0') ::numeric
              - outstanding_balance::numeric              AS recovered_amount
     FROM staff_advances
     WHERE user_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [user_id, organization_id]
  );
  return result.rows;
}

export async function getActiveOutstandingAdvances(
  pool: Pool,
  user_id: string
): Promise<StaffAdvanceRow[]> {
  const result = await pool.query<StaffAdvanceRow>(
    `SELECT * FROM staff_advances
     WHERE user_id = $1
       AND status IN ('DISBURSED')
       AND outstanding_balance > 0
     ORDER BY created_at ASC`,
    [user_id]
  );
  return result.rows;
}

export async function approveAdvance(
  pool: Pool,
  id: string,
  approved_by: string,
  now_utc: string
): Promise<StaffAdvanceRow | null> {
  const result = await pool.query<StaffAdvanceRow>(
    `UPDATE staff_advances
     SET status = 'APPROVED', approved_by = $2, approved_at = $3, updated_at = $3
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, approved_by, now_utc]
  );
  return result.rows[0] ?? null;
}

export async function disburseAdvance(
  client: PoolClient,
  id: string,
  disbursed_amount: number,
  disbursed_by: string,
  cash_movement_id: string | null,
  now_utc: string
): Promise<StaffAdvanceRow | null> {
  const result = await client.query<StaffAdvanceRow>(
    `UPDATE staff_advances
     SET status = 'DISBURSED',
         disbursed_amount = $2,
         outstanding_balance = $2,
         disbursed_by = $3,
         disbursed_at = $4,
         cash_movement_id = $5,
         updated_at = $4
     WHERE id = $1 AND status = 'APPROVED'
     RETURNING *`,
    [id, disbursed_amount, disbursed_by, now_utc, cash_movement_id]
  );
  return result.rows[0] ?? null;
}

export async function recordAdvanceTransaction(
  client: PoolClient,
  params: {
    id: string;
    advance_id: string;
    user_id: string;
    organization_id: string;
    transaction_type: string;
    amount: number;
    balance_after: number;
    salary_record_id: string | null;
    cash_movement_id: string | null;
    reversal_of: string | null;
    notes: string | null;
    created_by: string;
    now_utc: string;
  }
): Promise<StaffAdvanceTransactionRow> {
  const result = await client.query<StaffAdvanceTransactionRow>(
    `INSERT INTO staff_advance_transactions (
       id, advance_id, user_id, organization_id,
       transaction_type, amount, balance_after,
       salary_record_id, cash_movement_id, reversal_of,
       notes, created_by, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      params.id,
      params.advance_id,
      params.user_id,
      params.organization_id,
      params.transaction_type,
      params.amount,
      params.balance_after,
      params.salary_record_id,
      params.cash_movement_id,
      params.reversal_of,
      params.notes,
      params.created_by,
      params.now_utc,
    ]
  );
  return result.rows[0];
}

export async function updateAdvanceBalance(
  client: PoolClient,
  id: string,
  new_balance: number,
  now_utc: string
): Promise<void> {
  await client.query(
    `UPDATE staff_advances
     SET outstanding_balance = $2,
         status = CASE WHEN $2 <= 0 THEN 'FULLY_RECOVERED' ELSE status END,
         updated_at = $3
     WHERE id = $1`,
    [id, new_balance, now_utc]
  );
}

// ─── Users for HR ─────────────────────────────────────────────────────────────

/**
 * List active users belonging to an organization.
 * Uses branch→organization join since users don't have direct org FK.
 */
export interface OrgActiveUserRow {
  user_id: string;
  username: string;
  full_name: string;
  email: string | null;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listOrgActiveUsers(
  pool: Pool,
  organization_id: string
): Promise<OrgActiveUserRow[]> {
  const result = await pool.query<OrgActiveUserRow>(
    `SELECT
       u.id          AS user_id,
       u.username,
       u.name        AS full_name,
       u.email,
       u.role,
       u.branch_id,
       b.name        AS branch_name,
       (u.is_active = 1) AS is_active,
       u.created_at
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE (b.organization_id = $1 OR u.branch_id IS NULL)
       AND u.is_active = 1
       AND u.status NOT IN ('DISABLED','PENDING','REJECTED')
       AND u.role NOT IN (
         'SUPER_ADMIN','OWNER','MULTI_ADMIN','SHOPADMIN','BRANCH_ADMIN','PUBLIC_USER'
       )
     ORDER BY u.name ASC`,
    [organization_id]
  );
  return result.rows;
}
