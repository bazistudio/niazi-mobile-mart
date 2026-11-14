'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, CreditCard, Receipt, Package, RefreshCw } from 'lucide-react';
import { KPIGrid } from '@/components/kpi/KPIGrid';
import { KPIData } from '@/types/dashboard/kpi.types';
import { HourlySalesChart, HourlySalesData } from '../HourlySalesChart';
import { CategorySalesDistribution, CategorySalesData } from '../CategorySalesDistribution';
import { AiRecommendations } from '../AiRecommendations';
import { StockWidget } from '@/features/inventory/stock/StockWidget';
import { DailySalesModal } from './DailySalesModal';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/services/dashboard.api';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { expensesApi } from '@/services/expenses.api';
import { ExpenseSummary } from '@/lib/tauri/tauriClient';
import { ReceiptText, Wallet, Ban } from 'lucide-react';

export const ShopAdminDashboard = () => {
  const [filter, setFilter] = useState<'today' | 'week' | 'month'>('today');
  const [isDailySalesModalOpen, setIsDailySalesModalOpen] = useState(false);

  // Canonical branch context from store: reactive to topbar branch switcher
  const activeShopId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id || null);

  // Gate 5: Expense analytics for dashboard
  const [expenseSummary, setExpenseSummary] = React.useState<ExpenseSummary | null>(null);
  const [isExpenseFetching, setIsExpenseFetching] = React.useState(false);

  React.useEffect(() => {
    // DEFECT-06 FIX: Use local date components instead of .toISOString() which
    // returns UTC and shifts to the previous day between 00:00–04:59 PKT (UTC+5).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setIsExpenseFetching(true);
    expensesApi
      .getExpenseSummary({ branch_id: activeShopId, start_date: today, end_date: today })
      .then(setExpenseSummary)
      .catch(() => {/* non-critical */})
      .finally(() => setIsExpenseFetching(false));
  }, [activeShopId]);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const searchInvoice = searchParams.get('invoice');

  useEffect(() => {
    if (searchInvoice) {
      setIsDailySalesModalOpen(true);
    }
  }, [searchInvoice]);

  const handleCloseModal = () => {
    setIsDailySalesModalOpen(false);
    if (searchInvoice) {
      navigate(pathname, { replace: true });
    }
  };

  // 1. Authoritative Metrics Query (Scoped by active branch)
  const {
    data: dashboardResponse,
    isLoading: isMetricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: queryKeys.dashboard.byBranch(activeShopId),
    queryFn: () => dashboardApi.getMetrics(activeShopId),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 2. Dedicated Backend Hourly Breakdown Query (Scoped by active branch)
  const {
    data: hourlyBreakdownResponse,
    isLoading: isHourlyLoading,
    refetch: refetchHourly,
  } = useQuery({
    queryKey: [...queryKeys.dashboard.byBranch(activeShopId), 'hourly-breakdown'],
    queryFn: () => dashboardApi.getHourlyBreakdown({ branchId: activeShopId }),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const metrics = dashboardResponse?.data;
  const hourlyData = hourlyBreakdownResponse?.data;

  const hourlySalesData = useMemo<HourlySalesData[]>(() => {
    if (hourlyData?.hourlySales && hourlyData.hourlySales.length > 0) {
      return hourlyData.hourlySales;
    }
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      sales: 0,
      ordersCount: 0,
    }));
  }, [hourlyData?.hourlySales]);

  const categorySalesData = useMemo<CategorySalesData[]>(() => {
    return hourlyData?.categorySales || [];
  }, [hourlyData?.categorySales]);

  const computedTopProduct = useMemo(() => {
    return hourlyData?.topProduct || undefined;
  }, [hourlyData?.topProduct]);

  const getFilterValue = (field: 'revenue' | 'profit', currentFilter: 'today' | 'week' | 'month') => {
    if (!metrics) return 0;
    const key = currentFilter === 'today' ? 'today' : 'thisMonth';
    return metrics.summary[field][key] || 0;
  };

  const kpiData: KPIData[] = [
    {
      title: "Today's Sales",
      value: isMetricsLoading ? 'Loading...' : `${metrics?.summary.orders.today || 0} Sales`,
      trend: 0,
      icon: <Receipt className="h-5 w-5" />,
      format: 'number',
      timeframe: `₨ ${(metrics?.summary.revenue.today || 0).toLocaleString()}`,
      onClick: () => setIsDailySalesModalOpen(true),
    },
    {
      title: "Today's Revenue",
      value: isMetricsLoading ? 'Loading...' : `₨ ${(metrics?.summary.revenue.today || 0).toLocaleString()}`,
      trend: 0,
      icon: <DollarSign className="h-5 w-5" />,
      format: 'currency',
      timeframe: 'vs. Yesterday',
    },
    {
      title: 'Estimated Profit',
      value: isMetricsLoading ? 'Loading...' : `₨ ${(getFilterValue('profit', filter) || 0).toLocaleString()}`,
      trend: metrics?.summary.revenue.growth || 0,
      icon: <TrendingUp className="h-5 w-5" />,
      format: 'currency',
      timeframe: filter === 'today' ? 'Today' : 'This Month',
    },
    {
      title: 'Gross Margin',
      value: isMetricsLoading
        ? 'Loading...'
        : `${(
            ((getFilterValue('profit', filter) || 0) / (getFilterValue('revenue', filter) || 1)) *
            100
          ).toFixed(1)}%`,
      trend: 0,
      icon: <CreditCard className="h-5 w-5" />,
      format: 'number',
      timeframe: 'Return on Sales',
    },
  ];


  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* 0. Top Bar: Performance KPIs */}
      <section aria-labelledby="kpi-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 id="kpi-heading" className="text-lg font-bold text-text-primary">
              Overview & Performance
            </h2>
            <p className="text-xs text-text-muted">Real-time sales, profitability, and stock health</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                refetchMetrics();
                refetchHourly();
              }}
              title="Refresh Dashboard"
              className="p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-1.5 border border-border bg-surface rounded-lg text-xs font-bold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer transition-colors hover:bg-surface-hover shadow-xs"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {/* 1. KPI Cards Row */}
        <KPIGrid data={kpiData} isLoading={isMetricsLoading} />
      </section>

      {/* 2. Hourly Sales Progression Chart */}
      <section aria-labelledby="hourly-sales-heading">
        <HourlySalesChart
          data={hourlySalesData}
          isLoading={isHourlyLoading}
          onRetry={refetchHourly}
        />
      </section>

      {/* 3. Mid Analytics Grid: Category Distribution & AI Recommendations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 flex flex-col min-h-0">
          <CategorySalesDistribution
            data={categorySalesData}
            isLoading={isHourlyLoading}
          />
        </div>

        <div className="lg:col-span-6 flex flex-col min-h-0">
          <AiRecommendations
            lowStockCount={metrics?.summary.inventory.lowStockItems || 0}
            topProduct={computedTopProduct}
            pendingPaymentsAmount={metrics?.summary.customers.pendingPayments || 0}
            isLoading={isMetricsLoading || isHourlyLoading}
          />
        </div>
      </section>

      {/* Gate 5: Expense Analytics Strip */}
      {(expenseSummary || isExpenseFetching) && (
        <section aria-labelledby="expense-analytics-heading">
          <div className="rounded-2xl bg-surface border border-border shadow-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 id="expense-analytics-heading" className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-orange-500" />
                  Today's Expense Overview
                </h3>
                <p className="text-xs text-text-muted mt-0.5">Business expenses recorded today (COMPLETED only)</p>
              </div>
              {isExpenseFetching && (
                <span className="text-xs text-text-muted animate-pulse">Refreshing…</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total Expenses */}
              <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-text-muted">Total Expenses</span>
                </div>
                <p className="text-lg font-bold text-text-primary">
                  PKR {(expenseSummary?.total_amount ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {expenseSummary?.total_count ?? 0} records
                </p>
              </div>

              {/* Cash Expenses */}
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                <div className="flex items-center gap-2 mb-2">
                  <ReceiptText className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-text-muted">Cash Expenses</span>
                </div>
                <p className="text-lg font-bold text-text-primary">
                  PKR {(expenseSummary?.cash_total ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-0.5">Deducted from drawer</p>
              </div>

              {/* Non-Cash Expenses */}
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-text-muted">Non-Cash</span>
                </div>
                <p className="text-lg font-bold text-text-primary">
                  PKR {(expenseSummary?.non_cash_total ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-0.5">Card, Bank, Digital</p>
              </div>

              {/* Cancelled */}
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-700">
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="w-4 h-4 text-neutral-400" />
                  <span className="text-xs text-text-muted">Cancelled</span>
                </div>
                <p className="text-lg font-bold text-text-primary">
                  {expenseSummary?.cancelled_count ?? 0}
                </p>
                <p className="text-xs text-text-muted mt-0.5">Reversed entries</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Inventory Brain Section */}
      <section aria-labelledby="inventory-heading">
        <div className="rounded-2xl bg-surface border border-border shadow-card p-5 sm:p-6">
          <StockWidget />
        </div>
      </section>

      {/* Daily Sales Modal */}
      <DailySalesModal
        isOpen={isDailySalesModalOpen}
        onClose={handleCloseModal}
        branchId={activeShopId}
      />
    </div>
  );
};

export default ShopAdminDashboard;
