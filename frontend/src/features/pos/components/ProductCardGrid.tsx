'use client';

import React, { useMemo } from 'react';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { usePosStore } from '../store/usePosStore';
import { InventoryProduct } from '@/features/inventory/types';
import { DBInventory } from '@/types/db.types';
import { Package, AlertCircle, ShoppingBag, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProductCardGridProps {
  selectedCategoryId: string | null;
  searchQuery?: string;
}

export const ProductCardGrid: React.FC<ProductCardGridProps> = ({
  selectedCategoryId,
  searchQuery = '',
}) => {
  const products = useInventoryStore((s) => s.products);
  const status = useInventoryStore((s) => s.status);
  const addToCart = usePosStore((s) => s.addToCart);
  const activeSession = usePosStore((s) => s.getActiveSession());
  const isReturnMode = activeSession?.mode === 'replace';

  // Filter products by selected category and search query
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Category filter
      if (selectedCategoryId) {
        const catName = (product.category || '').toLowerCase();
        const catId = product.categoryId || '';
        const matchesCategory =
          catId === selectedCategoryId ||
          catName === selectedCategoryId.toLowerCase();
        if (!matchesCategory) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = product.name.toLowerCase().includes(query);
        const skuMatch = (product.sku || '').toLowerCase().includes(query);
        const barcodeMatch = (product.barcode || '').toLowerCase().includes(query);
        if (!nameMatch && !skuMatch && !barcodeMatch) return false;
      }

      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  const handleProductClick = (product: InventoryProduct) => {
    const isOutOfStock = (product.stock || 0) < 1;

    if (!isReturnMode && isOutOfStock) {
      toast.error(`${product.name} is out of stock`);
      return;
    }

    const dbProduct: DBInventory = {
      id: product.id || (product as any)._id,
      sku: product.sku || '',
      barcode: product.barcode || '',
      name: product.name,
      costPrice: product.purchasePrice ?? (product as any).costPrice ?? 0,
      salePrice: product.price ?? (product as any).salePrice ?? 0,
      stock: product.stock ?? 0,
      reservedStock: 0,
      lastUpdated: Date.now(),
    };

    addToCart(dbProduct, isReturnMode);
  };

  if (status === 'loading' && products.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-text-muted">
        <div className="flex flex-col items-center gap-2">
          <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs font-medium">Loading products...</span>
        </div>
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface/50 rounded-xl border border-dashed border-border m-1 min-h-[220px]">
        <Package className="h-10 w-10 text-text-muted mb-2 opacity-50" />
        <p className="text-sm font-semibold text-text-secondary">No products found</p>
        <p className="text-xs text-text-muted mt-0.5 max-w-xs">
          {searchQuery
            ? `No items match "${searchQuery}" in the selected category.`
            : 'No inventory items available in this category.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5">
        {filteredProducts.map((product) => {
          const isOutOfStock = (product.stock || 0) <= 0;
          const isLowStock = !isOutOfStock && (product.stock || 0) <= (product.minStockThreshold || 3);
          const price = product.price ?? (product as any).salePrice ?? 0;

          return (
            <button
              key={product.id || product.sku}
              type="button"
              onClick={() => handleProductClick(product)}
              disabled={!isReturnMode && isOutOfStock}
              className={`group relative flex flex-col justify-between p-2.5 sm:p-3 rounded-xl border text-left transition-all duration-fast min-h-[120px] sm:min-h-[130px] select-none shadow-xs hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                isOutOfStock && !isReturnMode
                  ? 'bg-surface/50 border-border/60 opacity-60 cursor-not-allowed'
                  : isReturnMode
                  ? 'bg-surface border-warning/30 hover:border-warning hover:bg-warning/5'
                  : 'bg-surface border-border hover:border-primary/50 hover:bg-surface-hover/80'
              }`}
            >
              {/* Top Header: SKU & Stock Badge */}
              <div className="flex items-start justify-between gap-1.5 w-full">
                <span className="text-[10px] font-mono text-text-muted truncate max-w-[80px]">
                  {product.sku || 'SKU'}
                </span>

                {/* Stock badge */}
                {isOutOfStock ? (
                  <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-danger/10 text-danger border border-danger/20">
                    Out
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-warning/10 text-warning border border-warning/20">
                    {product.stock} left
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-success/10 text-success border border-success/20">
                    {product.stock} in stock
                  </span>
                )}
              </div>

              {/* Middle: Product Name */}
              <div className="my-1.5 w-full">
                <h4
                  className="text-xs sm:text-sm font-bold text-text-primary line-clamp-2 leading-snug group-hover:text-primary transition-colors"
                  title={product.name}
                >
                  {product.name}
                </h4>
                {product.category && (
                  <p className="text-[10px] text-text-muted truncate mt-0.5">
                    {product.category}
                  </p>
                )}
              </div>

              {/* Bottom: Price & Tap CTA */}
              <div className="flex items-end justify-between w-full pt-1.5 border-t border-border/50 mt-auto">
                <div className="flex flex-col">
                  <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">
                    Price
                  </span>
                  <span className="text-xs sm:text-sm font-black text-primary tabular-nums">
                    Rs {price.toLocaleString()}
                  </span>
                </div>

                <div className="h-6 w-6 rounded-lg bg-primary/10 group-hover:bg-primary group-hover:text-white text-primary flex items-center justify-center transition-all duration-fast">
                  <Plus className="h-3.5 w-3.5" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProductCardGrid;
