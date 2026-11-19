'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Building2,
  Users,
  FileText,
  Shield,
  Loader2,
  AlertTriangle,
  Coffee,
  DollarSign,
  Banknote,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useBranches } from '../hooks/useBranches';
import {
  useHRStaff,
  useStaffAttendance,
  useAnnualAttendanceSummary,
  useDailyAttendanceRegister,
  useAttendanceRange,
  usePayrollPeriods,
  usePayrollRecords,
  useOrgAdvances,
} from '../hooks/useHR';
import type { BackendStaffMember } from '../types/hr.types';
import { SharedChart } from '@/components/charts';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import {
  getKarachiTodayCanonical,
  addDaysCanonical,
  formatCanonicalToMMDDYYYY,
} from './DailyAttendanceAndLeavePage';
import {
  HRSectionCard,
  HRStatCard,
  HRChartCard,
  HRStatusBadge,
  HREmptyState,
  HRBanner,
} from './ui/HRPrimitives';

type ReportSection = 'overview' | 'late_absence' | 'leave' | 'payroll' | 'advances';
type PeriodMode = 'daily' | 'weekly' | 'monthly';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatPKR(v: number): string {
  return `₨ ${Math.round(v).toLocaleString('en-PK')}`;
}

export const HRAttendanceReportsTab: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const { branches } = useBranches();

  const [reportSection, setReportSection] = useState<ReportSection>('overview');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');

  const todayCanonical = useMemo(() => getKarachiTodayCanonical(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayCanonical);
  const [selectedMonth, setSelectedMonth] = useState<number>(
    parseInt(todayCanonical.split('-')[1], 10)
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    parseInt(todayCanonical.split('-')[0], 10)
  );

  const [drillDownStaff, setDrillDownStaff] = useState<BackendStaffMember | null>(null);

  const effectiveBranchParam = useMemo(() => {
    if (!isOrgAdmin) return user?.shopId ?? null;
    return selectedBranchId === 'all' ? null : selectedBranchId;
  }, [isOrgAdmin, selectedBranchId, user?.shopId]);

  const { data: hrStaff = [], isLoading: isLoadingStaff } = useHRStaff(effectiveBranchParam);

  // Compute Weekly / Monthly date ranges
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (periodMode === 'weekly') {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const dow = dt.getUTCDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const start = addDaysCanonical(selectedDate, mondayOffset);
      const end = addDaysCanonical(start, 6);
      return { rangeStart: start, rangeEnd: end };
    }
    const mm = String(selectedMonth).padStart(2, '0');
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    return {
      rangeStart: `${selectedYear}-${mm}-01`,
      rangeEnd: `${selectedYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [periodMode, selectedDate, selectedMonth, selectedYear]);

  const needAttendanceData =
    reportSection === 'overview' || reportSection === 'late_absence' || reportSection === 'leave';

  const {
    data: dailyRegister,
    isLoading: isLoadingDaily,
    isError: isErrorDaily,
  } = useDailyAttendanceRegister(selectedDate, effectiveBranchParam);

  const {
    data: rangeReport,
    isLoading: isLoadingRange,
    isError: isErrorRange,
  } = useAttendanceRange(
    rangeStart,
    rangeEnd,
    effectiveBranchParam,
    needAttendanceData && (periodMode === 'weekly' || periodMode === 'monthly')
  );

  // Individual Staff Queries
  const activeStaff = useMemo(() => {
    if (selectedStaffId === 'all') return null;
    return hrStaff.find((s) => s.user_id === selectedStaffId) || null;
  }, [hrStaff, selectedStaffId]);

  const { data: individualMonthlyRecords = [], isLoading: isLoadingIndMonthly } = useStaffAttendance(
    activeStaff?.user_id,
    selectedMonth,
    selectedYear
  );

  const { data: individualAnnualRecords = [] } = useAnnualAttendanceSummary(
    activeStaff?.user_id,
    selectedYear
  );

  // Payroll & Advances Queries (fetched when relevant section active)
  const { data: periods = [], isLoading: isLoadingPeriods } = usePayrollPeriods();
  const [selectedPayrollPeriodId, setSelectedPayrollPeriodId] = useState<string>('');
  useEffect(() => {
    if (!selectedPayrollPeriodId && periods.length > 0) {
      setSelectedPayrollPeriodId(periods[0].id);
    }
  }, [periods, selectedPayrollPeriodId]);

  const { data: payrollRecords = [], isLoading: isLoadingPayrollRecords } = usePayrollRecords(
    reportSection === 'payroll' ? selectedPayrollPeriodId || undefined : undefined,
    effectiveBranchParam
  );

  const { data: orgAdvances = [], isLoading: isLoadingAdvances } = useOrgAdvances(
    effectiveBranchParam,
    null
  );

  // Reconciled Overview Metrics
  const orgOverviewMetrics = useMemo(() => {
    if (periodMode === 'daily') {
      const s = dailyRegister?.summary;
      const workedMins = (dailyRegister?.rows ?? []).reduce(
        (acc, r) => acc + (r.worked_minutes ?? 0),
        0
      );
      return {
        totalEmployees: s?.total_employees ?? hrStaff.length,
        present: s?.present ?? 0,
        late: s?.late ?? 0,
        absent: s?.absent ?? 0,
        leave: s?.on_leave ?? 0,
        halfDay: s?.half_day ?? 0,
        totalHours: Number((workedMins / 60).toFixed(1)),
      };
    }

    const recs = rangeReport?.records ?? [];
    const emps = rangeReport?.employees ?? hrStaff;
    let present = 0,
      late = 0,
      absent = 0,
      leave = 0,
      halfDay = 0,
      workedMins = 0;

    for (const r of recs) {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'ABSENT') absent++;
      else if (r.status === 'LEAVE') leave++;
      else if (r.status === 'HALF_DAY') halfDay++;
      if (r.worked_minutes) workedMins += r.worked_minutes;
    }

    return {
      totalEmployees: emps.length,
      present,
      late,
      absent,
      leave,
      halfDay,
      totalHours: Number((workedMins / 60).toFixed(1)),
    };
  }, [periodMode, dailyRegister, rangeReport, hrStaff]);

  // Employee Summary Rollup
  const employeeRollupRows = useMemo(() => {
    if (periodMode === 'daily') {
      return (dailyRegister?.rows ?? []).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        role: r.role,
        branch_name: r.branch_name || '—',
        present: r.status === 'PRESENT' ? 1 : 0,
        late: r.status === 'LATE' ? 1 : 0,
        absent: r.status === 'ABSENT' ? 1 : 0,
        leave: r.status === 'LEAVE' ? 1 : 0,
        halfDay: r.status === 'HALF_DAY' ? 1 : 0,
        lateMinutes: r.late_minutes ?? 0,
        workedHours: r.worked_minutes ? Number((r.worked_minutes / 60).toFixed(1)) : 0,
      }));
    }

    const emps = rangeReport?.employees ?? [];
    const recs = rangeReport?.records ?? [];
    const byUser = new Map<
      string,
      {
        present: number;
        late: number;
        absent: number;
        leave: number;
        halfDay: number;
        lateMinutes: number;
        workedMins: number;
      }
    >();

    for (const e of emps) {
      byUser.set(e.user_id, {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        halfDay: 0,
        lateMinutes: 0,
        workedMins: 0,
      });
    }
    for (const r of recs) {
      const bucket = byUser.get(r.user_id);
      if (!bucket) continue;
      if (r.status === 'PRESENT') bucket.present++;
      else if (r.status === 'LATE') {
        bucket.late++;
        bucket.lateMinutes += r.late_minutes ?? 0;
      } else if (r.status === 'ABSENT') bucket.absent++;
      else if (r.status === 'LEAVE') bucket.leave++;
      else if (r.status === 'HALF_DAY') bucket.halfDay++;
      if (r.worked_minutes) bucket.workedMins += r.worked_minutes;
    }

    return emps.map((e) => {
      const b = byUser.get(e.user_id)!;
      return {
        user_id: e.user_id,
        full_name: e.full_name,
        role: e.role,
        branch_name: e.branch_name || '—',
        present: b.present,
        late: b.late,
        absent: b.absent,
        leave: b.leave,
        halfDay: b.halfDay,
        lateMinutes: b.lateMinutes,
        workedHours: Number((b.workedMins / 60).toFixed(1)),
      };
    });
  }, [periodMode, dailyRegister, rangeReport]);

  // Chart 1: Attendance Distribution Donut
  const attendanceDistributionData = useMemo(() => {
    const items = [
      { name: 'Present', value: orgOverviewMetrics.present, color: '#10b981' },
      { name: 'Late', value: orgOverviewMetrics.late, color: '#f59e0b' },
      { name: 'Absent', value: orgOverviewMetrics.absent, color: '#ef4444' },
      { name: 'On Leave', value: orgOverviewMetrics.leave, color: '#8b5cf6' },
      { name: 'Half Day', value: orgOverviewMetrics.halfDay, color: '#f97316' },
    ];
    return items.filter((i) => i.value > 0);
  }, [orgOverviewMetrics]);

  // Chart 2: Branch Stacked Bar
  const branchAttendanceChartData = useMemo(() => {
    const branchMap = new Map<
      string,
      { name: string; present: number; late: number; absent: number; leave: number }
    >();
    for (const b of branches) {
      branchMap.set(b.id, { name: b.name, present: 0, late: 0, absent: 0, leave: 0 });
    }
    const sourceRecs =
      periodMode === 'daily'
        ? (dailyRegister?.rows ?? []).map((r) => ({ branch_id: r.branch_id, status: r.status, branch_name: r.branch_name }))
        : (rangeReport?.records ?? []).map((r) => ({ branch_id: r.branch_id, status: r.status, branch_name: null }));

    for (const r of sourceRecs) {
      const bKey = r.branch_id ?? 'unassigned';
      if (!branchMap.has(bKey)) {
        branchMap.set(bKey, {
          name: r.branch_name || 'Org Default',
          present: 0,
          late: 0,
          absent: 0,
          leave: 0,
        });
      }
      const entry = branchMap.get(bKey)!;
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'LATE') entry.late++;
      else if (r.status === 'ABSENT') entry.absent++;
      else if (r.status === 'LEAVE') entry.leave++;
    }
    return Array.from(branchMap.values()).filter(
      (b) => b.present + b.late + b.absent + b.leave > 0
    );
  }, [branches, periodMode, dailyRegister, rangeReport]);

  // Chart 3: Daily Trend Line/Area (Weekly / Monthly)
  const dailyTrendChartData = useMemo(() => {
    if (periodMode === 'daily' || !rangeReport?.records) return [];
    const byDate = new Map<
      string,
      { date: string; present: number; late: number; absent: number }
    >();
    for (const r of rangeReport.records) {
      const dKey = r.attendance_date.slice(0, 10);
      if (!byDate.has(dKey)) {
        byDate.set(dKey, { date: dKey.slice(5), present: 0, late: 0, absent: 0 });
      }
      const bucket = byDate.get(dKey)!;
      if (r.status === 'PRESENT' || r.status === 'HALF_DAY') bucket.present++;
      else if (r.status === 'LATE') bucket.late++;
      else if (r.status === 'ABSENT') bucket.absent++;
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [periodMode, rangeReport]);

  // Chart 4: Top Staff Worked Hours Horizontal Bar
  const topStaffHoursData = useMemo(() => {
    return [...employeeRollupRows]
      .filter((r) => r.workedHours > 0)
      .sort((a, b) => b.workedHours - a.workedHours)
      .slice(0, 8)
      .map((r) => ({ name: r.full_name, workedHours: r.workedHours }));
  }, [employeeRollupRows]);

  // Individual Staff Metrics & Charts
  const individualMetrics = useMemo(() => {
    let present = 0,
      late = 0,
      absent = 0,
      leave = 0,
      halfDay = 0,
      workedMinutes = 0;

    for (const r of individualMonthlyRecords) {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'ABSENT') absent++;
      else if (r.status === 'LEAVE') leave++;
      else if (r.status === 'HALF_DAY') halfDay++;
      if (r.worked_minutes) workedMinutes += r.worked_minutes;
    }

    return {
      totalDays: individualMonthlyRecords.length,
      present,
      late,
      absent,
      leave,
      halfDay,
      totalHours: (workedMinutes / 60).toFixed(1),
    };
  }, [individualMonthlyRecords]);

  const annualChartData = useMemo(() => {
    return individualAnnualRecords.map((r) => ({
      name: MONTH_NAMES[r.month - 1]?.slice(0, 3) || `M${r.month}`,
      presentDays: r.present_days,
      absentDays: r.absent_days,
      workedHours: Number((r.total_worked_minutes / 60).toFixed(1)),
    }));
  }, [individualAnnualRecords]);

  const individualDonutData = useMemo(
    () =>
      [
        { name: 'Present', value: individualMetrics.present, color: '#10b981' },
        { name: 'Late', value: individualMetrics.late, color: '#f59e0b' },
        { name: 'Absent', value: individualMetrics.absent, color: '#ef4444' },
        { name: 'On Leave', value: individualMetrics.leave, color: '#8b5cf6' },
      ].filter((d) => d.value > 0),
    [individualMetrics]
  );

  // Late & Absence Specific Rollup
  const lateAbsenceRows = useMemo(
    () =>
      employeeRollupRows
        .filter((r) => r.late > 0 || r.absent > 0 || r.halfDay > 0)
        .sort((a, b) => b.absent * 3 + b.late - (a.absent * 3 + a.late)),
    [employeeRollupRows]
  );

  // Leave Rows
  const leaveRows = useMemo(
    () => employeeRollupRows.filter((r) => r.leave > 0).sort((a, b) => b.leave - a.leave),
    [employeeRollupRows]
  );

  // Payroll & Overtime Report Data
  const payrollChartData = useMemo(() => {
    return payrollRecords.slice(0, 12).map((r) => ({
      name: r.full_name || r.username,
      netPayable: Number(r.net_payable ?? 0),
      overtimePay: Number(r.overtime_amount ?? 0),
    }));
  }, [payrollRecords]);

  // Advances Report Data
  const advancesStatusChartData = useMemo(() => {
    const sums = new Map<string, number>();
    for (const a of orgAdvances) {
      const st = a.status || 'PENDING';
      sums.set(st, (sums.get(st) ?? 0) + Number(a.amount ?? 0));
    }
    const palette: Record<string, string> = {
      PENDING: '#f59e0b',
      APPROVED: '#0ea5e9',
      DISBURSED: '#10b981',
      RECOVERED: '#006970',
      REJECTED: '#ef4444',
      CANCELLED: '#94a3b8',
    };
    return Array.from(sums.entries())
      .filter(([, val]) => val > 0)
      .map(([name, value]) => ({ name, value, color: palette[name] ?? '#64748b' }));
  }, [orgAdvances]);

  const isOverviewLoading =
    isLoadingStaff || (periodMode === 'daily' ? isLoadingDaily : isLoadingRange);
  const isOverviewError = periodMode === 'daily' ? isErrorDaily : isErrorRange;

  return (
    <div className="space-y-5">
      {/* Header & Section Switcher */}
      <HRSectionCard
        title="HR Analytics & Reports"
        subtitle="Operational attendance, late arrivals, leaves, payroll overtime, and advance reports computed from live PostgreSQL records"
        icon={<FileText className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        badge={
          isOrgAdmin ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf]">
              <Shield className="w-3 h-3" /> Org Admin Scope
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Branch Scoped
            </span>
          )
        }
        actions={
          needAttendanceData && selectedStaffId === 'all' ? (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {(['daily', 'weekly', 'monthly'] as PeriodMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPeriodMode(mode)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${periodMode === mode
                    ? 'bg-white dark:bg-slate-900 text-[#006970] dark:text-[#33c9cf] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {/* Report Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pb-4 border-b border-slate-100 dark:border-slate-800">
          {(
            [
              { id: 'overview', label: 'Attendance Overview', icon: CheckCircle2 },
              { id: 'late_absence', label: 'Late & Absence', icon: AlertTriangle },
              { id: 'leave', label: 'Leave Report', icon: Coffee },
              { id: 'payroll', label: 'Payroll & Overtime', icon: DollarSign },
              { id: 'advances', label: 'Advances Summary', icon: Banknote },
            ] as Array<{ id: ReportSection; label: string; icon: React.ElementType }>
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setReportSection(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${reportSection === id
                ? 'bg-[#006970] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Shared Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 text-xs">
          {isOrgAdmin ? (
            <div>
              <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Branch Scope
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setSelectedStaffId('all');
                }}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Branch Scope
              </label>
              <input
                type="text"
                disabled
                value="Your Assigned Branch"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-500"
              />
            </div>
          )}

          {reportSection === 'overview' && (
            <div>
              <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Staff Filter
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">All Staff (Aggregate Report)</option>
                {hrStaff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name || s.username} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {needAttendanceData && (periodMode === 'daily' || periodMode === 'weekly') && (
            <div className={reportSection === 'overview' ? 'lg:col-span-2' : 'lg:col-span-3'}>
              <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />{' '}
                {periodMode === 'daily'
                  ? 'Target Date'
                  : `Reference Date (Week: ${formatCanonicalToMMDDYYYY(rangeStart)} – ${formatCanonicalToMMDDYYYY(rangeEnd)})`}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white max-w-xs"
              />
            </div>
          )}

          {needAttendanceData && periodMode === 'monthly' && (
            <>
              <div>
                <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {MONTH_NAMES.map((mName, idx) => (
                    <option key={mName} value={idx + 1}>
                      {mName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Year
                </label>
                <input
                  type="number"
                  min={2020}
                  max={2035}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </>
          )}

          {reportSection === 'payroll' && (
            <div className="lg:col-span-2">
              <label className="block text-slate-500 font-semibold mb-1">Payroll Period</label>
              <select
                value={selectedPayrollPeriodId}
                onChange={(e) => setSelectedPayrollPeriodId(e.target.value)}
                disabled={isLoadingPeriods || periods.length === 0}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white max-w-sm"
              >
                {periods.length === 0 ? (
                  <option value="">No payroll periods available</option>
                ) : (
                  periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {MONTH_NAMES[(p.period_month ?? 1) - 1]} {p.period_year ?? selectedYear} ({p.status})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>
      </HRSectionCard>

      {isOverviewError && needAttendanceData && (
        <HRBanner
          type="error"
          message="Failed to load attendance report dataset from PostgreSQL."
        />
      )}

      {/* ══ SECTION 1: ATTENDANCE OVERVIEW ═══════════════════════════════════ */}
      {reportSection === 'overview' && selectedStaffId === 'all' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <HRStatCard
              label="Active Staff"
              value={orgOverviewMetrics.totalEmployees}
              subtext="In selected scope"
              tone="teal"
              loading={isOverviewLoading}
            />
            <HRStatCard
              label={`Present ${periodMode === 'daily' ? 'Today' : 'Days'}`}
              value={orgOverviewMetrics.present}
              subtext="Verified check-ins"
              tone="emerald"
              loading={isOverviewLoading}
            />
            <HRStatCard
              label="Late Marks"
              value={orgOverviewMetrics.late}
              subtext="Beyond policy grace"
              tone="amber"
              loading={isOverviewLoading}
            />
            <HRStatCard
              label="Absent Days"
              value={orgOverviewMetrics.absent}
              subtext={`Half-days: ${orgOverviewMetrics.halfDay}`}
              tone="rose"
              loading={isOverviewLoading}
            />
            <HRStatCard
              label="On Leave"
              value={orgOverviewMetrics.leave}
              subtext="Recorded leaves"
              tone="violet"
              loading={isOverviewLoading}
            />
            <HRStatCard
              label="Worked Hours"
              value={`${orgOverviewMetrics.totalHours}h`}
              subtext="Total recorded duration"
              tone="sky"
              loading={isOverviewLoading}
            />
          </div>

          {/* Bounded Row 1 Charts: Donut (5 cols) + Branch Stacked Bar (7 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 min-w-0">
              <HRChartCard
                title="Attendance Distribution"
                subtitle="Proportion of Present, Late, Absent, and Leave statuses"
                pill={periodMode.toUpperCase()}
                maxWidth={440}
              >
                <SharedChart
                  variant="donut"
                  data={attendanceDistributionData}
                  series={[{ key: 'value', label: 'Count', color: '#006970' }]}
                  height={240}
                  maxWidth={400}
                  align="center"
                  legend={{ enabled: true, position: 'bottom' }}
                  emptyMessage="No attendance distribution data for selected period"
                  isLoading={isOverviewLoading}
                />
              </HRChartCard>
            </div>

            <div className="lg:col-span-7 min-w-0">
              <HRChartCard
                title="Branch Attendance Comparison"
                subtitle="Present, Late, Absent, and Leave counts by authorized branch"
                pill={`${branchAttendanceChartData.length} branch(es)`}
                maxWidth={760}
              >
                <SharedChart
                  variant="stacked-bar"
                  data={branchAttendanceChartData}
                  series={[
                    { key: 'present', label: 'Present', color: '#10b981' },
                    { key: 'late', label: 'Late', color: '#f59e0b' },
                    { key: 'absent', label: 'Absent', color: '#ef4444' },
                    { key: 'leave', label: 'Leave', color: '#8b5cf6' },
                  ]}
                  xAxis={{ dataKey: 'name' }}
                  height={240}
                  barMaxSize={34}
                  legend={{ enabled: true, position: 'bottom' }}
                  emptyMessage="No branch breakdown records for selected range"
                  isLoading={isOverviewLoading}
                />
              </HRChartCard>
            </div>
          </div>

          {/* Bounded Row 2 Charts (Weekly/Monthly): Daily Area Trend (7 cols) + Top Worked Hours (5 cols) */}
          {periodMode !== 'daily' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 min-w-0">
                <HRChartCard
                  title="Daily Attendance Trend"
                  subtitle="Present, Late, and Absent headcount across dates in range"
                  pill={`${formatCanonicalToMMDDYYYY(rangeStart)} – ${formatCanonicalToMMDDYYYY(rangeEnd)}`}
                  maxWidth={760}
                >
                  <SharedChart
                    variant="area"
                    data={dailyTrendChartData}
                    series={[
                      { key: 'present', label: 'Present', color: '#10b981' },
                      { key: 'late', label: 'Late', color: '#f59e0b' },
                      { key: 'absent', label: 'Absent', color: '#ef4444' },
                    ]}
                    xAxis={{ dataKey: 'date' }}
                    height={235}
                    legend={{ enabled: true, position: 'bottom' }}
                    emptyMessage="No daily trend data in selected window"
                    isLoading={isOverviewLoading}
                  />
                </HRChartCard>
              </div>

              <div className="lg:col-span-5 min-w-0">
                <HRChartCard
                  title="Top Recorded Work Hours"
                  subtitle="Highest cumulative recorded hours in selected window"
                  pill="Top 8 Staff"
                  maxWidth={500}
                >
                  <SharedChart
                    variant="horizontal-bar"
                    data={topStaffHoursData}
                    series={[{ key: 'workedHours', label: 'Hours', color: '#006970' }]}
                    xAxis={{ dataKey: 'name' }}
                    height={235}
                    barMaxSize={18}
                    valueType="decimal"
                    emptyMessage="No completed shift durations recorded yet"
                    isLoading={isOverviewLoading}
                  />
                </HRChartCard>
              </div>
            </div>
          )}

          {/* Employee Summary Table */}
          <HRSectionCard
            title="Staff Attendance Summary"
            subtitle="Every row reconciles directly with the attendance overview metrics above"
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Staff Name</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Branch</th>
                    <th className="px-3 py-3 text-center">Present</th>
                    <th className="px-3 py-3 text-center">Late</th>
                    <th className="px-3 py-3 text-center">Absent</th>
                    <th className="px-3 py-3 text-center">Half Day</th>
                    <th className="px-3 py-3 text-center">Leave</th>
                    <th className="px-3 py-3 text-right">Worked Hours</th>
                    <th className="px-4 py-3 text-right">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isOverviewLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-[#006970]" />
                        Loading attendance summary…
                      </td>
                    </tr>
                  ) : employeeRollupRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        No staff members found in this scope.
                      </td>
                    </tr>
                  ) : (
                    employeeRollupRows.map((row) => {
                      const matchedStaff = hrStaff.find((s) => s.user_id === row.user_id);
                      return (
                        <tr key={row.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {row.full_name}
                          </td>
                          <td className="px-3 py-3 text-slate-500">{row.role}</td>
                          <td className="px-3 py-3 text-slate-500">{row.branch_name}</td>
                          <td className="px-3 py-3 text-center font-bold text-emerald-600 tabular-nums">{row.present}</td>
                          <td className="px-3 py-3 text-center font-bold text-amber-600 tabular-nums">{row.late}</td>
                          <td className="px-3 py-3 text-center font-bold text-rose-600 tabular-nums">{row.absent}</td>
                          <td className="px-3 py-3 text-center font-bold text-orange-600 tabular-nums">{row.halfDay}</td>
                          <td className="px-3 py-3 text-center font-bold text-violet-600 tabular-nums">{row.leave}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                            {row.workedHours}h
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => matchedStaff && setDrillDownStaff(matchedStaff)}
                              className="px-2.5 py-1 rounded-lg bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf] hover:bg-[#006970]/20 font-semibold cursor-pointer"
                            >
                              Full Logs
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </HRSectionCard>
        </div>
      )}

      {/* Individual Staff View (bounded charts!) */}
      {reportSection === 'overview' && selectedStaffId !== 'all' && activeStaff && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <HRStatCard label="Present" value={individualMetrics.present} tone="emerald" />
            <HRStatCard label="Late" value={individualMetrics.late} tone="amber" />
            <HRStatCard label="Absent" value={individualMetrics.absent} tone="rose" />
            <HRStatCard label="Leave" value={individualMetrics.leave} tone="violet" />
            <HRStatCard label="Half Day" value={individualMetrics.halfDay} tone="neutral" />
            <HRStatCard label="Hours" value={`${individualMetrics.totalHours}h`} tone="teal" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 min-w-0">
              <HRChartCard
                title={`${selectedYear} Annual Attendance Trend`}
                subtitle={`Monthly present vs absent days and worked hours for ${activeStaff.full_name || activeStaff.username}`}
                maxWidth={780}
              >
                <SharedChart
                  variant="composed"
                  data={annualChartData}
                  series={[
                    { key: 'presentDays', label: 'Present Days', color: '#10b981', renderType: 'bar' },
                    { key: 'absentDays', label: 'Absent Days', color: '#ef4444', renderType: 'bar' },
                    { key: 'workedHours', label: 'Worked Hours', color: '#006970', renderType: 'line', strokeWidth: 2 },
                  ]}
                  xAxis={{ dataKey: 'name' }}
                  height={250}
                  barMaxSize={26}
                  legend={{ enabled: true, position: 'bottom' }}
                />
              </HRChartCard>
            </div>
            <div className="lg:col-span-4 min-w-0">
              <HRChartCard
                title={`Month Mix (${selectedMonth}/${selectedYear})`}
                subtitle="Selected month status breakdown"
                maxWidth={380}
              >
                <SharedChart
                  variant="donut"
                  data={individualDonutData}
                  series={[{ key: 'value', label: 'Days', color: '#006970' }]}
                  height={250}
                  legend={{ enabled: true, position: 'bottom' }}
                  emptyMessage="No attendance records this month"
                />
              </HRChartCard>
            </div>
          </div>

          <HRSectionCard
            title={`Detailed Attendance Logs (${selectedMonth}/${selectedYear})`}
            actions={
              <button
                type="button"
                onClick={() => setDrillDownStaff(activeStaff)}
                className="px-3 py-1.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold cursor-pointer"
              >
                Open Interactive Calendar
              </button>
            }
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Check-In</th>
                    <th className="px-3 py-3">Check-Out</th>
                    <th className="px-3 py-3">Worked</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoadingIndMonthly ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Loading entries…
                      </td>
                    </tr>
                  ) : individualMonthlyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No attendance entries recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    individualMonthlyRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                          {rec.attendance_date}
                        </td>
                        <td className="px-3 py-3">
                          <HRStatusBadge status={rec.status} showIcon={false} />
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-500 tabular-nums">
                          {rec.check_in_at
                            ? new Date(rec.check_in_at).toLocaleTimeString('en-PK', {
                              timeZone: 'Asia/Karachi',
                            })
                            : '—'}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-500 tabular-nums">
                          {rec.check_out_at
                            ? new Date(rec.check_out_at).toLocaleTimeString('en-PK', {
                              timeZone: 'Asia/Karachi',
                            })
                            : '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                          {rec.worked_minutes ? `${(rec.worked_minutes / 60).toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{rec.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </HRSectionCard>
        </div>
      )}

      {/* ══ SECTION 2: LATE & ABSENCE REPORT ═════════════════════════════════ */}
      {reportSection === 'late_absence' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HRStatCard
              label="Total Late Arrivals"
              value={orgOverviewMetrics.late}
              tone="amber"
              icon={<Clock className="w-4 h-4" />}
            />
            <HRStatCard
              label="Total Absences"
              value={orgOverviewMetrics.absent}
              tone="rose"
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <HRStatCard
              label="Half Days"
              value={orgOverviewMetrics.halfDay}
              tone="neutral"
            />
            <HRStatCard
              label="Staff Affected"
              value={lateAbsenceRows.length}
              tone="teal"
              icon={<Users className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 min-w-0">
              <HRChartCard
                title="Late & Absence Occurrences by Staff"
                subtitle="Top staff by combined late and absence counts"
                pill={periodMode.toUpperCase()}
                maxWidth={680}
              >
                <SharedChart
                  variant="horizontal-bar"
                  data={lateAbsenceRows.slice(0, 10).map((r) => ({
                    name: r.full_name,
                    absent: r.absent,
                    late: r.late,
                  }))}
                  series={[
                    { key: 'absent', label: 'Absent', color: '#ef4444' },
                    { key: 'late', label: 'Late', color: '#f59e0b' },
                  ]}
                  xAxis={{ dataKey: 'name' }}
                  height={260}
                  barMaxSize={18}
                  legend={{ enabled: true, position: 'bottom' }}
                  emptyMessage="No late arrivals or absences recorded in selected scope"
                />
              </HRChartCard>
            </div>

            <div className="lg:col-span-6 min-w-0">
              <HRSectionCard
                title="Late & Absence Breakdown"
                subtitle="Employees with late arrivals, absences, or half-days"
                noPadding
              >
                {lateAbsenceRows.length === 0 ? (
                  <div className="p-6">
                    <HREmptyState
                      title="Zero late marks or absences"
                      description="All recorded staff attendance in this period was punctual."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5">Employee</th>
                          <th className="px-3 py-2.5 text-center">Late</th>
                          <th className="px-3 py-2.5 text-center">Absent</th>
                          <th className="px-3 py-2.5 text-center">Half Day</th>
                          <th className="px-4 py-2.5 text-right">Late Mins</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lateAbsenceRows.map((r) => (
                          <tr key={r.user_id}>
                            <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                              {r.full_name}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-amber-600 tabular-nums">
                              {r.late}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-rose-600 tabular-nums">
                              {r.absent}
                            </td>
                            <td className="px-3 py-2.5 text-center font-semibold text-orange-600 tabular-nums">
                              {r.halfDay}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                              {r.lateMinutes}m
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </HRSectionCard>
            </div>
          </div>
        </div>
      )}

      {/* ══ SECTION 3: LEAVE REPORT ══════════════════════════════════════════ */}
      {reportSection === 'leave' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 min-w-0">
            <HRChartCard
              title="Leave Days by Employee"
              subtitle={`Recorded LEAVE days in ${periodMode} report window`}
              maxWidth={560}
            >
              <SharedChart
                variant="horizontal-bar"
                data={leaveRows.slice(0, 10).map((r) => ({ name: r.full_name, leave: r.leave }))}
                series={[{ key: 'leave', label: 'Leave Days', color: '#8b5cf6' }]}
                xAxis={{ dataKey: 'name' }}
                height={250}
                barMaxSize={18}
                emptyMessage="No leave days recorded in selected window"
              />
            </HRChartCard>
          </div>
          <div className="lg:col-span-7 min-w-0">
            <HRSectionCard
              title={`Leave Utilization Table (${leaveRows.length} staff)`}
              subtitle="Employees with LEAVE attendance records in selected scope"
              noPadding
            >
              {leaveRows.length === 0 ? (
                <div className="p-6">
                  <HREmptyState
                    icon={<Coffee className="w-5 h-5" />}
                    title="No leave days in selected report scope"
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">Branch</th>
                        <th className="px-4 py-3 text-right">Leave Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {leaveRows.map((r) => (
                        <tr key={r.user_id}>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {r.full_name}
                          </td>
                          <td className="px-3 py-3 text-slate-500">{r.role}</td>
                          <td className="px-3 py-3 text-slate-500">{r.branch_name}</td>
                          <td className="px-4 py-3 text-right font-bold text-violet-600 tabular-nums">
                            {r.leave}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </HRSectionCard>
          </div>
        </div>
      )}

      {/* ══ SECTION 4: PAYROLL & OVERTIME REPORT ═════════════════════════════ */}
      {reportSection === 'payroll' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HRStatCard
              label="Total Net Payable"
              value={formatPKR(
                payrollRecords.reduce((s, r) => s + Number(r.net_payable ?? 0), 0)
              )}
              tone="teal"
              loading={isLoadingPayrollRecords}
            />
            <HRStatCard
              label="Total Overtime Pay"
              value={formatPKR(
                payrollRecords.reduce((s, r) => s + Number(r.overtime_amount ?? 0), 0)
              )}
              tone="emerald"
              loading={isLoadingPayrollRecords}
            />
            <HRStatCard
              label="Absence Deductions"
              value={formatPKR(
                payrollRecords.reduce((s, r) => s + Number(r.absence_deduction ?? 0), 0)
              )}
              tone="rose"
              loading={isLoadingPayrollRecords}
            />
            <HRStatCard
              label="Remaining Unpaid"
              value={formatPKR(
                payrollRecords.reduce((s, r) => s + Number(r.remaining_amount ?? 0), 0)
              )}
              tone="amber"
              loading={isLoadingPayrollRecords}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 min-w-0">
              <HRChartCard
                title="Employee Net Salary & Overtime Comparison"
                subtitle="Generated payroll records for selected period"
                maxWidth={720}
              >
                <SharedChart
                  variant="bar"
                  data={payrollChartData}
                  series={[
                    { key: 'netPayable', label: 'Net Payable', color: '#006970' },
                    { key: 'overtimePay', label: 'Overtime Pay', color: '#10b981' },
                  ]}
                  xAxis={{ dataKey: 'name' }}
                  height={255}
                  barMaxSize={30}
                  valueType="currency"
                  legend={{ enabled: true, position: 'bottom' }}
                  emptyMessage="No payroll records generated for selected period"
                  isLoading={isLoadingPayrollRecords}
                />
              </HRChartCard>
            </div>

            <div className="lg:col-span-6 min-w-0">
              <HRSectionCard title="Overtime & Payroll Register Summary" noPadding>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5">Staff</th>
                        <th className="px-3 py-2.5 text-right">OT Mins</th>
                        <th className="px-3 py-2.5 text-right">OT Pay</th>
                        <th className="px-3 py-2.5 text-right">Net Payable</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {payrollRecords.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            No salary records generated for this period yet.
                          </td>
                        </tr>
                      ) : (
                        payrollRecords.map((r) => (
                          <tr key={r.id}>
                            <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                              {r.full_name || r.username}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {r.overtime_minutes}m
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-600 tabular-nums font-semibold">
                              {formatPKR(Number(r.overtime_amount ?? 0))}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                              {formatPKR(Number(r.net_payable ?? 0))}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <HRStatusBadge status={r.status} showIcon={false} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </HRSectionCard>
            </div>
          </div>
        </div>
      )}

      {/* ══ SECTION 5: ADVANCES SUMMARY ══════════════════════════════════════ */}
      {reportSection === 'advances' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 min-w-0">
            <HRChartCard
              title="Staff Advances by Status"
              subtitle="Total advance principal grouped by approval/disbursement state"
              maxWidth={440}
            >
              <SharedChart
                variant="donut"
                data={advancesStatusChartData}
                series={[{ key: 'value', label: 'Amount', color: '#006970' }]}
                height={250}
                valueType="currency"
                legend={{ enabled: true, position: 'bottom' }}
                emptyMessage="No staff advance requests recorded"
                isLoading={isLoadingAdvances}
              />
            </HRChartCard>
          </div>

          <div className="lg:col-span-7 min-w-0">
            <HRSectionCard title={`Advances Breakdown (${orgAdvances.length})`} noPadding>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Employee</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                      <th className="px-3 py-2.5 text-right">Outstanding</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orgAdvances.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          No advance requests recorded.
                        </td>
                      </tr>
                    ) : (
                      orgAdvances.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                            {a.user_name || a.username || a.user_id}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 tabular-nums">
                            {(a.requested_date || a.created_at || '').slice(0, 10)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                            {formatPKR(Number(a.amount ?? 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right text-amber-600 font-semibold tabular-nums">
                            {formatPKR(Number(a.outstanding_amount ?? a.amount ?? 0))}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <HRStatusBadge status={a.status} showIcon={false} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </HRSectionCard>
          </div>
        </div>
      )}

      {drillDownStaff && (
        <StaffDetailDrawer
          open={Boolean(drillDownStaff)}
          onClose={() => setDrillDownStaff(null)}
          staff={drillDownStaff}
        />
      )}
    </div>
  );
};
