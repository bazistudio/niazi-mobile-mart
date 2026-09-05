'use client';

import React from 'react';
import { X, Package, Tag, Hash, ShoppingBag, BarChart2, Clock, Edit2 } from 'lucide-react';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';
import { StockStatusBadge } from '@/components/inventory/StockStatusBadge';

interface ProductDetailsDrawerProps {
  product: InventoryProduct;
  onClose: () => void;
  onEdit: (product: InventoryProduct) => void;
}

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide shrink-0">{label}</span>
    <span className="text-sm text-gray-900 dark:text-white text-right">{value || <span className="text-gray-400">—</span>}</span>
  </div>
);

export const ProductDetailsDrawer = ({ product, onClose, onEdit }: ProductDetailsDrawerProps) => {
  const margin = product.purchasePrice && product.price
    ? (((product.price - product.purchasePrice) / product.purchasePrice) * 100).toFixed(1)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-100 dark:border-gray-800 flex flex-col animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#006970]/10 dark:bg-[#00B4BB]/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-[#006970] dark:text-[#00B4BB]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{product.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{product.brand || 'No brand'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onEdit(product); onClose(); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              title="Edit product"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stock Overview */}
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              <BarChart2 className="h-3.5 w-3.5" /> Stock
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 border border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Current Stock</p>
                <p className={`text-2xl font-bold mt-1 ${
                  product.status === StockStatus.OUT_OF_STOCK ? 'text-red-600' :
                  product.status === StockStatus.LOW_STOCK ? 'text-amber-600' :
                  'text-gray-900 dark:text-white'
                }`}>{product.stock}</p>
                <p className="text-xs text-gray-400">{product.unit}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 border border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                <div className="mt-2">
                  <StockStatusBadge status={product.status} />
                </div>
                <p className="text-xs text-gray-400 mt-1">Threshold: {product.minStockThreshold}</p>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              <ShoppingBag className="h-3.5 w-3.5" /> Pricing
            </h3>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <DetailRow label="Sale Price" value={`PKR ${product.price.toLocaleString()}`} />
              <DetailRow
                label="Purchase Price"
                value={product.purchasePrice ? `PKR ${product.purchasePrice.toLocaleString()}` : null}
              />
              <DetailRow
                label="Margin"
                value={margin ? (
                  <span className={Number(margin) >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600'}>
                    {margin}%
                  </span>
                ) : null}
              />
            </div>
          </section>

          {/* Meta */}
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              <Tag className="h-3.5 w-3.5" /> Meta
            </h3>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <DetailRow label="SKU" value={product.sku ? <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{product.sku}</code> : null} />
              <DetailRow label="Barcode" value={product.barcode ? <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{product.barcode}</code> : null} />
              <DetailRow label="Category" value={product.category} />
              <DetailRow label="Brand" value={product.brand} />
              <DetailRow label="Description" value={product.description} />
            </div>
          </section>

          {/* History — placeholder for Phase 6 */}
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              <Clock className="h-3.5 w-3.5" /> History
            </h3>
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Stock movement history coming in Phase 6
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default ProductDetailsDrawer;
