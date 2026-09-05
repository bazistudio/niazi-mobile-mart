'use client';

import React, { useEffect } from 'react';
import { Package, AlertTriangle, XCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { 
  selectFetchProducts,
  selectForceSync,
  selectProducts, 
  selectInventoryStatus, 
  selectInventoryError 
} from '@/features/inventory/core/inventory.selectors';
import { useInventoryData } from '@/features/inventory/hooks/useInventoryData';
import { StockTable } from './StockTable';
import { LowStockAlert } from '@/components/inventory/LowStockAlert';
import { StockStatus } from './stock.types';
import { ErrorState } from '@/shared/components/error-state/ErrorState';
import { LoadingState } from '@/shared/components/loading-state/LoadingState';

export const StockWidget = () => {
  const fetchProducts = selectFetchProducts();
  const forceSync = selectForceSync();
  const products = selectProducts();
  const reqStatus = selectInventoryStatus();
  const error = selectInventoryError();
  
  const { filtered, stats } = useInventoryData();

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const alertProducts = products.filter(
    (p) => p.status === StockStatus.OUT_OF_STOCK || p.status === StockStatus.LOW_STOCK
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-[#006970] dark:text-[#00B4BB]" />
            Stock Control
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage quantities, view alerts, and track adjustment history
          </p>
        </div>
        <button 
          onClick={() => forceSync()}
          disabled={reqStatus === 'loading'}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors self-start disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reqStatus === 'loading' ? 'animate-spin' : ''}`} />
          Sync Now
        </button>
      </div>

      {/* Global Error Fallback */}
      {reqStatus === 'error' && (
        <ErrorState 
          message={error || 'Failed to sync with backend inventory'} 
          onRetry={() => fetchProducts()} 
        />
      )}

      {/* Stock Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1 rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Total Lines</span>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalProducts}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 border border-emerald-100 dark:border-emerald-800/30">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Healthy</span>
          </div>
          <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.healthyCount}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl bg-amber-50 dark:bg-amber-900/10 px-4 py-3 border border-amber-100 dark:border-amber-800/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-600 dark:text-amber-400">Low Stock</span>
          </div>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.lowStockCount}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-xl  dark:/10 px-4 py-3 border  dark:/30">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">Out of Stock</span>
          </div>
          <span className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.outOfStockCount}</span>
        </div>
      </div>

      {/* Stock Health Bar */}
      {stats.totalProducts > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Overall Stock Health</span>
            <span className={`font-semibold ${stats.healthPercentage >= 80 ? 'text-emerald-600' : stats.healthPercentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {stats.healthPercentage}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                stats.healthPercentage >= 80 ? 'bg-emerald-500' :
                stats.healthPercentage >= 50 ? 'bg-amber-500' : ''
              }`}
              style={{ width: `${stats.healthPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Alerts */}
      {alertProducts.length > 0 && (
        <div className="mt-2">
          <LowStockAlert products={alertProducts} />
        </div>
      )}

      {/* Table Section */}
      <div className="mt-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Showing <strong className="text-gray-900 dark:text-white">{filtered.length}</strong> stock lines
          </span>
        </div>
        
        {reqStatus === 'loading' && products.length === 0 ? (
          <LoadingState rows={5} />
        ) : (
          <StockTable products={filtered} isLoading={reqStatus === 'loading'} />
        )}
      </div>
    </div>
  );
};

export default StockWidget;
