import React, { useState } from 'react';
import {
  Settings,
  DollarSign,
  Clock,
  Calendar,
  Info,
  Save,
  AlertTriangle,
  Gift,
  Briefcase,
  Wrench,
  Percent,
} from 'lucide-react';
import type { StaffUser } from '@/features/settings/types/staff.types';
import type { HRSalaryConfig, HROvertimeConfig, EmploymentType } from '../types/hr.types';
import { DEFAULT_ATTENDANCE_RULES } from '../types/hr.types';
import { BackendIntegrationNotice } from './BackendIntegrationNotice';

interface StaffSalaryConfigurationProps {
  staff: StaffUser;
  /** Initial values — may be null if backend has no data yet */
  initialConfig?: (HRSalaryConfig & { commissionPercentage?: number }) | null;
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
 * Per-employee salary, shift hours, and attendance rule configuration form.
 * Supports:
 *  1. FULL-TIME: Standard 11h shift, monthly salary.
 *  2. PART-TIME: Custom hours (e.g. 2h, 4h, 5h), agreed salary.
 *  3. REPAIR MECHANIC (PERCENTAGE COMMISSION): Profit split (e.g. 50%, 40%, 60%)
 *     on net repair profit (Bill minus parts/expenses) with Rs 0 base salary or optional retainer.
 */
export const StaffSalaryConfiguration: React.FC<StaffSalaryConfigurationProps> = ({
  staff,
  initialConfig,
  initialOvertimeConfig,
  onSave,
}) => {
  const isMechanicRole = (staff.roleName || '').toUpperCase().includes('MECHANIC') || (staff.roleName || '').toUpperCase().includes('REPAIR');

  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    initialConfig?.employmentType ??
    (isMechanicRole ? 'COMMISSION_PERCENTAGE' : (initialConfig?.standardShiftHours && initialConfig.standardShiftHours < 11 ? 'PART_TIME' : 'FULL_TIME'))
  );
  const [monthlySalary, setMonthlySalary] = useState(
    initialConfig?.monthlySalary ?? 0
  );
  const [commissionPercentage, setCommissionPercentage] = useState(
    initialConfig?.commissionPercentage ?? 50
  );
  const [standardShiftHours, setStandardShiftHours] = useState(
    initialConfig?.standardShiftHours ?? DEFAULT_ATTENDANCE_RULES.standardShiftHours
  );
  const [individualBonus, setIndividualBonus] = useState(
    initialConfig?.individualBonus ?? 0
  );
  const [bonusReason, setBonusReason] = useState(
    initialConfig?.bonusReason ?? ''
  );
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(
    initialConfig?.lateThresholdMinutes ?? DEFAULT_ATTENDANCE_RULES.lateThresholdMinutes
  );
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(
    initialOvertimeConfig?.overtimeMultiplier ?? DEFAULT_ATTENDANCE_RULES.overtimeMultiplier
  );
  const [overtimeTriggerHours, setOvertimeTriggerHours] = useState(
    initialOvertimeConfig?.overtimeTriggerHours ?? 
    (employmentType === 'PART_TIME' ? standardShiftHours : DEFAULT_ATTENDANCE_RULES.overtimeTriggerHours)
  );
  const [requiresManagerApproval, setRequiresManagerApproval] = useState(
    initialOvertimeConfig?.requiresManagerApproval ?? true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When switching between Full-Time, Part-Time and Mechanic Commission
  const handleEmploymentTypeChange = (type: EmploymentType) => {
    setEmploymentType(type);
    if (type === 'FULL_TIME') {
      setStandardShiftHours(DEFAULT_ATTENDANCE_RULES.standardShiftHours); // 11 hrs
      setOvertimeTriggerHours(DEFAULT_ATTENDANCE_RULES.overtimeTriggerHours); // 9 hrs
      if (monthlySalary === 0) setMonthlySalary(30000);
    } else if (type === 'PART_TIME') {
      if (standardShiftHours >= 11) {
        setStandardShiftHours(4); // friendly default for part-time (e.g. 4 hrs)
        setOvertimeTriggerHours(4);
      }
      if (monthlySalary === 0) setMonthlySalary(15000);
    } else if (type === 'COMMISSION_PERCENTAGE') {
      // For repair mechanics: Pakistan market standard is 50% profit share & Rs 0 base salary
      if (commissionPercentage <= 0) setCommissionPercentage(50);
      setMonthlySalary(0); // Rs 0 base salary
    }
  };

  // Derived: effective total agreed pay
  const effectiveTotalPay = monthlySalary + individualBonus;

  // Derived: per-day deduction (salary / 26 working days)
  const absenceDeductionPerDay =
    monthlySalary > 0
      ? monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth
      : 0;

  // Derived: hourly rate based on this staff member's specific daily working hours
  const safeShiftHours = standardShiftHours > 0 ? standardShiftHours : 1;
  const hourlyRate =
    monthlySalary > 0
      ? monthlySalary / DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth / safeShiftHours
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
        employmentType,
        commissionPercentage: employmentType === 'COMMISSION_PERCENTAGE' ? commissionPercentage : undefined,
        monthlySalary,
        standardShiftHours,
        individualBonus,
        bonusReason,
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
    <div className="space-y-3.5">
      {/* Backend notice */}
      <BackendIntegrationNotice
        title="Compensation & Work Configuration"
        description="Configure staff compensation model: Full-Time Salary, Part-Time Salary, or Repair Mechanic Percentage Split on net repair profit."
        requiredEndpoints={[
          'POST /api/v1/hr/salary-configs',
          'GET /api/v1/hr/salary-configs/:staffId',
        ]}
        variant="info"
        compact
      />

      {/* Staff Header */}
      <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">
            {staff.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
            {staff.name}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
              employmentType === 'COMMISSION_PERCENTAGE'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : employmentType === 'PART_TIME'
                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            }`}>
              {employmentType === 'COMMISSION_PERCENTAGE'
                ? `Repair Mechanic (${commissionPercentage}% Profit Share)`
                : employmentType === 'PART_TIME'
                ? `Part-Time (${standardShiftHours}h/day)`
                : `Full-Time (11h/day)`}
            </span>
          </div>
          {staff.branchName && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{staff.branchName}</div>
          )}
        </div>
        <div className="ml-auto">
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
            {staff.roleName || 'Staff'}
          </span>
        </div>
      </div>

      {/* ── Compensation Model Selector (3 Options) ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 p-3 sm:p-3.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 block flex items-center gap-1.5">
          <Briefcase className="w-3.5 h-3.5 text-blue-500" />
          Select Compensation Model
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* Option 1: Full-Time */}
          <button
            type="button"
            onClick={() => handleEmploymentTypeChange('FULL_TIME')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              employmentType === 'FULL_TIME'
                ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/30'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">Full-Time Staff</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">11h Standard</span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Standard full-time salary. Standard 11 hours daily shift.
            </p>
          </button>

          {/* Option 2: Part-Time */}
          <button
            type="button"
            onClick={() => handleEmploymentTypeChange('PART_TIME')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              employmentType === 'PART_TIME'
                ? 'border-purple-600 bg-purple-50/60 dark:bg-purple-950/30 ring-2 ring-purple-500/30'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-purple-900 dark:text-purple-300">Part-Time Staff</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">Custom Hours</span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              For staff working 2h, 4h, 5h, with custom agreed monthly salary.
            </p>
          </button>

          {/* Option 3: Repair Mechanic Percentage Split */}
          <button
            type="button"
            onClick={() => handleEmploymentTypeChange('COMMISSION_PERCENTAGE')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              employmentType === 'COMMISSION_PERCENTAGE'
                ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/30 ring-2 ring-amber-500/30'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Repair Mechanic
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">% Split</span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              Commission split on real profit after parts/expenses.
            </p>
          </button>
        </div>
      </div>

      {/* ── MECHANIC COMMISSION CONFIGURATION (Shown when COMMISSION_PERCENTAGE) ── */}
      {employmentType === 'COMMISSION_PERCENTAGE' && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 overflow-hidden bg-amber-50/20 dark:bg-amber-950/10">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-100/60 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Percent className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
                Repair Mechanic Commission Split Configuration
              </span>
            </div>
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
              Mechanic: {commissionPercentage}% | Shop: {100 - commissionPercentage}%
            </span>
          </div>
          <div className="p-3 sm:p-3.5 space-y-3 bg-white dark:bg-gray-900">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Profit Share Percentage */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>Mechanic Profit Share (%)</span>
                  <span className="text-[11px] text-amber-600 font-semibold">{commissionPercentage}% Real Profit</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={commissionPercentage || ''}
                    onChange={(e) => setCommissionPercentage(Math.min(100, Math.max(1, Number(e.target.value))))}
                    className="w-full pl-3 pr-8 py-1.5 text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 border border-amber-300 dark:border-amber-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-gray-900 dark:text-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">%</span>
                </div>
              </div>

              {/* Optional Guaranteed Base Retainer */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Guaranteed Monthly Base Retainer (PKR)
                  <span className="text-[10px] text-gray-400 font-normal ml-1">(Optional, default ₨ 0)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">₨</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlySalary || ''}
                    onChange={(e) => setMonthlySalary(Number(e.target.value))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-1.5 text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Quick Presets for Mechanic Splits */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400 font-medium">Popular Splits:</span>
              {[
                { pct: 50, label: '50% / 50% (Equal Split)' },
                { pct: 40, label: '40% Mechanic / 60% Shop' },
                { pct: 60, label: '60% Mechanic / 40% Shop' },
                { pct: 70, label: '70% Master Mechanic / 30% Shop' },
              ].map(preset => (
                <button
                  key={preset.pct}
                  type="button"
                  onClick={() => setCommissionPercentage(preset.pct)}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    commissionPercentage === preset.pct
                      ? 'bg-amber-500 text-white border-amber-600 font-bold'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Live Calculation Formula Card */}
            <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-900 dark:text-amber-200">
              <div className="font-bold flex items-center gap-1 mb-0.5">
                <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Automatic Accounting on Delivered Jobs:
              </div>
              <p className="leading-snug">
                Real Profit = Customer Billed - Parts Cost &nbsp;|&nbsp; Mechanic Earns = Real Profit × {commissionPercentage}% &nbsp;|&nbsp; Shop Retains = Real Profit × {100 - commissionPercentage}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STANDARD SALARY & SHIFT CONFIGURATION (Shown when FULL_TIME or PART_TIME) ── */}
      {employmentType !== 'COMMISSION_PERCENTAGE' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
                {employmentType === 'PART_TIME' ? 'Part-Time Agreed Salary & Hours' : 'Full-Time Base Salary & Hours'}
              </span>
            </div>
            {effectiveTotalPay > 0 && (
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Total Pay: <span className="text-green-600 dark:text-green-400">₨ {effectiveTotalPay.toLocaleString('en-PK')}</span>
              </span>
            )}
          </div>
          <div className="p-3 sm:p-3.5 space-y-3 bg-white dark:bg-gray-900">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Monthly Agreed Salary */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Agreed Monthly Salary (PKR)
                  <span className="ml-1 text-[10px] text-gray-400 font-normal">
                    {employmentType === 'PART_TIME' ? '(e.g. 15,000 for 4h, 8,000 for 2h)' : '(e.g. 30,000)'}
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">₨</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlySalary || ''}
                    onChange={(e) => setMonthlySalary(Number(e.target.value))}
                    placeholder={employmentType === 'PART_TIME' ? 'e.g. 15000' : 'e.g. 30000'}
                    className="w-full pl-7 pr-3 py-1.5 text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                      text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Daily Shift Hours */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Working Shift (Hours / Day)
                  <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                    {employmentType === 'PART_TIME' ? 'Custom Hours' : 'Full-Time Standard: 11h'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={standardShiftHours || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setStandardShiftHours(val);
                      if (employmentType === 'PART_TIME') {
                        setOvertimeTriggerHours(val);
                      }
                    }}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                      text-gray-900 dark:text-white"
                  />
                  <span className="text-xs font-semibold text-gray-500 shrink-0">hrs/day</span>
                </div>
              </div>
            </div>

            {/* Quick preset chips for common part-time arrangements */}
            {employmentType === 'PART_TIME' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 font-medium">Quick Presets:</span>
                {[
                  { hours: 2, salary: 8000, label: '2 Hours / ₨ 8,000' },
                  { hours: 4, salary: 15000, label: '4 Hours / ₨ 15,000' },
                  { hours: 5, salary: 25000, label: '5 Hours / ₨ 25,000 (Skill/Exp)' },
                ].map(preset => (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => {
                      setStandardShiftHours(preset.hours);
                      setMonthlySalary(preset.salary);
                      setOvertimeTriggerHours(preset.hours);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* Derived Calculation Rates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block">Absence Deduction / Day</span>
                <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                  {monthlySalary > 0 ? formatCurrency(absenceDeductionPerDay) : '₨ 0'}
                  <span className="text-[10px] text-gray-400 font-normal ml-1">/day (salary ÷ 26)</span>
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block">Calculated Hourly Rate</span>
                <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                  {monthlySalary > 0 ? formatCurrency(hourlyRate) : '₨ 0'}
                  <span className="text-[10px] text-gray-400 font-normal ml-1">/hr ({standardShiftHours}h shift)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-Column Bottom Grid: Individual Bonus & Attendance/Overtime Rules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column: Individual Staff Bonus / Reward */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <Gift className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
              Individual Staff Bonus / Reward
            </span>
          </div>
          <div className="p-3 space-y-2 bg-white dark:bg-gray-900 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  Bonus / Reward (PKR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">₨</span>
                  <input
                    type="number"
                    min={0}
                    value={individualBonus || ''}
                    onChange={(e) => setIndividualBonus(Number(e.target.value))}
                    placeholder="e.g. 2000"
                    className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  Reward Reason / Note
                </label>
                <input
                  type="text"
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  placeholder="e.g. Sales achievement"
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Attendance Grace & Overtime Rules */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <Clock className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
            <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
              Grace &amp; Overtime Rules
            </span>
          </div>
          <div className="p-3 bg-white dark:bg-gray-900 flex-1 flex items-center">
            <div className="grid grid-cols-3 gap-2 w-full">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate block">
                  Late Grace (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={lateThresholdMinutes}
                  onChange={(e) => setLateThresholdMinutes(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate block">
                  OT Trigger (hrs)
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={overtimeTriggerHours}
                  onChange={(e) => setOvertimeTriggerHours(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate block">
                  OT Multiplier
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.25}
                  value={overtimeMultiplier}
                  onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
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
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (employmentType !== 'COMMISSION_PERCENTAGE' && monthlySalary <= 0)}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700
              text-white text-xs sm:text-sm font-semibold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
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
