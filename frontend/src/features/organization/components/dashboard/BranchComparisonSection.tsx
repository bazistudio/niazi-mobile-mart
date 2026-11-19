import React, { useMemo } from 'react';
import { Store } from 'lucide-react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardChartCard } from './DashboardChartCard';
import type { ExpenseSummary, OrgCashSummaryDto } from '@/lib/tauri/tauriClient';
import type { MobileOrganizationSummary } from '@/features/mobiles/services/mobile.api';
import type { BranchComparisonMetricRow } from '../../services/commandCenter.api';
import { formatCompactPkr, formatPkr, type DashboardDateRange } from '../../utils/dashboardDates';

interface BranchComparisonSectionProps {
  dateRange: DashboardDateRange;
  branchMetrics: BranchComparisonMetricRow[];
  expenseSummary: ExpenseSummary | null;
  orgCash: OrgCashSummaryDto | null;
  mobileOrgSummary: MobileOrganizationSummary | null;
  isLoading: boolean;
  isError: boolean;
  onSelectBranch: (branchId: string) => void;
}

export const BranchComparisonSection: React.FC<BranchComparisonSectionProps> = ({
  dateRange,
  branchMetrics,
  expenseSummary,
  orgCash,
  mobileOrgSummary,
  isLoading,
  isError,
  onSelectBranch,
}) => {
  const combinedRows = useMemo(() => {
    const expMap = new Map((expenseSummary?.by_branch ?? []).map((e) => [e.branch_id, e.total_amount]));
    const cashMap = new Map((orgCash?.branches ?? []).map((c) => [c.branch_id, c]));
    const mobMap = new Map((mobileOrgSummary?.branches ?? []).map((m) => [m.branch_id, m]));

    return branchMetrics.map((b) => {
      const expenses = Math.round(Number(expMap.get(b.branchId) ?? 0));
      const cashRow = cashMap.get(b.branchId);
      const mobRow = mobMap.get(b.branchId);
      return {
        ...b,
        expenses,
        cashExpected: Math.round(Number(cashRow?.expected_closing_cash ?? 0)),
        cashStatus: cashRow?.session_status ?? 'NONE',
        mobileStockCount: mobRow?.in_stock_count ?? 0,
        mobileValuation: Math.round(Number(mobRow?.total_valuation ?? 0)),
      };
    });
  }, [branchMetrics, expenseSummary, orgCash, mobileOrgSummary]);

  if (!isLoading && combinedRows.length === 0 && !isError) {
    return null;
  }

  return (
    <section aria-labelledby="branch-comp-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="branch-comp-heading"
        title="Multi-Branch Comparison"
        subtitle="Side-by-side branch sales, returns, expenses, gross profit, and register cash (Organization Admin only)"
        badge={dateRange.label}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5">
          <DashboardChartCard
            title="Branch Revenue vs Expenses"
            subtitle={`Period comparison across ${combinedRows.length} retail branch(es)`}
            isError={isError}
            footerText="Cash drawer figure reflects current active/latest business-date session."
          >
            <SharedChart
              variant="bar"
              data={combinedRows}
              height={235}
              minHeight={200}
              isLoading={isLoading}
              emptyMessage="No retail branches available to compare"
              currency="Rs"
              valueType="currency"
              xAxis={{ dataKey: 'branchName' }}
              yAxis={{ tickFormatter: (v) => formatCompactPkr(Number(v)) }}
              legend={{ enabled: true, position: 'bottom', align: 'center' }}
              tooltip={{
                enabled: true,
                formatter: (val, name) => [formatPkr(Number(val)), String(name)],
              }}
              barMaxSize={28}
              series={[
                { key: 'netSales', label: 'Net Sales', color: '#006970' },
                { key: 'expenses', label: 'Expenses', color: '#e11d48' },
              ]}
            />
          </DashboardChartCard>
        </div>

        <div className="lg:col-span-7 bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between min-w-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-text-primary">Branch Scorecard</h3>
            </div>
            <span className="text-[11px] text-text-muted">Click any branch row to filter dashboard</span>
          </div>

          <div className="flex-1 overflow-x-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 bg-surface-hover/50 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/50 text-[11px] font-bold uppercase text-text-muted">
                    <th className="py-2 px-3">Branch</th>
                    <th className="py-2 px-3 text-right">Net Sales</th>
                    <th className="py-2 px-3 text-right">Returns</th>
                    <th className="py-2 px-3 text-right">Gross Profit</th>
                    <th className="py-2 px-3 text-right">OPEX</th>
                    <th className="py-2 px-3 text-right">Drawer Cash</th>
                    <th className="py-2 px-3 text-right">Mobiles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {combinedRows.map((row) => (
                    <tr
                      key={row.branchId}
                      onClick={() => onSelectBranch(row.branchId)}
                      className="hover:bg-surface-hover/60 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-semibold text-text-primary">
                        {row.branchName}{' '}
                        <span className="text-[11px] font-normal text-text-muted">({row.branchCode})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-text-primary">
                        {formatPkr(row.netSales)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                        {formatPkr(row.returnedRevenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                        {formatPkr(row.grossProfit)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {formatPkr(row.expenses)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-text-primary">
                        <div>{formatPkr(row.cashExpected)}</div>
                        <div className="text-[10px] text-text-muted">{row.cashStatus}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">
                        {row.mobileStockCount} units
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
