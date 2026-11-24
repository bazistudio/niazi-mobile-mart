/**
 * SalesAnalyticsPage — Live Analytics Implementation
 *
 * Premium business intelligence dashboard for Niazi Mobile Mart.
 * Six tabs connected to live backend APIs and authenticated queries.
 *
 * Data layer: src/features/sales-analytics/services/
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesAnalyticsApi } from '@/features/sales-analytics/services/salesAnalytics.api';
import { Link } from 'react-router-dom';
import {
  TrendingUp, BarChart2, Wrench, Smartphone, PackageX, FileText,
  RefreshCw, ArrowUpRight, ArrowDownRight, X,
  AlertTriangle, CheckCircle, Clock, AlertCircle, Info,
  Search, ChevronRight, ChevronLeft,
  Building2, CalendarDays, Eye, RotateCcw,
} from 'lucide-react';

import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { SharedChart } from '@/components/charts/SharedChart';
import { formatPkr } from '@/features/organization/utils/dashboardDates';
import { formatChartValue } from '@/components/charts/formatters';

import {
  type AnalyticsViewData,
  type TabId,
  type TrendPeriod,
  type LiveTransaction as MockTransaction,
  type LiveProduct as MockProduct,
  type LiveRepairJob as MockRepairJob,
  type LiveMobileDevice as MockMobileDevice,
  type LiveLossEvent as MockLossEvent,
  type LiveSupplierClaim as MockSupplierClaim,
  type LiveReconciliationRow as MockReconciliationRow,
} from '@/features/sales-analytics/services/salesAnalytics.types';
import { buildLiveAnalyticsViewData } from '@/features/sales-analytics/services/salesAnalytics.adapter';
import { useSalesAnalyticsData } from '@/features/sales-analytics/hooks/useSalesAnalyticsData';
import { resolveDateRange, type DashboardDatePreset } from '@/features/organization/utils/dashboardDates';
import { useOrganizationStore } from '@/store/useOrganizationStore';

// ─── Utility helpers ──────────────────────────────────────────────────────────

function pct(n: number, digits = 1) { return `${n.toFixed(digits)}%`; }
function clsx(...args: (string | false | null | undefined)[]) { return args.filter(Boolean).join(' '); }
function formatCompactPkr(v: number): string {
  return formatChartValue(v, 'compact', 'Rs');
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function LiveStatusBanner({
  isLoading = false,
  isLive = false,
  isError = false,
  recordCount = 0,
}: {
  isLoading?: boolean;
  isLive?: boolean;
  isError?: boolean;
  recordCount?: number;
}) {
  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700/50 select-none">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
        <span>FETCHING LIVE DATA…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/50 select-none">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>API CONNECTION ERROR</span>
      </div>
    );
  }
  if (isLive) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/50 select-none">
        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
        <span>LIVE DATA CONNECTED</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 select-none">
      <Info className="w-3.5 h-3.5 shrink-0" />
      <span>{recordCount > 0 ? `${recordCount} RECORDS LOADED` : 'NO TRANSACTIONS'}</span>
    </div>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-text-muted">—</span>;
  const up = delta >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-success' : 'text-danger')}>
      <Icon className="w-3 h-3 shrink-0" />{Math.abs(delta)}%
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    delivered: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    matched: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    recovered: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    sold: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    in_stock: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    claim_accepted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    accepted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    open: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    transferred: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
    closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    partial: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    pending_payment: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    in_progress: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    waiting_parts: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    claim_submitted: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    submitted: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    quarantined: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    inspected: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    reported: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    review: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    returned: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    cancelled: 'bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400',
    written_off: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    rejected: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    unmatched: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    claim_rejected: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    reserved: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  };
  const cls = map[status] ?? 'bg-gray-100 dark:bg-gray-700/40 text-gray-500';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-surface border border-border rounded-xl shadow-card', className)}>
      {children}
    </div>
  );
}

function CardHeader({ title, badge, action }: { title: string; badge?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-border">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {badge && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{badge}</span>}
      </div>
      {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

function KpiCard({
  title, value, sub, delta, accent,
}: { title: string; value: string; sub?: string; delta?: number | null; accent?: 'green' | 'red' | 'blue' | 'amber' }) {
  const borderClass = { green: 'border-l-success', red: 'border-l-danger', blue: 'border-l-info', amber: 'border-l-warning' }[accent ?? 'green'] ?? 'border-l-primary';
  return (
    <Card className={clsx('p-4 sm:p-5 border-l-4 min-w-0', borderClass)}>
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5 truncate">{title}</p>
      <p className="text-xl xl:text-[22px] font-bold text-text-primary leading-tight tabular-nums truncate">{value}</p>
      {(sub || delta !== undefined) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap min-w-0">
          {sub && <span className="text-xs text-text-muted truncate">{sub}</span>}
          {delta !== undefined && <Delta delta={delta} />}
        </div>
      )}
    </Card>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        aria-label={placeholder ?? 'Search'}
        className="pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary w-full"
      />
    </div>
  );
}

// ─── Modal / Drawer ───────────────────────────────────────────────────────────

function Drawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-overlay" />
      <div
        className="relative w-full max-w-lg bg-surface h-full overflow-y-auto shadow-modal flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

function DrawerRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary min-w-0 mr-4">{label}</span>
      <span className={clsx('text-sm font-medium text-text-primary text-right', valueClass)}>{value}</span>
    </div>
  );
}

// ─── Tab 1: Business Overview ─────────────────────────────────────────────────

function OverviewTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { kpis, profitBreakdown, trendDaily, trendWeekly, trendMonthly, expenses, branchPerf, transactions, insights } = viewData;
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('daily');
  const [txDetail, setTxDetail] = useState<MockTransaction | null>(null);

  const trendData = { daily: trendDaily, weekly: trendWeekly, monthly: trendMonthly }[trendPeriod];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Total Revenue" value={formatPkr(kpis.totalRevenue)} delta={kpis.revenueChange} accent="blue" />
        <KpiCard title="Net Sales" value={formatPkr(kpis.netSales)} sub={`After ${formatPkr(kpis.totalReturns)} returns`} />
        <KpiCard title="Gross Profit" value={formatPkr(kpis.grossProfit)} delta={kpis.grossProfitChange} accent="green" sub={`${pct(kpis.grossMarginPct)} margin`} />
        <KpiCard title="Operating Profit" value={formatPkr(kpis.operatingProfit)} delta={kpis.operatingProfitChange} accent="green" />
        <KpiCard title="Gross Margin" value={pct(kpis.grossMarginPct)} accent="green" />
        <KpiCard title="Total Expenses" value={formatPkr(kpis.totalExpenses)} accent="amber" />
        <KpiCard title="Transactions" value={kpis.totalTransactions.toString()} delta={kpis.transactionsChange} accent="blue" />
        <KpiCard title="Avg Transaction" value={formatPkr(kpis.averageTransactionValue)} />
      </div>

      {/* Profitability Breakdown + Expense Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Profit by Business Line" badge={formatPkr(kpis.grossProfit)} />
          <div className="p-5">
            <SharedChart
              variant="pie"
              data={profitBreakdown}
              series={profitBreakdown.map(p => ({ key: 'value', label: p.label, color: p.color }))}
              xAxis={{ dataKey: 'label' }}
              legend={{ enabled: true, position: 'bottom' }}
              height={220}
              currency="Rs"
              valueType="currency"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Expense Breakdown" badge={formatPkr(kpis.totalExpenses)} />
          <div className="p-5">
            {expenses.length > 0 ? (
              <SharedChart
                variant="horizontal-bar"
                data={expenses.map(e => ({ label: e.label, amount: e.amount }))}
                series={[{ key: 'amount', label: 'Expense', color: '#006970' }]}
                xAxis={{ dataKey: 'label', tickFormatter: formatCompactPkr }}
                yAxis={{ dataKey: 'label' }}
                height={220}
                currency="Rs"
                valueType="currency"
              />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">
                No expense records for this filter selection.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Revenue & Profit Trend */}
      <Card>
        <CardHeader
          title="Revenue & Profit Trend"
          action={
            <div className="flex items-center gap-1">
              {(['daily', 'weekly', 'monthly'] as TrendPeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => setTrendPeriod(p)}
                  className={clsx(
                    'px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors',
                    trendPeriod === p ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover'
                  )}
                >{p}</button>
              ))}
            </div>
          }
        />
        <div className="p-5">
          {trendData.length > 0 ? (
            <SharedChart
              variant="composed"
              data={trendData}
              xAxis={{ dataKey: 'label' }}
              yAxis={{ tickFormatter: formatCompactPkr }}
              series={[
                { key: 'revenue', label: 'Revenue', color: '#006970', renderType: 'area', fillOpacity: 0.15 },
                { key: 'cogs', label: 'COGS', color: '#f59e0b', renderType: 'area', fillOpacity: 0.1 },
                { key: 'grossProfit', label: 'Gross Profit', color: '#16a34a', renderType: 'line', strokeWidth: 2 },
              ]}
              legend={{ enabled: true, position: 'bottom' }}
              height={280}
              currency="Rs"
              valueType="currency"
            />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-xs text-text-muted">
              No trend points available for this selection.
            </div>
          )}
        </div>
      </Card>

      {/* Branch Performance */}
      <Card>
        <CardHeader title="Branch Performance" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Branch</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Gross Profit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Margin</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Transactions</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">vs Prev</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branchPerf.map(b => (
                <tr key={b.branchId} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-text-primary">{b.branchName}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-text-primary tabular-nums">{formatPkr(b.revenue)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-success tabular-nums">{formatPkr(b.grossProfit)}</td>
                  <td className="px-4 py-3.5 text-right text-text-secondary tabular-nums">{pct(b.marginPct)}</td>
                  <td className="px-4 py-3.5 text-right text-text-secondary tabular-nums">{b.transactions}</td>
                  <td className="px-5 py-3.5 text-right"><Delta delta={b.changeRevPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader title="Recent Transactions" badge={`${transactions.length} records`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap">Date / Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Branch</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Party</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Profit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map(tx => {
                const typeLabel: Record<string, string> = {
                  product_sale: 'Product', repair: 'Repair',
                  mobile_sale: 'Mobile', return: 'Return', advance: 'Advance',
                };
                return (
                  <tr key={tx.id} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-text-primary text-xs">{tx.date}</p>
                      <p className="text-text-muted text-[11px]">{tx.reference} · {tx.time}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium text-text-secondary">{typeLabel[tx.type] ?? tx.type}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary whitespace-nowrap">{tx.branchName}</td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary max-w-32 truncate">{tx.party}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-text-primary text-xs tabular-nums">{formatPkr(tx.revenue)}</td>
                    <td className="px-4 py-3.5 text-right text-text-secondary text-xs tabular-nums">{formatPkr(tx.cost)}</td>
                    <td className={clsx('px-4 py-3.5 text-right font-semibold text-xs tabular-nums', tx.profit >= 0 ? 'text-success' : 'text-danger')}>
                      {formatPkr(tx.profit)}
                    </td>
                    <td className="px-4 py-3.5 text-center"><StatusPill status={tx.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setTxDetail(tx)}
                        aria-label={`View transaction ${tx.reference}`}
                        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-text-muted text-xs">No transactions in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Business Insights */}
      <Card>
        <CardHeader title="Business Insights" />
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {insights.map(ins => {
            const iconMap = { positive: CheckCircle, warning: AlertTriangle, info: Info };
            const colorMap = { positive: 'text-success', warning: 'text-warning', info: 'text-info' };
            const bgMap = { positive: 'bg-green-50 dark:bg-green-900/10', warning: 'bg-amber-50 dark:bg-amber-900/10', info: 'bg-blue-50 dark:bg-blue-900/10' };
            const Icon = iconMap[ins.type];
            return (
              <div key={ins.id} className={clsx('rounded-xl border border-border p-4', bgMap[ins.type])}>
                <div className={clsx('flex items-center gap-2 mb-1.5', colorMap[ins.type])}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <p className="text-sm font-semibold">{ins.title}</p>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{ins.body}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Transaction Detail Drawer */}
      <Drawer title="Transaction Detail" open={!!txDetail} onClose={() => setTxDetail(null)}>
        {txDetail && (
          <div className="space-y-1">
            <DrawerRow label="Reference" value={txDetail.reference} />
            <DrawerRow label="Date & Time" value={`${txDetail.date} ${txDetail.time}`} />
            <DrawerRow label="Type" value={txDetail.type.replace(/_/g, ' ')} />
            <DrawerRow label="Branch" value={txDetail.branchName} />
            <DrawerRow label="Party" value={txDetail.party} />
            <DrawerRow label="Revenue" value={formatPkr(txDetail.revenue)} />
            <DrawerRow label="Cost" value={formatPkr(txDetail.cost)} />
            <DrawerRow label="Profit" value={formatPkr(txDetail.profit)} valueClass={txDetail.profit >= 0 ? 'text-success' : 'text-danger'} />
            <DrawerRow label="Status" value={<StatusPill status={txDetail.status} />} />

          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Tab 2: Product Sales ──────────────────────────────────────────────────────

function ProductSalesTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { products, productTransactions } = viewData;
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortKey, setSortKey] = useState<keyof MockProduct>('grossProfit');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MockProduct | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  const filtered = useMemo(() => {
    let arr = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
      return matchSearch && matchCat;
    });
    arr = [...arr].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return arr;
  }, [products, search, categoryFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const totals = useMemo(() => {
    const grossRev = products.reduce((s, p) => s + p.grossRevenue, 0);
    const netRev = products.reduce((s, p) => s + p.netRevenue, 0);
    const cogs = products.reduce((s, p) => s + p.totalCogs, 0);
    const profit = products.reduce((s, p) => s + p.grossProfit, 0);
    const marginPct = netRev > 0 ? (profit / netRev) * 100 : 0;
    return {
      revenue: grossRev,
      netRev,
      unitsSold: products.reduce((s, p) => s + p.qtySold, 0),
      cogs,
      profit,
      marginPct,
      discounts: products.reduce((s, p) => s + p.discount, 0),
      returns: products.reduce((s, p) => s + p.returnValue, 0),
    };
  }, [products]);

  const topByRevenue = [...products].sort((a, b) => b.grossRevenue - a.grossRevenue).slice(0, 6);
  const topByProfit = [...products].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 6);

  function SortTh({ label, field }: { label: string; field: keyof MockProduct }) {
    const active = sortKey === field;
    return (
      <th
        className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
        onClick={() => { setSortKey(field); setSortAsc(active ? !sortAsc : false); setPage(0); }}
      >
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    );
  }

  const selectedProductTxs = selectedProduct
    ? productTransactions.filter(t => t.productId === selectedProduct.id)
    : [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Product Revenue" value={formatPkr(totals.revenue)} accent="blue" />
        <KpiCard title="Units Sold" value={totals.unitsSold.toString()} accent="blue" />
        <KpiCard title="Product COGS" value={formatPkr(totals.cogs)} accent="amber" />
        <KpiCard title="Gross Profit" value={formatPkr(totals.profit)} accent="green" sub={`${pct(totals.marginPct)} margin`} />
        <KpiCard title="Discounts" value={formatPkr(totals.discounts)} accent="amber" />
        <KpiCard title="Returns Value" value={formatPkr(totals.returns)} accent="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Top Products by Revenue" />
          <div className="p-5">
            {topByRevenue.length > 0 ? (
              <SharedChart
                variant="horizontal-bar"
                data={topByRevenue.map(p => ({ label: p.name.slice(0, 24), revenue: p.grossRevenue }))}
                series={[{ key: 'revenue', label: 'Revenue', color: '#006970' }]}
                xAxis={{ dataKey: 'label', tickFormatter: formatCompactPkr }}
                yAxis={{ dataKey: 'label' }}
                height={240}
                currency="Rs"
                valueType="currency"
              />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-xs text-text-muted">No sales for this filter.</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Top Products by Gross Profit" />
          <div className="p-5">
            {topByProfit.length > 0 ? (
              <SharedChart
                variant="horizontal-bar"
                data={topByProfit.map(p => ({ label: p.name.slice(0, 24), profit: p.grossProfit }))}
                series={[{ key: 'profit', label: 'Gross Profit', color: '#16a34a' }]}
                xAxis={{ dataKey: 'label', tickFormatter: formatCompactPkr }}
                yAxis={{ dataKey: 'label' }}
                height={240}
                currency="Rs"
                valueType="currency"
              />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-xs text-text-muted">No sales for this filter.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Product Table */}
      <Card>
        <CardHeader
          title="Product Profitability"
          badge={`${filtered.length} products`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search products…" />
              <select
                value={categoryFilter}
                onChange={e => { setCategoryFilter(e.target.value); setPage(0); }}
                aria-label="Filter by product category"
                className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary"
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Category</th>
                <SortTh label="Qty" field="qtySold" />
                <SortTh label="Gross Rev" field="grossRevenue" />
                <SortTh label="Net Rev" field="netRevenue" />
                <SortTh label="COGS" field="totalCogs" />
                <SortTh label="Profit" field="grossProfit" />
                <SortTh label="Margin" field="marginPct" />
                <th className="text-center px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map(p => (
                <tr key={p.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-text-primary text-sm">{p.name}</p>
                    <p className="text-text-muted text-[11px]">{p.sku}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{p.category}</td>
                  <td className="px-4 py-3.5 text-right text-text-secondary tabular-nums">{p.qtySold}</td>
                  <td className="px-4 py-3.5 text-right text-text-primary font-medium tabular-nums">{formatPkr(p.grossRevenue)}</td>
                  <td className="px-4 py-3.5 text-right text-text-secondary tabular-nums">{formatPkr(p.netRevenue)}</td>
                  <td className="px-4 py-3.5 text-right text-text-secondary tabular-nums">{formatPkr(p.totalCogs)}</td>
                  <td className={clsx('px-4 py-3.5 text-right font-semibold tabular-nums', p.grossProfit >= 0 ? 'text-success' : 'text-danger')}>
                    {formatPkr(p.grossProfit)}
                  </td>
                  <td className={clsx('px-4 py-3.5 text-right font-medium tabular-nums', p.marginPct >= 40 ? 'text-success' : p.marginPct >= 25 ? 'text-warning' : 'text-danger')}>
                    {pct(p.marginPct)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      onClick={() => setSelectedProduct(p)}
                      aria-label={`View details for ${p.name}`}
                      className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-text-muted text-sm">No products match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-text-muted">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                aria-label="Previous page"
                className="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 text-text-secondary"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                aria-label="Next page"
                className="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 text-text-secondary"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Product Detail Drawer */}
      <Drawer title={selectedProduct?.name ?? ''} open={!!selectedProduct} onClose={() => setSelectedProduct(null)}>
        {selectedProduct && (
          <div className="space-y-5">
            <div className="space-y-1">
              <DrawerRow label="SKU" value={selectedProduct.sku} />
              <DrawerRow label="Category" value={selectedProduct.category} />
              <DrawerRow label="Units Sold" value={selectedProduct.qtySold.toString()} />
              <DrawerRow label="Gross Revenue" value={formatPkr(selectedProduct.grossRevenue)} />
              <DrawerRow label="Discounts" value={formatPkr(selectedProduct.discount)} />
              <DrawerRow label="Net Revenue" value={formatPkr(selectedProduct.netRevenue)} />
              <DrawerRow label="Unit Cost (snapshot)" value={formatPkr(selectedProduct.unitCost)} />
              <DrawerRow label="Total COGS" value={formatPkr(selectedProduct.totalCogs)} />
              <DrawerRow label="Gross Profit" value={formatPkr(selectedProduct.grossProfit)} valueClass={selectedProduct.grossProfit >= 0 ? 'text-success' : 'text-danger'} />
              <DrawerRow label="Gross Margin" value={pct(selectedProduct.marginPct)} />
              <DrawerRow label="Returns" value={`${selectedProduct.returnCount} (${formatPkr(selectedProduct.returnValue)})`} />
            </div>
            {selectedProductTxs.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-text-primary mb-3">Transaction History</p>
                <div className="space-y-2">
                  {selectedProductTxs.map(tx => (
                    <div key={tx.id} className="rounded-lg border border-border p-3 bg-surface-hover/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text-primary">{tx.invoiceNo}</span>
                        <StatusPill status={tx.status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary mt-1">
                        <span>Qty: {tx.qty}</span>
                        <span>Price: {formatPkr(tx.sellingPrice)}</span>
                        <span>Discount: {formatPkr(tx.discount)}</span>
                        <span>Cost: {formatPkr(tx.costSnapshot)}</span>
                        <span>Net Rev: {formatPkr(tx.netRevenue)}</span>
                        <span className={tx.profit >= 0 ? 'text-success font-medium' : 'text-danger font-medium'}>Profit: {formatPkr(tx.profit)}</span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-1">{tx.date} · {tx.branchName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Tab 3: Repair Profitability ───────────────────────────────────────────────

function RepairProfitabilityTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { repairJobs, repairSummary: s } = viewData;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedJob, setSelectedJob] = useState<MockRepairJob | null>(null);

  const statuses = ['All', 'delivered', 'in_progress', 'waiting_parts', 'cancelled'];

  const filtered = useMemo(() => repairJobs.filter(j => {
    const matchSearch = j.id.toLowerCase().includes(search.toLowerCase())
      || j.customer.toLowerCase().includes(search.toLowerCase())
      || j.deviceModel.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || j.status === statusFilter;
    return matchSearch && matchStatus;
  }), [repairJobs, search, statusFilter]);

  const technicianData = useMemo(() => {
    const map: Record<string, { name: string; jobs: number; revenue: number; profit: number }> = {};
    repairJobs.filter(j => j.status === 'delivered').forEach(j => {
      if (!map[j.technicianId]) map[j.technicianId] = { name: j.technicianName, jobs: 0, revenue: 0, profit: 0 };
      map[j.technicianId].jobs++;
      map[j.technicianId].revenue += j.totalBilled;
      map[j.technicianId].profit += j.grossProfit;
    });
    return Object.values(map);
  }, [repairJobs]);

  const partsStageColor: Record<string, string> = {
    requested: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
    approved: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    issued: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    consumed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    returned: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };

  return (
    <div className="space-y-6">
      {/* KPIs — 10 cards arranged in a responsive 5+5 layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Total Jobs" value={s.totalJobs.toString()} accent="blue" />
        <KpiCard title="Completed" value={s.completedJobs.toString()} accent="green" />
        <KpiCard title="Active / Waiting" value={s.activeJobs.toString()} accent="amber" />
        <KpiCard title="Cancelled" value={s.cancelledJobs.toString()} accent="red" />
        <KpiCard title="Total Billed" value={formatPkr(s.totalBilled)} accent="blue" />
        <KpiCard title="Parts Revenue" value={formatPkr(s.partsRevenue)} />
        <KpiCard title="Labour Revenue" value={formatPkr(s.labourRevenue)} />
        <KpiCard title="Parts Cost" value={formatPkr(s.partsCost)} accent="amber" />
        <KpiCard title="Total Profit" value={formatPkr(s.totalProfit)} accent="green" />
        <KpiCard title="Avg Profit/Job" value={formatPkr(s.avgProfit)} accent="green" />
      </div>

      {/* Technician performance */}
      <Card>
        <CardHeader title="Profit by Technician" />
        <div className="p-5">
          {technicianData.length > 0 ? (
            <SharedChart
              variant="bar"
              data={technicianData.map(t => ({ label: t.name, profit: t.profit, revenue: t.revenue }))}
              series={[
                { key: 'revenue', label: 'Revenue', color: '#006970' },
                { key: 'profit', label: 'Gross Profit', color: '#16a34a' },
              ]}
              xAxis={{ dataKey: 'label' }}
              yAxis={{ tickFormatter: formatCompactPkr }}
              legend={{ enabled: true }}
              height={220}
              currency="Rs"
              valueType="currency"
            />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">
              No technician activity for delivered repairs in this window.
            </div>
          )}
        </div>
      </Card>

      {/* Parts Lifecycle Visual */}
      <Card>
        <CardHeader title="Parts Lifecycle" />
        <div className="p-5">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {(['requested', 'approved', 'issued', 'consumed', 'returned'] as const).map((stage, i, arr) => (
              <React.Fragment key={stage}>
                <div className="text-center">
                  <div className={clsx('px-4 py-2 rounded-lg text-xs font-semibold capitalize', partsStageColor[stage])}>
                    {i + 1}. {stage}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">
                    {stage === 'consumed' ? 'Counts as cost' : stage === 'returned' ? 'No cost' : ''}
                  </p>
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-text-muted text-center mt-3">
            Only <strong className="text-text-secondary">consumed</strong> parts count toward parts cost. Requested or issued parts that are returned are never costed.
          </p>
        </div>
      </Card>

      {/* Repair Jobs Table */}
      <Card>
        <CardHeader
          title="Repair Jobs"
          badge={`${filtered.length} jobs`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by repair job status"
                className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary"
              >
                {statuses.map(sItem => <option key={sItem}>{sItem}</option>)}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap">Job / Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Device</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Technician</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Parts Rev</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Labour</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Parts Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Total Billed</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Profit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(j => (
                <tr key={j.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-text-primary text-xs">{j.id}</p>
                    <p className="text-text-muted text-[11px]">{j.date}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <p className="font-medium text-text-primary">{j.deviceModel}</p>
                    <p className="text-text-muted">{j.deviceType}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{j.customer}</td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{j.technicianName}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{j.partsRevenue > 0 ? formatPkr(j.partsRevenue) : '—'}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{j.labourRevenue > 0 ? formatPkr(j.labourRevenue) : '—'}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-secondary tabular-nums">{j.partsCost > 0 ? formatPkr(j.partsCost) : '—'}</td>
                  <td className="px-4 py-3.5 text-right text-xs font-semibold text-text-primary tabular-nums">{j.totalBilled > 0 ? formatPkr(j.totalBilled) : '—'}</td>
                  <td className={clsx('px-4 py-3.5 text-right text-xs font-semibold tabular-nums', j.grossProfit > 0 ? 'text-success' : j.grossProfit < 0 ? 'text-danger' : 'text-text-muted')}>
                    {j.totalBilled > 0 ? formatPkr(j.grossProfit) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center"><StatusPill status={j.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedJob(j)}
                      aria-label={`View repair job ${j.id}`}
                      className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-text-muted text-sm">No jobs match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Job Detail Drawer */}
      <Drawer title={`Job ${selectedJob?.id ?? ''}`} open={!!selectedJob} onClose={() => setSelectedJob(null)}>
        {selectedJob && (
          <div className="space-y-5">
            <div className="space-y-1">
              <DrawerRow label="Date" value={selectedJob.date} />
              <DrawerRow label="Customer" value={selectedJob.customer} />
              <DrawerRow label="Device" value={`${selectedJob.deviceModel} (${selectedJob.deviceType})`} />
              <DrawerRow label="Technician" value={selectedJob.technicianName} />
              <DrawerRow label="Status" value={<StatusPill status={selectedJob.status} />} />
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-surface-hover/40 px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-text-primary">Cost & Revenue Breakdown</p>
              </div>
              <div className="p-4 space-y-1">
                <DrawerRow label="Parts Revenue" value={formatPkr(selectedJob.partsRevenue)} />
                <DrawerRow label="Labour Revenue" value={formatPkr(selectedJob.labourRevenue)} />
                <DrawerRow label="Total Billed" value={formatPkr(selectedJob.totalBilled)} />
                <DrawerRow label="Parts Cost" value={formatPkr(selectedJob.partsCost)} valueClass="text-danger" />
                <DrawerRow label="Labour Cost" value={formatPkr(selectedJob.labourCost)} valueClass="text-danger" />
                <DrawerRow label="Gross Profit" value={formatPkr(selectedJob.grossProfit)} valueClass={selectedJob.grossProfit >= 0 ? 'text-success' : 'text-danger'} />
                <DrawerRow label="Margin" value={selectedJob.totalBilled > 0 ? pct(selectedJob.marginPct) : '—'} />
              </div>
            </div>
            {selectedJob.parts.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-text-primary mb-3">Parts Detail</p>
                <div className="space-y-2">
                  {selectedJob.parts.map(pItem => (
                    <div key={pItem.id} className="rounded-lg border border-border p-3 bg-surface-hover/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text-primary">{pItem.name}</span>
                        <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', partsStageColor[pItem.stage])}>{pItem.stage}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary">
                        <span>Qty: {pItem.qty}</span>
                        <span>Cost: {formatPkr(pItem.unitCost)}</span>
                        <span>Sale: {formatPkr(pItem.unitSalePrice)}</span>
                        <span className={pItem.stage === 'consumed' ? 'text-danger font-medium' : 'text-text-muted'}>
                          Total Cost: {pItem.stage === 'consumed' ? formatPkr(pItem.totalCost) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedJob.notes && (
              <div className="p-3 bg-surface-hover/20 rounded-lg border border-border">
                <p className="text-xs text-text-secondary"><strong>Notes:</strong> {selectedJob.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Tab 4: Mobile Sales & Purchases ──────────────────────────────────────────

function MobileSalesTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { mobileDevices, mobileSummary: summary } = viewData;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedDevice, setSelectedDevice] = useState<MockMobileDevice | null>(null);

  const statuses = ['All', 'sold', 'in_stock', 'written_off'];

  const filtered = useMemo(() => mobileDevices.filter(d => {
    const matchSearch = d.model.toLowerCase().includes(search.toLowerCase())
      || d.brand.toLowerCase().includes(search.toLowerCase())
      || d.imei.includes(search);
    const matchStatus = statusFilter === 'All' || d.status === statusFilter;
    return matchSearch && matchStatus;
  }), [mobileDevices, search, statusFilter]);

  const profitByModel = useMemo(() => {
    const map: Record<string, { label: string; profit: number; count: number }> = {};
    mobileDevices.filter(d => d.status === 'sold').forEach(d => {
      const key = d.model;
      if (!map[key]) map[key] = { label: d.model.slice(0, 20), profit: 0, count: 0 };
      map[key].profit += d.grossProfit ?? 0;
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.profit - a.profit).slice(0, 6);
  }, [mobileDevices]);

  const stockPieData = useMemo(() => [
    { label: 'Sold', value: summary.devicesSold, color: '#10b981' },
    { label: 'In Stock', value: summary.devicesInStock, color: '#006970' },
    { label: 'Written Off', value: summary.devicesWrittenOff, color: '#ef4444' },
  ].filter(d => d.value > 0), [summary]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Devices In View" value={summary.totalDevicesPurchased.toString()} accent="blue" />
        <KpiCard title="Devices Sold" value={summary.devicesSold.toString()} accent="green" />
        <KpiCard title="Current In Stock" value={summary.devicesInStock.toString()} accent="blue" />
        <KpiCard title="Written Off" value={summary.devicesWrittenOff.toString()} accent="red" />
        <KpiCard title="Cost of Goods Sold" value={formatPkr(summary.totalSoldCost)} accent="amber" />
        <KpiCard title="Sales Revenue" value={formatPkr(summary.totalSaleRevenue)} accent="blue" />
        <KpiCard title="Gross Profit" value={formatPkr(summary.totalGrossProfit)} accent="green" />
        <KpiCard title="Weighted Margin" value={pct(summary.grossMarginPct)} accent="green" />
      </div>

      <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/10 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0" />
        <span>A mobile purchase is an inventory asset — cost is only recognized at the point of sale or confirmed write-off.</span>
      </div>

      {/* Profit by model chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Profit by Model (Sold Devices)" />
          <div className="p-5">
            {profitByModel.length > 0 ? (
              <SharedChart
                variant="horizontal-bar"
                data={profitByModel}
                series={[{ key: 'profit', label: 'Gross Profit', color: '#16a34a' }]}
                xAxis={{ dataKey: 'label', tickFormatter: formatCompactPkr }}
                yAxis={{ dataKey: 'label' }}
                height={220}
                currency="Rs"
                valueType="currency"
              />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">
                No sold devices in this window.
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Device Stock Breakdown" />
          <div className="p-5">
            {stockPieData.length > 0 ? (
              <SharedChart
                variant="pie"
                data={stockPieData}
                series={stockPieData.map(d => ({ key: 'value', label: d.label, color: d.color }))}
                xAxis={{ dataKey: 'label' }}
                legend={{ enabled: true, position: 'bottom' }}
                height={220}
              />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">
                No devices found for this selection.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Device Table */}
      <Card>
        <CardHeader
          title="Mobile Device Inventory"
          badge={`${filtered.length} devices`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder="Model, brand, IMEI…" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by mobile device status"
                className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary"
              >
                {statuses.map(sItem => <option key={sItem}>{sItem}</option>)}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Device</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">IMEI</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Branch</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Purchase</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Purchase Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Sale Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Profit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Margin</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(d => (
                <tr key={d.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-text-primary text-sm">{d.model}</p>
                    <p className="text-text-muted text-[11px]">{d.brand} · {d.storage} · {d.color}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono text-text-secondary">{d.imei}</td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{d.branchName}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-muted">{d.purchaseDate}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary font-medium tabular-nums">{formatPkr(d.purchaseCost)}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{d.salePrice !== null ? formatPkr(d.salePrice) : '—'}</td>
                  <td className={clsx('px-4 py-3.5 text-right text-xs font-semibold tabular-nums', d.grossProfit !== null ? (d.grossProfit >= 0 ? 'text-success' : 'text-danger') : 'text-text-muted')}>
                    {d.grossProfit !== null ? formatPkr(d.grossProfit) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-secondary tabular-nums">
                    {d.marginPct !== null ? pct(d.marginPct) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center"><StatusPill status={d.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedDevice(d)}
                      aria-label={`View details for ${d.model}`}
                      className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-text-muted text-sm">No devices match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Device Detail Drawer */}
      <Drawer title={selectedDevice?.model ?? ''} open={!!selectedDevice} onClose={() => setSelectedDevice(null)}>
        {selectedDevice && (
          <div className="space-y-5">
            <div className="space-y-1">
              <DrawerRow label="Brand" value={selectedDevice.brand} />
              <DrawerRow label="Model" value={selectedDevice.model} />
              <DrawerRow label="Storage" value={selectedDevice.storage} />
              <DrawerRow label="Color" value={selectedDevice.color} />
              <DrawerRow label="IMEI" value={<span className="font-mono">{selectedDevice.imei}</span>} />
              <DrawerRow label="Branch" value={selectedDevice.branchName} />
              <DrawerRow label="Status" value={<StatusPill status={selectedDevice.status} />} />
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-surface-hover/40 px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-text-primary">Purchase Record</p>
              </div>
              <div className="p-4 space-y-1">
                <DrawerRow label="Purchase Date" value={selectedDevice.purchaseDate} />
                <DrawerRow label="Purchase Cost" value={formatPkr(selectedDevice.purchaseCost)} />
                <DrawerRow label="Supplier Ref" value={selectedDevice.supplierRef} />
              </div>
            </div>
            {selectedDevice.saleDate && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-surface-hover/40 px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold text-text-primary">Sale Record</p>
                </div>
                <div className="p-4 space-y-1">
                  <DrawerRow label="Sale Date" value={selectedDevice.saleDate} />
                  <DrawerRow label="Invoice" value={selectedDevice.invoiceNo ?? '—'} />
                  <DrawerRow label="Customer" value={selectedDevice.customer ?? '—'} />
                  <DrawerRow label="Sale Price" value={formatPkr(selectedDevice.salePrice ?? 0)} />
                  <DrawerRow label="Purchase Cost" value={formatPkr(selectedDevice.purchaseCost)} valueClass="text-danger" />
                  <DrawerRow label="Gross Profit" value={formatPkr(selectedDevice.grossProfit ?? 0)} valueClass={(selectedDevice.grossProfit ?? 0) >= 0 ? 'text-success' : 'text-danger'} />
                  <DrawerRow label="Margin" value={pct(selectedDevice.marginPct ?? 0)} />
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Tab 5: Inventory Loss & Supplier Recovery ────────────────────────────────

function InventoryLossTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { lossEvents, supplierClaims, lossSummary: lossSum } = viewData;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedClaim, setSelectedClaim] = useState<MockSupplierClaim | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MockLossEvent | null>(null);

  const eventStatuses = ['All', 'reported', 'quarantined', 'inspected', 'claim_submitted', 'claim_accepted', 'recovered', 'written_off'];

  const filteredEvents = useMemo(() => lossEvents.filter(e => {
    const matchSearch = e.product.toLowerCase().includes(search.toLowerCase())
      || e.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  }), [lossEvents, search, statusFilter]);

  const lossLifecycle = [
    { stage: 'Reported', color: 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300' },
    { stage: 'Quarantined', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    { stage: 'Inspected', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    { stage: 'Claim Submitted', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
    { stage: 'Claim Accepted', color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' },
    { stage: 'Recovered / Written Off', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Damage Events" value={lossSum.damageEvents.toString()} accent="amber" />
        <KpiCard title="Total Qty Affected" value={lossSum.totalQtyAffected.toString()} accent="amber" />
        <KpiCard title="Estimated Loss" value={formatPkr(lossSum.totalEstimatedLoss)} accent="red" />
        <KpiCard title="Confirmed Write-Off" value={formatPkr(lossSum.confirmedWriteOff)} accent="red" />
        <KpiCard title="Supplier Claims" value={lossSum.totalClaims.toString()} accent="blue" />
        <KpiCard title="Open Claims" value={lossSum.openClaims.toString()} accent="amber" />
        <KpiCard title="Pending Recovery" value={formatPkr(lossSum.pendingRecovery)} accent="amber" />
        <KpiCard title="Recovered Value" value={formatPkr(lossSum.recoveredValue)} accent="green" />
      </div>

      <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>A pending supplier claim is not equivalent to cash received. Recovery is only confirmed when supplier credit or replacement is received.</span>
      </div>

      {/* Loss Lifecycle */}
      <Card>
        <CardHeader title="Loss Event Lifecycle" />
        <div className="p-5">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {lossLifecycle.map((step, i, arr) => (
              <React.Fragment key={step.stage}>
                <div className={clsx('px-3 py-2 rounded-lg text-xs font-semibold text-center', step.color)}>
                  {i + 1}. {step.stage}
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Card>

      {/* Loss Events Table */}
      <Card>
        <CardHeader
          title="Loss Events"
          badge={`${filteredEvents.length} events`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder="Product, event ID…" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by loss event status"
                className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary"
              >
                {eventStatuses.map(sItem => <option key={sItem} value={sItem}>{sItem.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">ID / Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Branch</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Unit Cost</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Est. Value</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Claim</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEvents.map(e => {
                const claim = e.supplierClaimId ? supplierClaims.find(c => c.id === e.supplierClaimId) : null;
                return (
                  <tr key={e.id} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-text-primary text-xs">{e.id}</p>
                      <p className="text-text-muted text-[11px]">{e.date}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="font-medium text-text-primary">{e.product}</p>
                      <p className="text-text-muted">{e.category}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary">{e.branchName}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{e.qtyAffected}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-text-secondary tabular-nums">{formatPkr(e.unitCost)}</td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-danger tabular-nums">{formatPkr(e.estimatedValue)}</td>
                    <td className="px-4 py-3.5 text-center"><StatusPill status={e.status} /></td>
                    <td className="px-4 py-3.5 text-center">
                      {claim ? (
                        <button
                          onClick={() => setSelectedClaim(claim)}
                          className="text-xs font-medium text-primary hover:underline cursor-pointer"
                        >{claim.claimRef}</button>
                      ) : <span className="text-text-muted text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedEvent(e)}
                        aria-label={`View loss event ${e.id}`}
                        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredEvents.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-text-muted text-sm">No loss events match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Supplier Recovery Table */}
      <Card>
        <CardHeader title="Supplier Recovery Claims" badge={`${supplierClaims.length} claims`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Ref / Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Supplier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Product</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Claimed</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Accepted</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Recovered</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Pending</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {supplierClaims.map(c => (
                <tr key={c.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-text-primary text-xs">{c.claimRef}</p>
                    <p className="text-text-muted text-[11px]">{c.date}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{c.supplier}</td>
                  <td className="px-4 py-3.5 text-xs text-text-secondary">{c.product}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{formatPkr(c.claimedAmount)}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-text-primary tabular-nums">{c.acceptedAmount > 0 ? formatPkr(c.acceptedAmount) : '—'}</td>
                  <td className={clsx('px-4 py-3.5 text-right text-xs font-semibold tabular-nums', c.recoveredAmount > 0 ? 'text-success' : 'text-text-muted')}>
                    {c.recoveredAmount > 0 ? formatPkr(c.recoveredAmount) : '—'}
                  </td>
                  <td className={clsx('px-4 py-3.5 text-right text-xs font-semibold tabular-nums', c.pendingAmount > 0 ? 'text-warning' : 'text-text-muted')}>
                    {c.pendingAmount > 0 ? formatPkr(c.pendingAmount) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center"><StatusPill status={c.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedClaim(c)}
                      aria-label={`View supplier claim ${c.claimRef}`}
                      className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {supplierClaims.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-text-muted text-xs">No claims recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Loss Event Drawer */}
      <Drawer title={`Event ${selectedEvent?.id ?? ''}`} open={!!selectedEvent} onClose={() => setSelectedEvent(null)}>
        {selectedEvent && (
          <div className="space-y-1">
            <DrawerRow label="Date" value={selectedEvent.date} />
            <DrawerRow label="Product" value={selectedEvent.product} />
            <DrawerRow label="Category" value={selectedEvent.category} />
            <DrawerRow label="Branch" value={selectedEvent.branchName} />
            <DrawerRow label="Qty Affected" value={selectedEvent.qtyAffected.toString()} />
            <DrawerRow label="Unit Cost" value={formatPkr(selectedEvent.unitCost)} />
            <DrawerRow label="Estimated Value" value={formatPkr(selectedEvent.estimatedValue)} valueClass="text-danger" />
            <DrawerRow label="Reason" value={selectedEvent.reason} />
            <DrawerRow label="Status" value={<StatusPill status={selectedEvent.status} />} />
          </div>
        )}
      </Drawer>

      {/* Claim Detail Drawer */}
      <Drawer title={`Claim ${selectedClaim?.claimRef ?? ''}`} open={!!selectedClaim} onClose={() => setSelectedClaim(null)}>
        {selectedClaim && (
          <div className="space-y-5">
            <div className="space-y-1">
              <DrawerRow label="Supplier" value={selectedClaim.supplier} />
              <DrawerRow label="Product" value={selectedClaim.product} />
              <DrawerRow label="Claim Type" value={selectedClaim.claimType.toUpperCase()} />
              <DrawerRow label="Claimed Amount" value={formatPkr(selectedClaim.claimedAmount)} />
              <DrawerRow label="Accepted Amount" value={selectedClaim.acceptedAmount > 0 ? formatPkr(selectedClaim.acceptedAmount) : '—'} />
              <DrawerRow label="Recovered Amount" value={selectedClaim.recoveredAmount > 0 ? formatPkr(selectedClaim.recoveredAmount) : '—'} valueClass="text-success" />
              <DrawerRow label="Pending Amount" value={selectedClaim.pendingAmount > 0 ? formatPkr(selectedClaim.pendingAmount) : '—'} valueClass="text-warning" />
              <DrawerRow label="Status" value={<StatusPill status={selectedClaim.status} />} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-3">Claim History</p>
              <div className="space-y-2">
                {selectedClaim.history.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-hover/20">
                    <Clock className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-secondary">{h.event}</p>
                      {h.amount !== undefined && <p className="text-xs font-semibold text-success mt-0.5">{formatPkr(h.amount)}</p>}
                      <p className="text-[11px] text-text-muted mt-0.5">{h.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedClaim.notes && (
              <div className="p-3 bg-surface-hover/20 rounded-lg border border-border">
                <p className="text-xs text-text-secondary">{selectedClaim.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Tab 6: Financial Reconciliation ─────────────────────────────────────────

function FinancialReconTab({ viewData }: { viewData: AnalyticsViewData }) {
  const { financialSummary: fs, ledgerEntries, reconRows } = viewData;
  const [search, setSearch] = useState('');
  const [reconStatusFilter, setReconStatusFilter] = useState('All');
  const [selectedRecon, setSelectedRecon] = useState<MockReconciliationRow | null>(null);
  const [showAllLedger, setShowAllLedger] = useState(false);

  const reconStatuses = ['All', 'matched', 'partial', 'pending', 'unmatched', 'review'];

  const displayedLedger = showAllLedger ? ledgerEntries : ledgerEntries.slice(0, 10);

  const filteredRecon = useMemo(() => reconRows.filter(r => {
    const matchSearch = r.txRef.toLowerCase().includes(search.toLowerCase())
      || r.sourceModule.toLowerCase().includes(search.toLowerCase())
      || r.invoiceRef.toLowerCase().includes(search.toLowerCase());
    const matchStatus = reconStatusFilter === 'All' || r.status === reconStatusFilter;
    return matchSearch && matchStatus;
  }), [reconRows, search, reconStatusFilter]);

  const reconStatusIcon: Record<string, React.ElementType> = {
    matched: CheckCircle, partial: AlertCircle, pending: Clock,
    unmatched: AlertTriangle, review: AlertTriangle,
  };

  return (
    <div className="space-y-6">
      {/* Financial Position */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Cash on Hand" value={formatPkr(fs.cashOnHand)} accent="green" />
        <KpiCard title="Bank Balance" value={formatPkr(fs.bankBalance)} accent="green" />
        <KpiCard title="Customer Receivables" value={formatPkr(fs.customerReceivables)} accent="blue" />
        <KpiCard title="Supplier Payables" value={formatPkr(fs.supplierPayables)} accent="amber" />
        <KpiCard title="Customer Advances" value={formatPkr(fs.customerAdvances)} accent="blue" />
        <KpiCard title="Net Position" value={formatPkr(fs.netPosition)} accent="green" sub="Cash+Bank+Receiv-Pay-Adv" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/10 text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Revenue ≠ Cash Received. A credit sale generates revenue when the invoice is raised, not when the customer pays.</span>
        </div>
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Pending supplier claims ({formatPkr(fs.pendingClaims)}) are not counted as cash received. Confirm recovery before recognizing income.</span>
        </div>
      </div>

      {/* Ledger Overview */}
      <Card>
        <CardHeader
          title="Ledger Entries"
          badge="Fictional Records"
          action={
            ledgerEntries.length > 10 ? (
              <button
                onClick={() => setShowAllLedger(s => !s)}
                className="text-xs font-medium text-primary hover:underline px-2 py-1 rounded cursor-pointer"
              >
                {showAllLedger ? 'Show latest 10' : `Show all ${ledgerEntries.length} entries`}
              </button>
            ) : undefined
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Parent Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Child Ledger</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Reference</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Debit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Credit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Balance</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Branch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedLedger.map(l => (
                <tr key={l.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3 text-xs text-text-muted">{l.date}</td>
                  <td className="px-4 py-3 text-xs font-medium text-text-primary">{l.parentAccount}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{l.childLedger}</td>
                  <td className="px-4 py-3 text-xs text-text-muted font-mono">{l.invoiceRef}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-danger tabular-nums">{l.debit > 0 ? formatPkr(l.debit) : '—'}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-success tabular-nums">{l.credit > 0 ? formatPkr(l.credit) : '—'}</td>
                  <td className={clsx('px-4 py-3 text-right text-xs font-semibold tabular-nums', l.runningBalance >= 0 ? 'text-text-primary' : 'text-danger')}>
                    {formatPkr(l.runningBalance)}
                  </td>
                  <td className="px-5 py-3 text-xs text-text-muted">{l.branchName}</td>
                </tr>
              ))}
              {displayedLedger.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-text-muted text-xs">No ledger entries for this selection.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reconciliation Table */}
      <Card>
        <CardHeader
          title="Transaction Reconciliation"
          badge={`${filteredRecon.length} rows`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder="Ref, module, invoice…" />
              <select
                value={reconStatusFilter}
                onChange={e => setReconStatusFilter(e.target.value)}
                aria-label="Filter by reconciliation status"
                className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary"
              >
                {reconStatuses.map(sItem => <option key={sItem}>{sItem}</option>)}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap">Tx Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Module</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Paid</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Outstanding</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Debit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Credit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRecon.map(r => {
                const StatusIcon = reconStatusIcon[r.status] ?? Info;
                return (
                  <tr key={r.id} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-text-primary text-xs">{r.txRef}</p>
                      <p className="text-text-muted text-[11px]">{r.invoiceRef}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary">{r.sourceModule}</td>
                    <td className="px-4 py-3.5 text-right text-xs font-medium text-text-primary tabular-nums">{r.revenue !== 0 ? formatPkr(r.revenue) : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-text-secondary tabular-nums">{r.paymentReceived !== 0 ? formatPkr(r.paymentReceived) : '—'}</td>
                    <td className={clsx('px-4 py-3.5 text-right text-xs font-semibold tabular-nums', r.outstanding > 0 ? 'text-warning' : r.outstanding < 0 ? 'text-danger' : 'text-text-muted')}>
                      {r.outstanding !== 0 ? formatPkr(r.outstanding) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-danger tabular-nums">{r.debit > 0 ? formatPkr(r.debit) : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-success tabular-nums">{r.credit > 0 ? formatPkr(r.credit) : '—'}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1">
                        <StatusIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <StatusPill status={r.status} />
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedRecon(r)}
                        aria-label={`View reconciliation row ${r.txRef}`}
                        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-primary transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRecon.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-text-muted text-sm">No records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recon Detail Drawer */}
      <Drawer title={`Reconciliation: ${selectedRecon?.txRef ?? ''}`} open={!!selectedRecon} onClose={() => setSelectedRecon(null)}>
        {selectedRecon && (
          <div className="space-y-1">
            <DrawerRow label="Tx Reference" value={selectedRecon.txRef} />
            <DrawerRow label="Source Module" value={selectedRecon.sourceModule} />
            <DrawerRow label="Invoice Ref" value={selectedRecon.invoiceRef} />
            <DrawerRow label="Branch" value={selectedRecon.branchName} />
            <DrawerRow label="Revenue" value={formatPkr(selectedRecon.revenue)} />
            <DrawerRow label="Payment Received" value={formatPkr(selectedRecon.paymentReceived)} />
            <DrawerRow label="Outstanding" value={formatPkr(selectedRecon.outstanding)} valueClass={selectedRecon.outstanding > 0 ? 'text-warning' : 'text-text-primary'} />
            <DrawerRow label="Debit" value={selectedRecon.debit > 0 ? formatPkr(selectedRecon.debit) : '—'} valueClass="text-danger" />
            <DrawerRow label="Credit" value={selectedRecon.credit > 0 ? formatPkr(selectedRecon.credit) : '—'} valueClass="text-success" />
            <DrawerRow label="Status" value={<StatusPill status={selectedRecon.status} />} />
            {selectedRecon.notes && (
              <div className="mt-4 p-3 bg-surface-hover/20 rounded-lg border border-border">
                <p className="text-xs text-text-secondary"><strong>Notes:</strong> {selectedRecon.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

type TabDef = { id: TabId; label: string; shortLabel: string; icon: React.ElementType };

const TABS: TabDef[] = [
  { id: 'overview', label: 'Business Overview', shortLabel: 'Overview', icon: TrendingUp },
  { id: 'products', label: 'Product Sales', shortLabel: 'Products', icon: BarChart2 },
  { id: 'repairs', label: 'Repair Profitability', shortLabel: 'Repairs', icon: Wrench },
  { id: 'mobiles', label: 'Mobile Sales', shortLabel: 'Mobiles', icon: Smartphone },
  { id: 'inventory', label: 'Inventory Loss', shortLabel: 'Loss', icon: PackageX },
  { id: 'reconciliation', label: 'Financial Recon', shortLabel: 'Recon', icon: FileText },
];

const DATE_PRESETS: { label: string; value: DashboardDatePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Prev Month', value: 'prev_month' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Custom', value: 'custom' },
];

export interface SalesAnalyticsPageProps {
  mode?: 'organization' | 'shop-admin';
}

export function SalesAnalyticsPage({ mode = 'organization' }: SalesAnalyticsPageProps) {
  const activeShopId = useOrganizationStore(
    (s) => s.activeShopId || s.activeShop?._id || null
  );
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [datePreset, setDatePreset] = useState<DashboardDatePreset>('today');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [branchId, setBranchId] = useState(() => mode === 'shop-admin' && activeShopId ? activeShopId : 'ALL');
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));
  const [refreshKey, setRefreshKey] = useState(0);

  // Synchronize branchId if activeShop changes in shop-admin mode
  useEffect(() => {
    if (mode === 'shop-admin' && activeShopId) {
      setBranchId(activeShopId);
    }
  }, [mode, activeShopId]);

  // Live date resolution based on actual current calendar
  const resolvedRange = useMemo(
    () => resolveDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd]
  );

  // Live sales analytics query hook
  const effectiveBranch = branchId === 'ALL' ? null : branchId;
  const saData = useSalesAnalyticsData({
    branchId: effectiveBranch,
    dateRange: resolvedRange,
  });

  // Transform genuine data from live API and tauriClient queries
  const viewData = useMemo(() => {
    return buildLiveAnalyticsViewData({
      branchId,
      startDate: resolvedRange.startDate,
      endDate: resolvedRange.endDate,
      dateLabel: resolvedRange.label,
      fullReport: saData.liveReport,
      productsReport: saData.productsReport,
      rawSales: saData.rawSales,
      rawReturns: saData.rawReturns,
      rawRepairs: saData.rawRepairs,
      rawMobiles: saData.rawMobileSales,
      rawExpenses: saData.rawExpenses,
      branches: saData.branches,
      orgBalances: saData.orgBalances,
      expenseSummary: saData.expenseSummary,
      profitSummary: saData.headline,
      prevProfitSummary: null,
      productSalesAnalysis: saData.productSalesAnalysis,
    });
  }, [
    branchId,
    resolvedRange,
    saData.liveReport,
    saData.productsReport,
    saData.rawSales,
    saData.rawReturns,
    saData.rawRepairs,
    saData.rawMobileSales,
    saData.rawExpenses,
    saData.branches,
    saData.orgBalances,
    saData.expenseSummary,
    saData.headline,
    refreshKey,
  ]);

  const isLoading = saData.loading.liveReport || saData.loading.sales || saData.loading.profit;
  const isLive = saData.isLive;
  const isError = saData.errors.liveReport && saData.errors.sales;

  const handleRefresh = () => {
    setLastRefreshed(new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));
    setRefreshKey(k => k + 1);
  };

  const handleResetFilters = () => {
    const d = new Date();
    setDatePreset('this_month');
    setCustomStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    setCustomEnd(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setBranchId('ALL');
    setLastRefreshed(new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));
    setRefreshKey(k => k + 1);
  };

  // Live branches list from store / API
  const branchOptions = useMemo(() => {
    const list = [{ id: 'ALL', name: 'All Branches' }];
    for (const b of saData.branches) {
      const bId = String((b as any).id || (b as any)._id);
      const bName = String((b as any).name || (b as any).branch_name || bId);
      list.push({ id: bId, name: bName });
    }
    return list;
  }, [saData.branches]);

  const activeBranchName = branchOptions.find(b => b.id === branchId)?.name ?? branchId;

  const headerAction = (
    <div className="flex items-center gap-2 flex-wrap">
      <LiveStatusBanner
        isLoading={isLoading}
        isLive={isLive}
        isError={isError}
        recordCount={viewData.transactions.length}
      />
      <button
        onClick={handleRefresh}
        aria-label="Refresh analytics data"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-text-secondary text-xs font-medium transition-colors cursor-pointer"
      >
        <RefreshCw className={clsx("w-3 h-3", isLoading && "animate-spin")} />
        Refresh
      </button>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      {/* Global Filters */}
      <div className="bg-surface border border-border rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CalendarDays className="w-4 h-4 text-text-muted shrink-0" />
          <span className="text-xs font-medium text-text-secondary mr-1">Period:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {DATE_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  datePreset === p.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:bg-surface-hover border border-border'
                )}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary">
            <label className="flex items-center gap-1">
              <span>From:</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:ml-auto flex-wrap">
          <Building2 className="w-4 h-4 text-text-muted shrink-0" />
          <span className="text-xs font-medium text-text-secondary">Branch:</span>
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            aria-label="Filter by branch"
            className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-primary cursor-pointer"
          >
            {branchOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button
            onClick={handleResetFilters}
            title="Reset filters to defaults"
            aria-label="Reset all filters"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="w-full pt-1 border-t border-border/60 flex items-center justify-between text-[11px] text-text-muted">
          <span>Active filter: <strong className="text-text-secondary">{resolvedRange.label}</strong> · <strong className="text-text-secondary">{activeBranchName}</strong></span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last refreshed: {lastRefreshed}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex overflow-x-auto border-b border-border" role="tablist" aria-label="Sales Analytics Tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px cursor-pointer',
                  active
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover/60'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6" key={refreshKey}>
          {activeTab === 'overview' && <OverviewTab viewData={viewData} />}
          {activeTab === 'products' && <ProductSalesTab viewData={viewData} />}
          {activeTab === 'repairs' && <RepairProfitabilityTab viewData={viewData} />}
          {activeTab === 'mobiles' && <MobileSalesTab viewData={viewData} />}
          {activeTab === 'inventory' && <InventoryLossTab viewData={viewData} />}
          {activeTab === 'reconciliation' && <FinancialReconTab viewData={viewData} />}
        </div>
      </div>
    </div>
  );

  if (mode === 'shop-admin') {
    return (
      <div className="w-full min-w-0 space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Link to="/dashboard/shop-admin" className="hover:text-primary transition-colors">
            Branch Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-800 dark:text-gray-200 font-semibold">Sales Analytics</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200/80 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Sales Analytics</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                LIVE
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Branch & enterprise business intelligence and profitability workspace.
            </p>
          </div>
          {headerAction}
        </div>
        {mainContent}
      </div>
    );
  }

  return (
    <OrganizationPageShell
      title="Sales Analytics"
      description="Business intelligence and profitability workspace."
      badge="LIVE"
      fullWidth
      action={headerAction}
    >
      <div className="w-full min-w-0 space-y-5">
        {mainContent}
      </div>
    </OrganizationPageShell>
  );
}

export default SalesAnalyticsPage;
