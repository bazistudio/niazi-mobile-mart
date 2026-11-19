'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Users,
  TrendingDown,
  TrendingUp,
  Wallet,
  Building2,
  Eye,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import type { StaffUser } from '@/features/settings/types/staff.types';
import { DEFAULT_ATTENDANCE_RULES } from '../types/hr.types';
import type { BackendPayrollPeriod, BackendSalaryRecord } from '../types/hr.types';
import {
  usePayrollPeriods,
  usePayrollRecords,
  useCreatePayrollPeriod,
  useGeneratePayroll,
  useApprovePayrollPeriod,
  useHRPolicies,
  useEffectiveHRPolicy,
  useStaffSalaryConfig,
} from '../hooks/useHR';
import { useBranches } from '../hooks/useBranches';
import { getStaffExtraConfig } from '../hooks/useStaffExtraConfig';
import { HRStaffSelector } from './HRStaffSelector';
import { SalaryCalculationBreakdown } from './SalaryCalculationBreakdown';
import { SalarySettlementModal } from './SalarySettlementModal';
import {
  HRSectionCard,
  HRStatCard,
  HRStatusBadge,
  HRConfirmDialog,
  HREmptyState,
  HRBanner,
} from './ui/HRPrimitives';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatPKR(val: number): string {
  return `₨ ${Math.round(val).toLocaleString('en-PK')}`;
}

