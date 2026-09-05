'use client';

import React, { useEffect } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { 
  selectFetchProducts,
  selectForceSync,
  selectProducts, 
  selectInventoryStatus, 
  selectInventoryError 
} from '@/features/inventory/core/inventory.selectors';
import { useInventoryData } from '@/features/inventory/hooks/useInventoryData';
import { InventorySearchBar } from '@/components/inventory/InventorySearchBar';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { ProductTable } from './ProductTable';
import { ErrorState } from '@/shared/components/error-state/ErrorState';
import { LoadingState } from '@/shared/components/loading-state/LoadingState';

export const ProductListWidget = () => {
  const fetchProducts = selectFetchProducts();
  const forceSync = selectForceSync();
  const products = selectProducts();
  const reqStatus = selectInventoryStatus();
  const error = selectInventoryError();
  
  // Custom hook extracts memoized filtered data
  const { filtered, stats } = useInventoryData();

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-[#006970] dark:text-[#00B4BB]" />
            Products
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage product entities, pricing, and categories
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button 
            onClick={() => forceSync()}
            disabled={reqStatus === 'loading'}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reqStatus === 'loading' ? 'animate-spin' : ''}`} />
            Sync Now
          </button>
          
          <Link
            href="/dashboard/shop-admin/products/new"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#006970] hover:bg-[#005a60] rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Product
          </Link>
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
        
        {reqStatus === 'loading' && products.length === 0 ? (
          <LoadingState rows={5} />
        ) : (
          <ProductTable products={filtered} isLoading={reqStatus === 'loading'} />
        )}
      </div>
    </div>
  );
};

export default ProductListWidget;
