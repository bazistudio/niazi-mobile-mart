import React, { useState } from 'react';
import { InventoryTable, TableColumn } from '@/features/inventory/components/InventoryTable';
import { useInventoryFilters } from '@/features/inventory/components/InventoryFilterContext';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';
import { ProductEditModal } from '@/features/inventory/product/components/ProductEditModal';
import { ProductDeleteDialog } from '@/features/inventory/product/components/ProductDeleteDialog';
import { QuickStockAdjustModal } from '@/features/inventory/components/QuickStockAdjustModal';
import { Loader2, Edit, Trash2, Plus } from 'lucide-react';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';

interface InventoryProductsPageProps {
  mode?: 'products' | 'restock';
}

export function InventoryProductsPage({ mode = 'products' }: InventoryProductsPageProps) {
  const queryClient = useQueryClient();
  const fetchProductsStore = useInventoryStore((state) => state.fetchProducts);

  const { role, hasPermission } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const normalizedRole = (role || '').toUpperCase();
  const canViewCost = isOrgAdmin || (!['SALESMAN', 'CASHIER'].includes(normalizedRole) && (hasPermission(PERMISSIONS.INVENTORY_VIEW) || hasPermission(PERMISSIONS.PURCHASES_VIEW)));
  const canAdjustStock = hasPermission(PERMISSIONS.INVENTORY_EDIT);

  const { filters } = useInventoryFilters();
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<InventoryProduct | null>(null);
  const [restockProduct, setRestockProduct] = useState<InventoryProduct | null>(null);

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

  const isRestockMode = mode === 'restock';

  const handleRestockSuccess = async () => {
    setRestockProduct(null);
    // Invalidate React Query caches for products, stock, and dashboard
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    // Also sync the Zustand inventory store if active
    try {
      await fetchProductsStore();
    } catch {
      // Store sync failure non-blocking
    }
  };

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
    ...(canViewCost ? [
      { key: 'purchasePrice', label: 'Purchase', render: (row: InventoryProduct) => `Rs. ${(row.purchasePrice || 0).toLocaleString()}` },
    ] : []),
    { key: 'price', label: 'Sale', render: (row: InventoryProduct) => `Rs. ${(row.price || 0).toLocaleString()}` },
    ...(canViewCost ? [
      {
        key: 'totalValue',
        label: 'Value',
        render: (row: InventoryProduct) => <span className="font-medium text-[#006970] dark:text-[#00B4BB]">Rs. {((row.stock || 0) * (row.purchasePrice || 0)).toLocaleString()}</span>
      },
    ] : []),
    ...(isRestockMode
      ? (canAdjustStock ? [{
          key: 'actions' as const,
          label: 'Action',
          render: (row: InventoryProduct) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRestockProduct(row)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] hover:bg-[#006970]/20 dark:hover:bg-[#006970]/30 transition-colors cursor-pointer"
                title="Restock Product"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Restock</span>
              </button>
            </div>
          ),
        }] : [])
      : (isOrgAdmin ? [{
          key: 'actions' as const,
          label: 'Action',
          render: (row: InventoryProduct) => (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditingProduct(row)}
                className="inline-flex items-center gap-1 text-[#006970] dark:text-[#00B4BB] hover:underline font-semibold cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeletingProduct(row)}
                className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )
        }] : [])
    ),
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
            {isRestockMode ? `Restock Directory (${products.length})` : `Products Directory (${products.length})`}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-4">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-[#006970]" />
          </div>
        ) : null}
        <InventoryTable columns={columns} data={products} />
      </div>

      {/* Product Edit Modal (Products Mode) */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {/* Row Hard Delete Dialog (Products Mode) */}
      {deletingProduct && (
        <ProductDeleteDialog
          product={deletingProduct}
          onClose={() => setDeletingProduct(null)}
        />
      )}

      {/* Quick Stock Adjust / Restock Modal (Restock Mode) */}
      {restockProduct && (
        <QuickStockAdjustModal
          product={restockProduct}
          isOpen={true}
          initialMode="RESTOCK"
          onClose={() => setRestockProduct(null)}
          onSuccess={handleRestockSuccess}
        />
      )}
    </div>
  );
}

export default InventoryProductsPage;
