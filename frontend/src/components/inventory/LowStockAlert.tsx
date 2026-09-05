'use client';

import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { InventoryProduct, StockStatus } from '../../features/inventory/types';
import { StockStatusBadge } from './StockStatusBadge';

interface LowStockAlertProps {
  products: InventoryProduct[];
}

export const LowStockAlert = ({ products }: LowStockAlertProps) => {
  if (products.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {products.slice(0, 3).map((product) => (
        <div 
          key={product.id}
          className="flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-[#006970]/30 transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
              product.status === StockStatus.OUT_OF_STOCK 
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' 
                : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
            }`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-[#006970] dark:group-hover:text-[#00B4BB] transition-colors">
                {product.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {product.stock} {product.unit} remaining
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StockStatusBadge status={product.status} />
            <button className="p-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      {products.length > 3 && (
        <button className="text-xs font-medium text-[#006970] dark:text-[#00B4BB] hover:underline self-start px-2 py-1">
          View {products.length - 3} more critical items
        </button>
      )}
    </div>
  );
};
