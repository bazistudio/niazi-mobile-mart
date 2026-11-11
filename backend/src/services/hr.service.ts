/**
 * HR Service — Business logic for HR & Payroll domain.
 *
 * Owner-confirmed business rules applied here:
 *   - Standard shift: 660 minutes (11 hours)
 *   - Late threshold: 20 minutes
 *   - 3 qualifying lates = 1 absence-equivalent (floor(lates / 3))
 *   - Absence deduction = (absent_days + late_absence_equivalents) × (monthly_salary / 26)
 *   - Overtime multiplier default: 1.5×
 *   - Monthly salaried employees are overtime-eligible
 *   - Payroll is organization-wide (no branch scope)
 *
 * UNRESOLVED (kept configurable — no hardcoded policy):
 *   1. Break duration within 11-hour shift (break_duration_minutes_snap, default 0)
 *   2. Late accumulation reset period (late_reset_policy on payroll_periods)
 *   3. Staff advance borrowing limit (no cap enforced)
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  getAttendanceForUserMonth,
  recordLoginAttendance,
  getAttendanceSummary,
  getActiveSalaryConfig,
  getSalaryConfigHistory,
  setSalaryConfig,
  getActiveShiftForUser,
  listShiftTemplates,
  createShiftTemplate,
  createPayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriodById,
  approvePayrollPeriod,
  upsertSalaryRecord,
  getSalaryRecordsByPeriod,
  lockSalaryRecordForPayment,
  updateSalaryRecordPayment,
  createAdvanceRequest,
  getAdvancesForUser,
  getActiveOutstandingAdvances,
  approveAdvance,
  disburseAdvance,
  recordAdvanceTransaction,
  updateAdvanceBalance,
  listOrgActiveUsers,
  StaffSalaryConfigRow,
  SalaryRecordRow,
} from '../repositories/hr.repo';
import { writeChangeLogEntry } from '../repositories/change_log.repo';

// ─── Constants (owner-confirmed) ──────────────────────────────────────────────

const DEFAULT_SHIFT_MINUTES = 660;
const DEFAULT_LATE_THRESHOLD_MINUTES = 20;
const LATES_PER_ABSENCE_EQUIVALENT = 3;
const MONTHLY_WORKING_DAYS = 26;   // Denominator for monthly salary deduction
const DEFAULT_OVERTIME_MULTIPLIER = 1.5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Get Asia/Karachi local date string (YYYY-MM-DD) from a UTC timestamp.
 * Uses Intl.DateTimeFormat so there is no external dependency.
 */
export function getKarachiDate(utcDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(utcDate);
}

/**
 * Parse HH:MM time string to total minutes from midnight.
 */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Calculate minutes late from shift start.
 * Returns 0 if on time or early.
 */
function calculateLateMinutes(
  loginAt: Date,
  shiftStartTime: string,
  lateThreshold: number,
  attendanceDate: string
): number {
  // Build shift start datetime in Asia/Karachi context
  const [h, m] = shiftStartTime.split(':').map(Number);
  const [year, month, day] = attendanceDate.split('-').map(Number);

  // Construct shift start in UTC by computing Karachi offset
  // Karachi is UTC+5 (no DST)
  const KARACHI_OFFSET_MINUTES = 5 * 60;
  const shiftStartUtcMs =
    Date.UTC(year!, month! - 1, day!, (h ?? 0), (m ?? 0), 0) -
    KARACHI_OFFSET_MINUTES * 60 * 1000;

  const loginMs = loginAt.getTime();
  const diffMinutes = Math.floor((loginMs - shiftStartUtcMs) / 60_000);

  if (diffMinutes <= lateThreshold) return 0;
  return diffMinutes;
}

// ─── Attendance Hook (called from auth.service.ts) ───────────────────────────

/**
 * Record attendance for a successful login.
 *
 * MUST be called fire-and-forget from auth.service.ts — wrapped in try/catch
 * so attendance failure never blocks login.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 * If a record already exists for today, the insert is silently skipped.
 */
