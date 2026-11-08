/**
 * HR Feature Types — Niazi Mobile Mart
 *
 * Phase 2: Backend HR endpoints are now live.
 * - Frontend UI types (HRSalaryConfig, HROvertimeConfig, etc.) remain for
 *   local React state and form handling.
 * - Backend* types (BackendSalaryConfig, BackendStaffMember, etc.) describe
 *   actual API response shapes from /api/v1/hr/*.
 */

// ─── Salary & Payroll (UI / local state) ─────────────────────────────────────

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'COMMISSION_PERCENTAGE';

export interface HRSalaryConfig {
  staffId: string;
  /**
   * Gross monthly salary in PKR. Used as base for all calculations.
   * For percentage mechanics, this is typically 0 or an optional guaranteed base retainer.
   */
  monthlySalary: number;
  /**
   * Employment type: FULL_TIME (default 11h), PART_TIME (custom hours), or COMMISSION_PERCENTAGE (repair mechanics).
   */
  employmentType?: EmploymentType;
  /**
   * Commission / Profit Share percentage for repair mechanics (e.g. 50%, 40%, 60%).
   */
  commissionPercentage?: number;
  /**
   * Standard work hours per day. Full-time business rule: 11 hours.
   * For part-time staff, e.g. 2h, 4h, 5h.
   * Note: Overtime triggers at 9 hours — a KNOWN discrepancy kept as
   * two separate configurable values. See HROvertimeConfig.overtimeTriggerHours.
   */
  standardShiftHours: number; // default: 11
  /**
   * Minutes late before a late-mark is recorded. Business rule: 20 minutes.
   */
  lateThresholdMinutes: number; // default: 20
  /**
   * Individual staff bonus or reward in PKR (specific to this staff member).
   */
  individualBonus?: number;
  /**
   * Reason or note for the individual bonus / reward.
   */
  bonusReason?: string;
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
 */
export interface HRAdvanceRequest {
  staffId: string;
  amount: number;
  reason: string;
  requestDate: string; // ISO date string
  /** Approval status */
  status: 'pending' | 'approved' | 'rejected';
}

// ─── Salary Settlement ────────────────────────────────────────────────────────

export type SalarySettlementScenario =
  | 'exact'      // Payment equals net salary
  | 'overpaid'   // Payment exceeds net salary
  | 'underpaid'; // Payment less than net salary

export interface HRSalarySettlementPreview {
  staffId: string;
  month: number;
  year: number;
  netSalary: number;
  paymentAmount: number;
  scenario: SalarySettlementScenario;
  difference: number; // Math.abs(paymentAmount - netSalary)
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
  search?: string;
  role?: string;
  month?: number;
  year?: number;
}

// ─── Backend API Response Types ───────────────────────────────────────────────
// These reflect the actual shapes returned by /api/v1/hr/* endpoints.

/** Staff member as returned by GET /api/v1/hr/staff */
export interface BackendStaffMember {
  user_id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  created_at: string;
}

/** Salary configuration as returned by GET /api/v1/hr/staff/:userId/salary-config */
export interface BackendSalaryConfig {
  id: string;
  user_id: string;
  organization_id: string;
  branch_id: string | null;
  salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY';
  monthly_salary: number | null;
  daily_rate: number | null;
  hourly_rate: number | null;
  effective_from: string;       // ISO date string (YYYY-MM-DD)
  effective_to: string | null;  // null = currently active
  overtime_multiplier: number;  // default 1.5
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Shift template as returned by GET /api/v1/hr/shift-templates */
export interface BackendShiftTemplate {
  id: string;
  organization_id: string;
  name: string;
  shift_start_time: string;        // HH:MM:SS
  shift_end_time: string;          // HH:MM:SS
  shift_duration_minutes: number;  // default 660 (11 hours)
  break_duration_minutes: number;  // default 0 (UNRESOLVED — owner not yet confirmed)
  late_threshold_minutes: number;  // default 20
  working_days_json: string;       // JSON array e.g. '["MON","TUE","WED","THU","FRI","SAT"]'
  is_active: boolean;
  created_by: string;
  created_at: string;
}

/** Payroll period as returned by GET /api/v1/hr/payroll-periods */
export interface BackendPayrollPeriod {
  id: string;
  organization_id: string;
  period_month: number;   // 1–12
  period_year: number;
  start_date: string;     // YYYY-MM-DD
  end_date: string;       // YYYY-MM-DD
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'CLOSED';
  late_reset_policy: 'MONTHLY' | 'PAYROLL_PERIOD' | 'CONTINUOUS';
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  record_count?: number;
}

/** Salary record as returned by GET /api/v1/hr/payroll-periods/:id/records */
export interface BackendSalaryRecord {
  id: string;
  period_id: string;
  user_id: string;
  organization_id: string;
  branch_id: string | null;
  full_name: string | null;
  username: string;
  salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY';
  base_salary: number;
  absent_days: number;
  late_count: number;
  late_absence_equivalents: number;
  total_deduction_days: number;
  absence_deduction: number;
  overtime_minutes: number;
  overtime_amount: number;
  bonus_amount: number;
  advance_deduction: number;
  manual_adjustment: number;
  adjustment_note: string | null;
  gross_payable: number;
  net_payable: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'DRAFT' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID';
  salary_config_snapshot: Partial<BackendSalaryConfig> | null;
  created_at: string;
  updated_at: string;
}

/** Staff advance as returned by GET /api/v1/hr/staff/:userId/advances */
export interface BackendStaffAdvance {
  id: string;
  user_id: string;
  organization_id: string;
  branch_id: string | null;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISBURSED' | 'RECOVERED' | 'CANCELLED';
  requested_date: string;    // YYYY-MM-DD
  approved_by: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  disbursement_method: string | null;
  reference_number: string | null;
  recovered_amount: number;
  outstanding_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Attendance record as returned by GET /api/v1/hr/staff/:userId/attendance */
export interface BackendAttendanceRecord {
  id: string;
  user_id: string;
  organization_id: string;
  branch_id: string | null;
  attendance_date: string;         // YYYY-MM-DD
  check_in_at: string | null;      // ISO UTC timestamp
  check_out_at: string | null;     // ISO UTC timestamp (manual or null)
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY' | 'WEEKLY_OFF';
  late_minutes: number;
  worked_minutes: number | null;
  shift_duration_minutes: number;  // snapshot at time of attendance
  late_threshold_minutes: number;  // snapshot at time of attendance
  source: 'LOGIN' | 'MANUAL' | 'ABSENCE_JOB';
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Progress report response from GET /api/v1/reports/progress */
export interface ProgressReportResponse {
  user_id: string;
  branch_id: string | null;
  period: {
    start_date: string | null;
    end_date: string | null;
  };
  sales: {
    count: number;
    gross: number;
    discounts: number;
    net: number;
    collected: number;
  };
  returns: {
    count: number;
    refunds: number;
  };
  cash: {
    collected: number;
    refunded: number;
  };
  repairs: {
    count: number;
    completed: number;
    quoted_total: number;
  };
}
