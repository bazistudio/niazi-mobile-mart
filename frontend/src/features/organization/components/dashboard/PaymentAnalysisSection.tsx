import React from 'react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardChartCard } from './DashboardChartCard';
import { formatPkr } from '../../utils/dashboardDates';
import type { PaymentSettlementAnalytics } from '../../utils/dashboardCalculations';

interface PaymentAnalysisSectionProps {
  settlement: PaymentSettlementAnalytics;
  todayCashSales: number;
  todayCustomerCollections: number;
  showCashTodaySupplement: boolean;
  isLoading: boolean;
  onViewCash: () => void;
}

export const PaymentAnalysisSection: React.FC<PaymentAnalysisSectionProps> = ({
  settlement,
  todayCashSales,
  todayCustomerCollections,
  showCashTodaySupplement,
  isLoading,
  onViewCash,
}) => {
  return (
    <DashboardChartCard
      title="Invoice Settlement & Credit"
      subtitle="Paid at checkout vs credit receivable exposure"
      badge={`${settlement.settlementRate}% Settled`}
      actionLabel="Cash & Accounts"
      onAction={onViewCash}
      footerText="Note: Historical tender split (Cash/Bank/EasyPaisa per invoice) requires backend payment-line aggregation."
    >
      <div className="flex flex-col items-center">
        <SharedChart
          variant="donut"
          data={settlement.chartData}
          height={185}
          minHeight={170}
          maxWidth={260}
          align="center"
          isLoading={isLoading}
          emptyMessage="No completed invoices in selected period"
          currency="Rs"
          valueType="currency"
          legend={{ enabled: true, position: 'bottom', align: 'center' }}
          tooltip={{
            enabled: true,
            formatter: (val, name) => [formatPkr(Number(val)), String(name)],
          }}
          series={[{ key: 'value', label: 'Amount', color: '#006970' }]}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Total Invoiced</span>
          <span className="font-bold text-text-primary tabular-nums">
            {formatPkr(settlement.totalInvoiced)} ({settlement.invoiceCount})
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Settled at Checkout</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatPkr(settlement.settledAmount)} ({settlement.paidCount} paid)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Credit Sales / Unpaid</span>
          <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatPkr(settlement.creditExposure)} ({settlement.partialCount + settlement.unpaidCount})
          </span>
        </div>

        {showCashTodaySupplement && (
          <div className="pt-2 mt-2 border-t border-border/70 grid grid-cols-2 gap-2">
            <div className="rounded bg-surface-hover/60 px-2.5 py-1.5">
              <p className="text-[10px] uppercase font-semibold text-text-muted">Drawer Cash Sales (Today)</p>
              <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                {formatPkr(todayCashSales)}
              </p>
            </div>
            <div className="rounded bg-surface-hover/60 px-2.5 py-1.5">
              <p className="text-[10px] uppercase font-semibold text-text-muted">Debt Collected (Today)</p>
              <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                {formatPkr(todayCustomerCollections)}
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardChartCard>
  );
};
