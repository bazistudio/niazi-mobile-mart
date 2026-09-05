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
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';

export const ShopAdminDashboard = () => {
  const keys = useTenantQueryKeys();
  const [filter, setFilter] = useState<'today' | 'week' | 'month'>('today');
  const [isDailySalesModalOpen, setIsDailySalesModalOpen] = useState(false);

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

  // 1. Authoritative Metrics Query
  const {
    data: dashboardResponse,
    isLoading: isMetricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => dashboardApi.getMetrics(),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 2. Dedicated Backend Hourly Breakdown Query (Pre-aggregated hourly, category, and top product)
  const {
    data: hourlyBreakdownResponse,
    isLoading: isHourlyLoading,
    refetch: refetchHourly,
  } = useQuery({
    queryKey: keys.dashboard ? [...keys.dashboard, 'hourly-breakdown'] : ['dashboard', 'hourly-breakdown'],
    queryFn: () => dashboardApi.getHourlyBreakdown(),
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
      />
    </div>
  );
};

export default ShopAdminDashboard;
