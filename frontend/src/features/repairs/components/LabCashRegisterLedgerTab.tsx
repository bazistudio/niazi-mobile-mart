'use client';

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Package,
  UserCheck,
  Calendar,
  Download,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  Banknote,
  Search,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import type { RepairJob } from '../types/repair.types';
import { useStaffSalaryConfig } from '@/features/hr/hooks/useHR';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { CashSessionOpenModal } from '@/features/cash/components/CashSessionOpenModal';
import { CashSessionCloseModal } from '@/features/cash/components/CashSessionCloseModal';
import { CashAdjustmentModal } from '@/features/cash/components/CashAdjustmentModal';
import { ExpenseCreateModal } from '@/features/expenses/components/ExpenseCreateModal';
import { useCashStore } from '@/features/cash/store/cash.store';

interface LabCashRegisterLedgerTabProps {
  jobs: RepairJob[];
  mechanicFilter: string;
}

export type LabDateRange = 'today' | 'last7' | 'last10' | 'monthly' | 'all';

export const LabCashRegisterLedgerTab: React.FC<LabCashRegisterLedgerTabProps> = ({
  jobs,
  mechanicFilter,
}) => {
  const currentUser = useAuthStore((s) => s.user);
  const isMechanicUser = currentUser?.role === 'REPAIR_MECHANIC';
  const effectiveTechId = isMechanicUser && currentUser?.id ? currentUser.id : mechanicFilter;

  const [dateRange, setDateRange] = useState<LabDateRange>('last7');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Cash Action Modals
  const [isOpenSessionModalOpen, setIsOpenSessionModalOpen] = useState(false);
  const [isCloseSessionModalOpen, setIsCloseSessionModalOpen] = useState(false);
  const [isCashInModalOpen, setIsCashInModalOpen] = useState(false);
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const { currentSession, fetchCurrentState } = useCashStore();

  // Ensure current cash session is fetched on tab mount
  React.useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  // Fetch mechanic salary/commission config
  const { data: salaryConfig } = useStaffSalaryConfig(effectiveTechId || undefined);
  const mechanicCommissionPct =
    salaryConfig?.salary_type === 'COMMISSION_PERCENTAGE' && salaryConfig.commission_percentage !== null
      ? Number(salaryConfig.commission_percentage)
      : 60; // Standard 60%
  const orgSharePct = 100 - mechanicCommissionPct;

  // Filter jobs by date range
  const filteredJobs = useMemo(() => {
    const now = new Date();
    let startDate = subDays(now, 7);

    if (dateRange === 'today') {
      startDate = startOfDay(now);
    } else if (dateRange === 'last7') {
      startDate = subDays(now, 7);
    } else if (dateRange === 'last10') {
      startDate = subDays(now, 10);
    } else if (dateRange === 'monthly') {
      startDate = subDays(now, 30);
    } else if (dateRange === 'all') {
      startDate = new Date(0);
    }

    return jobs.filter((j) => {
      const created = new Date(j.createdAt || (j as any).created_at || now);
      const inDate = isWithinInterval(created, { start: startOfDay(startDate), end: endOfDay(now) });
      if (!inDate) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesQuery =
          j.jobId?.toLowerCase().includes(q) ||
          j.device?.brand?.toLowerCase().includes(q) ||
          j.device?.model?.toLowerCase().includes(q) ||
          (j.customerId as any)?.name?.toLowerCase().includes(q) ||
          (j as any).customer_name?.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [jobs, dateRange, searchTerm]);

  // Extract all payments across filtered jobs (Lab Cash Register Entries)
  const labPayments = useMemo(() => {
    const list: Array<{
      id: string;
      jobId: string;
      customer: string;
      device: string;
      amount: number;
      method: string;
      reference?: string;
      date: string;
      status: string;
    }> = [];

    for (const job of filteredJobs) {
      const payments = (job.payments as Array<any>) || [];
      for (const p of payments) {
        if (methodFilter !== 'ALL' && (p.method || '').toUpperCase() !== methodFilter.toUpperCase()) {
          continue;
        }
        list.push({
          id: p._id || p.id || Math.random().toString(),
          jobId: job.jobId,
          customer: (job.customerId as any)?.name || (job as any).customer_name || 'Walk-in Customer',
          device: `${job.device?.brand || ''} ${job.device?.model || ''}`.trim(),
          amount: Number(p.amount || 0),
          method: p.method || 'CASH',
          reference: p.reference,
          date: p.timestamp || (p as any).created_at || job.createdAt,
          status: job.status,
        });
      }
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredJobs, methodFilter]);

  // Aggregate Figures
  const totalCashCollected = labPayments
    .filter((p) => p.method.toUpperCase() === 'CASH')
    .reduce((s, p) => s + p.amount, 0);

  const totalDigitalCollected = labPayments
    .filter((p) => p.method.toUpperCase() !== 'CASH')
    .reduce((s, p) => s + p.amount, 0);

  const totalAllCollections = totalCashCollected + totalDigitalCollected;

  // Ledger Summary Calculations (Job by Job breakdown)
  const ledgerEntries = useMemo(() => {
    return filteredJobs
      .filter((j) => j.status === 'Delivered' || j.status === 'Ready for Pickup')
      .map((job) => {
        const billed = Number(job.grandTotal || job.estimatedCost || 0);
        const parts = ((job.partsUsed as Array<any>) || []).reduce(
          (sum, p) => sum + Number(p.qty || 1) * Number(p.price || p.cost || 0),
          0
        );
        const margin = Math.max(0, billed - parts);
        const mechanicEarn = Math.floor((margin * mechanicCommissionPct) / 100);
        const shopEarn = margin - mechanicEarn;
        const paid = Number(job.totalPaid || 0);
        const balance = Math.max(0, billed - paid);

        return {
          id: job.id || job._id,
          jobId: job.jobId,
          date: job.updatedAt || job.createdAt,
          customer: (job.customerId as any)?.name || (job as any).customer_name || 'Walk-in',
          device: `${job.device?.brand || ''} ${job.device?.model || ''}`.trim(),
          billed,
          parts,
          margin,
          mechanicEarn,
          shopEarn,
          paid,
          balance,
          status: job.status,
        };
      });
  }, [filteredJobs, mechanicCommissionPct]);

  // Total Commission Earned across filtered completed jobs
  const totalMechanicEarned = ledgerEntries.reduce((s, e) => s + e.mechanicEarn, 0);
  const totalPartsDeduction = ledgerEntries.reduce((s, e) => s + e.parts, 0);
  const totalShopShare = ledgerEntries.reduce((s, e) => s + e.shopEarn, 0);

  // Shop Net Handover: (Total Collected - Mechanic Earned)
  const netDueToShop = Math.max(0, totalAllCollections - totalMechanicEarned);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Action Bar (Replaced Banner with Full Control Buttons) */}
      <div className="p-3 bg-surface border border-border rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Session Status & Config Indicator */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                currentSession?.status === 'OPEN' ? 'bg-success animate-pulse' : 'bg-warning'
              }`}
            />
            <span className="text-xs font-bold text-text-primary">
              Lab Session: {currentSession?.status === 'OPEN' ? 'ACTIVE (OPEN)' : 'NO ACTIVE SESSION'}
            </span>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
            Commission: {mechanicCommissionPct}%
          </span>
        </div>

        {/* Right: Cash Action Buttons (Session Open, Close, Cash In, Cash Out, Expense) */}
        <div className="flex items-center gap-2 flex-wrap">
          {currentSession?.status === 'OPEN' ? (
            <button
              type="button"
              onClick={() => setIsCloseSessionModalOpen(true)}
              className="h-8 px-3 rounded-lg text-xs font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/30 transition-all flex items-center gap-1.5 shadow-xs"
              title="Close current session and reconcile register"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Close Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpenSessionModalOpen(true)}
              className="h-8 px-3 rounded-lg text-xs font-bold bg-success text-white hover:bg-success-hover transition-all flex items-center gap-1.5 shadow-xs"
              title="Open a new cash session for lab"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Open Session</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCashInModalOpen(true)}
            className="h-8 px-3 rounded-lg text-xs font-bold bg-surface-hover text-success border border-border hover:border-success/50 transition-all flex items-center gap-1.5 shadow-xs"
            title="Deposit cash / petty cash into lab register"
          >
            <Banknote className="w-3.5 h-3.5 text-success" />
            <span>Cash In</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCashOutModalOpen(true)}
            className="h-8 px-3 rounded-lg text-xs font-bold bg-surface-hover text-warning border border-border hover:border-warning/50 transition-all flex items-center gap-1.5 shadow-xs"
            title="Withdraw cash / drawer drop"
          >
            <CreditCard className="w-3.5 h-3.5 text-warning" />
            <span>Cash Out</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="h-8 px-3 rounded-lg text-xs font-bold bg-surface-hover text-text-primary border border-border hover:border-primary/50 transition-all flex items-center gap-1.5 shadow-xs"
            title="Record lab consumable or shop operational expense"
          >
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span>Expense</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Card 1: Physical Cash in Lab Drawer */}
        <div className="bg-surface rounded-xl p-3 border border-border shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1">
            <span>Cash in Hand (Lab)</span>
            <Banknote className="w-3.5 h-3.5 text-success" />
          </div>
          <div className="text-base font-black text-success tabular-nums">
            Rs {totalCashCollected.toLocaleString()}
          </div>
          <span className="text-[10px] text-text-muted">Physical bench cash hold</span>
        </div>

        {/* Card 2: Digital Wallets */}
        <div className="bg-surface rounded-xl p-3 border border-border shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1">
            <span>Online / Wallets</span>
            <CreditCard className="w-3.5 h-3.5 text-info" />
          </div>
          <div className="text-base font-black text-info tabular-nums">
            Rs {totalDigitalCollected.toLocaleString()}
          </div>
          <span className="text-[10px] text-text-muted">EasyPaisa, JazzCash, Bank</span>
        </div>

        {/* Card 3: Mechanic Commission Earned */}
        <div className="bg-surface rounded-xl p-3 border border-border shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1">
            <span>Mechanic Earnings</span>
            <UserCheck className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-base font-black text-primary tabular-nums">
            Rs {totalMechanicEarned.toLocaleString()}
          </div>
          <span className="text-[10px] text-text-muted">{mechanicCommissionPct}% profit share earned</span>
        </div>

        {/* Card 4: Parts Cost Recovery */}
        <div className="bg-surface rounded-xl p-3 border border-border shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1">
            <span>Parts Cost Due</span>
            <Package className="w-3.5 h-3.5 text-warning" />
          </div>
          <div className="text-base font-black text-warning tabular-nums">
            Rs {totalPartsDeduction.toLocaleString()}
          </div>
          <span className="text-[10px] text-text-muted">Org inventory protected value</span>
        </div>

        {/* Card 5: Net Handover Due to Shop */}
        <div className="bg-surface rounded-xl p-3 border border-border shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-text-muted mb-1">
            <span>Net Due to Admin</span>
            <DollarSign className="w-3.5 h-3.5 text-text-primary" />
          </div>
          <div className="text-base font-black text-text-primary tabular-nums">
            Rs {netDueToShop.toLocaleString()}
          </div>
          <span className="text-[10px] text-text-muted">To transfer upon session close</span>
        </div>
      </div>

      {/* Control Bar: Date Range Filter & Search */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface p-2.5 rounded-xl border border-border text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Session Period:
          </span>
          {(['today', 'last7', 'last10', 'monthly', 'all'] as LabDateRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDateRange(r)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                dateRange === r
                  ? 'bg-primary text-text-inverse font-bold'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {r === 'today'
                ? 'Today'
                : r === 'last7'
                ? 'Last 7 Days'
                : r === 'last10'
                ? 'Last 10 Days'
                : r === 'monthly'
                ? 'Monthly (30d)'
                : 'All Time'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by Job / Model / Customer..."
              className="h-7 pl-7 pr-2 rounded-lg bg-surface-hover border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="h-7 px-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface-hover text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* DUAL WORKSPACE: Left = Lab Cash Register, Right = Mechanic Commission Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* =================================================================
            LEFT COLUMN (50%): Lab Cash Register (Physical Bench & Wallet Log)
           ================================================================= */}
        <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-surface-hover/60 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-success" />
              <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Lab Cash Register (Bench Hold)
              </span>
            </div>
            <div className="flex items-center gap-1">
              {(['ALL', 'CASH', 'EASYPAISA', 'JAZZCASH'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethodFilter(m)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    methodFilter === m
                      ? 'bg-success text-white'
                      : 'bg-surface text-text-muted hover:text-text-primary border border-border'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-hover/80 border-b border-border text-[10px] uppercase text-text-muted font-semibold sticky top-0">
                <tr>
                  <th className="px-3 py-2">Date / Time</th>
                  <th className="px-3 py-2">Job ID &amp; Device</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-center">Method</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {labPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      No cash register intake recorded in this session period.
                    </td>
                  </tr>
                ) : (
                  labPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-3 py-2 text-text-muted font-mono text-[10px] whitespace-nowrap">
                        {p.date ? format(new Date(p.date), 'dd MMM, hh:mm a') : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">
                        <span className="font-bold text-primary font-mono">{p.jobId}</span>
                        <div className="text-[10px] text-text-muted">{p.device}</div>
                      </td>
                      <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{p.customer}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            p.method.toUpperCase() === 'CASH'
                              ? 'bg-success/15 text-success border border-success/30'
                              : 'bg-info/15 text-info border border-info/30'
                          }`}
                        >
                          {p.method}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-black text-text-primary tabular-nums whitespace-nowrap">
                        Rs {p.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-surface-hover/80 border-t border-border flex justify-between items-center text-xs font-bold mt-auto">
            <span className="text-text-muted">Total Lab Intake ({labPayments.length} entries)</span>
            <span className="text-success text-sm tabular-nums">
              Rs {totalAllCollections.toLocaleString()}
            </span>
          </div>
        </div>

        {/* =================================================================
            RIGHT COLUMN (50%): Mechanic Commission & Settlement Ledger
           ================================================================= */}
        <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-surface-hover/60 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Mechanic Commission &amp; Settlement Ledger
              </span>
            </div>
            <span className="text-[10px] text-text-muted">
              {ledgerEntries.length} completed jobs
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-hover/80 border-b border-border text-[10px] uppercase text-text-muted font-semibold sticky top-0">
                <tr>
                  <th className="px-3 py-2">Job &amp; Device</th>
                  <th className="px-3 py-2 text-right">Billed</th>
                  <th className="px-3 py-2 text-right">Parts</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                  <th className="px-3 py-2 text-right text-success">Mechanic ({mechanicCommissionPct}%)</th>
                  <th className="px-3 py-2 text-right text-info">Shop ({orgSharePct}%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                      No settled repair jobs found for this period.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-bold text-primary font-mono">{e.jobId}</span>
                        <div className="text-[10px] text-text-muted">{e.device}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                        Rs {e.billed.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-warning tabular-nums whitespace-nowrap">
                        Rs {e.parts.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-text-primary tabular-nums whitespace-nowrap">
                        Rs {e.margin.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-success tabular-nums whitespace-nowrap bg-success/5">
                        Rs {e.mechanicEarn.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-info tabular-nums whitespace-nowrap">
                        Rs {e.shopEarn.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-surface-hover/80 border-t border-border flex justify-between items-center text-xs font-bold mt-auto">
            <span className="text-text-muted">Total Mechanic Earning</span>
            <span className="text-primary text-sm tabular-nums">
              Rs {totalMechanicEarned.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Cash Management Modals */}
      <CashSessionOpenModal
        isOpen={isOpenSessionModalOpen}
        onClose={() => setIsOpenSessionModalOpen(false)}
      />

      <CashSessionCloseModal
        isOpen={isCloseSessionModalOpen}
        onClose={() => setIsCloseSessionModalOpen(false)}
      />

      <CashAdjustmentModal
        isOpen={isCashInModalOpen}
        onClose={() => setIsCashInModalOpen(false)}
      />

      <CashAdjustmentModal
        isOpen={isCashOutModalOpen}
        onClose={() => setIsCashOutModalOpen(false)}
      />

      <ExpenseCreateModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
      />
    </div>
  );
};
