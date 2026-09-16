import React from 'react';
import { InventoryTable, TableColumn } from '@/features/inventory/components/InventoryTable';
import { useInventoryFilters } from '@/features/inventory/components/InventoryFilterContext';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';
import { Loader2, Plus } from 'lucide-react';

export function InventoryProductsPage() {
  const { filters } = useInventoryFilters();
  
  const { products, isLoading, error } = useProducts({
    page: 1,
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
        <button className="text-[#006970] dark:text-[#00B4BB] hover:underline font-medium cursor-pointer">
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
      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <div>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Products Directory ({products.length})
          </span>
        </div>
        <button
          type="button"
          onClick={() => useInventoryUIStore.getState().setAddProductOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#006970] hover:bg-[#005a60] rounded shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          + Add Product / Stock
        </button>
      </div>

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

export default InventoryProductsPage;
