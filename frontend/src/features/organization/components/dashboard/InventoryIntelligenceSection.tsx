import React from 'react';
import { Package, Smartphone, AlertTriangle, ChevronRight } from 'lucide-react';
import { SharedChart } from '@/components/charts/SharedChart';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { DashboardChartCard } from './DashboardChartCard';
import { formatCompactPkr, formatPkr } from '../../utils/dashboardDates';
import type { InventoryIntelligence } from '../../utils/dashboardCalculations';

interface InventoryIntelligenceSectionProps {
  mode: 'organization' | 'branch';
  inventory: InventoryIntelligence;
  isLoading: boolean;
  isError: boolean;
  onNavigate: (href: string) => void;
}

export const InventoryIntelligenceSection: React.FC<InventoryIntelligenceSectionProps> = ({
  mode,
  inventory,
  isLoading,
  isError,
  onNavigate,
}) => {
  const catalogDest =
    mode === 'organization' ? '/dashboard/organization/products' : '/dashboard/shop-admin/inventory';
  const mobileDest =
    mode === 'organization'
      ? '/dashboard/organization/mobile-inventory'
      : '/dashboard/shop-admin/mobiles';
  const lowStockDest =
    mode === 'organization'
      ? '/dashboard/organization/products'
      : '/dashboard/shop-admin/inventory/low-stock';

  return (
    <section aria-labelledby="inventory-intel-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="inventory-intel-heading"
        title="Inventory & Mobile Asset Intelligence"
        subtitle="Weighted-average-cost (WAC) catalog valuation, serialized mobile inventory, and low-stock watchlist"
        badge={`${inventory.totalSkus} Active SKUs • ${inventory.mobileInStockCount} Mobiles`}
        actionLabel="Open Inventory"
        onAction={() => onNavigate(catalogDest)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Valuation & Category Chart */}
        <div className="lg:col-span-6">
          <DashboardChartCard
            title="Stock Valuation by Category (WAC Cost)"
            subtitle="Catalog stock cost value & mobile handset investment (not revenue or cash)"
            isError={isError}
            actionLabel="Mobile Inventory"
            onAction={() => onNavigate(mobileDest)}
            footerText={`Catalog est. retail margin potential: ${formatPkr(inventory.estimatedCatalogMargin)}`}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted flex items-center gap-1">
                  <Package className="w-3 h-3" /> Catalog Cost
                </p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {formatPkr(inventory.catalogCostValuation)}
                </p>
                <p className="text-[10px] text-text-muted">{inventory.catalogUnits.toLocaleString()} units</p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted">Retail Value</p>
                <p className="text-xs font-bold text-primary tabular-nums mt-0.5">
                  {formatPkr(inventory.catalogRetailValuation)}
                </p>
                <p className="text-[10px] text-text-muted">At sale price</p>
              </div>
              <div className="rounded bg-surface-hover/60 border border-border/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-text-muted flex items-center gap-1">
                  <Smartphone className="w-3 h-3" /> Mobiles Cost
                </p>
                <p className="text-xs font-bold text-teal-700 dark:text-teal-400 tabular-nums mt-0.5">
                  {formatPkr(inventory.mobileValuation)}
                </p>
                <p className="text-[10px] text-text-muted">
                  {inventory.mobileNewCount}N / {inventory.mobileUsedCount}U
                </p>
              </div>
              <div className="rounded bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase text-amber-800 dark:text-amber-300">
                  Stock Alerts
                </p>
                <p className="text-xs font-bold text-text-primary tabular-nums mt-0.5">
                  {inventory.outOfStockCount} Out / {inventory.lowStockCount} Low
                </p>
                <p className="text-[10px] text-text-muted">Active SKUs</p>
              </div>
            </div>

            <SharedChart
              variant="horizontal-bar"
              data={inventory.byCategory}
              height={210}
              minHeight={185}
              isLoading={isLoading}
              emptyMessage="No active catalog stock found"
              currency="Rs"
              valueType="currency"
              yAxis={{ dataKey: 'name' }}
              xAxis={{ tickFormatter: (v) => formatCompactPkr(Number(v)) }}
              tooltip={{
                enabled: true,
                formatter: (val) => [formatPkr(Number(val)), 'Cost Valuation'],
              }}
              series={[{ key: 'costValuation', label: 'Cost Valuation', color: '#006970' }]}
            />
          </DashboardChartCard>
        </div>

        {/* Right: Compact Actionable Low-Stock & Out-of-Stock Watchlist */}
        <div className="lg:col-span-6 bg-surface rounded-lg border border-border shadow-xs flex flex-col justify-between min-w-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text-primary truncate">
                  Low-Stock & Out-of-Stock Watchlist
                </h3>
                <p className="text-xs text-text-muted truncate">
                  Active SKUs at or below configured reorder threshold
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(lowStockDest)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer shrink-0"
            >
              Manage Stock <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 bg-surface-hover/50 rounded animate-pulse" />
                ))}
              </div>
            ) : inventory.lowStockWatchlist.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center text-xs text-text-muted">
                All active products are currently above their low-stock thresholds.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/50 text-[11px] font-bold uppercase text-text-muted">
                    <th className="py-2 px-3">Product / SKU</th>
                    <th className="py-2 px-3 text-right">On Hand</th>
                    <th className="py-2 px-3 text-right">Min</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {inventory.lowStockWatchlist.slice(0, 8).map((item) => (
                    <tr
                      key={`${item.productId}-${item.branchName}`}
                      className="hover:bg-surface-hover/40 transition-colors"
                    >
                      <td className="py-2 px-3 min-w-0">
                        <p className="font-semibold text-text-primary truncate max-w-[230px]">
                          {item.productName}
                        </p>
                        <p className="text-[11px] text-text-muted font-mono truncate">
                          {item.sku} • {item.branchName}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-bold tabular-nums text-text-primary">
                        {item.currentQuantity}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                        {item.threshold}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'OUT_OF_STOCK'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}
                        >
                          {item.status === 'OUT_OF_STOCK' ? 'Out' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-border bg-surface-hover/40 flex items-center justify-between text-xs rounded-b-lg">
            <span className="text-text-muted">
              Combined Asset Cost: <strong className="text-text-primary">{formatPkr(inventory.combinedCostValuation)}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigate(mobileDest)}
              className="font-semibold text-primary hover:underline cursor-pointer"
            >
              Mobile Handsets ({inventory.mobileInStockCount})
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
