'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, Trash2, Eye } from 'lucide-react';
import { InventoryProduct } from '@/features/inventory/types';

interface ProductActionsProps {
  product: InventoryProduct;
  onView: (product: InventoryProduct) => void;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (product: InventoryProduct) => void;
  onAdjustStock?: (product: InventoryProduct) => void;
}

export const ProductActions = ({ product, onView, onEdit, onDelete, onAdjustStock }: ProductActionsProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleAction = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Product actions"
        id={`product-actions-${product.id}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          <button
            onClick={() => handleAction(() => onView(product))}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Eye className="h-3.5 w-3.5 text-gray-400" />
            View Details
          </button>
          <button
            onClick={() => handleAction(() => onEdit(product))}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5 text-blue-400" />
            Edit Product
          </button>
          {onAdjustStock && (
            <button
              onClick={() => handleAction(() => onAdjustStock(product))}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors font-medium"
            >
              <span className="text-xs">⚡</span>
              Quick Adjust Stock
            </button>
          )}
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <button
            onClick={() => handleAction(() => onDelete(product))}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductActions;