export async function recordLoginAttendanceForUser(
  pool: Pool,
  userId: string,
  explicitOrgId?: string | null
): Promise<void> {
  let organizationId = explicitOrgId;
  if (!organizationId) {
    try {
      const orgRes = await pool.query<{ organization_id: string }>(
        'SELECT b.organization_id FROM users u JOIN branches b ON u.branch_id = b.id WHERE u.id = $1 LIMIT 1',
        [userId]
      );
      if (orgRes.rows[0]?.organization_id) {
        organizationId = orgRes.rows[0].organization_id;
      } else {
        const fallbackRes = await pool.query<{ id: string }>(
          'SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1'
        );
        organizationId = fallbackRes.rows[0]?.id || '00000000-0000-0000-0000-000000000001';
      }
    } catch {
      organizationId = '00000000-0000-0000-0000-000000000001';
    }
  }
  const now = new Date();
  const attendanceDate = getKarachiDate(now);
  const nowIso = now.toISOString();

  // Try to get the user's active shift for today
  let shiftStartTime: string | null = null;
  let lateThresholdMinutes = DEFAULT_LATE_THRESHOLD_MINUTES;
  let breakDurationMinutes = 0;
  let lateMinutes = 0;
  let status: 'PRESENT' | 'LATE' = 'PRESENT';

  try {
    const shift = await getActiveShiftForUser(pool, userId, attendanceDate);
    if (shift) {
      shiftStartTime = shift.shift_start_time;
      lateThresholdMinutes = shift.late_threshold_minutes;
      breakDurationMinutes = shift.break_duration_minutes;

      lateMinutes = calculateLateMinutes(now, shiftStartTime, lateThresholdMinutes, attendanceDate);
      status = lateMinutes > 0 ? 'LATE' : 'PRESENT';
    }
  } catch {
    // Shift lookup failure must not block attendance recording
  }

  await recordLoginAttendance(pool, {
    id: uuidv4(),
    user_id: userId,
    organization_id: organizationId,
    attendance_date: attendanceDate,
    first_login_at: nowIso,
    shift_start_time_snapshot: shiftStartTime,
    late_threshold_minutes_snap: lateThresholdMinutes,
    break_duration_minutes_snap: breakDurationMinutes,
    status,
    late_minutes: lateMinutes,
    now_utc: nowIso,
  });
}

// ─── Salary Config ────────────────────────────────────────────────────────────

export async function getStaffSalaryConfig(
  pool: Pool,
  userId: string
): Promise<StaffSalaryConfigRow | null> {
  return getActiveSalaryConfig(pool, userId);
}

export async function getStaffSalaryConfigHistory(
  pool: Pool,
  userId: string
): Promise<StaffSalaryConfigRow[]> {
  return getSalaryConfigHistory(pool, userId);
}

