/**
 * HR API Service — Niazi Mobile Mart
 *
 * Phase 2: Backend HR endpoints are now implemented.
 * All functions call real /api/v1/hr/* endpoints via httpClient.
 *
 * Endpoints available:
 *   GET  /api/v1/hr/staff
 *   GET  /api/v1/hr/staff/:userId/salary-config
 *   POST /api/v1/hr/staff/:userId/salary-config
 *   GET  /api/v1/hr/staff/:userId/salary-config/history
 *   GET  /api/v1/hr/staff/:userId/attendance
 *   GET  /api/v1/hr/staff/:userId/advances
 *   POST /api/v1/hr/staff/:userId/advances
 *   POST /api/v1/hr/advances/:advanceId/approve
 *   POST /api/v1/hr/advances/:advanceId/disburse
 *   GET  /api/v1/hr/shift-templates
 *   POST /api/v1/hr/shift-templates
 *   GET  /api/v1/hr/payroll-periods
 *   POST /api/v1/hr/payroll-periods
 *   POST /api/v1/hr/payroll-periods/:periodId/generate
 *   GET  /api/v1/hr/payroll-periods/:periodId/records
 *   POST /api/v1/hr/payroll-periods/:periodId/approve
 *   POST /api/v1/hr/salary-records/:recordId/pay
 */

import { httpClient } from '@/lib/http/httpClient';
import type {
  HRSalaryConfig,
  HROvertimeConfig,
  HRAdvanceRequest,
  // Backend response types
  BackendSalaryConfig,
  BackendStaffMember,
  BackendShiftTemplate,
  BackendPayrollPeriod,
  BackendSalaryRecord,
  BackendStaffAdvance,
  BackendAttendanceRecord,
} from '../types/hr.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class HRApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HRApiError';
  }
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function getHRStaffList(): Promise<BackendStaffMember[]> {
  return httpClient.get<BackendStaffMember[]>('/api/v1/hr/staff');
}

// ─── Salary Config ────────────────────────────────────────────────────────────

export async function getStaffSalaryConfig(
  staffId: string
): Promise<BackendSalaryConfig | null> {
  try {
    return await httpClient.get<BackendSalaryConfig>(
      `/api/v1/hr/staff/${staffId}/salary-config`
    );
  } catch (err: unknown) {
    const e = err as { statusCode?: number; status?: number };
    if (e?.statusCode === 404 || e?.status === 404) return null;
    throw err;
  }
}

export async function saveStaffSalaryConfig(params: {
  staffId: string;
  salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY' | 'COMMISSION_PERCENTAGE';
  monthly_salary?: number;
  daily_rate?: number;
  hourly_rate?: number;
  commission_percentage?: number;
  effective_from: string; // YYYY-MM-DD
  overtime_multiplier?: number;
}): Promise<BackendSalaryConfig> {
  const { staffId, ...body } = params;
  return httpClient.post<BackendSalaryConfig>(
    `/api/v1/hr/staff/${staffId}/salary-config`,
    body
  );
}

export async function getSalaryConfigHistory(
  staffId: string
): Promise<BackendSalaryConfig[]> {
  return httpClient.get<BackendSalaryConfig[]>(
    `/api/v1/hr/staff/${staffId}/salary-config/history`
  );
}

/** Legacy stub compat — returns null (use getStaffSalaryConfig instead) */
export async function getStaffOvertimeConfig(
  _staffId: string
): Promise<HROvertimeConfig | null> {
  return null;
}

/** Legacy stub compat */
export async function saveStaffOvertimeConfig(
  _config: HROvertimeConfig
): Promise<void> {
  // Overtime config is now part of salary-config (overtime_multiplier field)
  // This stub is kept for backward compatibility with existing UI callers.
  return;
}

// ─── Payroll / Settlement ─────────────────────────────────────────────────────

