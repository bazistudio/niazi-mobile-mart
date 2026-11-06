/**
 * HR API Service — Niazi Mobile Mart
 *
 * ⚠️  BACKEND NOT YET IMPLEMENTED
 *
 * This file contains placeholder functions representing the HR API surface
 * that WILL exist once backend endpoints are built. All functions currently
 * throw or return empty results with a clear notice.
 *
 * DO NOT:
 * - Add localStorage reads/writes to simulate persistence
 * - Return fake "success" responses that imply data was saved
 * - Present any returned data as real company financial records
 *
 * DO:
 * - Use these stubs to type-check callers
 * - Show BackendIntegrationNotice in any UI that calls these
 */

import type {
  HRSalaryConfig,
  HROvertimeConfig,
  HRAdvanceRequest,
} from '../types/hr.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class HRBackendUnavailableError extends Error {
  constructor(endpoint: string) {
    super(
      `[HR] Backend endpoint not yet implemented: ${endpoint}. ` +
        'This feature requires backend development before data can be saved.'
    );
    this.name = 'HRBackendUnavailableError';
  }
}

// ─── Salary Config Stubs ──────────────────────────────────────────────────────

/**
 * Fetch salary configuration for a staff member.
 * STUB: No backend endpoint. Returns null.
 */
export async function getStaffSalaryConfig(
  _staffId: string
): Promise<HRSalaryConfig | null> {
  // TODO: GET /api/v1/hr/salary-configs/:staffId
  return null;
}

/**
 * Save salary configuration for a staff member.
 * STUB: No backend endpoint. Throws HRBackendUnavailableError.
 */
export async function saveStaffSalaryConfig(
  _config: HRSalaryConfig
): Promise<void> {
  throw new HRBackendUnavailableError('POST /api/v1/hr/salary-configs');
}

/**
 * Fetch overtime configuration for a staff member.
 * STUB: No backend endpoint. Returns null.
 */
export async function getStaffOvertimeConfig(
  _staffId: string
): Promise<HROvertimeConfig | null> {
  // TODO: GET /api/v1/hr/overtime-configs/:staffId
  return null;
}

/**
 * Save overtime configuration for a staff member.
 * STUB: No backend endpoint. Throws HRBackendUnavailableError.
 */
export async function saveStaffOvertimeConfig(
  _config: HROvertimeConfig
): Promise<void> {
  throw new HRBackendUnavailableError('POST /api/v1/hr/overtime-configs');
}

// ─── Payroll / Settlement Stubs ───────────────────────────────────────────────

/**
 * Submit a salary settlement (payment record).
 * STUB: No backend endpoint. Throws HRBackendUnavailableError.
 */
export async function submitSalarySettlement(_payload: {
  staffId: string;
  month: number;
  year: number;
  paymentAmount: number;
  notes?: string;
}): Promise<void> {
  throw new HRBackendUnavailableError('POST /api/v1/hr/settlements');
}

// ─── Advance Stubs ─────────────────────────────────────────────────────────────

/**
 * Submit a staff advance request.
 * STUB: No backend endpoint. Throws HRBackendUnavailableError.
 */
export async function submitAdvanceRequest(
  _request: Omit<HRAdvanceRequest, 'status'>
): Promise<void> {
  throw new HRBackendUnavailableError('POST /api/v1/hr/advances');
}

/**
 * Fetch advance history for a staff member.
 * STUB: No backend endpoint. Returns empty array.
 */
export async function getStaffAdvanceHistory(
  _staffId: string
): Promise<HRAdvanceRequest[]> {
  // TODO: GET /api/v1/hr/advances?staffId=:staffId
  return [];
}

// ─── Attendance Stubs ──────────────────────────────────────────────────────────

/**
 * Fetch attendance records for a staff member in a given month.
 * STUB: No backend endpoint. Returns null.
 */
export async function getStaffAttendance(_params: {
  staffId: string;
  month: number;
  year: number;
}): Promise<null> {
  // TODO: GET /api/v1/hr/attendance?staffId=...&month=...&year=...
  return null;
}
