'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Clock, TrendingUp, AlertCircle } from 'lucide-react';

export interface HourlySalesData {
  hour: string;
  sales: number;
  ordersCount: number;
}

export interface HourlySalesChartProps {
  data: HourlySalesData[];
  isLoading?: boolean;
  onRetry?: () => void;
}

export const HourlySalesChart: React.FC<HourlySalesChartProps> = ({
  data,
  isLoading = false,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="w-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-surface-hover animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-surface-hover rounded animate-pulse" />
              <div className="h-3 w-48 bg-surface-hover rounded animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-20 bg-surface-hover rounded-full animate-pulse" />
        </div>
        <div className="h-64 sm:h-72 w-full bg-surface-hover/40 rounded-xl animate-pulse flex items-center justify-center">
          <span className="text-xs font-semibold text-text-muted">Loading 24-hour sales data...</span>
        </div>
      </div>
    );
  }

  const totalSales = (data || []).reduce((acc, curr) => acc + (curr.sales || 0), 0);
  const totalOrders = (data || []).reduce((acc, curr) => acc + (curr.ordersCount || 0), 0);
  const hasSales = totalSales > 0;

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pointData: HourlySalesData = payload[0].payload;
      return (
        <div className="rounded-xl bg-surface border border-border p-3 shadow-modal text-xs space-y-1 z-50">
          <p className="font-bold text-text-primary flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Time: {label}</span>
          </p>
          <div className="pt-1 border-t border-border space-y-0.5">
            <div className="flex justify-between gap-4 text-text-secondary">
              <span>Sales:</span>
              <span className="font-black text-primary tabular-nums">
                Rs {pointData.sales.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-text-secondary">
              <span>Orders:</span>
              <span className="font-bold text-text-primary tabular-nums">
                {pointData.ordersCount} {pointData.ordersCount === 1 ? 'order' : 'orders'}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">Hourly Sales Progression</h3>
            <p className="text-xs text-text-muted">Today's 24-hour hourly revenue and order velocity</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tabular-nums">
            <span>Today:</span>
            <span className="font-black">Rs {totalSales.toLocaleString()}</span>
          </div>
          <div className="text-xs font-semibold text-text-secondary tabular-nums">
            {totalOrders} {totalOrders === 1 ? 'sale' : 'sales'}
          </div>
        </div>
      </div>

      {/* Chart Canvas or Empty State */}
      {!hasSales ? (
        <div className="h-64 sm:h-72 w-full rounded-xl bg-surface-hover/30 border border-dashed border-border flex flex-col items-center justify-center p-6 text-center">
          <Clock className="h-8 w-8 text-text-muted mb-2 opacity-50" />
          <p className="text-sm font-bold text-text-secondary">No sales recorded today</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            Completed transactions from POS will automatically populate the 24-hour timeline.
          </p>
        </div>
      ) : (
        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="hourlySalesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#006970" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#006970" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e5e7eb)" opacity={0.6} />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-muted, #9ca3af)', fontWeight: 600 }}
                interval={2}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-muted, #9ca3af)', fontWeight: 600 }}
                tickFormatter={(val) => `Rs ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#006970"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#hourlySalesGradient)"
                activeDot={{ r: 5, stroke: '#006970', strokeWidth: 2, fill: '#ffffff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default HourlySalesChart;
