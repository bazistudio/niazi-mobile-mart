'use client';

import React from 'react';
import { PieChart as PieIcon, Layers, Package, ArrowUpRight } from 'lucide-react';

export interface CategorySalesData {
  categoryName: string;
  salesAmount: number;
  itemsSold: number;
  percentage: number;
}

export interface CategorySalesDistributionProps {
  data: CategorySalesData[];
  isLoading?: boolean;
}

export const CategorySalesDistribution: React.FC<CategorySalesDistributionProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="w-full h-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-surface-hover animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-32 bg-surface-hover rounded animate-pulse" />
            <div className="h-3 w-48 bg-surface-hover rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-surface-hover/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalSales = (data || []).reduce((acc, curr) => acc + (curr.salesAmount || 0), 0);
  const hasCategories = data && data.length > 0 && totalSales > 0;

  return (
    <div className="w-full h-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">Category Distribution</h3>
            <p className="text-xs text-text-muted">Breakdown of today's sales by department</p>
          </div>
        </div>

        {hasCategories && (
          <span className="text-xs font-black text-text-secondary tabular-nums">
            {data.length} {data.length === 1 ? 'category' : 'categories'}
          </span>
        )}
      </div>

      {/* Content */}
      {!hasCategories ? (
        <div className="flex-1 min-h-[200px] rounded-xl bg-surface-hover/30 border border-dashed border-border flex flex-col items-center justify-center p-6 text-center">
          <PieIcon className="h-8 w-8 text-text-muted mb-2 opacity-50" />
          <p className="text-sm font-bold text-text-secondary">No category data yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            Completed product sales will automatically reflect category revenue distribution.
          </p>
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px]">
          {data.map((item) => {
            const pct = Math.min(100, Math.max(0, item.percentage || 0));
            return (
              <div
                key={item.categoryName}
                className="p-3 rounded-xl bg-surface-hover/40 border border-border/70 hover:border-primary/40 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-text-primary truncate">
                      {item.categoryName}
                    </span>
                    <span className="text-[10px] text-text-muted font-medium tabular-nums">
                      ({item.itemsSold} {item.itemsSold === 1 ? 'item' : 'items'})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-black text-primary tabular-nums">
                      Rs {item.salesAmount.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-border/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CategorySalesDistribution;
