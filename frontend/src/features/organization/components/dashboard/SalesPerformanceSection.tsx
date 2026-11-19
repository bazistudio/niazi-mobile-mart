import React from 'react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardChartCard } from './DashboardChartCard';
import { formatCompactPkr, formatPkr, type DashboardDateRange } from '../../utils/dashboardDates';
import type { SalesTrendPoint } from '../../utils/dashboardCalculations';

interface SalesPerformanceSectionProps {
  mode: 'organization' | 'branch';
  dateRange: DashboardDateRange;
  series: SalesTrendPoint[];
  grossSales: number;
  returnsAmount: number;
  netSales: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  isTruncated: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onViewDetails: () => void;
}

export const SalesPerformanceSection: React.FC<SalesPerformanceSectionProps> = ({
  mode,
  dateRange,
  series,
  grossSales,
  returnsAmount,
  netSales,
  invoiceCount,
  averageInvoiceValue,
  isTruncated,
  isLoading,
  isError,
  onRetry,
  onViewDetails,
}) => {
  const bucketDesc =
    dateRange.bucketMode === 'hourly'
      ? '24-hour PKT hourly gross sales, completed returns, and net revenue'
      : dateRange.bucketMode === 'monthly'
      ? 'Monthly gross sales, returns, and net revenue progression'
      : 'Daily PKT gross sales, completed returns, and net revenue trend';

  const hasActivity = series.some((p) => p.grossSales > 0 || p.returnsAmount > 0);

  return (
    <DashboardChartCard
      title="Sales Performance Trend"
      subtitle={bucketDesc}
      badge={isTruncated ? '1,000+ cap note' : dateRange.label}
      isError={isError}
      onRetry={onRetry}
      actionLabel={mode === 'branch' ? 'Inspect Daily Sales' : 'View All Transactions'}
      onAction={onViewDetails}
      footerText={
        isTruncated
          ? 'KPI totals reflect authoritative backend summary; trend chart is capped at latest 1,000 invoices.'
          : 'Voided sales excluded. Completed returns reduce net revenue at return timestamp.'
      }
      headerRight={
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-text-muted">
            Invoices: <strong className="text-text-primary">{invoiceCount}</strong>
          </span>
          <span className="text-text-muted">
            Avg: <strong className="text-text-primary">{formatPkr(averageInvoiceValue)}</strong>
          </span>
        </div>
      }
    >
      {/* Inline Summary Strip */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <div className="rounded-md bg-surface-hover/60 border border-border/70 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted uppercase">Invoiced Sales</p>
          <p className="text-sm font-bold text-text-primary tabular-nums mt-0.5">
            {formatPkr(grossSales)}
          </p>
        </div>
        <div className="rounded-md bg-surface-hover/60 border border-border/70 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted uppercase">Returns</p>
          <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
            {formatPkr(returnsAmount)}
          </p>
        </div>
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
          <p className="text-[11px] font-semibold text-primary uppercase">Net Revenue</p>
          <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
            {formatPkr(netSales)}
          </p>
        </div>
      </div>

      <SharedChart
        variant="composed"
        data={hasActivity ? series : []}
        height={240}
        minHeight={210}
        isLoading={isLoading}
        emptyMessage="No sales or returns recorded for the selected period"
        currency="Rs"
        valueType="currency"
        xAxis={{ dataKey: 'label' }}
        yAxis={{ tickFormatter: (v) => formatCompactPkr(Number(v)) }}
        legend={{ enabled: true, position: 'bottom', align: 'center' }}
        tooltip={{
          enabled: true,
          formatter: (val, name) => [formatPkr(Number(val)), String(name)],
        }}
        barMaxSize={26}
        series={[
          { key: 'grossSales', label: 'Invoiced Sales', color: '#006970', renderType: 'bar' },
          { key: 'returnsAmount', label: 'Returns', color: '#d97706', renderType: 'bar' },
          { key: 'netSales', label: 'Net Sales', color: '#16a34a', renderType: 'line', strokeWidth: 2 },
        ]}
      />
    </DashboardChartCard>
  );
};
