'use client';

import React from 'react';
import { InventoryTable, TableColumn } from '@/components/inventory/InventoryTable';

import { useInventoryFilters } from '@/components/inventory/InventoryFilterContext';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';
import { Loader2 } from 'lucide-react';

export default function InventoryProductsPage() {
  const { filters } = useInventoryFilters();
  
  const { products, isLoading, error } = useProducts({
    page: 1, // Todo: Add pagination state
    limit: 50,
    search: filters.search,
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    companyId: filters.companyId,
    colorId: filters.colorId,
    qualityId: filters.qualityId,
  });

  const columns: TableColumn<InventoryProduct>[] = [
    { key: 'name', label: 'Name', render: (row) => (
      <div>
        <div className="font-medium">{row.name}</div>
        {row.sku && <div className="text-xs text-gray-500">{row.sku}</div>}
      </div>
    )},
    { key: 'category', label: 'Category' },
    { key: 'brand', label: 'Brand' },
    { key: 'company', label: 'Company' },
    { key: 'color', label: 'Color' },
    { key: 'quality', label: 'Quality' },
    { key: 'stock', label: 'Stock', render: (row) => (
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          row.status === StockStatus.HEALTHY ? 'bg-green-500' :
          row.status === StockStatus.LOW_STOCK ? 'bg-yellow-500' : 'bg-red-500'
        }`}></span>
        <span>{row.stock}</span>
      </div>
    )},
    { key: 'purchasePrice', label: 'Purchase', render: (row) => `Rs. ${(row.purchasePrice || 0).toLocaleString()}` },
    { key: 'price', label: 'Sale', render: (row) => `Rs. ${(row.price || 0).toLocaleString()}` },
    { 
      key: 'totalValue', 
      label: 'Value', 
      render: (row) => <span className="font-medium text-[#006970] dark:text-[#00B4BB]">Rs. {((row.stock || 0) * (row.purchasePrice || 0)).toLocaleString()}</span>
    },
    { 
      key: 'actions', 
      label: 'Action', 
      render: () => (
        <button className="text-[#006970] dark:text-[#00B4BB] hover:underline font-medium">
          Edit
        </button>
      )
    },
  ];

  if (error) {
    return <div className="p-4 text-red-500">Failed to load products.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      
      {/* Table Area (Maximized) */}
      <div className="flex-1 overflow-hidden relative p-4">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-[#006970]" />
          </div>
        ) : null}
        <InventoryTable columns={columns} data={products} />
      </div>

    </div>
  );
}
