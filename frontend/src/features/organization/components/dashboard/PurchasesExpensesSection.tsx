import React from 'react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardChartCard } from './DashboardChartCard';
import { formatCompactPkr, formatPkr, type DashboardDateRange } from '../../utils/dashboardDates';
import type { ExpenseAnalytics, PurchaseAnalytics } from '../../utils/dashboardCalculations';

interface PurchasesExpensesSectionProps {
  mode: 'organization' | 'branch';
  dateRange: DashboardDateRange;
  canViewPurchases: boolean;
  canViewExpenses: boolean;
  purchaseAnalytics: PurchaseAnalytics;
  expenseAnalytics: ExpenseAnalytics;
  purchasesLoading: boolean;
  expensesLoading: boolean;
  purchasesError: boolean;
  expensesError: boolean;
  onNavigate: (href: string) => void;
}

export const PurchasesExpensesSection: React.FC<PurchasesExpensesSectionProps> = ({
  mode,
  dateRange,
  canViewPurchases,
  canViewExpenses,
  purchaseAnalytics,
  expenseAnalytics,
  purchasesLoading,
  expensesLoading,
  purchasesError,
  expensesError,
  onNavigate,
}) => {
  if (!canViewPurchases && !canViewExpenses) return null;

  const purchaseDest = '/dashboard/shop-admin/inventory/purchases';
  const supplierDest =
    mode === 'organization' ? '/dashboard/organization/ledger' : '/dashboard/shop-admin/suppliers';

  return (
    <section aria-labelledby="proc-opex-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="proc-opex-heading"
        title="Procurement & Operating Expenses"
        subtitle="Stock purchases vs supplier cash paid, and categorized operating expenditure"
        badge={dateRange.label}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {canViewPurchases && (
          <DashboardChartCard
            title="Purchases & Procurement"
            subtitle="Purchase invoice value vs immediate payment at receipt"
            badge={purchaseAnalytics.isTruncated ? 'Recent 200 cap' : `${purchaseAnalytics.invoiceCount} Invoices`}
            isError={purchasesError}
            actionLabel="View Purchases"
            onAction={() => onNavigate(purchaseDest)}
            footerText={
              purchaseAnalytics.isTruncated
                ? 'API listPurchases() is capped at 200 recent purchases; older dates may require backend date filter.'
                : `Active demand orders: ${purchaseAnalytics.activeDemandCount} (${formatPkr(purchaseAnalytics.activeDemandValue)})`
            }
            headerRight={
              <button
                type="button"
                onClick={() => onNavigate(supplierDest)}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Supplier Payables
              </button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Purchase Value</p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {formatPkr(purchaseAnalytics.totalPurchaseValue)}
                </p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Paid at Receipt</p>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {formatPkr(purchaseAnalytics.paidAtPurchase)}
                </p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">On Credit</p>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                  {formatPkr(purchaseAnalytics.creditCreated)}
                </p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Open Demands</p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {purchaseAnalytics.activeDemandCount} orders
                </p>
              </div>
            </div>

            <SharedChart
              variant="bar"
              data={purchaseAnalytics.invoiceCount > 0 ? purchaseAnalytics.trendSeries : []}
              height={195}
              minHeight={175}
              isLoading={purchasesLoading}
              emptyMessage="No completed purchase invoices in selected period"
              currency="Rs"
              valueType="currency"
              xAxis={{ dataKey: 'label' }}
              yAxis={{ tickFormatter: (v) => formatCompactPkr(Number(v)) }}
              legend={{ enabled: true, position: 'bottom', align: 'center' }}
              tooltip={{
                enabled: true,
                formatter: (val, name) => [formatPkr(Number(val)), String(name)],
              }}
              barMaxSize={24}
              series={[
                { key: 'purchaseValue', label: 'Purchase Value', color: '#2563eb' },
                { key: 'paidAmount', label: 'Paid', color: '#16a34a' },
              ]}
            />

            {purchaseAnalytics.topSuppliers.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-border/70">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Top Suppliers (Selected Period)
                </p>
                <div className="space-y-1">
                  {purchaseAnalytics.topSuppliers.slice(0, 3).map((sup) => (
                    <div key={sup.name} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary truncate max-w-[60%]">
                        {sup.name} ({sup.count})
                      </span>
                      <span className="font-bold text-text-primary tabular-nums">
                        {formatPkr(sup.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DashboardChartCard>
        )}

        {canViewExpenses && (
          <DashboardChartCard
            title="Operating Expenses Analysis"
            subtitle="Completed business expenses by category & payment channel"
            badge={`${expenseAnalytics.totalCount} Records`}
            isError={expensesError}
            actionLabel="Manage Expenses"
            onAction={() => onNavigate('/dashboard/shop-admin/expenses')}
            footerText={`Cancelled / reversed entries in period: ${expenseAnalytics.cancelledCount}${
              expenseAnalytics.isListTruncated ? ' • Category split reflects first 500 entries' : ''
            }`}
          >
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Total OPEX</p>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                  {formatPkr(expenseAnalytics.totalAmount)}
                </p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Cash Drawer</p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {formatPkr(expenseAnalytics.cashTotal)}
                </p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Bank / Digital</p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {formatPkr(expenseAnalytics.nonCashTotal)}
                </p>
              </div>
            </div>

            <SharedChart
              variant="horizontal-bar"
              data={expenseAnalytics.byCategory}
              height={195}
              minHeight={175}
              isLoading={expensesLoading}
              emptyMessage="No completed operating expenses in selected period"
              currency="Rs"
              valueType="currency"
              yAxis={{ dataKey: 'name' }}
              xAxis={{ tickFormatter: (v) => formatCompactPkr(Number(v)) }}
              tooltip={{
                enabled: true,
                formatter: (val) => [formatPkr(Number(val)), 'Spent'],
              }}
              series={[{ key: 'amount', label: 'Expense Amount', color: '#e11d48' }]}
            />

            {expenseAnalytics.byPaymentMethod.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-border/70 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-text-muted">Channels:</span>
                {expenseAnalytics.byPaymentMethod.map((pm) => (
                  <span
                    key={pm.payment_method}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-hover border border-border text-[11px] text-text-secondary tabular-nums"
                  >
                    <strong className="text-text-primary">{pm.payment_method}</strong>:{' '}
                    {formatPkr(pm.total_amount)} ({pm.count})
                  </span>
                ))}
              </div>
            )}
          </DashboardChartCard>
        )}
      </div>
    </section>
  );
};
