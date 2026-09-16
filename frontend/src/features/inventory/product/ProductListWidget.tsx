'use client';

import React, { useEffect } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import { selectFetchProducts, selectForceSync } from '@/features/inventory/core/inventory.selectors';
import { useInventoryData } from '@/features/inventory/hooks/useInventoryData';
import { InventorySearchBar } from '@/features/inventory/components/InventorySearchBar';
import { InventoryFilters } from '@/features/inventory/components/InventoryFilters';
import { ProductTable } from './ProductTable';
import { ErrorState } from '@/shared/components/error-state/ErrorState';
import { LoadingState } from '@/shared/components/loading-state/LoadingState';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';

export const ProductListWidget = () => {
  const { hasPermission } = usePermissions();
  const canManageProducts = hasPermission(PERMISSIONS.PRODUCTS_MANAGE);

  const fetchProducts = selectFetchProducts();
  const forceSync = selectForceSync();

  const { filtered, stats, status: reqStatus, error } = useInventoryData();

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-[#006970]" />
            Products Directory
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manage catalog items, pricing, SKU mapping, and stock alert levels
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button 
            onClick={() => forceSync()}
            disabled={reqStatus === 'loading'}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reqStatus === 'loading' ? 'animate-spin' : ''}`} />
            Sync Now
          </button>
          
          {canManageProducts && (
            <button
              type="button"
              onClick={() => useInventoryUIStore.getState().setAddProductOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#006970] hover:bg-[#005a60] rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Global Error Fallback */}
      {reqStatus === 'error' && (
        <ErrorState 
          message={error || 'Failed to sync with backend inventory'} 
          onRetry={() => fetchProducts()} 
        />
      )}

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <InventorySearchBar />
        <InventoryFilters />
      </div>

      {/* Table Section */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Showing <strong className="text-gray-900 dark:text-white">{filtered.length}</strong> of {stats.totalProducts} products
          </span>
        </div>
        
        {reqStatus === 'loading' && filtered.length === 0 ? (
          <LoadingState rows={5} />
        ) : (
          <ProductTable products={filtered} isLoading={reqStatus === 'loading'} />
        )}
      </div>
    </div>
  );
};
