'use client';

import React, { useState } from 'react';
import {
  Settings,
  Building2,
  Calendar,
  Save,
  Clock,
  History,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useBranches } from '../hooks/useBranches';
import { getKarachiTodayCanonical } from './DailyAttendanceAndLeavePage';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import {
  useHRPolicies,
  useEffectiveHRPolicy,
  useCreateHRPolicy,
  useRetireHRPolicy,
  useHRPolicyAuditLogs,
  useShiftTemplates,
  useCreateShiftTemplate,
} from '../hooks/useHR';
import type { CreatePolicyPayload } from '../types/hr.types';
import { SharedChart } from '@/components/charts';
import {
  HRSectionCard,
  HRChartCard,
  HRConfirmDialog,
  HRBanner,
  HRStatusBadge,
} from './ui/HRPrimitives';

export const PolicySettingsManager: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { branches } = useBranches();
  const isOrgAdmin = user?.role === 'ADMIN';

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string>(() => getKarachiTodayCanonical());

  const { data: allPolicies = [], isLoading: isLoadingPolicies, refetch: refetchPolicies } =
    useHRPolicies();
  const {
    data: effectiveData,
    isLoading: isLoadingEffective,
    error: effectiveError,
  } = useEffectiveHRPolicy(selectedBranchId || undefined, targetDate);
  const { data: auditLogs = [], isLoading: isLoadingAudit } = useHRPolicyAuditLogs(
    undefined,
    selectedBranchId ?? undefined
  );

  const createPolicyMutation = useCreateHRPolicy();
  const retirePolicyMutation = useRetireHRPolicy();

  // Shift Templates Queries & Mutations
  const {
    data: shiftTemplates = [],
    isLoading: isLoadingTemplates,
    isError: isErrorTemplates,
  } = useShiftTemplates();
  const createTemplateMutation = useCreateShiftTemplate();
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplStart, setTplStart] = useState('09:30');
  const [tplEnd, setTplEnd] = useState('20:30');
  const [tplDuration, setTplDuration] = useState(660);
  const [tplBreak, setTplBreak] = useState(0);
  const [tplLateThreshold, setTplLateThreshold] = useState(20);

  const [banner, setBanner] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);

  const showBanner = (text: string, type: 'success' | 'error' = 'success') => {
    setBanner({ text, type });
  };

  const handleSaveShiftTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOrgAdmin) {
      showBanner('Access denied: Only Organization Admins can create shift templates.', 'error');
      return;
    }
    if (!tplName.trim() || !tplStart || !tplEnd) {
      showBanner('Template name, start time, and end time are required.', 'error');
      return;
    }
    try {
      await createTemplateMutation.mutateAsync({
        name: tplName.trim(),
        shift_start_time: tplStart,
        shift_end_time: tplEnd,
        shift_duration_minutes: Number(tplDuration) || 660,
        break_duration_minutes: Number(tplBreak) || 0,
        late_threshold_minutes: Number(tplLateThreshold) || 20,
        working_days_json: '[1,2,3,4,5,6]',
      });
      showBanner('Shift template created in PostgreSQL.');
      setIsCreatingTemplate(false);
      setTplName('');
    } catch (err: any) {
      showBanner(
        err?.response?.data?.error || err?.message || 'Failed to create shift template.',
        'error'
      );
    }
  };

  // Policy Create / Override Form State
  const [isCreatingOverride, setIsCreatingOverride] = useState(false);
  const [isCreatingNewDefault, setIsCreatingNewDefault] = useState(false);
  const [formShiftMinutes, setFormShiftMinutes] = useState(660);
  const [formLateThreshold, setFormLateThreshold] = useState(20);
  const [formLatesForAbsence, setFormLatesForAbsence] = useState(3);
  const [formWorkingDays, setFormWorkingDays] = useState(26);
  const [formOTMultiplier, setFormOTMultiplier] = useState(1.5);
  const [formOTEligibleMonthly, setFormOTEligibleMonthly] = useState(true);
  const [formHalfDayFactor, setFormHalfDayFactor] = useState(0.5);
  const [formEffectiveFrom, setFormEffectiveFrom] = useState(() => getKarachiTodayCanonical());

  const currentPolicy = effectiveData?.policy;
  const isOverride = effectiveData?.is_override;
  const orgDefaultPolicy = allPolicies.find((p) => p.branch_id === null && p.effective_to === null);
  const displayedPolicy = selectedBranchId ? currentPolicy : orgDefaultPolicy;

  const handleOpenCreateForm = (asOverride: boolean) => {
    setIsCreatingOverride(asOverride);
    setIsCreatingNewDefault(!asOverride);
    const source = displayedPolicy ?? {
      standard_shift_minutes: 660,
      late_threshold_minutes: 20,
      lates_for_absence: 3,
      monthly_working_days: 26,
      overtime_multiplier: 1.5,
      overtime_eligible_monthly: true,
      half_day_deduction_factor: 0.5,
    };
    setFormShiftMinutes(Number(source.standard_shift_minutes));
    setFormLateThreshold(Number(source.late_threshold_minutes));
    setFormLatesForAbsence(Number(source.lates_for_absence));
    setFormWorkingDays(Number(source.monthly_working_days));
    setFormOTMultiplier(Number(source.overtime_multiplier));
    setFormOTEligibleMonthly(Boolean(source.overtime_eligible_monthly));
    setFormHalfDayFactor(Number(source.half_day_deduction_factor ?? 0.5));
    setFormEffectiveFrom(getKarachiTodayCanonical());
  };

  const handleSaveNewPolicy = async () => {
    if (!isOrgAdmin) {
      showBanner('Access denied: Only Organization Admins can configure policies.', 'error');
      return;
    }

    const payload: CreatePolicyPayload = {
      branch_id: isCreatingOverride ? selectedBranchId : null,
      standard_shift_minutes: Number(formShiftMinutes),
      late_threshold_minutes: Number(formLateThreshold),
      lates_for_absence: Number(formLatesForAbsence),
      monthly_working_days: Number(formWorkingDays),
      overtime_multiplier: Number(formOTMultiplier),
      overtime_eligible_monthly: Boolean(formOTEligibleMonthly),
      half_day_deduction_factor: Number(formHalfDayFactor),
      effective_from: formEffectiveFrom,
    };

    try {
      await createPolicyMutation.mutateAsync(payload);
      showBanner('HR policy version saved and activated in PostgreSQL.');
      setIsCreatingOverride(false);
      setIsCreatingNewDefault(false);
    } catch (err: any) {
      showBanner(err?.response?.data?.error || err?.message || 'Failed to save policy.', 'error');
    }
  };

  const handleConfirmRetire = async (retireDate?: string) => {
    if (!isOrgAdmin || !currentPolicy || !retireDate) return;
    try {
      await retirePolicyMutation.mutateAsync({
        policyId: currentPolicy.id,
        payload: { effective_to: retireDate },
      });
      setRetireDialogOpen(false);
      showBanner(`Policy period closed through ${retireDate}.`);
    } catch (err: any) {
      setRetireDialogOpen(false);
      showBanner(err?.response?.data?.error || err?.message || 'Failed to retire policy.', 'error');
    }
  };

  // Numeric chart data (bugfix: shiftHours must be numeric!)
  const policyComparisonChartData = allPolicies.map((p) => ({
    name: p.branch_name ? `${p.branch_name}` : 'Org Default',
    shiftHours: Number((p.standard_shift_minutes / 60).toFixed(1)),
    lateGrace: Number(p.late_threshold_minutes),
  }));

  return (
    <div className="space-y-5">
      {banner && (
        <HRBanner
          type={banner.type}
          message={banner.text}
          onDismiss={() => setBanner(null)}
        />
      )}

      {/* Header & Scope Selector */}
      <HRSectionCard
        title="HR Policies & Working Rules"
        subtitle="Configure organization-wide baseline rules or date-effective branch overrides persisted in PostgreSQL"
        icon={<Settings className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        badge={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf]">
            <Shield className="w-3 h-3" /> Org-Wide Payroll Scope
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => void refetchPolicies()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Scope:</span>
              <select
                value={selectedBranchId ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setSelectedBranchId(val || null);
                  setIsCreatingOverride(false);
                  setIsCreatingNewDefault(false);
                }}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value="">Organization Default Policy</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Branch: {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">As Of:</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {isOrgAdmin && !isCreatingOverride && !isCreatingNewDefault && (
            <div className="flex items-center gap-2">
              {selectedBranchId ? (
                <button
                  type="button"
                  onClick={() => handleOpenCreateForm(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Configure Branch Override
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenCreateForm(false)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Default Policy Version
                </button>
              )}
            </div>
          )}
        </div>
      </HRSectionCard>

      {/* Active Policy Details Card */}
      <HRSectionCard
        title={
          selectedBranchId
            ? 'Resolved Branch Policy'
            : 'Organization Default Policy (Active Baseline)'
        }
        badge={
          selectedBranchId ? (
            isOverride ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Custom Branch Override Active
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Inherited from Organization Default
              </span>
            )
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {orgDefaultPolicy
                ? `Active Baseline: ${(Number(orgDefaultPolicy.standard_shift_minutes) / 60).toFixed(1)}h shift · ${orgDefaultPolicy.late_threshold_minutes}m grace · ${orgDefaultPolicy.lates_for_absence} lates = 1 absent · 1/${orgDefaultPolicy.monthly_working_days} deduction`
                : 'Baseline Reference: 11h shift · 20m grace · 3 lates = 1 absent · 1/26 deduction'}
            </span>
          )
        }
        actions={
          selectedBranchId && currentPolicy && isOrgAdmin ? (
            <button
              type="button"
              onClick={() => setRetireDialogOpen(true)}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Retire / Close Period
            </button>
          ) : undefined
        }
      >
        {(selectedBranchId ? isLoadingEffective : isLoadingPolicies) ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Resolving authoritative policy from PostgreSQL…
          </div>
        ) : selectedBranchId && effectiveError ? (
          <HRBanner
            type="error"
            message={
              (effectiveError as any)?.response?.data?.error ||
              (effectiveError as any)?.message ||
              'Failed to resolve policy.'
            }
          />
        ) : displayedPolicy ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Standard Shift
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {(displayedPolicy.standard_shift_minutes / 60).toFixed(1)} hrs/day
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                {displayedPolicy.standard_shift_minutes} mins · OT starts after shift
              </span>
            </div>

            <div className="flex flex-col md:pl-4 pt-3 md:pt-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Late Arrival Threshold
              </span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {displayedPolicy.late_threshold_minutes} minutes
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                {displayedPolicy.lates_for_absence} lates = 1 absence-equivalent
              </span>
            </div>

            <div className="flex flex-col md:pl-4 pt-3 md:pt-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Absence &amp; Half-Day Divisor
              </span>
              <span className="text-lg font-bold text-violet-600 dark:text-violet-400 mt-1 tabular-nums">
                1/{displayedPolicy.monthly_working_days} per absent day
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Half-day factor: {displayedPolicy.half_day_deduction_factor ?? 0.5}× daily pay
              </span>
            </div>

            <div className="flex flex-col md:pl-4 pt-3 md:pt-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Overtime Rules
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {displayedPolicy.overtime_multiplier}× rate
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Monthly OT: {displayedPolicy.overtime_eligible_monthly ? 'Eligible' : 'Disabled'} · Since {displayedPolicy.effective_from}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-600 py-4 text-center">
            No open-ended active policy found. Use &ldquo;New Default Policy Version&rdquo; above to initialize one.
          </p>
        )}
      </HRSectionCard>

      {/* Create / Override Policy Form */}
      {(isCreatingOverride || isCreatingNewDefault) && isOrgAdmin && (
        <HRSectionCard
          title={
            isCreatingOverride
              ? `New Branch Override — ${branches.find((b) => b.id === selectedBranchId)?.name ?? 'Branch'}`
              : 'New Organization Default Policy Version'
          }
          subtitle="Saved versioned rows take effect immediately for attendance snapshots and future payroll runs"
          actions={
            <button
              type="button"
              onClick={() => {
                setIsCreatingOverride(false);
                setIsCreatingNewDefault(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Standard Shift (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={formShiftMinutes}
                onChange={(e) => setFormShiftMinutes(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <span className="text-[10px] text-slate-400">
                {(formShiftMinutes / 60).toFixed(1)} hours/day (default: 660)
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Late Grace Threshold (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={formLateThreshold}
                onChange={(e) => setFormLateThreshold(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Lates Equal 1 Absence
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={formLatesForAbsence}
                onChange={(e) => setFormLatesForAbsence(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Monthly Working Days (Divisor)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={formWorkingDays}
                onChange={(e) => setFormWorkingDays(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <span className="text-[10px] text-slate-400">
                Deduction: 1/{formWorkingDays} monthly salary
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Overtime Multiplier
              </label>
              <input
                type="number"
                min={1.0}
                max={5.0}
                step={0.1}
                value={formOTMultiplier}
                onChange={(e) => setFormOTMultiplier(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Half-Day Deduction Factor
              </label>
              <input
                type="number"
                min={0.1}
                max={1.0}
                step={0.1}
                value={formHalfDayFactor}
                onChange={(e) => setFormHalfDayFactor(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <span className="text-[10px] text-slate-400">Standard baseline: 0.5 day</span>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Effective From Date
              </label>
              <input
                type="date"
                value={formEffectiveFrom}
                onChange={(e) => setFormEffectiveFrom(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="flex flex-col justify-center pt-3">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formOTEligibleMonthly}
                  onChange={(e) => setFormOTEligibleMonthly(e.target.checked)}
                />
                <span>Monthly Salaried Overtime Eligible</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsCreatingOverride(false);
                setIsCreatingNewDefault(false);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createPolicyMutation.isPending}
              onClick={() => void handleSaveNewPolicy()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006970] hover:bg-[#005a60] rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {createPolicyMutation.isPending ? 'Saving…' : 'Save & Publish Policy'}
            </button>
          </div>
        </HRSectionCard>
      )}

      {/* Controlled-Dimension Chart + Audit Trail in 12-Col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {allPolicies.length > 0 && (
          <div className="lg:col-span-5 min-w-0">
            <HRChartCard
              title="Policy Scope Comparison"
              subtitle="Shift hours and late grace thresholds across branches"
              maxWidth={520}
            >
              <SharedChart
                variant="bar"
                data={policyComparisonChartData}
                height={230}
                barMaxSize={30}
                series={[
                  { key: 'shiftHours', label: 'Shift Hours', color: '#006970' },
                  { key: 'lateGrace', label: 'Late Grace (m)', color: '#f59e0b' },
                ]}
                xAxis={{ dataKey: 'name' }}
                legend={{ enabled: true, position: 'bottom' }}
              />
            </HRChartCard>
          </div>
        )}

        <div className={allPolicies.length > 0 ? 'lg:col-span-7 min-w-0' : 'lg:col-span-12 min-w-0'}>
          <HRSectionCard
            title="Policy Audit Trail"
            subtitle="Immutable PostgreSQL history of policy revisions"
            icon={<History className="w-4 h-4 text-slate-500" />}
            badge={
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                {auditLogs.length} entries
              </span>
            }
            noPadding
          >
            {isLoadingAudit ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading audit log…</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                No policy modifications logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 uppercase border-b border-slate-100 dark:border-slate-800 text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Action</th>
                      <th className="px-3 py-2.5">Scope</th>
                      <th className="px-4 py-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditLogs.map((log) => {
                      let parsedNew: any = {};
                      try {
                        parsedNew = JSON.parse(log.new_values_json);
                      } catch {
                        parsedNew = {};
                      }
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap tabular-nums">
                            {log.changed_at ? new Date(log.changed_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <HRStatusBadge status={log.action} showIcon={false} />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                            {log.branch_id
                              ? branches.find((b) => b.id === log.branch_id)?.name ??
                                `Branch ${log.branch_id.slice(0, 6)}`
                              : 'Org Default'}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                            {parsedNew.standard_shift_minutes ? `${parsedNew.standard_shift_minutes}m` : '—'} · Grace {parsedNew.late_threshold_minutes ?? '—'}m
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </HRSectionCard>
        </div>
      </div>

      {/* Organization Shift Templates Section */}
      <HRSectionCard
        title="Organization Shift Templates"
        subtitle="Reusable shift schedules stored in staff_shift_templates"
        icon={<Clock className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        actions={
          isOrgAdmin ? (
            <button
              type="button"
              onClick={() => setIsCreatingTemplate(!isCreatingTemplate)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {isCreatingTemplate ? 'Cancel' : 'New Shift Template'}
            </button>
          ) : undefined
        }
        noPadding
      >
        {isCreatingTemplate && isOrgAdmin && (
          <form
            onSubmit={handleSaveShiftTemplate}
            className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Morning Shift (11h)"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={tplStart}
                  onChange={(e) => setTplStart(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  required
                  value={tplEnd}
                  onChange={(e) => setTplEnd(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Duration (Mins)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={tplDuration}
                  onChange={(e) => setTplDuration(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Break / Grace (m)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={240}
                    title="Break duration (minutes)"
                    value={tplBreak}
                    onChange={(e) => setTplBreak(Number(e.target.value))}
                    className="w-1/2 h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                  <input
                    type="number"
                    min={0}
                    max={240}
                    title="Late grace threshold (minutes)"
                    value={tplLateThreshold}
                    onChange={(e) => setTplLateThreshold(Number(e.target.value))}
                    className="w-1/2 h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createTemplateMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {createTemplateMutation.isPending ? 'Saving…' : 'Save Shift Template'}
              </button>
            </div>
          </form>
        )}

        {isLoadingTemplates ? (
          <div className="p-6 text-center text-xs text-slate-400">Loading shift templates…</div>
        ) : isErrorTemplates ? (
          <div className="p-6 text-center text-xs text-rose-600">Failed to load shift templates.</div>
        ) : shiftTemplates.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 italic">
            No shift templates defined yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 dark:bg-slate-800/40 text-slate-500 uppercase border-b border-slate-100 dark:border-slate-800 text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Template Name</th>
                  <th className="px-3 py-2.5">Start Time</th>
                  <th className="px-3 py-2.5">End Time</th>
                  <th className="px-3 py-2.5">Duration</th>
                  <th className="px-3 py-2.5">Late Grace</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shiftTemplates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                      {tpl.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                      {tpl.shift_start_time}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                      {tpl.shift_end_time}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 tabular-nums">
                      {(Number(tpl.shift_duration_minutes) / 60).toFixed(1)}h ({tpl.shift_duration_minutes}m)
                    </td>
                    <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                      {tpl.late_threshold_minutes} mins
                    </td>
                    <td className="px-4 py-2.5">
                      <HRStatusBadge status="ACTIVE" showIcon={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HRSectionCard>

      {/* Retire Policy Confirmation Dialog (Replaces window.prompt) */}
      <HRConfirmDialog
        open={retireDialogOpen}
        title="Retire Active Branch Policy Override"
        description="Closing this branch override will revert effective policy resolution back to the Organization Default after the selected date."
        dateInputLabel="Policy Closure / Effective To Date (YYYY-MM-DD)"
        defaultDateValue={new Date().toISOString().slice(0, 10)}
        confirmLabel="Retire Policy"
        variant="danger"
        isPending={retirePolicyMutation.isPending}
        onConfirm={handleConfirmRetire}
        onCancel={() => setRetireDialogOpen(false)}
      />
    </div>
  );
};
