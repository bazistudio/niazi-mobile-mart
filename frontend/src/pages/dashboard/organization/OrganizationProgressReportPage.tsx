/**
 * OrganizationProgressReportPage — Staff Progress Report
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MECHANIC DATA — Real repair jobs from /api/repairs via repairApi        ║
 * ║  SALESMAN DATA — Real data from GET /api/v1/reports/progress?user_id=.. ║
 * ║  CASHIER DATA  — Real data from GET /api/v1/reports/progress?user_id=.. ║
 * ║  BLOCKED       — Accountant, Admin require separate API attribution      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Phase 2 changes:
 *  - SalesmanReportCard: uses GET /api/v1/reports/progress (created_by attribution)
 *  - CashierReportCard:  uses GET /api/v1/reports/progress (created_by attribution)
 *  - Mechanic card unchanged (repairApi.getRepairJobs with technician_id)
 *  - Accountant & Admin remain blocked (no per-user ledger/audit attribution yet)
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { BackendIntegrationNotice } from '@/features/hr/components/BackendIntegrationNotice';
import { HRStaffSelector } from '@/features/hr/components/HRStaffSelector';
import { repairApi } from '@/features/repairs/services/repair.api';
import { httpClient } from '@/lib/http/httpClient';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { RepairJob } from '@/features/repairs/types/repair.types';
import type { ProgressReportResponse } from '@/features/hr/types/hr.types';
import {
  Wrench,
  ShoppingCart,
  Banknote,
  BookOpen,
  Shield,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Users,
  BarChart3,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
} from 'lucide-react';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function subDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

type DatePreset = 'today' | 'week' | 'month' | 'custom';

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function presetToRange(preset: DatePreset): DateRange {
  const today = new Date();
  switch (preset) {
    case 'today':
      return { from: formatDate(today), to: formatDate(today) };
    case 'week':
      return { from: formatDate(subDays(today, 6)), to: formatDate(today) };
    case 'month':
    default:
      return { from: formatDate(startOfMonth(today)), to: formatDate(today) };
  }
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (['Delivered', 'Ready for Pickup', 'Quality Check'].includes(status))
    return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40';
  if (['Repair In Progress', 'Waiting Parts', 'Waiting Customer Approval', 'Diagnosing'].includes(status))
    return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40';
  if (['Received', 'On Hold'].includes(status))
    return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40';
  if (['Cancelled', 'Rejected', 'Returned Under Warranty'].includes(status))
    return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40';
  return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
}

function isCompletedStatus(status: string): boolean {
  return ['Delivered', 'Ready for Pickup', 'Quality Check'].includes(status);
}

function isActiveStatus(status: string): boolean {
  return ['Repair In Progress', 'Waiting Parts', 'Waiting Customer Approval', 'Diagnosing'].includes(status);
}

function isCancelledStatus(status: string): boolean {
  return ['Cancelled', 'Rejected'].includes(status);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(status)}`}>
      {status}
    </span>
  );
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

function pkr(n: number): string {
  return `₨${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

interface Filters {
  staffId: string | undefined;
  branchId: string | undefined;
  roleFilter: string;
  datePreset: DatePreset;
  customRange: DateRange;
}

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'mechanic', label: 'Mechanic / Technician' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'admin', label: 'Admin' },
];

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange }) => {
  const today = formatDate(new Date());

  function set<K extends keyof Filters>(key: K, val: Filters[K]) {
    onChange({ ...filters, [key]: val });
  }

  const effectiveRange: DateRange =
    filters.datePreset === 'custom'
      ? filters.customRange
      : presetToRange(filters.datePreset);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        <Filter className="w-4 h-4 text-blue-500" />
        Report Filters
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Role */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Role</label>
          <select
            value={filters.roleFilter}
            onChange={e => set('roleFilter', e.target.value)}
            className="w-full h-9 px-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
          >
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Staff */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Staff Member</label>
          <HRStaffSelector
            value={filters.staffId}
            onChange={(id) => set('staffId', id || undefined)}
            placeholder="All staff..."
            roleFilter={filters.roleFilter ? [filters.roleFilter] : undefined}
            className="h-9"
          />
        </div>

        {/* Date Preset */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Period</label>
          <div className="flex gap-1.5">
            {(['today', 'week', 'month', 'custom'] as DatePreset[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => set('datePreset', p)}
                className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-colors capitalize
                  ${filters.datePreset === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range display / custom inputs */}
        {filters.datePreset === 'custom' ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date Range</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.customRange.from}
                max={filters.customRange.to || today}
                onChange={e => set('customRange', { ...filters.customRange, from: e.target.value })}
                className="flex-1 h-9 px-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
              />
              <input
                type="date"
                value={filters.customRange.to}
                min={filters.customRange.from}
                max={today}
                onChange={e => set('customRange', { ...filters.customRange, to: e.target.value })}
                className="flex-1 h-9 px-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Range</label>
            <div className="h-9 flex items-center px-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 font-mono">
              {effectiveRange.from} → {effectiveRange.to}
            </div>
          </div>
        )}
      </div>

      {(filters.staffId || filters.roleFilter || filters.datePreset !== 'month') && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange({
              staffId: undefined,
              branchId: undefined,
              roleFilter: '',
              datePreset: 'month',
              customRange: presetToRange('month'),
            })}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Mechanic Report Card ─────────────────────────────────────────────────────

interface MechanicReportCardProps {
  staffId?: string;
  branchId?: string;
  dateRange: DateRange;
}

const MechanicReportCard: React.FC<MechanicReportCardProps> = ({
  staffId,
  branchId,
  dateRange,
}) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['progress-report', 'repairs', staffId, branchId, dateRange.from, dateRange.to],
    queryFn: () => repairApi.getRepairJobs({
      technician_id: staffId,
      branch_id: branchId,
      limit: 500,
    }),
    staleTime: 2 * 60 * 1000,
  });

  // Client-side date filter using RepairJob.createdAt (camelCase from type)
  const jobs: RepairJob[] = useMemo(() => {
    if (!data?.data) return [];
    const from = new Date(dateRange.from + 'T00:00:00');
    const to   = new Date(dateRange.to   + 'T23:59:59');
    return data.data.filter(job => {
      const d = new Date(job.createdAt);
      return d >= from && d <= to;
    });
  }, [data, dateRange]);

  const stats = useMemo(() => {
    const completed  = jobs.filter(j => isCompletedStatus(j.status)).length;
    const inProgress = jobs.filter(j => isActiveStatus(j.status)).length;
    const pending    = jobs.filter(j => j.status === 'Received' || j.status === 'On Hold').length;
    const cancelled  = jobs.filter(j => isCancelledStatus(j.status)).length;
    const totalRevenue = jobs
      .filter(j => isCompletedStatus(j.status))
      .reduce((sum, j) => sum + (j.grandTotal ?? j.estimatedCost ?? 0), 0);
    return { total: jobs.length, completed, inProgress, pending, cancelled, totalRevenue };
  }, [jobs]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading repair data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <BackendIntegrationNotice
        title="Failed to Load Repair Data"
        description="Could not fetch repair jobs from /api/repairs. Check your connection."
        variant="warning"
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">
              {staffId ? 'Mechanic — Repair Jobs' : 'All Mechanics — Repair Jobs'}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {dateRange.from} to {dateRange.to} · Live data from /api/repairs
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-800">
        {[
          { label: 'Total Jobs',    value: stats.total,          icon: Package,       color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Completed',     value: stats.completed,      icon: CheckCircle2,  color: 'text-green-600 dark:text-green-400' },
          { label: 'In Progress',   value: stats.inProgress,     icon: Clock,         color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Pending',       value: stats.pending,        icon: AlertCircle,   color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Cancelled',     value: stats.cancelled,      icon: XCircle,       color: 'text-red-500 dark:text-red-400' },
          { label: 'Revenue (PKR)', value: pkr(stats.totalRevenue), icon: BarChart3,  color: 'text-purple-600 dark:text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 text-center">
            <Icon className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
            <div className={`text-lg font-black ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Job List */}
      {jobs.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No repair jobs in the selected period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Job ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Device</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {jobs.slice(0, 50).map(job => (
                <tr key={job._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {job.jobId || job._id?.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 max-w-[160px] truncate">
                    {[job.device?.brand, job.device?.model].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold
                      ${job.priority === 'Urgent' ? 'text-red-600 dark:text-red-400' :
                        job.priority === 'High'   ? 'text-amber-600 dark:text-amber-400' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                      {job.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200">
                    {job.grandTotal
                      ? pkr(job.grandTotal)
                      : job.estimatedCost
                        ? `~${pkr(job.estimatedCost)}`
                        : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500">
                    {new Date(job.createdAt).toLocaleDateString('en-PK', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobs.length > 50 && (
            <div className="px-4 py-2.5 text-xs text-gray-400 text-center border-t border-gray-100 dark:border-gray-800">
              Showing 50 of {jobs.length} jobs in this period
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Progress Report Card (Salesman & Cashier) ────────────────────────────────

interface ProgressReportCardProps {
  staffId: string;
  branchId?: string;
  dateRange: DateRange;
  role: 'salesman' | 'cashier';
}

const ProgressReportCard: React.FC<ProgressReportCardProps> = ({
  staffId,
  branchId,
  dateRange,
  role,
}) => {
  const params = new URLSearchParams({ user_id: staffId });
  if (branchId) params.set('branch_id', branchId);
  if (dateRange.from) params.set('start_date', dateRange.from);
  if (dateRange.to) params.set('end_date', dateRange.to);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.progress(staffId, branchId, dateRange.from, dateRange.to),
    queryFn: () => httpClient.get<ProgressReportResponse>(`/api/v1/reports/progress?${params.toString()}`),
    staleTime: 2 * 60 * 1000,
    enabled: !!staffId,
  });

  const isSalesman = role === 'salesman';
  const Icon = isSalesman ? ShoppingCart : Banknote;
  const iconBg = isSalesman ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-orange-50 dark:bg-orange-950/40';
  const iconColor = isSalesman ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400';
  const title = isSalesman ? 'Salesman — Sales Summary' : 'Cashier — Cash Handling Summary';
  const endpoint = '/api/v1/reports/progress';

  if (!staffId) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 text-center text-sm text-gray-400 dark:text-gray-500">
        Select a staff member above to view their {isSalesman ? 'sales' : 'cash handling'} report.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading {isSalesman ? 'sales' : 'cash'} data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <BackendIntegrationNotice
        title={`Failed to Load ${isSalesman ? 'Sales' : 'Cash'} Data`}
        description={`Could not fetch from ${endpoint}. Check your connection and ensure the backend is running.`}
        variant="warning"
      />
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {dateRange.from} to {dateRange.to} · Live data from {endpoint}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {isSalesman ? (
        /* Salesman: Sales metrics */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-800">
          {[
            { label: 'Sales',       value: data.sales.count,       icon: ShoppingCart,  color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Gross',       value: pkr(data.sales.gross),  icon: TrendingUp,    color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Discounts',   value: pkr(data.sales.discounts), icon: TrendingDown, color: 'text-red-500 dark:text-red-400' },
            { label: 'Net Sales',   value: pkr(data.sales.net),    icon: BarChart3,     color: 'text-gray-700 dark:text-gray-300' },
            { label: 'Collected',   value: pkr(data.sales.collected), icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
          ].map(({ label, value, icon: Ico, color }) => (
            <div key={label} className="p-4 text-center">
              <Ico className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
              <div className={`text-lg font-black ${color}`}>{value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      ) : (
        /* Cashier: Cash handling metrics */
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-800">
          {[
            { label: 'Cash Collected', value: pkr(data.cash.collected), icon: TrendingUp,     color: 'text-green-600 dark:text-green-400' },
            { label: 'Cash Refunded',  value: pkr(data.cash.refunded),  icon: TrendingDown,   color: 'text-red-500 dark:text-red-400' },
            { label: 'Returns',        value: data.returns.count,        icon: ArrowLeftRight,  color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Return Refunds', value: pkr(data.returns.refunds), icon: Banknote,       color: 'text-orange-600 dark:text-orange-400' },
          ].map(({ label, value, icon: Ico, color }) => (
            <div key={label} className="p-4 text-center">
              <Ico className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
              <div className={`text-lg font-black ${color}`}>{value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Attribution note */}
      <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {isSalesman
            ? 'Sales attributed via created_by on the sales table. Discounts are actual discount amounts recorded at sale time. "Collected" = paid_amount on the sale record.'
            : 'Cash movements attributed via created_by on cash_movements table. SALE_PAYMENT type = collected; REFUND type = refunded. Returns via processed_by on sales_returns.'
          }
        </p>
      </div>
    </div>
  );
};

// ─── No Staff Selected placeholder ───────────────────────────────────────────

const NoStaffSelectedCard: React.FC<{ role: string; icon: React.ElementType }> = ({ role, icon: Icon }) => (
  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-8 text-center">
    <Icon className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
    <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
      Select a {role} above to view their progress report.
    </div>
    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
      Data is fetched per staff member from /api/v1/reports/progress
    </div>
  </div>
);

// ─── Blocked Role Cards ───────────────────────────────────────────────────────

interface BlockedRoleCardProps {
  roleName: string;
  icon: React.ElementType;
  requiredEndpoints: string[];
  description: string;
}

const BlockedRoleCard: React.FC<BlockedRoleCardProps> = ({
  roleName,
  icon: Icon,
  requiredEndpoints,
  description,
}) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </div>
      <div>
        <div className="text-sm font-bold text-gray-700 dark:text-gray-300">{roleName} Progress</div>
        <div className="text-xs text-gray-400 dark:text-gray-500">Backend attribution required</div>
      </div>
    </div>
    <div className="p-5">
      <BackendIntegrationNotice
        description={description}
        requiredEndpoints={requiredEndpoints}
        variant="warning"
      />
    </div>
  </div>
);

// ─── PAGE ─────────────────────────────────────────────────────────────────────

type RoleView = 'all' | 'mechanic' | 'salesman' | 'cashier' | 'accountant' | 'admin';

const ROLE_TABS: { id: RoleView; label: string; icon: React.ElementType; hasData: boolean }[] = [
  { id: 'all',         label: 'All',        icon: Users,        hasData: true  },
  { id: 'mechanic',    label: 'Mechanic',   icon: Wrench,       hasData: true  },
  { id: 'salesman',    label: 'Salesman',   icon: ShoppingCart, hasData: true  },
  { id: 'cashier',     label: 'Cashier',    icon: Banknote,     hasData: true  },
  { id: 'accountant',  label: 'Accountant', icon: BookOpen,     hasData: false },
  { id: 'admin',       label: 'Admin',      icon: Shield,       hasData: false },
];

export const OrganizationProgressReportPage: React.FC = () => {
  const [filters, setFilters] = useState<Filters>({
    staffId: undefined,
    branchId: undefined,
    roleFilter: '',
    datePreset: 'month',
    customRange: presetToRange('month'),
  });
  const [activeRole, setActiveRole] = useState<RoleView>('all');

  const effectiveRange: DateRange =
    filters.datePreset === 'custom' ? filters.customRange : presetToRange(filters.datePreset);

  function handleRoleTabClick(role: RoleView) {
    setActiveRole(role);
    setFilters(f => ({
      ...f,
      roleFilter: role === 'all' ? '' : role,
      staffId: undefined,
    }));
  }

  const showMechanic   = activeRole === 'all' || activeRole === 'mechanic';
  const showSalesman   = activeRole === 'all' || activeRole === 'salesman';
  const showCashier    = activeRole === 'all' || activeRole === 'cashier';
  const showAccountant = activeRole === 'all' || activeRole === 'accountant';
  const showAdmin      = activeRole === 'all' || activeRole === 'admin';

  return (
    <OrganizationPageShell
      title="Progress Report"
      description="Per-staff performance data across roles. Mechanic, Salesman and Cashier data is live; Accountant and Admin require backend attribution updates."
    >
      {/* Top notice */}
      <BackendIntegrationNotice
        title="Progress Report — Phase 2 Live"
        description="Mechanic data: /api/repairs (technician_id). Salesman & Cashier data: /api/v1/reports/progress (created_by attribution). Select a staff member to view their metrics. Accountant and Admin sections remain pending."
        compact
      />

      {/* Filter Bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Role Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-1 overflow-x-auto">
        {ROLE_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleRoleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
                ${activeRole === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {!tab.hasData && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 font-bold leading-none">
                  Pending
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Report Content */}
      <div className="space-y-5">

        {showMechanic && (
          <MechanicReportCard
            staffId={filters.staffId}
            branchId={filters.branchId}
            dateRange={effectiveRange}
          />
        )}

        {showSalesman && (
          filters.staffId
            ? <ProgressReportCard
                staffId={filters.staffId}
                branchId={filters.branchId}
                dateRange={effectiveRange}
                role="salesman"
              />
            : <NoStaffSelectedCard role="salesman" icon={ShoppingCart} />
        )}

        {showCashier && (
          filters.staffId
            ? <ProgressReportCard
                staffId={filters.staffId}
                branchId={filters.branchId}
                dateRange={effectiveRange}
                role="cashier"
              />
            : <NoStaffSelectedCard role="cashier" icon={Banknote} />
        )}

        {showAccountant && (
          <BlockedRoleCard
            roleName="Accountant"
            icon={BookOpen}
            description="Ledger entries and accounting records do not have accountant_id attribution. Once the Ledger API supports per-user filtering, this section will show real accounting activity."
            requiredEndpoints={[
              'GET /api/ledger?accountant_id=:userId (pending)',
              'Ledger model: add accountant_id field (pending)',
            ]}
          />
        )}

        {showAdmin && (
          <BlockedRoleCard
            roleName="Admin"
            icon={Shield}
            description="Admin activity is tracked in the Audit Log, but the Audit Log API does not support filtering by admin user_id. Once that filter is added, admin activity can be surfaced here."
            requiredEndpoints={[
              'GET /api/audit-logs?user_id=:userId (pending)',
            ]}
          />
        )}
      </div>
    </OrganizationPageShell>
  );
};

export default OrganizationProgressReportPage;