export const HRPayrollWorkspace: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isOrgAdmin = user?.role === 'ADMIN';
  const { branches } = useBranches();

  const now = new Date();
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [newMonth, setNewMonth] = useState<number>(now.getMonth() + 1);
  const [newYear, setNewYear] = useState<number>(now.getFullYear());
  const [newStartDate, setNewStartDate] = useState<string>(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });
  const [newEndDate, setNewEndDate] = useState<string>(() => {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [periodFeedback, setPeriodFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // Confirmation modal states
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  // Payroll Queries & Mutations
  const {
    data: periods = [],
    isLoading: isPeriodsLoading,
    isError: isPeriodsError,
  } = usePayrollPeriods();

  useEffect(() => {
    if (!selectedPeriodId && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  const activePeriod: BackendPayrollPeriod | undefined = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId),
    [periods, selectedPeriodId]
  );

  const effectiveBranch = isOrgAdmin ? branchFilter || null : user?.shopId ?? null;

  const {
    data: payrollRecords = [],
    isLoading: isRecordsLoading,
    refetch: refetchRecords,
  } = usePayrollRecords(selectedPeriodId || undefined, effectiveBranch);

  const createPeriodMut = useCreatePayrollPeriod();
  const generatePayrollMut = useGeneratePayroll();
  const approvePayrollMut = useApprovePayrollPeriod();

  const [settleRecord, setSettleRecord] = useState<BackendSalaryRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<BackendSalaryRecord | null>(null);

  // Policy rules from backend (safe branch guard)
  const { data: allPolicies = [] } = useHRPolicies();
  const { data: branchEffectivePolicy } = useEffectiveHRPolicy(effectiveBranch || undefined);

  const policyRules = useMemo(() => {
    const resolved =
      branchEffectivePolicy?.policy ??
      allPolicies.find((p) => p.branch_id === null && p.effective_to === null) ??
      allPolicies[0];
    return {
      standardShiftHours: resolved
        ? Math.round((Number(resolved.standard_shift_minutes) / 60) * 10) / 10
        : DEFAULT_ATTENDANCE_RULES.standardShiftHours,
      workingDaysPerMonth: resolved
        ? Number(resolved.monthly_working_days)
        : DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth,
      overtimeMultiplier: resolved
        ? Number(resolved.overtime_multiplier)
        : DEFAULT_ATTENDANCE_RULES.overtimeMultiplier,
      latesForAbsence: resolved ? Number(resolved.lates_for_absence) : 3,
    };
  }, [branchEffectivePolicy, allPolicies]);

  // Aggregate metrics for active payroll period
  const payrollTotals = useMemo(() => {
    let baseTotal = 0;
    let deductionsTotal = 0;
    let extrasTotal = 0;
    let netTotal = 0;
    let paidTotal = 0;
    let remainingTotal = 0;

    for (const r of payrollRecords) {
      baseTotal += Number(r.base_salary ?? 0);
      deductionsTotal += Number(r.absence_deduction ?? 0) + Number(r.advance_deduction ?? 0);
      extrasTotal +=
        Number(r.overtime_amount ?? 0) +
        Number(r.bonus_amount ?? 0) +
        Number(r.manual_adjustment ?? 0);
      const net = Number(r.net_payable ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      netTotal += net;
      paidTotal += paid;
      remainingTotal += Number(r.remaining_amount ?? Math.max(0, net - paid));
    }

    return {
      count: payrollRecords.length,
      baseTotal,
      deductionsTotal,
      extrasTotal,
      netTotal,
      paidTotal,
      remainingTotal,
    };
  }, [payrollRecords]);

  // Payroll Pipeline Step Status
  const pipelineStep = useMemo(() => {
    if (!activePeriod) return 'NONE';
    if (activePeriod.status === 'PAID' || activePeriod.status === 'CLOSED') return 'PAID';
    if (
      payrollRecords.length > 0 &&
      payrollRecords.every((r) => r.status === 'PAID')
    ) {
      return 'PAID';
    }
    if (activePeriod.status === 'APPROVED') return 'APPROVED';
    if (payrollRecords.length > 0) return 'CALCULATED';
    return 'DRAFT';
  }, [activePeriod, payrollRecords]);

  // Interactive Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>();
  const { data: selectedStaffSalaryConfig } = useStaffSalaryConfig(selectedStaff?._id);
  const [monthlySalary, setMonthlySalary] = useState(30000);
  const [customShiftHours, setCustomShiftHours] = useState(11);
  const [presentDays, setPresentDays] = useState(24);
  const [absentDays, setAbsentDays] = useState(2);
  const [lateDays, setLateDays] = useState(1);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [advanceDeduction, setAdvanceDeduction] = useState(0);

  useEffect(() => {
    if (selectedStaff) {
      const extraCfg = getStaffExtraConfig(selectedStaff._id);
      setCustomShiftHours(extraCfg.standardShiftHours || policyRules.standardShiftHours);
      setBonusAmount(extraCfg.individualBonus > 0 ? extraCfg.individualBonus : 0);
    }
  }, [selectedStaff, policyRules.standardShiftHours]);

  useEffect(() => {
    if (
      selectedStaffSalaryConfig?.monthly_salary !== null &&
      selectedStaffSalaryConfig?.monthly_salary !== undefined
    ) {
      const configured = Number(selectedStaffSalaryConfig.monthly_salary);
      if (configured > 0) setMonthlySalary(configured);
    }
  }, [selectedStaffSalaryConfig]);

  const handleMonthYearChange = (m: number, y: number) => {
    setNewMonth(m);
    setNewYear(y);
    const mm = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    setNewStartDate(`${y}-${mm}-01`);
    setNewEndDate(`${y}-${mm}-${String(lastDay).padStart(2, '0')}`);
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setPeriodFeedback(null);
    try {
      const created = await createPeriodMut.mutateAsync({
        period_month: newMonth,
        period_year: newYear,
        start_date: newStartDate,
        end_date: newEndDate,
        late_reset_policy: 'MONTHLY',
      });
      setSelectedPeriodId(created.id);
      setShowCreatePeriod(false);
      setPeriodFeedback({
        type: 'success',
        msg: `Payroll period ${MONTH_LABELS[newMonth - 1]} ${newYear} created.`,
      });
    } catch (err: any) {
      setPeriodFeedback({
        type: 'error',
        msg: err?.response?.data?.error || err?.message || 'Failed to create payroll period.',
      });
    }
  };

  const handleConfirmGeneratePayroll = async () => {
    if (!selectedPeriodId) return;
    setPeriodFeedback(null);
    try {
      const res = await generatePayrollMut.mutateAsync(selectedPeriodId);
      setConfirmGenerateOpen(false);
      setPeriodFeedback({
        type: 'success',
        msg: `Generated ${res.records?.length ?? 0} salary record(s) using active backend HR policies.`,
      });
      void refetchRecords();
    } catch (err: any) {
      setConfirmGenerateOpen(false);
      setPeriodFeedback({
        type: 'error',
        msg: err?.response?.data?.error || err?.message || 'Failed to generate payroll records.',
      });
    }
  };

  const handleConfirmApprovePayroll = async () => {
    if (!selectedPeriodId) return;
    setPeriodFeedback(null);
    try {
      await approvePayrollMut.mutateAsync(selectedPeriodId);
      setConfirmApproveOpen(false);
      setPeriodFeedback({
        type: 'success',
        msg: 'Payroll period approved and ready for salary settlement.',
      });
      void refetchRecords();
    } catch (err: any) {
      setConfirmApproveOpen(false);
      setPeriodFeedback({
        type: 'error',
        msg: err?.response?.data?.error || err?.message || 'Failed to approve payroll period.',
      });
    }
  };

  const previewInput = selectedStaff
    ? {
        staffId: selectedStaff._id,
        staffName: selectedStaff.name,
        month: activePeriod?.period_month ?? now.getMonth() + 1,
        year: activePeriod?.period_year ?? now.getFullYear(),
        monthlySalary,
        standardShiftHours: customShiftHours || policyRules.standardShiftHours,
        workingDays: policyRules.workingDaysPerMonth,
        latesForAbsence: policyRules.latesForAbsence,
        presentDays,
        absentDays,
        lateDays,
        overtimeHours,
        overtimeMultiplier: policyRules.overtimeMultiplier,
        bonusAmount,
        advanceDeduction,
      }
    : null;

  return (
    <div className="space-y-5">
      {periodFeedback && (
        <HRBanner
          type={periodFeedback.type}
          message={periodFeedback.msg}
          onDismiss={() => setPeriodFeedback(null)}
        />
      )}

      {/* Payroll Lifecycle Pipeline */}
      {activePeriod && (
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">
              Workflow Stage:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: 'DRAFT', label: '1. Draft Period' },
                { key: 'CALCULATED', label: '2. Calculated' },
                { key: 'APPROVED', label: '3. Approved' },
                { key: 'PAID', label: '4. Settled / Paid' },
              ].map((step) => {
                const isActive = pipelineStep === step.key;
                return (
                  <span
                    key={step.key}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      isActive
                        ? 'bg-[#006970] text-white border-[#006970]'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>

          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Active Policy: {policyRules.workingDaysPerMonth} working days · {policyRules.latesForAbsence} lates = 1 absent · {policyRules.overtimeMultiplier}× OT
          </span>
        </div>
      )}

      {/* 5 Overview KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <HRStatCard
          label="Staff in Payroll"
          value={payrollTotals.count}
          subtext={activePeriod ? `${activePeriod.period_start} → ${activePeriod.period_end}` : 'No period selected'}
          icon={<Users className="w-4 h-4" />}
          tone="teal"
          loading={isRecordsLoading}
        />
        <HRStatCard
          label="Gross Base Salary"
          value={formatPKR(payrollTotals.baseTotal)}
          subtext="Configured salary rates"
          icon={<DollarSign className="w-4 h-4" />}
          tone="neutral"
          loading={isRecordsLoading}
        />
        <HRStatCard
          label="Total Deductions"
          value={formatPKR(payrollTotals.deductionsTotal)}
          subtext="Absences, lates & advances"
          icon={<TrendingDown className="w-4 h-4" />}
          tone="rose"
          loading={isRecordsLoading}
        />
        <HRStatCard
          label="Overtime & Bonuses"
          value={formatPKR(payrollTotals.extrasTotal)}
          subtext="Overtime pay & adjustments"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="emerald"
          loading={isRecordsLoading}
        />
        <HRStatCard
          label="Net Payable"
          value={formatPKR(payrollTotals.netTotal)}
          subtext={`Paid: ${formatPKR(payrollTotals.paidTotal)} · Due: ${formatPKR(payrollTotals.remainingTotal)}`}
          icon={<Wallet className="w-4 h-4" />}
          tone="sky"
          loading={isRecordsLoading}
        />
      </div>

      {/* Main Payroll Register Card */}
      <HRSectionCard
        title="Payroll Period & Salary Register"
        subtitle="Generate organization-wide salary registers from PostgreSQL attendance and settle staff payments"
        icon={<DollarSign className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select payroll period"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              disabled={isPeriodsLoading || periods.length === 0}
              className="h-9 px-3 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            >
              {periods.length === 0 ? (
                <option value="">No payroll periods created</option>
              ) : (
                periods.map((p) => {
                  const m = p.period_month ?? 1;
                  const y = p.period_year ?? now.getFullYear();
                  return (
                    <option key={p.id} value={p.id}>
                      {MONTH_LABELS[m - 1] ?? `Month ${m}`} {y} ({p.status})
                    </option>
                  );
                })
              )}
            </select>

            {isOrgAdmin && branches.length > 0 && (
              <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select
                  aria-label="Filter payroll records by branch"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="text-xs font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isOrgAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCreatePeriod((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showCreatePeriod ? 'Cancel Period' : 'New Period'}
                </button>

                {activePeriod && activePeriod.status === 'DRAFT' && (
                  <>
                    <button
                      type="button"
                      disabled={generatePayrollMut.isPending}
                      onClick={() => setConfirmGenerateOpen(true)}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${generatePayrollMut.isPending ? 'animate-spin' : ''}`}
                      />
                      Generate Payroll
                    </button>

                    {payrollRecords.length > 0 && (
                      <button
                        type="button"
                        disabled={approvePayrollMut.isPending}
                        onClick={() => setConfirmApproveOpen(true)}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Period
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        }
        noPadding
      >
        {/* Create Payroll Period Inline Drawer */}
        {showCreatePeriod && isOrgAdmin && (
          <form
            onSubmit={handleCreatePeriod}
            className="p-5 border-b border-slate-100 dark:border-slate-800 bg-teal-50/40 dark:bg-teal-950/20 space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-[#006970] dark:text-[#33c9cf]">
              Create Monthly Payroll Period
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Month</label>
                <select
                  value={newMonth}
                  onChange={(e) => handleMonthYearChange(Number(e.target.value), newYear)}
                  className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {MONTH_LABELS.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Year</label>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={newYear}
                  onChange={(e) => handleMonthYearChange(newMonth, Number(e.target.value))}
                  className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePeriod(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPeriodMut.isPending}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#006970] hover:bg-[#005a60] text-white disabled:opacity-50 cursor-pointer"
              >
                {createPeriodMut.isPending ? 'Creating…' : 'Create Period'}
              </button>
            </div>
          </form>
        )}

        {isPeriodsError ? (
          <div className="p-5">
            <HRBanner
              type="error"
              message="Could not load payroll periods from /api/v1/hr/payroll-periods."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-3 py-3 text-right">Base Salary</th>
                  <th className="px-3 py-3 text-center">Absent / Late / Ded</th>
                  <th className="px-3 py-3 text-right">Deductions</th>
                  <th className="px-3 py-3 text-right">OT &amp; Bonus</th>
                  <th className="px-3 py-3 text-right">Net Payable</th>
                  <th className="px-3 py-3 text-right">Paid / Due</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isRecordsLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      Loading payroll salary records…
                    </td>
                  </tr>
                ) : payrollRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6">
                      <HREmptyState
                        icon={<DollarSign className="w-5 h-5" />}
                        title={
                          selectedPeriodId
                            ? 'No salary records generated for this period yet'
                            : 'Select or create a payroll period above'
                        }
                        description={
                          selectedPeriodId
                            ? 'Click "Generate Payroll" above to calculate employee salaries using active HR policies and attendance logs.'
                            : 'Organization Administrators can create monthly payroll cycles and track settlement payments.'
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  payrollRecords.map((rec) => {
                    const base = Number(rec.base_salary ?? rec.gross_payable ?? 0);
                    const totalDed =
                      Number(rec.absence_deduction ?? 0) + Number(rec.advance_deduction ?? 0);
                    const extras =
                      Number(rec.overtime_amount ?? 0) +
                      Number(rec.bonus_amount ?? 0) +
                      Number(rec.manual_adjustment ?? 0);
                    const net = Number(rec.net_payable ?? 0);
                    const paid = Number(rec.paid_amount ?? 0);
                    const due = Number(rec.remaining_amount ?? Math.max(0, net - paid));

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35">
                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {rec.full_name || rec.username || rec.user_id}
                          <span className="block text-[11px] text-slate-400 font-normal">
                            {rec.salary_type}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {formatPKR(base)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums">
                          <span className="text-rose-600 font-semibold">{rec.absent_days ?? 0}A</span>
                          {' / '}
                          <span className="text-amber-600 font-semibold">{rec.late_count ?? 0}L</span>
                          {' / '}
                          <span className="text-slate-500">{rec.total_deduction_days ?? 0}d</span>
                        </td>
                        <td className="px-3 py-3.5 text-right text-rose-600 dark:text-rose-400 tabular-nums font-medium">
                          -{formatPKR(totalDed)}
                        </td>
                        <td className="px-3 py-3.5 text-right text-emerald-600 dark:text-emerald-400 tabular-nums font-medium">
                          +{formatPKR(extras)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                          {formatPKR(net)}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums text-[11px]">
                          <div className="text-emerald-600 font-semibold">Paid: {formatPKR(paid)}</div>
                          <div className="text-amber-600">Due: {formatPKR(due)}</div>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <HRStatusBadge status={rec.status} showIcon={false} />
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailRecord(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Details
                            </button>
                            {isOrgAdmin && activePeriod?.status === 'APPROVED' && rec.status !== 'PAID' && (
                              <button
                                type="button"
                                onClick={() => setSettleRecord(rec)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#006970] hover:bg-[#005a60] text-white cursor-pointer"
                              >
                                <DollarSign className="w-3 h-3" />
                                Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </HRSectionCard>

      {/* Collapsible What-If Salary Calculator */}
      <HRSectionCard>
        <button
          type="button"
          onClick={() => setShowCalculator((v) => !v)}
          className="flex items-center justify-between w-full text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[#006970] dark:text-[#33c9cf]">
            {showCalculator ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span>
              Interactive What-If Salary Calculation Preview (Uses Active Backend HR Policy)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Preview only · Does not save or disburse</span>
        </button>

        {showCalculator && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-4">
              <HRStaffSelector
                value={selectedStaff?._id}
                onChange={(_id, s) => setSelectedStaff(s)}
                label="Select Staff Member"
                placeholder="Choose a staff member…"
              />

              {selectedStaff && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Monthly Salary (PKR)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={monthlySalary || ''}
                        onChange={(e) => setMonthlySalary(Number(e.target.value))}
                        className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Shift Hours / Day (Policy: {policyRules.standardShiftHours}h)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={customShiftHours || ''}
                        onChange={(e) => setCustomShiftHours(Number(e.target.value))}
                        className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'Present Days', value: presentDays, setter: setPresentDays, max: 31 },
                      { label: 'Absent Days', value: absentDays, setter: setAbsentDays, max: 31 },
                      { label: 'Late Days', value: lateDays, setter: setLateDays, max: 31 },
                      { label: 'Overtime Hours', value: overtimeHours, setter: setOvertimeHours, max: 200 },
                      { label: 'Bonus (PKR)', value: bonusAmount, setter: setBonusAmount, max: 999999 },
                      { label: 'Advance Deduct (PKR)', value: advanceDeduction, setter: setAdvanceDeduction, max: 999999 },
                    ].map(({ label, value, setter, max }) => (
                      <div key={label} className="space-y-1">
                        <label className="text-slate-500 font-medium">{label}</label>
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={value || ''}
                          onChange={(e) => setter(Number(e.target.value))}
                          className="w-full h-8 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div>
              {previewInput ? (
                <SalaryCalculationBreakdown input={previewInput} />
              ) : (
                <HREmptyState
                  icon={<DollarSign className="w-5 h-5" />}
                  title="Select an employee to preview calculation"
                  description="Calculations reflect your active PostgreSQL working-day divisor, overtime multiplier, and late conversion rules."
                />
              )}
            </div>
          </div>
        )}
      </HRSectionCard>

      {/* Employee Payroll Detail Breakdown Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[1px] p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Employee Payroll Breakdown"
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#006970] text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  Payroll Breakdown — {detailRecord.full_name || detailRecord.username}
                </h3>
                <p className="text-xs text-teal-100">
                  {activePeriod ? activePeriod.label : ''} · Salary Type: {detailRecord.salary_type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="p-1.5 rounded-lg text-teal-100 hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <dl className="grid grid-cols-2 gap-y-2.5 gap-x-4 tabular-nums">
                <dt className="text-slate-500">Base Salary</dt>
                <dd className="text-right font-semibold text-slate-900 dark:text-white">
                  {formatPKR(Number(detailRecord.base_salary ?? 0))}
                </dd>
                <dt className="text-slate-500">Absent Days / Late Marks</dt>
                <dd className="text-right font-semibold text-slate-900 dark:text-white">
                  {detailRecord.absent_days} absent · {detailRecord.late_count} late ({detailRecord.late_absence_equivalents} equiv.)
                </dd>
                <dt className="text-slate-500">Total Deduction Days</dt>
                <dd className="text-right font-semibold text-slate-900 dark:text-white">
                  {detailRecord.total_deduction_days} day(s)
                </dd>
                <dt className="text-slate-500">Absence Deduction</dt>
                <dd className="text-right font-semibold text-rose-600">
                  -{formatPKR(Number(detailRecord.absence_deduction ?? 0))}
                </dd>
                <dt className="text-slate-500">Advance Recovery Deduction</dt>
                <dd className="text-right font-semibold text-rose-600">
                  -{formatPKR(Number(detailRecord.advance_deduction ?? 0))}
                </dd>
                <dt className="text-slate-500">Overtime ({detailRecord.overtime_minutes} mins)</dt>
                <dd className="text-right font-semibold text-emerald-600">
                  +{formatPKR(Number(detailRecord.overtime_amount ?? 0))}
                </dd>
                <dt className="text-slate-500">Bonuses &amp; Manual Adjustments</dt>
                <dd className="text-right font-semibold text-emerald-600">
                  +{formatPKR(Number(detailRecord.bonus_amount ?? 0) + Number(detailRecord.manual_adjustment ?? 0))}
                </dd>
                <dt className="text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-100">
                  Net Payable
                </dt>
                <dd className="text-right pt-2 border-t border-slate-100 dark:border-slate-800 font-bold text-sm text-[#006970] dark:text-[#33c9cf]">
                  {formatPKR(Number(detailRecord.net_payable ?? 0))}
                </dd>
                <dt className="text-slate-500">Paid / Remaining Balance</dt>
                <dd className="text-right font-semibold text-slate-900 dark:text-white">
                  {formatPKR(Number(detailRecord.paid_amount ?? 0))} paid ·{' '}
                  {formatPKR(Number(detailRecord.remaining_amount ?? 0))} due
                </dd>
              </dl>
              {detailRecord.adjustment_note && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Note: {detailRecord.adjustment_note}
                </div>
              )}
            </div>
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
              {isOrgAdmin && activePeriod?.status === 'APPROVED' && detailRecord.status !== 'PAID' && (
                <button
                  type="button"
                  onClick={() => {
                    const rec = detailRecord;
                    setDetailRecord(null);
                    setSettleRecord(rec);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold cursor-pointer"
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Generate Payroll Dialog */}
      <HRConfirmDialog
        open={confirmGenerateOpen}
        title="Confirm Payroll Calculation & Generation"
        description="This will calculate attendance deductions, overtime pay, and advance recovery across all active salaried staff for the selected period."
        details={[
          {
            label: 'Period',
            value: activePeriod ? `${activePeriod.period_start} → ${activePeriod.period_end}` : '—',
          },
          { label: 'Working Days Divisor', value: `1 / ${policyRules.workingDaysPerMonth} per day` },
          { label: 'Late Conversion Rule', value: `${policyRules.latesForAbsence} lates = 1 absent` },
          { label: 'Overtime Multiplier', value: `${policyRules.overtimeMultiplier}× base hourly` },
        ]}
        confirmLabel="Generate Salary Records"
        isPending={generatePayrollMut.isPending}
        onConfirm={handleConfirmGeneratePayroll}
        onCancel={() => setConfirmGenerateOpen(false)}
      />

      {/* Confirm Approve Period Dialog */}
      <HRConfirmDialog
        open={confirmApproveOpen}
        title="Confirm Payroll Period Approval"
        description="Approving locks calculated salary records for official settlement payments."
        details={[
          { label: 'Staff Included', value: `${payrollTotals.count} employee(s)` },
          { label: 'Total Net Payable', value: formatPKR(payrollTotals.netTotal) },
          { label: 'Total Deductions Applied', value: formatPKR(payrollTotals.deductionsTotal) },
        ]}
        confirmLabel="Approve Payroll Period"
        variant="primary"
        isPending={approvePayrollMut.isPending}
        onConfirm={handleConfirmApprovePayroll}
        onCancel={() => setConfirmApproveOpen(false)}
      />

      {/* Real Salary Settlement Modal */}
      {settleRecord && (
        <SalarySettlementModal
          isOpen={Boolean(settleRecord)}
          onClose={() => setSettleRecord(null)}
          staffName={settleRecord.full_name || settleRecord.username || settleRecord.user_id}
          staffId={settleRecord.user_id}
          month={activePeriod?.period_month ?? now.getMonth() + 1}
          year={activePeriod?.period_year ?? now.getFullYear()}
          netSalary={Number(
            settleRecord.remaining_amount ??
              Math.max(0, Number(settleRecord.net_payable ?? 0) - Number(settleRecord.paid_amount ?? 0))
          )}
          salaryRecordId={settleRecord.id}
          onPaymentRecorded={() => {
            void refetchRecords();
            void queryClient.invalidateQueries({ queryKey: queryKeys.hr.payrollPeriods });
          }}
        />
      )}
    </div>
  );
};
