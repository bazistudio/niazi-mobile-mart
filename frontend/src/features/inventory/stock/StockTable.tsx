'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, History } from 'lucide-react';
import { InventoryProduct, SortField, SortDirection, InventoryAdjustmentType } from '@/features/inventory/types';
import { StockStatus } from './stock.types';
import { selectSortConfig, selectSetSort, selectFetchProducts } from '@/features/inventory/core/inventory.selectors';
import { inventoryApi } from '../api/inventory.api';

interface StockTableProps {
  products: InventoryProduct[];
  isLoading: boolean;
}

function SortIcon({ field, activeField, direction }: { field: SortField; activeField: SortField; direction: SortDirection }) {
  if (field !== activeField) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 text-[#006970] dark:text-[#00B4BB]" />
    : <ArrowDown className="h-3.5 w-3.5 text-[#006970] dark:text-[#00B4BB]" />;
}

export const StockTable = ({ products, isLoading }: StockTableProps) => {
  const sort = selectSortConfig();
  const setSort = selectSetSort();
  const fetchProducts = selectFetchProducts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleSort = (field: SortField) => {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const startEdit = (product: InventoryProduct) => {
    setEditingId(product.id);
    setEditValue(String(product.stock));
  };

  const commitEdit = async (productId: string) => {
    const newStock = parseInt(editValue, 10);
    if (!isNaN(newStock) && newStock >= 0) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const oldStock = product.stock;
        if (oldStock !== newStock) {
          const type = newStock > oldStock 
            ? InventoryAdjustmentType.INCREASE 
            : InventoryAdjustmentType.DECREASE;
          const diff = Math.abs(newStock - oldStock);
          try {
            await inventoryApi.adjustStock(productId, diff, type, 'Manual dashboard adjustment');
            await fetchProducts(); // Reload from backend of truth
          } catch (error: any) {
            import('react-hot-toast').then(m => m.default.error(error.message || 'Failed to adjust stock'));
          }
        }
      }
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') commitEdit(productId);
    if (e.key === 'Escape') setEditingId(null);
  };

  const rowBg = (product: InventoryProduct) => {
    if (product.status === StockStatus.OUT_OF_STOCK) return 'bg-red-50/50 dark:bg-red-900/5';
    if (product.status === StockStatus.LOW_STOCK) return 'bg-amber-50/50 dark:bg-amber-900/5';
    return '';
  };

  const columns: { label: string; field?: SortField }[] = [
    { label: 'Product', field: 'name' },
    { label: 'SKU' },
    { label: 'Current Stock', field: 'stock' },
    { label: 'Status' },
    { label: 'History' },
  ];

  if (products.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No products found</p>
      </div>
    );
  }

  return (
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
              <td className="px-4 py-1.5 font-medium text-gray-900 dark:text-white">
                {product.name}
              </td>
              <td className="px-4 py-1.5">
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                  {product.sku}
                </code>
              </td>
              <td className="px-4 py-1.5">
                {editingId === product.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(product.id)}
                      onKeyDown={(e) => handleKeyDown(e, product.id)}
                      autoFocus
                      className="w-20 rounded border border-[#006970] bg-white dark:bg-gray-800 px-2 py-1 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
                    />
                    <span className="text-xs text-gray-500">Press Enter</span>
                  </div>
                ) : (
                  <span
                    className={`font-semibold cursor-pointer hover:text-[#006970] dark:hover:text-[#00B4BB] transition-colors inline-block px-2 py-1 border border-transparent hover:border-[#006970]/30 rounded ${
                      product.status === StockStatus.OUT_OF_STOCK ? 'text-red-600 dark:text-red-400' :
                      product.status === StockStatus.LOW_STOCK ? 'text-amber-600 dark:text-amber-400' :
                      'text-gray-900 dark:text-white'
                    }`}
                    onClick={() => startEdit(product)}
                    title="Click to adjust stock"
                  >
                    {product.stock} {product.unit}
                  </span>
                )}
              </td>
              <td className="px-4 py-1.5">
                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                    product.status === StockStatus.HEALTHY ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                    product.status === StockStatus.LOW_STOCK ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                    'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                  {product.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-4 py-1.5">
                <button
                  className="p-1.5 text-gray-400 hover:text-[#006970] hover:bg-[#006970]/10 rounded-lg transition-colors"
                  title="View Stock History"
                  onClick={() => alert('Stock History view coming soon!')}
                >
                  <History className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StockTable;
