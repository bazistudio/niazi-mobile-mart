/**
 * HR React Query Hooks — Niazi Mobile Mart
 *
 * These hooks wrap hr.api.ts stubs. Because the backend HR endpoints
 * do not yet exist, most hooks return { data: null/[], isBackendPending: true }.
 *
 * React Query is used so that when backend endpoints are built, only
 * the api function needs updating — the hook interface stays stable.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getStaffSalaryConfig,
  getStaffOvertimeConfig,
  getStaffAdvanceHistory,
  getStaffAttendance,
} from '../services/hr.api';
import type { HRSalaryConfig, HROvertimeConfig, HRAdvanceRequest } from '../types/hr.types';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const hrQueryKeys = {
  salaryConfig: (staffId: string) => ['hr', 'salary-config', staffId] as const,
  overtimeConfig: (staffId: string) => ['hr', 'overtime-config', staffId] as const,
  advances: (staffId: string) => ['hr', 'advances', staffId] as const,
  attendance: (staffId: string, month: number, year: number) =>
    ['hr', 'attendance', staffId, month, year] as const,
} as const;

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch salary config for a staff member.
 * Returns null until backend is implemented.
 */
export function useStaffSalaryConfig(staffId: string | undefined) {
  return useQuery<HRSalaryConfig | null>({
    queryKey: hrQueryKeys.salaryConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffSalaryConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch overtime config for a staff member.
 * Returns null until backend is implemented.
 */
export function useStaffOvertimeConfig(staffId: string | undefined) {
  return useQuery<HROvertimeConfig | null>({
    queryKey: hrQueryKeys.overtimeConfig(staffId ?? ''),
    queryFn: () => (staffId ? getStaffOvertimeConfig(staffId) : Promise.resolve(null)),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch advance history for a staff member.
 * Returns [] until backend is implemented.
 */
export function useStaffAdvances(staffId: string | undefined) {
  return useQuery<HRAdvanceRequest[]>({
    queryKey: hrQueryKeys.advances(staffId ?? ''),
    queryFn: () => (staffId ? getStaffAdvanceHistory(staffId) : Promise.resolve([])),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch attendance records for a staff member.
 * Returns null until backend is implemented.
 */
export function useStaffAttendance(
  staffId: string | undefined,
  month: number,
  year: number
) {
  return useQuery({
    queryKey: hrQueryKeys.attendance(staffId ?? '', month, year),
    queryFn: () =>
      staffId ? getStaffAttendance({ staffId, month, year }) : Promise.resolve(null),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}
