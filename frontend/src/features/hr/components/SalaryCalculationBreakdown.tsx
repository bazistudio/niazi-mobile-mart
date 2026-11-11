import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Eye, AlertTriangle } from 'lucide-react';
import type { HRSalaryCalculation } from '../types/hr.types';
import { DEFAULT_ATTENDANCE_RULES } from '../types/hr.types';

interface SalaryCalculationInput {
  staffId: string;
  staffName: string;
  month: number;
  year: number;
  monthlySalary: number;
  standardShiftHours?: number;
  workingDays?: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  overtimeHours: number;
  overtimeMultiplier?: number;
  bonusAmount?: number;
  advanceDeduction?: number;
}

interface SalaryCalculationBreakdownProps {
  input: SalaryCalculationInput;
  className?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(value);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * SalaryCalculationBreakdown
 *
 * Shows a detailed, itemized salary calculation preview.
 * This is ALWAYS preview-only — never represents a real payment.
 *
 * Business rules applied:
 * - Absence deduction: absentDays × (monthlySalary / 26)
 * - Overtime: overtimeHours × (monthlySalary / 26 / standardShiftHours) × overtimeMultiplier
 * - Late deduction: a nominal amount (lateDays × half-day deduction; adjust when backend provides formula)
 */
export const SalaryCalculationBreakdown: React.FC<SalaryCalculationBreakdownProps> = ({
  input,
  className = '',
}) => {
  const calculation = useMemo((): HRSalaryCalculation => {
    const {
      staffId,
      staffName,
      month,
      year,
      monthlySalary,
      standardShiftHours = DEFAULT_ATTENDANCE_RULES.standardShiftHours,
      workingDays = DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth,
      presentDays,
      absentDays,
      lateDays,
      overtimeHours,
      overtimeMultiplier = DEFAULT_ATTENDANCE_RULES.overtimeMultiplier,
      bonusAmount = 0,
      advanceDeduction = 0,
    } = input;

    const perDayRate = monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth;
    const hourlyRate = perDayRate / standardShiftHours;

    const absenceDeduction = absentDays * perDayRate;
    // Late deduction policy: 3 qualifying late arrivals = 1 absence equivalent (monthlySalary / 26)
    const lateAbsenceEquivalents = Math.floor(lateDays / 3);
    const lateDeduction = lateAbsenceEquivalents * perDayRate;
    const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;

    const netSalary = Math.max(
      0,
      monthlySalary - absenceDeduction - lateDeduction + overtimePay + bonusAmount - advanceDeduction
    );

    return {
      staffId,
      staffName,
      month,
      year,
      monthlySalary,
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      absenceDeduction,
      lateDeduction,
      overtimeHours,
      overtimePay,
      bonusAmount,
      advanceDeduction,
      netSalary,
      isPreviewOnly: true,
    };
  }, [input]);

  const {
    staffName,
    month,
    year,
    monthlySalary,
    workingDays,
    presentDays,
    absentDays,
    lateDays,
    absenceDeduction,
    lateDeduction,
    overtimeHours,
    overtimePay,
    bonusAmount,
    advanceDeduction,
    netSalary,
  } = calculation;

  const totalDeductions = absenceDeduction + lateDeduction + advanceDeduction;
  const totalAdditions = overtimePay + bonusAmount;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Preview Warning Banner */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <Eye className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          PREVIEW ONLY — This calculation is not saved and does not represent a real payment.
        </span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-base">{staffName}</div>
              <div className="text-blue-200 text-xs mt-0.5">
                {MONTH_NAMES[month - 1]} {year} · Salary Calculation
              </div>
            </div>
            <div className="text-right">
              <div className="text-blue-200 text-xs">Base Salary</div>
              <div className="text-white font-bold text-lg">{formatCurrency(monthlySalary)}</div>
            </div>
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
          {[
            { label: 'Present', value: presentDays, color: 'text-green-600 dark:text-green-400' },
            { label: 'Absent', value: absentDays, color: 'text-red-500 dark:text-red-400' },
            { label: 'Late', value: lateDays, color: 'text-amber-500 dark:text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label} Days</div>
            </div>
          ))}
        </div>
      </div>

      {/* Deductions */}
      {totalDeductions > 0 && (
        <div className="rounded-xl border border-red-100 dark:border-red-900/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/50">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">Deductions</span>
          </div>
          <div className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
            {absenceDeduction > 0 && (
              <BreakdownRow
                label={`Absence (${absentDays} day${absentDays !== 1 ? 's' : ''} × ${formatCurrency(monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth)}/day)`}
                value={-absenceDeduction}
                variant="deduction"
              />
            )}
            {lateDeduction > 0 && (
              <BreakdownRow
                label={`Late Marks (${lateDays} late${lateDays !== 1 ? 's' : ''} → ${Math.floor(lateDays / 3)} absence equiv. × ${formatCurrency(monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth)}/day)`}
                value={-lateDeduction}
                variant="deduction"
                note="3 qualifying late arrivals (>20 min) = 1 absence equivalent"
              />
            )}
            {advanceDeduction > 0 && (
              <BreakdownRow
                label="Advance Recovery"
                value={-advanceDeduction}
                variant="deduction"
              />
            )}
            <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 dark:bg-red-950/20">
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Total Deductions</span>
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                − {formatCurrency(totalDeductions)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Additions */}
      {totalAdditions > 0 && (
        <div className="rounded-xl border border-green-100 dark:border-green-900/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900/50">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">Additions</span>
          </div>
          <div className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
            {overtimePay > 0 && (
              <BreakdownRow
                label={`Overtime (${overtimeHours}hr × ${input.overtimeMultiplier ?? DEFAULT_ATTENDANCE_RULES.overtimeMultiplier}× rate)`}
                value={overtimePay}
                variant="addition"
              />
            )}
            {bonusAmount > 0 && (
              <BreakdownRow
                label="Bonus"
                value={bonusAmount}
                variant="addition"
              />
            )}
            <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 dark:bg-green-950/20">
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">Total Additions</span>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                + {formatCurrency(totalAdditions)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Net Salary */}
      <div className="rounded-xl border-2 border-blue-500 dark:border-blue-600 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600 dark:bg-blue-700">
          <div>
            <div className="text-blue-100 text-xs font-medium mb-0.5">Net Salary (Preview)</div>
            <div className="text-white text-2xl font-black">{formatCurrency(netSalary)}</div>
          </div>
          <div className="text-right text-xs text-blue-200 space-y-0.5">
            <div>{formatCurrency(monthlySalary)} base</div>
            {totalDeductions > 0 && <div>− {formatCurrency(totalDeductions)} deductions</div>}
            {totalAdditions > 0 && <div>+ {formatCurrency(totalAdditions)} additions</div>}
          </div>
        </div>
        {/* Working days info */}
        <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-950/40 flex items-center justify-between">
          <span className="text-xs text-blue-600 dark:text-blue-400">
            Working days this period: {workingDays} · Present: {presentDays}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            Preview Only
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-component ─────────────────────────────────────────────────────────────

interface BreakdownRowProps {
  label: string;
  value: number;
  variant: 'deduction' | 'addition' | 'neutral';
  note?: string;
}

function BreakdownRow({ label, value, variant, note }: BreakdownRowProps) {
  const colorClass =
    variant === 'deduction'
      ? 'text-red-600 dark:text-red-400'
      : variant === 'addition'
      ? 'text-green-600 dark:text-green-400'
      : 'text-gray-700 dark:text-gray-300';

  const prefix = variant === 'deduction' ? '−' : variant === 'addition' ? '+' : '';

  return (
    <div className="flex items-start justify-between px-4 py-2.5 gap-4">
      <div className="min-w-0">
        <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">{label}</div>
        {note && (
          <div className="flex items-center gap-1 mt-0.5">
            <Minus className="w-2.5 h-2.5 text-gray-400" />
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">{note}</span>
          </div>
        )}
      </div>
      <span className={`text-sm font-semibold shrink-0 ${colorClass}`}>
        {prefix} {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export default SalaryCalculationBreakdown;
