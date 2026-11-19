/**
 * HR React Query Hooks — Niazi Mobile Mart
 *
 * Phase 2 Complete Integration:
 * All hooks wrap hr.api.ts and invoke live /api/v1/hr/* endpoints with
 * deterministic branch-aware query keys and cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStaffSalaryConfig,
  getSalaryConfigHistory,
  getStaffOvertimeConfig,
  getStaffAdvanceHistory,
  getOrgAdvances,
  approveAdvance,
  disburseAdvance,
  getStaffAttendance,
  markStaffAttendance,
  updateStaffAttendance,
  getAnnualAttendanceSummary,
  getDailyAttendanceRegister,
  getAttendanceRange,
  bulkMarkStaffAttendance,
  triggerAbsenceProcess,
  getHRStaffList,
  getPayrollPeriods,
  createPayrollPeriod,
  generatePayroll,
  approvePayrollPeriod,
  getPayrollRecords,
  submitSalarySettlement,
  getShiftTemplates,
  createShiftTemplate,
  getHRPolicies,
  getEffectiveHRPolicy,
  createHRPolicy,
  retireHRPolicy,
  getHRPolicyAuditLogs,
  type AnnualAttendanceSummaryRow,
} from '../services/hr.api';
import type {
  HROvertimeConfig,
  BackendSalaryConfig,
  BackendStaffMember,
  BackendStaffAdvance,
  BackendOrgAdvance,
  BackendAttendanceRecord,
  BackendPayrollPeriod,
  BackendSalaryRecord,
  BackendShiftTemplate,
  DailyRegisterResponse,
  AttendanceRangeResponse,
  BulkAttendancePayload,
  CreatePolicyPayload,
  RetirePolicyPayload,
} from '../types/hr.types';
import { queryKeys } from '@/lib/react-query/queryKeys';

// ─── Local Query Keys (kept for backward compat; prefer queryKeys.hr.*) ───────

export const hrQueryKeys = {
  salaryConfig: (staffId: string) => ['hr', 'salary-config', staffId] as const,
  overtimeConfig: (staffId: string) => ['hr', 'overtime-config', staffId] as const,
  advances: (staffId: string) => ['hr', 'advances', staffId] as const,
  attendance: (staffId: string, month: number, year: number) =>
    ['hr', 'attendance', staffId, month, year] as const,
} as const;

// ─── Staff ────────────────────────────────────────────────────────────────────

export function useHRStaff(branchId?: string | null) {
  return useQuery<BackendStaffMember[]>({
    queryKey: queryKeys.hr.staff(branchId),
    queryFn: () => getHRStaffList(branchId),
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Salary Config & History ──────────────────────────────────────────────────

export function useStaffSalaryConfig(staffId: string | undefined) {
  return useQuery<BackendSalaryConfig | null>({
    queryKey: queryKeys.hr.salaryConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffSalaryConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSalaryConfigHistory(staffId: string | undefined) {
  return useQuery<BackendSalaryConfig[]>({
    queryKey: queryKeys.hr.salaryConfigHistory(staffId ?? ''),
    queryFn: () => (staffId ? getSalaryConfigHistory(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useStaffOvertimeConfig(staffId: string | undefined) {
  return useQuery<HROvertimeConfig | null>({
    queryKey: queryKeys.hr.overtimeConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffOvertimeConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Advances ─────────────────────────────────────────────────────────────────

export function useStaffAdvances(staffId: string | undefined) {
  return useQuery<BackendStaffAdvance[]>({
    queryKey: queryKeys.hr.advances(staffId ?? ''),
    queryFn: () => (staffId ? getStaffAdvanceHistory(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useOrgAdvances(branchId?: string | null, status?: string | null) {
  return useQuery<BackendOrgAdvance[]>({
    queryKey: queryKeys.hr.orgAdvances(branchId, status),
    queryFn: () => getOrgAdvances({ branchId, status }),
    staleTime: 60 * 1000,
  });
}

export function useApproveAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (advanceId: string) => approveAdvance(advanceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hr', 'org-advances'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'advances'] });
    },
  });
}

export function useDisburseAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      advanceId: string;
      payment_method: string;
      disbursement_date: string;
      reference_number?: string;
    }) => disburseAdvance(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hr', 'org-advances'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'advances'] });
    },
  });
}

// ─── Attendance & Daily Register ──────────────────────────────────────────────

export function useStaffAttendance(
  staffId: string | undefined,
  month: number,
  year: number
) {
  return useQuery<BackendAttendanceRecord[]>({
    queryKey: queryKeys.hr.attendance(staffId ?? '', month, year),
    queryFn: () =>
      staffId ? getStaffAttendance({ staffId, month, year }) : Promise.resolve([]),
    enabled: Boolean(staffId),
    staleTime: 60 * 1000,
  });
}

export function useDailyAttendanceRegister(date: string, branchId?: string | null) {
  return useQuery<DailyRegisterResponse>({
    queryKey: queryKeys.hr.attendanceRegister(date, branchId),
    queryFn: () => getDailyAttendanceRegister({ date, branchId }),
    enabled: Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)),
    staleTime: 30 * 1000,
  });
}

export function useAttendanceRange(
  startDate: string,
  endDate: string,
  branchId?: string | null,
  enabled: boolean = true
) {
  return useQuery<AttendanceRangeResponse>({
    queryKey: queryKeys.hr.attendanceRange(startDate, endDate, branchId),
    queryFn: () => getAttendanceRange({ startDate, endDate, branchId }),
    enabled:
      enabled &&
      Boolean(startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)),
    staleTime: 60 * 1000,
  });
}

export function useAnnualAttendanceSummary(
  staffId: string | undefined,
  year: number
) {
  return useQuery<AnnualAttendanceSummaryRow[]>({
    queryKey: queryKeys.hr.annualSummary(staffId ?? '', year),
    queryFn: () =>
      staffId
        ? getAnnualAttendanceSummary({ staffId, year })
        : Promise.resolve([]),
    enabled: Boolean(staffId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useMarkAttendance(staffId: string, month: number, year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      attendance_date: string;
      status: string;
      check_in_at?: string | null;
      check_out_at?: string | null;
      notes?: string | null;
    }) => markStaffAttendance({ staffId, ...params }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.attendance(staffId, month, year) });
      void qc.invalidateQueries({ queryKey: queryKeys.hr.annualSummary(staffId, year) });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-register', variables.attendance_date] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-range'] });
    },
  });
}

export function useUpdateAttendance(staffId: string, month: number, year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      recordId: string;
      status?: string;
      check_in_at?: string | null;
      check_out_at?: string | null;
      notes?: string | null;
    }) => updateStaffAttendance({ staffId, ...params }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.attendance(staffId, month, year) });
      void qc.invalidateQueries({ queryKey: queryKeys.hr.annualSummary(staffId, year) });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-register'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-range'] });
    },
  });
}

export function useBulkMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkAttendancePayload) => bulkMarkStaffAttendance(payload),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-register', variables.date] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-register'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-range'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'annual-summary'] });
    },
  });
}

export function useTriggerAbsenceProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date?: string | null) => triggerAbsenceProcess(date),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-register'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance-range'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'attendance'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'annual-summary'] });
    },
  });
}

// ─── Payroll Periods & Settlement ─────────────────────────────────────────────

export function usePayrollPeriods() {
  return useQuery<BackendPayrollPeriod[]>({
    queryKey: queryKeys.hr.payrollPeriods,
    queryFn: getPayrollPeriods,
    staleTime: 60 * 1000,
  });
}

export function usePayrollRecords(periodId: string | undefined, branchId?: string | null) {
  return useQuery<BackendSalaryRecord[]>({
    queryKey: queryKeys.hr.payrollRecords(periodId ?? '', branchId),
    queryFn: () => (periodId ? getPayrollRecords(periodId, branchId) : Promise.resolve([])),
    enabled: Boolean(periodId),
    staleTime: 60 * 1000,
  });
}

export function useCreatePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      period_month: number;
      period_year: number;
      start_date: string;
      end_date: string;
      late_reset_policy?: 'MONTHLY' | 'PAYROLL_PERIOD' | 'CONTINUOUS';
    }) => createPayrollPeriod(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.payrollPeriods });
    },
  });
}

export function useGeneratePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => generatePayroll(periodId),
    onSuccess: (_data, periodId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.payrollPeriods });
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll-records', periodId] });
    },
  });
}

export function useApprovePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => approvePayrollPeriod(periodId),
    onSuccess: (_data, periodId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.payrollPeriods });
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll-records', periodId] });
    },
  });
}

export function useSalarySettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      salaryRecordId: string;
      amount: number;
      payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';
      reference_number?: string;
      notes?: string;
    }) => submitSalarySettlement(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hr', 'payroll-records'] });
      void qc.invalidateQueries({ queryKey: queryKeys.hr.payrollPeriods });
    },
  });
}

// ─── Shift Templates ──────────────────────────────────────────────────────────

export function useShiftTemplates() {
  return useQuery<BackendShiftTemplate[]>({
    queryKey: queryKeys.hr.shiftTemplates,
    queryFn: getShiftTemplates,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateShiftTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      shift_start_time: string;
      shift_end_time: string;
      shift_duration_minutes?: number;
      break_duration_minutes?: number;
      late_threshold_minutes?: number;
      working_days_json?: string;
    }) => createShiftTemplate(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.shiftTemplates });
    },
  });
}

// ─── HR Policy Settings Hooks (Stage 2.1 / 2.2) ──────────────────────────────

export function useHRPolicies() {
  return useQuery({
    queryKey: queryKeys.hr.policies,
    queryFn: getHRPolicies,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEffectiveHRPolicy(branchId?: string | null, date?: string) {
  return useQuery({
    queryKey: queryKeys.hr.effectivePolicy(branchId, date),
    queryFn: () => getEffectiveHRPolicy({ branchId, date }),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(branchId !== undefined),
  });
}

export function useHRPolicyAuditLogs(policyId?: string, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.hr.policyAuditLogs(policyId, branchId),
    queryFn: () => getHRPolicyAuditLogs({ policyId, branchId }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateHRPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePolicyPayload) => createHRPolicy(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.policies });
      void qc.invalidateQueries({ queryKey: ['hr', 'policies', 'effective'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'policies', 'audit'] });
    },
  });
}

export function useRetireHRPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, payload }: { policyId: string; payload: RetirePolicyPayload }) =>
      retireHRPolicy(policyId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.hr.policies });
      void qc.invalidateQueries({ queryKey: ['hr', 'policies', 'effective'] });
      void qc.invalidateQueries({ queryKey: ['hr', 'policies', 'audit'] });
    },
  });
}
