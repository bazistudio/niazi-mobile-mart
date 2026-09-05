'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, ShoppingCart, Target, Loader2 } from 'lucide-react';
import { salesService, SalesMetrics, SalesPeriod } from '../services/sales.service';

import { salesAdapter } from '@/features/realtime-sync/sync.adapters/sales.adapter';

export const SalesAnalyticsWidget = () => {
  const [period, setPeriod] = useState<SalesPeriod>('today');
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchMetrics = () => {
      setIsLoading(true);
      setError(null);
      salesService.getMetrics(period).then((data) => {
        if (isMounted) {
          setMetrics(data);
          setError(null);
          setIsLoading(false);
        }
      }).catch(err => {
        console.error(err);
        if (isMounted) {
          setError(err.message || 'Failed to load sales analytics');
          setIsLoading(false);
        }
      });
    };

    // Initial fetch
    fetchMetrics();

    // Subscribe to real-time inventory events
    const unsubscribe = salesAdapter.onInvalidate(() => {
      if (isMounted) fetchMetrics();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [period]);

  const tabs: { value: SalesPeriod; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' }
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#006970] dark:text-[#00B4BB]" />
            Sales Analytics
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Read-only financial performance metrics
          </p>
        </div>
        
        <div className="flex bg-gray-100 dark:bg-gray-800/80 p-1 rounded-xl self-start">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setPeriod(tab.value)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === tab.value 
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      {isLoading ? (
        <div className="h-40 flex items-center justify-center border border-gray-100 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-[#006970]" />
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 flex flex-col items-center justify-center text-center">
          <p className="font-semibold text-sm">{error}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setError(null);
              salesService.getMetrics(period).then((data) => {
                setMetrics(data);
                setIsLoading(false);
              }).catch(err => {
                setError(err.message || 'Failed to load sales analytics');
                setIsLoading(false);
              });
            }}
            className="mt-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-2 relative overflow-hidden">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Total Revenue</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              PKR {metrics.totalRevenue.toLocaleString()}
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/20 w-fit px-2 py-0.5 rounded-md mt-1">
              {metrics.periodLabel}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-sm font-medium">Total Orders</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              {metrics.totalOrders}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20 w-fit px-2 py-0.5 rounded-md mt-1">
              {metrics.periodLabel}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium">Average Order</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
              PKR {metrics.averageOrderValue.toLocaleString()}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/20 w-fit px-2 py-0.5 rounded-md mt-1">
              Per Order
            </div>
          </div>
        </div>
      ) : null}

      {/* Chart Placeholder */}
      <div className="h-64 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
        <BarChart3 className="w-10 h-10 text-gray-200 dark:text-gray-800 mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Chart Visualization Pending Integration</p>
      </div>
    </div>
  );
};
