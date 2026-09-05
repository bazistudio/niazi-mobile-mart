'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { InventoryProduct } from '@/features/inventory/types';
import { selectDeleteProduct } from '@/features/inventory/core/inventory.selectors';
import toast from 'react-hot-toast';

interface ProductDeleteDialogProps {
  product: InventoryProduct;
  onClose: () => void;
}

export const ProductDeleteDialog = ({ product, onClose }: ProductDeleteDialogProps) => {
  const deleteProduct = selectDeleteProduct();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await deleteProduct(product.id);
      toast.success(`${product.name} removed from inventory`);
      onClose();
    } catch {
      // Toast already shown by global interceptor
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 p-6 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Remove Product?
            </h3>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{product.name}</span> will be
              removed from your active inventory. This action can be reversed by support if needed.
            </p>
          </div>

          {/* Note: Soft delete — product is not physically deleted */}
          <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 w-full">
            ℹ️ Product data is preserved for audit and sales history purposes.
          </p>

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Removing...</>
              ) : (
                'Remove Product'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDeleteDialog;
