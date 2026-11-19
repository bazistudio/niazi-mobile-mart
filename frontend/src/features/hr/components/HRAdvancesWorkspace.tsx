'use client';

import React, { useState, useMemo } from 'react';
import {
  Banknote,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  Wallet,
  RotateCcw,
  Building2,
  Search,
  History,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import type { BackendOrgAdvance, BackendStaffMember } from '../types/hr.types';
import {
  useOrgAdvances,
  useApproveAdvance,
  useDisburseAdvance,
  useHRStaff,
} from '../hooks/useHR';
import { useBranches } from '../hooks/useBranches';
import { getKarachiTodayCanonical } from './DailyAttendanceAndLeavePage';
import { StaffAdvanceForm } from './StaffAdvanceForm';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import {
  HRSectionCard,
  HRStatCard,
  HRStatusBadge,
  HRConfirmDialog,
  HREmptyState,
  HRBanner,
} from './ui/HRPrimitives';

function formatPKR(val: number): string {
  return `₨ ${Math.round(val).toLocaleString('en-PK')}`;
}

interface HRAdvancesWorkspaceProps {
  showForm?: boolean;
  onCloseForm?: () => void;
}

export const HRAdvancesWorkspace: React.FC<HRAdvancesWorkspaceProps> = ({
  showForm: externalShowForm,
  onCloseForm,
}) => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const { branches } = useBranches();

  const [internalShowForm, setInternalShowForm] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [confirmApproveTarget, setConfirmApproveTarget] = useState<BackendOrgAdvance | null>(null);
  const [disbursingId, setDisbursingId] = useState<string | null>(null);
  const [disburseMethod, setDisburseMethod] = useState<string>('CASH');
  const [disburseDate, setDisburseDate] = useState<string>(() => getKarachiTodayCanonical());
  const [disburseRef, setDisburseRef] = useState<string>('');
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const [historyStaff, setHistoryStaff] = useState<BackendStaffMember | null>(null);

  const showForm = externalShowForm !== undefined ? externalShowForm : internalShowForm;
  const setShowForm = (val: boolean) => {
    if (externalShowForm !== undefined && onCloseForm && !val) {
      onCloseForm();
    } else {
      setInternalShowForm(val);
    }
  };

  const effectiveBranch = isOrgAdmin ? branchFilter || null : user?.shopId ?? null;

  // Fetch all org/branch advances so 5 financial KPI totals remain accurate regardless of active status filter
  const {
    data: advances = [],
    isLoading,
    isError,
    refetch,
  } = useOrgAdvances(effectiveBranch, null);
  const { data: hrStaff = [] } = useHRStaff(effectiveBranch);

  const approveMut = useApproveAdvance();
  const disburseMut = useDisburseAdvance();

  const filteredAdvances = useMemo(() => {
    return advances.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (a.user_name || '').toLowerCase().includes(q) ||
        (a.username || '').toLowerCase().includes(q) ||
        (a.reason || '').toLowerCase().includes(q) ||
        (a.branch_name || '').toLowerCase().includes(q)
      );
    });
  }, [advances, statusFilter, searchQuery]);

  // Financial separation metrics
  const advanceMetrics = useMemo(() => {
    let pendingAmt = 0,
      pendingCount = 0;
    let approvedAmt = 0,
      approvedCount = 0;
    let disbursedAmt = 0,
      recoveredAmt = 0,
      outstandingAmt = 0;

    for (const a of advances) {
      const amt = Number(a.amount ?? 0);
      const rec = Number(a.recovered_amount ?? 0);
      const out = Number(a.outstanding_amount ?? amt - rec);
      if (a.status === 'PENDING') {
        pendingAmt += amt;
        pendingCount++;
      } else if (a.status === 'APPROVED') {
        approvedAmt += amt;
        approvedCount++;
      } else if (a.status === 'DISBURSED' || a.status === 'RECOVERED') {
        disbursedAmt += amt;
        recoveredAmt += rec;
        outstandingAmt += Math.max(0, out);
      }
    }

    return {
      pendingAmt,
      pendingCount,
      approvedAmt,
      approvedCount,
      disbursedAmt,
      recoveredAmt,
      outstandingAmt,
    };
  }, [advances]);

  const handleConfirmApprove = async () => {
    if (!confirmApproveTarget) return;
    setActionBanner(null);
    try {
      await approveMut.mutateAsync(confirmApproveTarget.id);
      setActionBanner({
        type: 'success',
        msg: `Approved ₨ ${Number(confirmApproveTarget.amount).toLocaleString('en-PK')} advance for ${
          confirmApproveTarget.user_name || confirmApproveTarget.username
        }.`,
      });
      setConfirmApproveTarget(null);
    } catch (err: any) {
      setActionBanner({
        type: 'error',
        msg: err?.response?.data?.error || err?.message || 'Failed to approve advance.',
      });
      setConfirmApproveTarget(null);
    }
  };

  const handleConfirmDisburse = async (adv: BackendOrgAdvance) => {
    setActionBanner(null);
    try {
      await disburseMut.mutateAsync({
        advanceId: adv.id,
        payment_method: disburseMethod,
        disbursement_date: disburseDate || getKarachiTodayCanonical(),
        reference_number: disburseRef.trim() || undefined,
      });
      setDisbursingId(null);
      setDisburseRef('');
      setActionBanner({
        type: 'success',
        msg: `Disbursed ₨ ${Number(adv.amount).toLocaleString('en-PK')} via ${disburseMethod}.`,
      });
    } catch (err: any) {
      setActionBanner({
        type: 'error',
        msg: err?.response?.data?.error || err?.message || 'Failed to disburse advance.',
      });
    }
  };

  const openAdvanceHistoryDrawer = (adv: BackendOrgAdvance) => {
    const matched = hrStaff.find((s) => s.user_id === adv.user_id);
    if (matched) {
      setHistoryStaff(matched);
    } else {
      setHistoryStaff({
        user_id: adv.user_id,
        username: adv.username || adv.user_id,
        full_name: adv.user_name || adv.username || adv.user_id,
        email: null,
        role: adv.user_role || 'STAFF',
        branch_id: adv.branch_id,
        branch_name: adv.branch_name ?? null,
        is_active: true,
        created_at: '',
      });
    }
  };

  return (
    <div className="space-y-5">
      {actionBanner && (
        <HRBanner
          type={actionBanner.type}
          message={actionBanner.msg}
          onDismiss={() => setActionBanner(null)}
        />
      )}

      {/* Accounting Separation Indicator */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#006970] dark:text-[#33c9cf] shrink-0" />
          <span>
            <strong className="text-slate-900 dark:text-white">Payroll Advance Ledger:</strong>{' '}
            Staff salary advances are tracked strictly per employee in{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
              staff_advances
            </code>{' '}
            for payroll recovery — separate from customer credit balances and POS registers.
          </span>
        </div>
      </div>

      {/* 5 Financial KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <HRStatCard
          label="Pending Requests"
          value={formatPKR(advanceMetrics.pendingAmt)}
          subtext={`${advanceMetrics.pendingCount} awaiting approval`}
          icon={<Clock className="w-4 h-4" />}
          tone="amber"
          loading={isLoading}
        />
        <HRStatCard
          label="Approved (Unpaid)"
          value={formatPKR(advanceMetrics.approvedAmt)}
          subtext={`${advanceMetrics.approvedCount} ready for disbursement`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="sky"
          loading={isLoading}
        />
        <HRStatCard
          label="Total Disbursed"
          value={formatPKR(advanceMetrics.disbursedAmt)}
          subtext="Cash / transfer issued"
          icon={<Banknote className="w-4 h-4" />}
          tone="teal"
          loading={isLoading}
        />
        <HRStatCard
          label="Repaid / Recovered"
          value={formatPKR(advanceMetrics.recoveredAmt)}
          subtext="Settled via salary deductions"
          icon={<RotateCcw className="w-4 h-4" />}
          tone="emerald"
          loading={isLoading}
        />
        <HRStatCard
          label="Outstanding Balance"
          value={formatPKR(advanceMetrics.outstandingAmt)}
          subtext="Remaining employee receivable"
          icon={<Wallet className="w-4 h-4" />}
          tone="violet"
          loading={isLoading}
        />
      </div>

      {/* Advances Register Card */}
      <HRSectionCard
        title={`Staff Advance Register (${filteredAdvances.length})`}
        subtitle="Submit requests, approve amounts, record disbursements, and monitor payroll recovery balances"
        icon={<Banknote className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {showForm ? 'Close Form' : 'New Advance Request'}
            </button>
          </div>
        }
        noPadding
      >
        {showForm && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30">
            <StaffAdvanceForm
              onCancel={() => setShowForm(false)}
              onSuccess={() => {
                void refetch();
              }}
            />
          </div>
        )}

        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee or reason…"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <select
            aria-label="Filter advances by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved (Unpaid)</option>
            <option value="DISBURSED">Disbursed</option>
            <option value="RECOVERED">Recovered</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {isOrgAdmin && branches.length > 0 && (
            <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Filter advances by branch"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full text-xs bg-transparent text-slate-900 dark:text-white focus:outline-none"
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
        </div>

        {isError ? (
          <div className="p-5">
            <HRBanner
              type="error"
              message="Could not fetch advance records from /api/v1/hr/advances."
            />
          </div>
        ) : isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading staff advances from PostgreSQL…
          </div>
        ) : filteredAdvances.length === 0 ? (
          <div className="p-6">
            <HREmptyState
              icon={<Banknote className="w-5 h-5" />}
              title="No advance requests found"
              description="Click 'New Advance Request' above to submit a staff advance or clear your status filter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Employee &amp; Branch</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Requested</th>
                  <th className="px-3 py-3 text-right">Recovered</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAdvances.map((adv) => (
                  <React.Fragment key={adv.id}>
                    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {adv.user_name || adv.username || adv.user_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {adv.branch_name || 'Organization Scope'}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                        {(adv.requested_date || adv.created_at || '').slice(0, 10)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatPKR(Number(adv.amount ?? 0))}
                      </td>
                      <td className="px-3 py-3.5 text-right text-emerald-600 dark:text-emerald-400 tabular-nums font-medium">
                        {formatPKR(Number(adv.recovered_amount ?? 0))}
                      </td>
                      <td className="px-3 py-3.5 text-right text-amber-600 dark:text-amber-400 tabular-nums font-semibold">
                        {formatPKR(
                          Number(
                            adv.outstanding_amount ??
                              Math.max(0, Number(adv.amount ?? 0) - Number(adv.recovered_amount ?? 0))
                          )
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                        {adv.reason || '—'}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <HRStatusBadge status={adv.status} showIcon={false} />
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {isOrgAdmin && adv.status === 'PENDING' && (
                            <button
                              type="button"
                              disabled={approveMut.isPending}
                              onClick={() => setConfirmApproveTarget(adv)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#006970] hover:bg-[#005a60] text-white disabled:opacity-50 cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {isOrgAdmin && adv.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() =>
                                setDisbursingId(disbursingId === adv.id ? null : adv.id)
                              }
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              Disburse
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openAdvanceHistoryDrawer(adv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="View employee advance & repayment history"
                          >
                            <History className="w-3 h-3" />
                            History
                          </button>
                        </div>
                      </td>
                    </tr>

                    {disbursingId === adv.id && isOrgAdmin && (
                      <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="font-semibold text-emerald-800 dark:text-emerald-300 mr-2">
                              Disburse {formatPKR(Number(adv.amount ?? 0))}:
                            </span>
                            <select
                              aria-label="Disbursement payment method"
                              value={disburseMethod}
                              onChange={(e) => setDisburseMethod(e.target.value)}
                              className="h-8 px-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                            >
                              <option value="CASH">Cash</option>
                              <option value="BANK_TRANSFER">Bank Transfer</option>
                              <option value="EASYPAISA">EasyPaisa</option>
                              <option value="JAZZCASH">JazzCash</option>
                            </select>
                            <input
                              type="date"
                              aria-label="Disbursement date"
                              value={disburseDate}
                              onChange={(e) => setDisburseDate(e.target.value)}
                              className="h-8 px-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                            />
                            <input
                              type="text"
                              value={disburseRef}
                              onChange={(e) => setDisburseRef(e.target.value)}
                              placeholder="Ref / receipt # (optional)"
                              className="h-8 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                            />
                            <button
                              type="button"
                              disabled={disburseMut.isPending}
                              onClick={() => void handleConfirmDisburse(adv)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                            >
                              {disburseMut.isPending ? 'Saving…' : 'Confirm Disbursement'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDisbursingId(null)}
                              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                              Cancel
                            </button>
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
      </HRSectionCard>

      {/* Approve Confirmation Dialog */}
      <HRConfirmDialog
        open={confirmApproveTarget !== null}
        title="Approve Staff Salary Advance"
        description="Once approved, this advance becomes eligible for cash/transfer disbursement and future payroll recovery."
        details={
          confirmApproveTarget
            ? [
                {
                  label: 'Employee',
                  value:
                    confirmApproveTarget.user_name ||
                    confirmApproveTarget.username ||
                    confirmApproveTarget.user_id,
                },
                {
                  label: 'Requested Amount',
                  value: formatPKR(Number(confirmApproveTarget.amount ?? 0)),
                },
                { label: 'Reason', value: confirmApproveTarget.reason || '—' },
              ]
            : undefined
        }
        confirmLabel="Confirm Approval"
        isPending={approveMut.isPending}
        onConfirm={handleConfirmApprove}
        onCancel={() => setConfirmApproveTarget(null)}
      />

      {/* Employee Advance History Drawer */}
      <StaffDetailDrawer
        open={historyStaff !== null}
        onClose={() => setHistoryStaff(null)}
        staff={historyStaff}
        initialTab="advances"
      />
    </div>
  );
};