export async function submitSalarySettlement(payload: {
  salaryRecordId: string;
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';
  reference_number?: string;
  notes?: string;
}): Promise<{ payment: unknown }> {
  const { salaryRecordId, ...body } = payload;
  return httpClient.post<{ payment: unknown }>(
    `/api/v1/hr/salary-records/${salaryRecordId}/pay`,
    body
  );
}

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export async function getPayrollPeriods(): Promise<BackendPayrollPeriod[]> {
  return httpClient.get<BackendPayrollPeriod[]>('/api/v1/hr/payroll-periods');
}

export async function createPayrollPeriod(params: {
  period_month: number;
  period_year: number;
  start_date: string;
  end_date: string;
  late_reset_policy?: 'MONTHLY' | 'PAYROLL_PERIOD' | 'CONTINUOUS';
}): Promise<BackendPayrollPeriod> {
  return httpClient.post<BackendPayrollPeriod>('/api/v1/hr/payroll-periods', params);
}

export async function generatePayroll(periodId: string): Promise<{ records: BackendSalaryRecord[] }> {
  return httpClient.post<{ records: BackendSalaryRecord[] }>(
    `/api/v1/hr/payroll-periods/${periodId}/generate`,
    {}
  );
}

export async function approvePayrollPeriod(periodId: string): Promise<BackendPayrollPeriod> {
  return httpClient.post<BackendPayrollPeriod>(
    `/api/v1/hr/payroll-periods/${periodId}/approve`,
    {}
  );
}

export async function getPayrollRecords(periodId: string): Promise<BackendSalaryRecord[]> {
  return httpClient.get<BackendSalaryRecord[]>(
    `/api/v1/hr/payroll-periods/${periodId}/records`
  );
}

// ─── Advances ─────────────────────────────────────────────────────────────────

export async function getStaffAdvanceHistory(
  staffId: string
): Promise<BackendStaffAdvance[]> {
  return httpClient.get<BackendStaffAdvance[]>(
    `/api/v1/hr/staff/${staffId}/advances`
  );
}

export async function submitAdvanceRequest(request: {
  staffId: string;
  amount: number;
  reason: string;
  requested_date: string;
}): Promise<BackendStaffAdvance> {
  const { staffId, ...body } = request;
  return httpClient.post<BackendStaffAdvance>(
    `/api/v1/hr/staff/${staffId}/advances`,
    body
  );
}

export async function approveAdvance(advanceId: string): Promise<BackendStaffAdvance> {
  return httpClient.post<BackendStaffAdvance>(
    `/api/v1/hr/advances/${advanceId}/approve`,
    {}
  );
}

export async function disburseAdvance(params: {
  advanceId: string;
  payment_method: string;
  disbursement_date: string;
  reference_number?: string;
}): Promise<BackendStaffAdvance> {
  const { advanceId, ...body } = params;
  return httpClient.post<BackendStaffAdvance>(
    `/api/v1/hr/advances/${advanceId}/disburse`,
    body
  );
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getStaffAttendance(params: {
  staffId: string;
  month: number;
  year: number;
}): Promise<BackendAttendanceRecord[]> {
  const { staffId, month, year } = params;
  return httpClient.get<BackendAttendanceRecord[]>(
    `/api/v1/hr/staff/${staffId}/attendance?month=${month}&year=${year}`
  );
}

// ─── Shift Templates ──────────────────────────────────────────────────────────

export async function getShiftTemplates(): Promise<BackendShiftTemplate[]> {
  return httpClient.get<BackendShiftTemplate[]>('/api/v1/hr/shift-templates');
}

export async function createShiftTemplate(params: {
  name: string;
  shift_start_time: string;
  shift_end_time: string;
  shift_duration_minutes?: number;
  break_duration_minutes?: number;
  late_threshold_minutes?: number;
  working_days_json?: string;
}): Promise<BackendShiftTemplate> {
  return httpClient.post<BackendShiftTemplate>('/api/v1/hr/shift-templates', params);
}