export async function setStaffSalaryConfig(
  pool: Pool,
  params: {
    user_id: string;
    organization_id: string;
    salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY' | 'COMMISSION_PERCENTAGE';
    monthly_salary?: number;
    daily_rate?: number;
    hourly_rate?: number;
    overtime_multiplier?: number;
    commission_percentage?: number;
    effective_from: string;
    configured_by: string;
  }
): Promise<StaffSalaryConfigRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await setSalaryConfig(client, {
      new_id: uuidv4(),
      user_id: params.user_id,
      organization_id: params.organization_id,
      salary_type: params.salary_type,
      monthly_salary: params.monthly_salary ?? null,
      daily_rate: params.daily_rate ?? null,
      hourly_rate: params.hourly_rate ?? null,
      overtime_multiplier: params.overtime_multiplier ?? DEFAULT_OVERTIME_MULTIPLIER,
      commission_percentage: params.commission_percentage ?? null,
      effective_from: params.effective_from,
      configured_by: params.configured_by,
      now_utc: nowUtc(),
    });
    await writeChangeLogEntry(client, {
      event_type: 'HR_SALARY_CONFIG_SET',
      entity_type: 'staff_salary_configs',
      entity_id: result.id,
      changed_by: params.configured_by,
      organization_id: params.organization_id,
      branch_id: null,
      metadata: { user_id: params.user_id, salary_type: params.salary_type },
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Shift Templates ──────────────────────────────────────────────────────────

export async function listOrgShiftTemplates(pool: Pool, organizationId: string) {
  return listShiftTemplates(pool, organizationId);
}

export async function createOrgShiftTemplate(
  pool: Pool,
  params: {
    organization_id: string;
    name: string;
    shift_start_time: string;
    shift_end_time: string;
    shift_duration_minutes?: number;
    break_duration_minutes?: number;
    late_threshold_minutes?: number;
    working_days_json?: string;
    created_by: string;
  }
) {
  return createShiftTemplate(pool, {
    id: uuidv4(),
    organization_id: params.organization_id,
    name: params.name,
    shift_start_time: params.shift_start_time,
    shift_end_time: params.shift_end_time,
    shift_duration_minutes: params.shift_duration_minutes ?? DEFAULT_SHIFT_MINUTES,
    break_duration_minutes: params.break_duration_minutes ?? 0,
    late_threshold_minutes: params.late_threshold_minutes ?? DEFAULT_LATE_THRESHOLD_MINUTES,
    working_days_json: params.working_days_json ?? '[1,2,3,4,5,6]',
    created_by: params.created_by,
    now_utc: nowUtc(),
  });
}

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export async function createOrgPayrollPeriod(
  pool: Pool,
  params: {
    organization_id: string;
    // Frontend sends period_month + period_year + start_date + end_date.
    // Legacy callers may still send label + period_start + period_end.
    // Both shapes are accepted.
    period_month?: number;
    period_year?: number;
    start_date?: string;
    end_date?: string;
    label?: string;
    period_start?: string;
    period_end?: string;
    late_reset_policy?: string;
    created_by: string;
  }
) {
  // Resolve period start/end — prefer new-shape fields, fall back to legacy.
  const periodStart = params.start_date ?? params.period_start ?? '';
  const periodEnd   = params.end_date   ?? params.period_end   ?? '';

  // Build a human-readable label if one was not supplied.
  // Uses period_month/year when present, otherwise derives from periodStart.
  let label = params.label;
  if (!label) {
    if (params.period_month != null && params.period_year != null) {
      const MONTH_NAMES = [
        'Jan','Feb','Mar','Apr','May','Jun',
        'Jul','Aug','Sep','Oct','Nov','Dec',
      ];
      label = `${MONTH_NAMES[params.period_month - 1] ?? String(params.period_month)} ${params.period_year}`;
    } else if (periodStart) {
      label = periodStart.slice(0, 7); // 'YYYY-MM'
    } else {
      label = 'Payroll Period';
    }
  }

  return createPayrollPeriod(pool, {
    id: uuidv4(),
    organization_id: params.organization_id,
    label,
    period_start: periodStart,
    period_end: periodEnd,
    late_reset_policy: params.late_reset_policy ?? 'MONTHLY',
    created_by: params.created_by,
    now_utc: nowUtc(),
  });
}

export async function listOrgPayrollPeriods(pool: Pool, organizationId: string) {
  return listPayrollPeriods(pool, organizationId);
}

export async function approveOrgPayrollPeriod(
  pool: Pool,
  periodId: string,
  approvedBy: string,
  organizationId: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const period = await approvePayrollPeriod(client as unknown as Pool, periodId, approvedBy, nowUtc());
    if (!period) return null;
    await writeChangeLogEntry(client, {
      event_type: 'HR_PAYROLL_APPROVED',
      entity_type: 'payroll_periods',
      entity_id: periodId,
      changed_by: approvedBy,
      organization_id: organizationId,
      branch_id: null,
      metadata: { period_start: period.period_start, period_end: period.period_end },
    });
    await client.query('COMMIT');
    return period;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Payroll Calculation Engine ───────────────────────────────────────────────

/**
 * Calculate and upsert salary records for all active employees in a payroll period.
 *
 * Monthly salary formula (owner-confirmed):
 *   gross = base_salary
 *   absence_deduction = (absent_days + floor(late_count / 3)) × (base_salary / 26)
 *   net_payable = gross + overtime_amount + bonus - absence_deduction - advance_recovery + adjustments
 *
 * Returns list of computed salary records.
 */
export async function generatePayroll(
  pool: Pool,
  periodId: string,
  organizationId: string,
  generatedBy: string
): Promise<SalaryRecordRow[]> {
  const period = await getPayrollPeriodById(pool, periodId);
  if (!period) throw new Error('Payroll period not found');
  if (period.status !== 'DRAFT') throw new Error('Can only generate payroll for DRAFT periods');
  if (period.organization_id !== organizationId) throw new Error('Period belongs to another organization');

  const users = await listOrgActiveUsers(pool, organizationId);
  const results: SalaryRecordRow[] = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const user of users) {
      // Get active salary config
      const config = await getActiveSalaryConfig(pool, user.user_id);
      if (!config) continue;  // Skip users without salary config

      // Get attendance summary for the period
      const attendance = await getAttendanceSummary(
        pool, user.user_id, period.period_start, period.period_end
      );

      // Calculate working days in period
      const periodStart = new Date(period.period_start);
      const periodEnd = new Date(period.period_end);
      const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;

      const baseSalary = parseFloat(config.monthly_salary ?? config.daily_rate ?? config.hourly_rate ?? '0');

      let absenceDeduction = 0;
      let lateAbsenceEquivalents = 0;
      let grossSalary = 0;
      let overtimeMinutes = 0;
      let overtimeAmount = 0;

      if (config.salary_type === 'MONTHLY') {
        lateAbsenceEquivalents = Math.floor(attendance.late_count / LATES_PER_ABSENCE_EQUIVALENT);
        const totalAbsences = attendance.absent_days + lateAbsenceEquivalents;
        absenceDeduction = totalAbsences * (baseSalary / MONTHLY_WORKING_DAYS);
        grossSalary = baseSalary;
        // Approved overtime for monthly-salaried staff:
        // (approved_overtime_minutes / 60) * (baseSalary / 26 / 11) * overtime_multiplier
        overtimeMinutes = attendance.approved_overtime_minutes ?? 0;
        const overtimeMultiplier = parseFloat(config.overtime_multiplier ?? String(DEFAULT_OVERTIME_MULTIPLIER));
        const standardShiftHours = DEFAULT_SHIFT_MINUTES / 60; // 11 hours
        const perHourRate = baseSalary / MONTHLY_WORKING_DAYS / standardShiftHours;
        overtimeAmount = Math.round(((overtimeMinutes / 60) * perHourRate * overtimeMultiplier) * 100) / 100;
      } else if (config.salary_type === 'DAILY') {
        const dailyRate = parseFloat(config.daily_rate ?? '0');
        grossSalary = attendance.present_days * dailyRate;
        overtimeAmount = 0;
      } else if (config.salary_type === 'HOURLY') {
        // Hourly requires verified worked_minutes — leaving as stub pending checkout impl
        grossSalary = 0;
        overtimeAmount = 0;
      }

      // Outstanding advance balance = sum of active outstanding advances
      const advances = await getActiveOutstandingAdvances(pool, user.user_id);
      const totalOutstanding = advances.reduce((sum, a) => sum + parseFloat(a.outstanding_balance), 0);
      // For now, recover nothing automatically — advance recovery is explicitly set
      const advanceRecovery = 0;

      const totalDeductions = absenceDeduction + advanceRecovery;
      const netPayable = Math.max(0, grossSalary + overtimeAmount - totalDeductions);

      const record = await upsertSalaryRecord(client, {
        id: uuidv4(),
        payroll_period_id: periodId,
        user_id: user.user_id,
        organization_id: organizationId,
        salary_config_id: config.id,
        salary_type_snapshot: config.salary_type,
        base_salary_snapshot: baseSalary,
        total_working_days: totalDays,
        present_days: attendance.present_days,
        absent_days: attendance.absent_days,
        late_count: attendance.late_count,
        late_absence_equivalents: lateAbsenceEquivalents,
        absence_deduction: absenceDeduction,
        overtime_minutes: overtimeMinutes,
        overtime_amount: overtimeAmount,
        bonus_amount: 0,
        advance_recovery_amount: advanceRecovery,
        manual_adjustment_amount: 0,
        manual_adjustment_note: null,
        gross_salary: grossSalary,
        total_deductions: totalDeductions,
        net_payable: netPayable,
        created_by: generatedBy,
        now_utc: nowUtc(),
      });

      results.push(record);
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPayrollRecordsForPeriod(pool: Pool, periodId: string) {
  return getSalaryRecordsByPeriod(pool, periodId);
}

// ─── Salary Payment ───────────────────────────────────────────────────────────

export async function processSalaryPayment(
  pool: Pool,
  params: {
    salary_record_id: string;
    payment_amount: number;
    payment_method: string;
    payment_date: string;
    reference_number?: string;
    notes?: string;
    processed_by: string;
    organization_id: string;
  }
): Promise<SalaryRecordRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the record for concurrent payment prevention
    const record = await lockSalaryRecordForPayment(client, params.salary_record_id);
    if (!record) throw new Error('Salary record not found');
    if (record.status === 'CANCELLED') throw new Error('Cannot pay a cancelled salary record');

    const remaining = parseFloat(record.remaining_payable);
    if (params.payment_amount > remaining) {
      throw new Error(`Payment amount ${params.payment_amount} exceeds remaining payable ${remaining}`);
    }

    // Insert salary_payment row
    const paymentId = uuidv4();
    const now = nowUtc();
    await client.query(
      `INSERT INTO salary_payments (
         id, salary_record_id, user_id, organization_id,
         payment_amount, payment_method, payment_date,
         reference_number, notes, processed_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        paymentId,
        params.salary_record_id,
        record.user_id,
        params.organization_id,
        params.payment_amount,
        params.payment_method,
        params.payment_date,
        params.reference_number ?? null,
        params.notes ?? null,
        params.processed_by,
        now,
      ]
    );

    // Update the salary record totals
    const updated = await updateSalaryRecordPayment(
      client, params.salary_record_id, params.payment_amount, now
    );

    await writeChangeLogEntry(client, {
      event_type: 'HR_SALARY_PAID',
      entity_type: 'salary_payments',
      entity_id: paymentId,
      changed_by: params.processed_by,
      organization_id: params.organization_id,
      branch_id: null,
      metadata: {
        salary_record_id: params.salary_record_id,
        amount: params.payment_amount,
        method: params.payment_method,
      },
    });

    await client.query('COMMIT');
    return updated!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Advances ─────────────────────────────────────────────────────────────────

export async function requestAdvance(
  pool: Pool,
  params: {
    user_id: string;
    organization_id: string;
    // Frontend sends `amount`; legacy callers may send `requested_amount`.
    amount?: number;
    requested_amount?: number;
    reason: string;
    requested_date?: string | null;
    requested_by: string;
  }
) {
  const resolvedAmount = params.amount ?? params.requested_amount ?? 0;
  const now = nowUtc();
  return createAdvanceRequest(pool, {
    id: uuidv4(),
    user_id: params.user_id,
    organization_id: params.organization_id,
    requested_amount: resolvedAmount,
    reason: params.reason,
    requested_by: params.requested_by,
    requested_date: params.requested_date ?? null,
    now_utc: now,
  });
}

export async function approveStaffAdvance(
  pool: Pool,
  advanceId: string,
  approvedBy: string,
  organizationId: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const advance = await approveAdvance(client as unknown as Pool, advanceId, approvedBy, nowUtc());
    if (!advance) return null;
    await writeChangeLogEntry(client, {
      event_type: 'HR_ADVANCE_DISBURSED',
      entity_type: 'staff_advances',
      entity_id: advanceId,
      changed_by: approvedBy,
      organization_id: organizationId,
      branch_id: null,
      metadata: { status: 'APPROVED' },
    });
    await client.query('COMMIT');
    return advance;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function disburseStaffAdvance(
  pool: Pool,
  params: {
    advance_id: string;
    // Legacy callers may pass disbursed_amount directly.
    // New frontend shape: payment_method + disbursement_date + reference_number.
    // When disbursed_amount is absent the advance's own requested_amount is used.
    disbursed_amount?: number;
    payment_method?: string;
    disbursement_date?: string | null;
    reference_number?: string | null;
    disbursed_by: string;
    organization_id: string;
    cash_movement_id?: string;
  }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = nowUtc();

    // Fetch the advance so we can resolve the disbursement amount and store method.
    const advanceRow = await client.query<{ requested_amount: string; status: string }>(
      `SELECT requested_amount, status FROM staff_advances WHERE id = $1 FOR UPDATE`,
      [params.advance_id]
    );
    if (!advanceRow.rows[0]) throw new Error('Advance not found');
    if (advanceRow.rows[0].status !== 'APPROVED') {
      throw new Error('Advance not found or not in APPROVED status');
    }

    // Use supplied amount, or fall back to the full requested_amount.
    const disbursedAmount =
      params.disbursed_amount ?? parseFloat(advanceRow.rows[0].requested_amount);

    // Persist disbursement_method before updating main status.
    if (params.payment_method) {
      await client.query(
        `UPDATE staff_advances SET disbursement_method = $2 WHERE id = $1`,
        [params.advance_id, params.payment_method]
      );
    }

    const advance = await disburseAdvance(
      client, params.advance_id, disbursedAmount,
      params.disbursed_by, params.cash_movement_id ?? null, now
    );
    if (!advance) throw new Error('Advance not found or not in APPROVED status');

    // Record disbursement transaction
    await recordAdvanceTransaction(client, {
      id: uuidv4(),
      advance_id: params.advance_id,
      user_id: advance.user_id,
      organization_id: params.organization_id,
      transaction_type: 'DISBURSEMENT',
      amount: disbursedAmount,
      balance_after: disbursedAmount,
      salary_record_id: null,
      cash_movement_id: params.cash_movement_id ?? null,
      reversal_of: null,
      notes: params.reference_number ? `ref: ${params.reference_number}` : null,
      created_by: params.disbursed_by,
      now_utc: now,
    });

    await client.query('COMMIT');
    return advance;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getStaffAdvances(pool: Pool, userId: string, organizationId: string) {
  return getAdvancesForUser(pool, userId, organizationId);
}

// ─── Staff List ───────────────────────────────────────────────────────────────

export async function listStaffForOrg(pool: Pool, organizationId: string) {
  return listOrgActiveUsers(pool, organizationId);
}

// ─── Attendance Query ─────────────────────────────────────────────────────────

export async function getStaffAttendanceForMonth(
  pool: Pool,
  userId: string,
  year: number,
  month: number
) {
  return getAttendanceForUserMonth(pool, userId, year, month);
}
