/**
 * StaffDetailDrawer — full-width slide-in drawer showing one staff member's
 * complete HR profile with 4 tabs:
 *   1. Attendance  — MonthlyAttendanceGrid + AttendanceMarkingDrawer
 *   2. Annual      — AnnualAttendanceSummary (12-month table)
 *   3. Pay         — Current Salary Config + Salary Config History
 *   4. Advances    — Advance history + Org Admin Approve & Disburse actions
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  BarChart2,
  DollarSign,
  CreditCard,
  Check,
  Loader2,
  History,
  AlertCircle,
  Mail,
  Coffee,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import type { BackendStaffMember, BackendAttendanceRecord } from '../types/hr.types';
import { MonthlyAttendanceGrid } from './MonthlyAttendanceGrid';
import { AttendanceMarkingDrawer, type AttendancePayload } from './AttendanceMarkingDrawer';
import { AnnualAttendanceSummary } from './AnnualAttendanceSummary';
import { HRStatusBadge, getKarachiTodayCanonical } from './ui/HRPrimitives';
import {
  useStaffAttendance,
  useAnnualAttendanceSummary,
  useMarkAttendance,
  useUpdateAttendance,
  useStaffSalaryConfig,
  useSalaryConfigHistory,
  useStaffAdvances,
  useApproveAdvance,
  useDisburseAdvance,
} from '../hooks/useHR';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'attendance' | 'annual' | 'pay' | 'advances';

interface Props {
  open: boolean;
  onClose: () => void;
  staff: BackendStaffMember | null;
  initialTab?: Tab;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'SHOP_ADMIN':
      return 'Shop Admin';
    case 'CASHIER':
      return 'Cashier';
    case 'SALESMAN':
      return 'Salesman';
    case 'MECHANIC':
    case 'REPAIR_MECHANIC':
      return 'Mechanic';
    default:
      return role ?? '—';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Karachi',
    });
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StaffDetailDrawer({ open, onClose, staff, initialTab = 'attendance' }: Props) {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';

  const today = new Date();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [attMonth, setAttMonth] = useState(today.getMonth() + 1);
  const [attYear, setAttYear] = useState(today.getFullYear());
  const [annualYear, setAnnualYear] = useState(today.getFullYear());

  // Attendance marking drawer state
  const [markingDate, setMarkingDate] = useState<string | null>(null);
  const [markingExisting, setMarkingExisting] = useState<BackendAttendanceRecord | undefined>(undefined);
  const [markingError, setMarkingError] = useState<string | null>(null);

  // Advance action state
  const [advanceActionError, setAdvanceActionError] = useState<string | null>(null);
  const [disbursingAdvanceId, setDisbursingAdvanceId] = useState<string | null>(null);
  const [disburseMethod, setDisburseMethod] = useState<string>('CASH');
  const [disburseRef, setDisburseRef] = useState<string>('');

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setMarkingDate(null);
      setMarkingExisting(undefined);
      setMarkingError(null);
      setAdvanceActionError(null);
      setDisbursingAdvanceId(null);
      setDisburseRef('');
    }
  }, [open, initialTab, staff?.user_id]);

  useEffect(() => {
    if (!open || markingDate) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, markingDate, onClose]);

  const staffId = staff?.user_id;

  // Data hooks
  const { data: attRecords = [], isLoading: attLoading } = useStaffAttendance(staffId, attMonth, attYear);
  const { data: annualData = [], isLoading: annualLoading } = useAnnualAttendanceSummary(staffId, annualYear);
  const { data: salaryConfig, isLoading: salaryLoading } = useStaffSalaryConfig(staffId);
  const {
    data: salaryHistory = [],
    isLoading: historyLoading,
    isError: historyError,
  } = useSalaryConfigHistory(staffId);
  const {
    data: advances = [],
    isLoading: advancesLoading,
    isError: advancesError,
  } = useStaffAdvances(staffId);

  // Mutation hooks
  const markMut = useMarkAttendance(staffId ?? '', attMonth, attYear);
  const updateMut = useUpdateAttendance(staffId ?? '', attMonth, attYear);
  const approveAdvMut = useApproveAdvance();
  const disburseAdvMut = useDisburseAdvance();

  const monthlyLeaves = useMemo(
    () => attRecords.filter((r) => r.status === 'LEAVE'),
    [attRecords]
  );

  function handleDayClick(date: string, existing?: BackendAttendanceRecord) {
    setMarkingDate(date);
    setMarkingExisting(existing);
    setMarkingError(null);
  }

  function handleAttendanceSubmit(payload: AttendancePayload) {
    setMarkingError(null);
    const isEdit = Boolean(payload.recordId);
    const promise = isEdit
      ? updateMut.mutateAsync({
          recordId: payload.recordId!,
          status: payload.status,
          check_in_at: payload.check_in_at,
          check_out_at: payload.check_out_at,
          notes: payload.notes,
        })
      : markMut.mutateAsync({
          attendance_date: payload.attendance_date,
          status: payload.status,
          check_in_at: payload.check_in_at,
          check_out_at: payload.check_out_at,
          notes: payload.notes,
        });

    promise
      .then(() => setMarkingDate(null))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to save attendance';
        setMarkingError(msg);
      });
  }

  async function handleApproveAdvance(advanceId: string) {
    setAdvanceActionError(null);
    try {
      await approveAdvMut.mutateAsync(advanceId);
    } catch (err: any) {
      setAdvanceActionError(err?.response?.data?.error || err?.message || 'Failed to approve advance');
    }
  }

  async function handleConfirmDisburse(advanceId: string) {
    setAdvanceActionError(null);
    try {
      await disburseAdvMut.mutateAsync({
        advanceId,
        payment_method: disburseMethod,
        disbursement_date: getKarachiTodayCanonical(),
        reference_number: disburseRef.trim() || undefined,
      });
      setDisbursingAdvanceId(null);
      setDisburseRef('');
    } catch (err: any) {
      setAdvanceActionError(err?.response?.data?.error || err?.message || 'Failed to disburse advance');
    }
  }

  if (!open || !staff) return null;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'attendance', label: 'Attendance', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'annual', label: 'Annual Report', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: 'pay', label: 'Pay & History', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: 'advances', label: 'Advances', icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Employee HR Profile"
        className="fixed right-0 top-0 h-full w-full max-w-2xl bg-gray-50 dark:bg-gray-950 shadow-2xl z-40 flex flex-col border-l border-gray-200 dark:border-gray-800"
      >
        {/* Drawer header */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-[#006970]/10 dark:bg-[#006970]/30 flex items-center justify-center text-[#006970] dark:text-[#33c9cf] font-bold text-sm shrink-0">
                {(staff.full_name ?? staff.username).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {staff.full_name ?? staff.username}
                  </h2>
                  <HRStatusBadge status={staff.is_active ? 'ACTIVE' : 'INACTIVE'} showIcon={false} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{roleLabel(staff.role)}</span>
                  {staff.branch_name && (
                    <>
                      <span>·</span>
                      <span>{staff.branch_name}</span>
                    </>
                  )}
                  {staff.created_at && (
                    <>
                      <span>·</span>
                      <span>Joined {formatDate(staff.created_at)}</span>
                    </>
                  )}
                </div>
                {staff.email && (
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <Mail className="w-3 h-3" />
                    <span>{staff.email}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close staff profile"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div role="tablist" className="flex gap-1 mt-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-[#006970] text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── Attendance Tab ── */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <MonthlyAttendanceGrid
                staffId={staff.user_id}
                month={attMonth}
                year={attYear}
                records={attRecords}
                isLoading={attLoading}
                onMonthChange={(m, y) => {
                  setAttMonth(m);
                  setAttYear(y);
                }}
                onDayClick={handleDayClick}
              />

              {/* Monthly Leave History */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      Leave History ({attMonth}/{attYear})
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
                    {monthlyLeaves.length} day{monthlyLeaves.length === 1 ? '' : 's'}
                  </span>
                </div>
                {monthlyLeaves.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-slate-400 italic">
                    No leave days recorded in {attMonth}/{attYear}.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {monthlyLeaves.map((lv) => (
                      <div key={lv.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {lv.attendance_date.slice(0, 10)}
                          </span>
                          <span className="ml-2 text-slate-500 dark:text-slate-400">
                            {lv.notes || 'Recorded Leave'}
                          </span>
                        </div>
                        <HRStatusBadge status="LEAVE" showIcon={false} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Annual Tab ── */}
          {activeTab === 'annual' && (
            <AnnualAttendanceSummary
              staffName={staff.full_name ?? staff.username}
              year={annualYear}
              data={annualData}
              isLoading={annualLoading}
              onYearChange={setAnnualYear}
            />
          )}

          {/* ── Pay & Salary History Tab (DEF-HR-07-B) ── */}
          {activeTab === 'pay' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Active Salary Configuration
                </h4>
                {salaryLoading ? (
                  <p className="text-xs text-gray-400 italic">Loading salary configuration...</p>
                ) : salaryConfig ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500 dark:text-gray-400">Type</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {salaryConfig.salary_type?.replace('_', ' ')}
                    </dd>
                    {salaryConfig.monthly_salary != null && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400">Monthly Base</dt>
                        <dd className="font-semibold text-gray-900 dark:text-white">
                          ₨ {Number(salaryConfig.monthly_salary).toLocaleString()}
                        </dd>
                      </>
                    )}
                    {salaryConfig.daily_rate != null && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400">Daily Rate</dt>
                        <dd className="font-semibold text-gray-900 dark:text-white">
                          ₨ {Number(salaryConfig.daily_rate).toLocaleString()}
                        </dd>
                      </>
                    )}
                    {salaryConfig.commission_percentage != null && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400">Commission</dt>
                        <dd className="font-semibold text-gray-900 dark:text-white">
                          {salaryConfig.commission_percentage}%
                        </dd>
                      </>
                    )}
                    <dt className="text-gray-500 dark:text-gray-400">OT Multiplier</dt>
                    <dd className="text-gray-900 dark:text-white">
                      {salaryConfig.overtime_multiplier ?? 1.5}×
                    </dd>
                    <dt className="text-gray-500 dark:text-gray-400">Effective From</dt>
                    <dd className="text-gray-900 dark:text-white">
                      {formatDate(salaryConfig.effective_from)}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    No active salary configuration set.
                  </p>
                )}
              </div>

              {/* Salary Configuration History Table */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Salary Configuration History
                  </h4>
                </div>
                {historyLoading ? (
                  <div className="p-6 text-center text-xs text-gray-400 italic">
                    Loading salary revision history...
                  </div>
                ) : historyError ? (
                  <div className="p-4 text-xs text-red-600 dark:text-red-400">
                    Failed to load salary configuration history.
                  </div>
                ) : salaryHistory.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-gray-400 italic">
                    No salary configuration revisions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800">
                        <tr>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5 text-right">Rate / Commission</th>
                          <th className="px-4 py-2.5 text-center">OT</th>
                          <th className="px-4 py-2.5">Effective From</th>
                          <th className="px-4 py-2.5">Effective To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {salaryHistory.map((cfg) => (
                          <tr key={cfg.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white">
                              {cfg.salary_type}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                              {cfg.salary_type === 'COMMISSION_PERCENTAGE'
                                ? `${cfg.commission_percentage ?? 0}%`
                                : `₨ ${Number(
                                    cfg.monthly_salary ?? cfg.daily_rate ?? cfg.hourly_rate ?? 0
                                  ).toLocaleString()}`}
                            </td>
                            <td className="px-4 py-2.5 text-center text-gray-500">
                              {cfg.overtime_multiplier ?? 1.5}×
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                              {formatDate(cfg.effective_from)}
                            </td>
                            <td className="px-4 py-2.5">
                              {cfg.effective_to ? (
                                <span className="text-gray-500">{formatDate(cfg.effective_to)}</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                  Active
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Advances Tab (DEF-HR-07-C) ── */}
          {activeTab === 'advances' && (
            <div className="space-y-3">
              {advanceActionError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{advanceActionError}</span>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Employee Advance History
                  </h4>
                </div>
                {advancesLoading ? (
                  <p className="px-4 py-6 text-xs text-gray-400 italic">Loading advance records...</p>
                ) : advancesError ? (
                  <p className="px-4 py-6 text-xs text-red-600">Failed to load advance history.</p>
                ) : advances.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 italic">
                    No advances recorded for this employee.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                          <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                          <th className="text-right px-4 py-2.5 font-semibold">Outstanding</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Reason</th>
                          {isOrgAdmin && <th className="text-right px-4 py-2.5 font-semibold">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {advances.map((adv) => (
                          <React.Fragment key={adv.id}>
                            <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                              <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                                {formatDate(adv.requested_date || adv.created_at)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                                ₨ {Number(adv.amount ?? 0).toLocaleString()}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">
                                ₨ {Number(adv.outstanding_amount ?? 0).toLocaleString()}
                              </td>
                              <td className="px-4 py-2.5">
                                <HRStatusBadge status={adv.status} showIcon={false} />
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-[160px] truncate">
                                {adv.reason ?? '—'}
                              </td>
                              {isOrgAdmin && (
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  {adv.status === 'PENDING' && (
                                    <button
                                      type="button"
                                      disabled={approveAdvMut.isPending}
                                      onClick={() => handleApproveAdvance(adv.id)}
                                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  {adv.status === 'APPROVED' && (
                                    <button
                                      type="button"
                                      onClick={() => setDisbursingAdvanceId(adv.id)}
                                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      Disburse
                                    </button>
                                  )}
                                  {adv.status !== 'PENDING' && adv.status !== 'APPROVED' && (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              )}
                            </tr>

                            {disbursingAdvanceId === adv.id && (
                              <tr className="bg-emerald-50/70 dark:bg-emerald-950/30">
                                <td colSpan={6} className="px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-emerald-800 dark:text-emerald-200">
                                        Disburse ₨ {Number(adv.amount ?? 0).toLocaleString()}:
                                      </span>
                                      <select
                                        value={disburseMethod}
                                        onChange={(e) => setDisburseMethod(e.target.value)}
                                        className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                                      >
                                        <option value="CASH">Cash</option>
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="EASYPAISA">EasyPaisa</option>
                                        <option value="JAZZCASH">JazzCash</option>
                                      </select>
                                      <input
                                        type="text"
                                        placeholder="Reference # (optional)"
                                        value={disburseRef}
                                        onChange={(e) => setDisburseRef(e.target.value)}
                                        className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs w-36"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={disburseAdvMut.isPending}
                                        onClick={() => handleConfirmDisburse(adv.id)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {disburseAdvMut.isPending ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Check className="w-3 h-3" />
                                        )}
                                        Confirm Disbursement
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDisbursingAdvanceId(null)}
                                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attendance marking sub-drawer */}
      <AttendanceMarkingDrawer
        open={markingDate !== null}
        onClose={() => setMarkingDate(null)}
        staffName={staff.full_name ?? staff.username}
        staffId={staff.user_id}
        date={markingDate ?? ''}
        existing={markingExisting}
        month={attMonth}
        year={attYear}
        onSubmit={handleAttendanceSubmit}
        isSubmitting={markMut.isPending || updateMut.isPending}
        submitError={markingError}
      />
    </>
  );
}
