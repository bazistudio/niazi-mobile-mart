/**
 * HR React Query Hooks — Niazi Mobile Mart
 *
 * Phase 2: HR backend endpoints are now live at /api/v1/hr/*.
 * These hooks wrap hr.api.ts, which now makes real HTTP calls.
 *
 * Hook return types use BackendSalaryConfig, BackendStaffAdvance, and
 * BackendAttendanceRecord from hr.types.ts. The UI component that
 * previously relied on HRSalaryConfig for local preview state can still
 * use DEFAULT_ATTENDANCE_RULES for local defaults, but should use
 * BackendSalaryConfig when displaying saved backend data.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getStaffSalaryConfig,
  getStaffOvertimeConfig,
  getStaffAdvanceHistory,
  getStaffAttendance,
  getHRStaffList,
  getPayrollPeriods,
  getPayrollRecords,
  getShiftTemplates,
} from '../services/hr.api';
import type {
  HROvertimeConfig,
  BackendSalaryConfig,
  BackendStaffMember,
  BackendStaffAdvance,
  BackendAttendanceRecord,
  BackendPayrollPeriod,
  BackendSalaryRecord,
  BackendShiftTemplate,
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

export function useHRStaff() {
  return useQuery<BackendStaffMember[]>({
    queryKey: queryKeys.hr.staff,
    queryFn: getHRStaffList,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Salary Config ────────────────────────────────────────────────────────────

/**
 * Fetch salary config for a staff member from the backend.
 * Returns null if no config exists yet (404 → null).
 */
export function useStaffSalaryConfig(staffId: string | undefined) {
  return useQuery<BackendSalaryConfig | null>({
    queryKey: queryKeys.hr.salaryConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffSalaryConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Overtime config is now part of BackendSalaryConfig.overtime_multiplier.
 * This hook is kept for backward compatibility — returns null always.
 * Use useStaffSalaryConfig and read .overtime_multiplier instead.
 */
export function useStaffOvertimeConfig(staffId: string | undefined) {
  return useQuery<HROvertimeConfig | null>({
    queryKey: queryKeys.hr.overtimeConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffOvertimeConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Advances ─────────────────────────────────────────────────────────────────

/**
 * Fetch advance history for a staff member.
 */
export function useStaffAdvances(staffId: string | undefined) {
  return useQuery<BackendStaffAdvance[]>({
    queryKey: queryKeys.hr.advances(staffId ?? ''),
    queryFn: () => (staffId ? getStaffAdvanceHistory(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Attendance ───────────────────────────────────────────────────────────────

/**
 * Fetch attendance records for a staff member for a given month/year.
 */
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
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Payroll Periods ──────────────────────────────────────────────────────────

export function usePayrollPeriods() {
  return useQuery<BackendPayrollPeriod[]>({
    queryKey: queryKeys.hr.payrollPeriods,
    queryFn: getPayrollPeriods,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePayrollRecords(periodId: string | undefined) {
  return useQuery<BackendSalaryRecord[]>({
    queryKey: queryKeys.hr.payrollRecords(periodId ?? ''),
    queryFn: () => (periodId ? getPayrollRecords(periodId) : Promise.resolve([])),
    enabled: Boolean(periodId),
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Shift Templates ──────────────────────────────────────────────────────────

export function useShiftTemplates() {
  return useQuery<BackendShiftTemplate[]>({
    queryKey: queryKeys.hr.shiftTemplates,
    queryFn: getShiftTemplates,
    staleTime: 10 * 60 * 1000,
  });
}
