/**
 * HR Feature Types — Niazi Mobile Mart
 *
 * IMPORTANT: These types describe the DESIRED data model for HR features.
 * Most fields do NOT have corresponding backend API endpoints yet.
 * The UI uses these types for local React state / previews only.
 * No salary, payroll, attendance, or advance data is persisted to any database.
 */

// ─── Salary & Payroll ────────────────────────────────────────────────────────

export interface HRSalaryConfig {
  staffId: string;
  /**
   * Gross monthly salary in PKR. Used as base for all calculations.
   * SOURCE: Entered manually per staff member. Not stored in backend.
   */
  monthlySalary: number;
  /**
   * Standard work hours per day. Business rule: 11 hours.
   * Note: Overtime triggers at 9 hours — a KNOWN discrepancy kept as
   * two separate configurable values. See HROvertimeConfig.overtimeTriggerHours.
   */
  standardShiftHours: number; // default: 11
  /**
   * Minutes late before a late-mark is recorded. Business rule: 20 minutes.
   */
  lateThresholdMinutes: number; // default: 20
  /**
   * Deduction per absent day = monthlySalary / 26.
   * Calculated field — never stored separately.
   */
  absenceDeductionPerDay?: number; // derived: monthlySalary / 26
}

export interface HROvertimeConfig {
  staffId: string;
  /**
   * Multiplier applied to hourly rate for overtime hours.
   * Business rule: 1.5×
   */
  overtimeMultiplier: number; // default: 1.5
  /**
   * Hours/day beyond which overtime applies.
   * Business rule: 9 hours.
   * KNOWN DISCREPANCY: standard shift is 11 hrs but overtime triggers at 9 hrs.
   * Both values are kept as separate configurable fields — never silently merge.
   */
  overtimeTriggerHours: number; // default: 9
  /**
   * Whether manager approval is required before overtime is counted.
   */
  requiresManagerApproval: boolean; // default: true
}

/** Preview-only salary calculation. Never persisted. */
export interface HRSalaryCalculation {
  staffId: string;
  staffName: string;
  month: number; // 1–12
  year: number;
  monthlySalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  absenceDeduction: number; // absentDays × (monthlySalary / 26)
  lateDeduction: number;    // calculated per business rules
  overtimeHours: number;
  overtimePay: number;      // overtimeHours × (monthlySalary / 26 / 11) × 1.5
  bonusAmount: number;
  advanceDeduction: number;
  netSalary: number;        // monthlySalary - absenceDeduction - lateDeduction + overtimePay + bonusAmount - advanceDeduction
  /** This is a PREVIEW only — no payment has been recorded */
  isPreviewOnly: true;
}

// ─── Attendance Rules (UI Config) ────────────────────────────────────────────

export interface HRAttendanceRules {
  /**
   * Standard work shift in hours per day. Business rule: 11 hours.
   */
  standardShiftHours: number;         // 11 (overrides any mock showing 9)
  /**
   * Minutes after scheduled start before a late-mark applies. Business rule: 20 min.
   */
  lateThresholdMinutes: number;       // 20 (overrides any mock showing 15)
  /**
   * Days per month used for per-day deduction calculation.
   * Business rule: 26 (not 30/31).
   */
  workingDaysPerMonth: number;        // 26
  /**
   * Fraction of monthly salary deducted per absent day.
   * Business rule: 1/26
   */
  absenceDeductionFraction: number;   // 1/26 ≈ 0.03846
  /**
   * Trigger for overtime (separate from standard shift — KNOWN discrepancy).
   */
  overtimeTriggerHours: number;       // 9
  overtimeMultiplier: number;         // 1.5
}

export const DEFAULT_ATTENDANCE_RULES: HRAttendanceRules = {
  standardShiftHours: 11,
  lateThresholdMinutes: 20,
  workingDaysPerMonth: 26,
  absenceDeductionFraction: 1 / 26,
  overtimeTriggerHours: 9,
  overtimeMultiplier: 1.5,
};

// ─── Advance Payments ─────────────────────────────────────────────────────────

/**
 * Staff advance request form model.
 * IMPORTANT: Submitting this form does NOT persist any data.
 * No advance records are stored in localStorage or backend.
 */
export interface HRAdvanceRequest {
  staffId: string;
  amount: number;
  reason: string;
  requestDate: string; // ISO date string
  /** Approval status — purely for UI display, no backend round-trip */
  status: 'pending' | 'approved' | 'rejected';
}

// ─── Salary Settlement ────────────────────────────────────────────────────────

export type SalarySettlementScenario =
  | 'exact'      // Payment equals net salary
  | 'overpaid'   // Payment exceeds net salary
  | 'underpaid'; // Payment less than net salary

/** Preview only — describes what a settlement WOULD look like if backend supported it */
export interface HRSalarySettlementPreview {
  staffId: string;
  month: number;
  year: number;
  netSalary: number;
  paymentAmount: number;
  scenario: SalarySettlementScenario;
  difference: number; // Math.abs(paymentAmount - netSalary)
  /** Always true — this is never a real transaction */
  isPreviewOnly: true;
}

// ─── Branch (for HR filters) ──────────────────────────────────────────────────

export interface HRBranchOption {
  id: string;
  name: string;
  code?: string;
}

// ─── Report Filters ───────────────────────────────────────────────────────────

export interface HRReportFilters {
  branchId?: string;
  staffId?: string;
  role?: string;
  month?: number;
  year?: number;
}
