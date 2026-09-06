'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { InventoryProduct, SortField, SortDirection, StockStatus } from '@/features/inventory/types';
import { StockStatusBadge } from '@/components/inventory/StockStatusBadge';
import { ProductActions } from './components/ProductActions';
import { ProductEditModal } from './components/ProductEditModal';
import { ProductDeleteDialog } from './components/ProductDeleteDialog';
import { ProductDetailsDrawer } from './components/ProductDetailsDrawer';
import { QuickStockAdjustModal } from '../components/QuickStockAdjustModal';
import { selectSortConfig, selectSetSort } from '@/features/inventory/core/inventory.selectors';

interface ProductTableProps {
  products: InventoryProduct[];
  isLoading: boolean;
}

function SortIcon({ field, activeField, direction }: { field: SortField; activeField: SortField; direction: SortDirection }) {
  if (field !== activeField) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 text-[#006970] dark:text-[#00B4BB]" />
    : <ArrowDown className="h-3.5 w-3.5 text-[#006970] dark:text-[#00B4BB]" />;
}

export const ProductTable = ({ products, isLoading }: ProductTableProps) => {
  const sort = selectSortConfig();
  const setSort = selectSetSort();

  // Modal / Drawer state
  const [editProduct, setEditProduct] = useState<InventoryProduct | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<InventoryProduct | null>(null);
  const [viewProduct, setViewProduct] = useState<InventoryProduct | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<InventoryProduct | null>(null);

  const handleSort = (field: SortField) => {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const rowBg = (product: InventoryProduct) => {
    if (product.status === StockStatus.OUT_OF_STOCK) return 'bg-red-50/50 dark:bg-red-900/5';
    if (product.status === StockStatus.LOW_STOCK) return 'bg-amber-50/50 dark:bg-amber-900/5';
    return '';
  };

  const columns: { label: string; field?: SortField }[] = [
    { label: 'Product', field: 'name' },
    { label: 'Category', field: 'category' },
    { label: 'SKU' },
    { label: 'Stock', field: 'stock' },
    { label: 'Status' },
    { label: 'Cost', field: 'purchasePrice' },
    { label: 'Price', field: 'price' },
    { label: '' },
  ];

  if (products.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No products found</p>
        <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-white/50 dark:bg-gray-900/50 flex items-start justify-center pt-8 pointer-events-none">
            <div className="h-6 w-6 rounded-full border-2 border-[#006970] border-t-transparent animate-spin"></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {columns.map((col) => (
                <th
                  key={col.label}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap ${col.field ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200' : ''}`}
                  onClick={() => col.field && handleSort(col.field)}
                >
                  <span className="flex items-center gap-1.5">
                    {col.label}
                    {col.field && <SortIcon field={col.field} activeField={sort.field} direction={sort.direction} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {products.map((product) => (
              <tr
                key={product.id}
                className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40 ${rowBg(product)}`}
              >
                <td className="px-4 py-1.5">
                  <button
                    onClick={() => setViewProduct(product)}
                    className="font-medium text-gray-900 dark:text-white whitespace-nowrap hover:text-[#006970] dark:hover:text-[#00B4BB] transition-colors text-left"
                  >
                    {product.name}
                  </button>
                </td>
                <td className="px-4 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">{product.category}</span>
                </td>
                <td className="px-4 py-1.5">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                    {product.sku}
                  </code>
                </td>
                <td className="px-4 py-1.5">
                  <span
                    className={`font-semibold ${
                      product.status === StockStatus.OUT_OF_STOCK ? 'text-red-600 dark:text-red-400' :
                      product.status === StockStatus.LOW_STOCK ? 'text-amber-600 dark:text-amber-400' :
                      'text-gray-900 dark:text-white'
                    }`}
                  >
                    {product.stock} {product.unit}
                  </span>
                </td>
                <td className="px-4 py-1.5">
                  <StockStatusBadge status={product.status} />
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap">
                  <div className="flex flex-col text-xs">
                    <span className="text-gray-900 dark:text-gray-100 font-semibold">
                      Avg: {product.averageCost !== undefined && product.averageCost !== null ? `PKR ${product.averageCost.toLocaleString()}` : (product.purchasePrice ? `PKR ${product.purchasePrice.toLocaleString()}` : '-')}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-[11px]">
                      Last: {product.purchasePrice ? `PKR ${product.purchasePrice.toLocaleString()}` : '-'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-1.5 whitespace-nowrap">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    PKR {product.price.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-1.5">
                  <ProductActions
                    product={product}
                    onView={setViewProduct}
                    onEdit={setEditProduct}
                    onDelete={setDeleteProduct}
                    onAdjustStock={setAdjustProduct}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Stock Adjust Modal */}
      {adjustProduct && (
        <QuickStockAdjustModal
          product={adjustProduct}
          isOpen={true}
          onClose={() => setAdjustProduct(null)}
        />
      )}

      {/* Product Edit Modal */}
      {editProduct && (
        <ProductEditModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
        />
      )}

      {/* Product Delete Dialog */}
      {deleteProduct && (
        <ProductDeleteDialog
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
        />
      )}

      {/* Product Details Drawer */}
      {viewProduct && (
        <ProductDetailsDrawer
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onEdit={(p) => { setViewProduct(null); setEditProduct(p); }}
        />
      )}
    </>
  );
};

export default ProductTable;
