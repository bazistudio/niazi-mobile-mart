import React, { useState } from 'react';
import {
  Settings,
  DollarSign,
  Clock,
  Calendar,
  Info,
  Save,
  AlertTriangle,
} from 'lucide-react';
import type { StaffUser } from '@/features/settings/types/staff.types';
import type { HRSalaryConfig, HROvertimeConfig } from '../types/hr.types';
import { DEFAULT_ATTENDANCE_RULES } from '../types/hr.types';
import { BackendIntegrationNotice } from './BackendIntegrationNotice';

interface StaffSalaryConfigurationProps {
  staff: StaffUser;
  /** Initial values — may be null if backend has no data yet */
  initialConfig?: HRSalaryConfig | null;
  initialOvertimeConfig?: HROvertimeConfig | null;
  /**
   * Called when user submits the form. Parent handles the save attempt and shows error.
   * Since backend is unavailable, parent should show a BackendIntegrationNotice on error.
   */
  onSave?: (config: HRSalaryConfig, overtimeConfig: HROvertimeConfig) => Promise<void>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * StaffSalaryConfiguration
 *
 * Per-employee salary and attendance rule configuration form.
 * Values are React state — NOT persisted until backend is built.
 *
 * Business rules applied as defaults:
 * - Standard shift: 11 hours/day
 * - Late threshold: 20 minutes
 * - Absence deduction: 1/26 of monthly salary per absent day
 * - Overtime trigger: 9 hours (KNOWN DISCREPANCY from 11hr standard — both kept separate)
 * - Overtime multiplier: 1.5×
 */
export const StaffSalaryConfiguration: React.FC<StaffSalaryConfigurationProps> = ({
  staff,
  initialConfig,
  initialOvertimeConfig,
  onSave,
}) => {
  const [monthlySalary, setMonthlySalary] = useState(
    initialConfig?.monthlySalary ?? 0
  );
  const [standardShiftHours, setStandardShiftHours] = useState(
    initialConfig?.standardShiftHours ?? DEFAULT_ATTENDANCE_RULES.standardShiftHours
  );
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(
    initialConfig?.lateThresholdMinutes ?? DEFAULT_ATTENDANCE_RULES.lateThresholdMinutes
  );
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(
    initialOvertimeConfig?.overtimeMultiplier ?? DEFAULT_ATTENDANCE_RULES.overtimeMultiplier
  );
  const [overtimeTriggerHours, setOvertimeTriggerHours] = useState(
    initialOvertimeConfig?.overtimeTriggerHours ?? DEFAULT_ATTENDANCE_RULES.overtimeTriggerHours
  );
  const [requiresManagerApproval, setRequiresManagerApproval] = useState(
    initialOvertimeConfig?.requiresManagerApproval ?? true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Derived: per-day deduction
  const absenceDeductionPerDay =
    monthlySalary > 0
      ? monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth
      : 0;

  // Derived: hourly rate
  const hourlyRate =
    monthlySalary > 0
      ? monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth / standardShiftHours
      : 0;

  // Derived: overtime hourly rate
  const overtimeHourlyRate = hourlyRate * overtimeMultiplier;

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const config: HRSalaryConfig = {
        staffId: staff._id,
        monthlySalary,
        standardShiftHours,
        lateThresholdMinutes,
        absenceDeductionPerDay,
      };
      const overtimeConfig: HROvertimeConfig = {
        staffId: staff._id,
        overtimeMultiplier,
        overtimeTriggerHours,
        requiresManagerApproval,
      };
      await onSave(config, overtimeConfig);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Save failed — backend not yet available.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Backend notice */}
      <BackendIntegrationNotice
        title="Salary Configuration — Preview Mode"
        description="Changes made here are stored in React state for the current session only. No data is saved to the database until the HR backend endpoints are built."
        requiredEndpoints={[
          'POST /api/v1/hr/salary-configs',
          'GET /api/v1/hr/salary-configs/:staffId',
        ]}
        variant="warning"
      />

      {/* Staff Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">
            {staff.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">{staff.name}</div>
          {staff.branchName && (
            <div className="text-xs text-gray-500 dark:text-gray-400">{staff.branchName}</div>
          )}
        </div>
        <div className="ml-auto">
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium">
            {staff.roleName || 'Staff'}
          </span>
        </div>
      </div>

      {/* ── Salary Section ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
          <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Base Salary</span>
        </div>
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          {/* Monthly Salary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Monthly Gross Salary (PKR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₨</span>
                <input
                  type="number"
                  min={0}
                  value={monthlySalary || ''}
                  onChange={(e) => setMonthlySalary(Number(e.target.value))}
                  placeholder="e.g. 30000"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Derived: Per-Day Deduction */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Absence Deduction / Day
                <span className="ml-1.5 text-xs text-gray-400 font-normal">(salary ÷ 26)</span>
              </label>
              <div className="flex items-center h-9 px-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400 font-semibold">
                {monthlySalary > 0 ? formatCurrency(absenceDeductionPerDay) : '—'}
              </div>
            </div>
          </div>

          {/* Derived calculation info */}
          {monthlySalary > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Hourly rate: <strong>{formatCurrency(hourlyRate)}/hr</strong> based on {standardShiftHours}hr shift × 26 working days.
                Overtime rate: <strong>{formatCurrency(overtimeHourlyRate)}/hr</strong> ({overtimeMultiplier}× multiplier).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Attendance Rules Section ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
          <Clock className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Attendance Rules</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-gray-900">
          {/* Standard Shift Hours */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Standard Shift (hours/day)
              <span className="ml-1.5 text-xs text-orange-500 font-semibold">Business rule: 11</span>
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={standardShiftHours}
              onChange={(e) => setStandardShiftHours(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                text-gray-900 dark:text-white"
            />
          </div>

          {/* Late Threshold */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Late Threshold (minutes)
              <span className="ml-1.5 text-xs text-orange-500 font-semibold">Business rule: 20</span>
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={lateThresholdMinutes}
              onChange={(e) => setLateThresholdMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* ── Overtime Section ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
          <Calendar className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Overtime Configuration</span>
        </div>
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          {/* Discrepancy notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Known discrepancy:</strong> Standard shift is {standardShiftHours} hrs/day but overtime triggers at {overtimeTriggerHours} hrs/day.
              Both values are configurable separately — this is intentional per business rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Overtime Trigger Hours */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Overtime Trigger (hours/day)
                <span className="ml-1.5 text-xs text-purple-500 font-semibold">Business rule: 9</span>
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={overtimeTriggerHours}
                onChange={(e) => setOvertimeTriggerHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                  text-gray-900 dark:text-white"
              />
            </div>

            {/* Overtime Multiplier */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Overtime Rate Multiplier
                <span className="ml-1.5 text-xs text-purple-500 font-semibold">Business rule: 1.5×</span>
              </label>
              <input
                type="number"
                min={1}
                max={5}
                step={0.25}
                value={overtimeMultiplier}
                onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                  text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Manager Approval Toggle */}
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={requiresManagerApproval}
              onChange={(e) => setRequiresManagerApproval(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500/30"
            />
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Requires Manager Approval
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                Overtime hours must be approved by a manager before they count toward pay.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <BackendIntegrationNotice
          title="Save Not Available"
          description={saveError}
          variant="warning"
          requiredEndpoints={[
            'POST /api/v1/hr/salary-configs',
            'POST /api/v1/hr/overtime-configs',
          ]}
        />
      )}

      {/* Save Button */}
      {onSave && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || monthlySalary <= 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700
              text-white text-sm font-semibold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      )}
    </div>
  );
};

export default StaffSalaryConfiguration;
