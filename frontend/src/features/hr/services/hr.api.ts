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

export async function getHRStaffList(branchId?: string | null): Promise<BackendStaffMember[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  return httpClient.get<BackendStaffMember[]>(`/api/v1/hr/staff${query}`);
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
  monthly_salary?: number | null;
  daily_rate?: number | null;
  hourly_rate?: number | null;
  commission_percentage?: number | null;
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

export async function getPayrollRecords(
  periodId: string,
  branchId?: string | null
): Promise<BackendSalaryRecord[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  return httpClient.get<BackendSalaryRecord[]>(
    `/api/v1/hr/payroll-periods/${periodId}/records${query}`
  );
}

// ─── Advances ─────────────────────────────────────────────────────────────────

export async function getOrgAdvances(params?: {
  branchId?: string | null;
  status?: string | null;
}): Promise<import('../types/hr.types').BackendOrgAdvance[]> {
  const q = new URLSearchParams();
  if (params?.branchId) q.append('branch_id', params.branchId);
  if (params?.status) q.append('status', params.status);
  const qStr = q.toString();
  return httpClient.get<import('../types/hr.types').BackendOrgAdvance[]>(
    `/api/v1/hr/advances${qStr ? `?${qStr}` : ''}`
  );
}

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

export async function markStaffAttendance(params: {
  staffId: string;
  attendance_date: string;    // YYYY-MM-DD
  status: string;             // PRESENT|ABSENT|LATE|HALF_DAY|LEAVE|HOLIDAY|WEEKLY_OFF
  check_in_at?: string | null;
  check_out_at?: string | null;
  notes?: string | null;
}): Promise<BackendAttendanceRecord> {
  const { staffId, ...body } = params;
  return httpClient.post<BackendAttendanceRecord>(
    `/api/v1/hr/staff/${staffId}/attendance`,
    body
  );
}

export async function updateStaffAttendance(params: {
  staffId: string;
  recordId: string;
  status?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  notes?: string | null;
}): Promise<BackendAttendanceRecord> {
  const { staffId, recordId, ...body } = params;
  return httpClient.patch<BackendAttendanceRecord>(
    `/api/v1/hr/staff/${staffId}/attendance/${recordId}`,
    body
  );
}

export interface AnnualAttendanceSummaryRow {
  year: number;
  month: number;
  total_records: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  total_worked_minutes: number;
  total_late_minutes: number;
  total_overtime_minutes: number;
}

export async function getAnnualAttendanceSummary(params: {
  staffId: string;
  year: number;
}): Promise<AnnualAttendanceSummaryRow[]> {
  const { staffId, year } = params;
  return httpClient.get<AnnualAttendanceSummaryRow[]>(
    `/api/v1/hr/staff/${staffId}/attendance/annual-summary?year=${year}`
  );
}

export async function getDailyAttendanceRegister(params: {
  date: string;
  branchId?: string | null;
}): Promise<import('../types/hr.types').DailyRegisterResponse> {
  const q = new URLSearchParams();
  q.append('date', params.date);
  if (params.branchId) q.append('branch_id', params.branchId);
  return httpClient.get<import('../types/hr.types').DailyRegisterResponse>(
    `/api/v1/hr/attendance/register?${q.toString()}`
  );
}

export async function getAttendanceRange(params: {
  startDate: string;
  endDate: string;
  branchId?: string | null;
}): Promise<import('../types/hr.types').AttendanceRangeResponse> {
  const q = new URLSearchParams();
  q.append('start_date', params.startDate);
  q.append('end_date', params.endDate);
  if (params.branchId) q.append('branch_id', params.branchId);
  return httpClient.get<import('../types/hr.types').AttendanceRangeResponse>(
    `/api/v1/hr/attendance/range?${q.toString()}`
  );
}

export async function bulkMarkStaffAttendance(
  payload: import('../types/hr.types').BulkAttendancePayload
): Promise<import('../types/hr.types').BulkAttendanceResult> {
  return httpClient.post<import('../types/hr.types').BulkAttendanceResult>(
    '/api/v1/hr/attendance/bulk',
    payload
  );
}

export async function triggerAbsenceProcess(
  date?: string | null
): Promise<import('../types/hr.types').AbsenceProcessResponse> {
  return httpClient.post<import('../types/hr.types').AbsenceProcessResponse>(
    '/api/v1/hr/absence-process',
    date ? { date } : {}
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

// ─── HR Policy Settings API (Stage 2.1 / 2.2) ───────────────────────────────

import type {
  HRPolicySettings,
  EffectivePolicyResponse,
  CreatePolicyPayload,
  RetirePolicyPayload,
  HRPolicyAuditLog,
} from '../types/hr.types';

export async function getHRPolicies(): Promise<HRPolicySettings[]> {
  return httpClient.get<HRPolicySettings[]>('/api/v1/hr/policies');
}

export async function getEffectiveHRPolicy(params: {
  branchId?: string | null;
  date?: string;
}): Promise<EffectivePolicyResponse> {
  const query = new URLSearchParams();
  if (params.branchId) query.append('branch_id', params.branchId);
  if (params.date) query.append('date', params.date);
  const qStr = query.toString();
  return httpClient.get<EffectivePolicyResponse>(`/api/v1/hr/policies/effective${qStr ? `?${qStr}` : ''}`);
}

export async function createHRPolicy(payload: CreatePolicyPayload): Promise<HRPolicySettings> {
  return httpClient.post<HRPolicySettings>('/api/v1/hr/policies', payload);
}

export async function retireHRPolicy(
  policyId: string,
  payload: RetirePolicyPayload
): Promise<HRPolicySettings> {
  return httpClient.post<HRPolicySettings>(`/api/v1/hr/policies/${policyId}/retire`, payload);
}

export async function getHRPolicyAuditLogs(params?: {
  policyId?: string;
  branchId?: string;
}): Promise<HRPolicyAuditLog[]> {
  const query = new URLSearchParams();
  if (params?.policyId) query.append('policy_id', params.policyId);
  if (params?.branchId) query.append('branch_id', params.branchId);
  const qStr = query.toString();
  return httpClient.get<HRPolicyAuditLog[]>(`/api/v1/hr/policies/audit${qStr ? `?${qStr}` : ''}`);
}
