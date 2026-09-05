'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ProductCardGrid } from './ProductCardGrid';
import { CartPanel } from './CartPanel';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { usePosStore } from '../store/usePosStore';
import { DBInventory } from '@/types/db.types';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import toast from 'react-hot-toast';

export const SaleWorkspace: React.FC = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const products = useInventoryStore((s) => s.products);
  const status = useInventoryStore((s) => s.status);
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const addToCart = usePosStore((s) => s.addToCart);
  const activeSession = usePosStore((s) => s.getActiveSession());
  const isReturnMode = activeSession?.mode === 'replace';

  // Ensure inventory is loaded only once on initial mount
  useEffect(() => {
    if (status === 'idle') {
      fetchProducts();
    }
  }, [fetchProducts, status]);

  // Headless hardware scanner handler
  const handleScanComplete = useCallback(
    (scannedCode: string) => {
      const trimmed = scannedCode.trim();
      if (!trimmed || trimmed.length < 2) return;

      const matchedProduct = products.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === trimmed.toLowerCase())
      );

      if (matchedProduct) {
        const isOutOfStock = (matchedProduct.stock || 0) <= 0;
        if (!isReturnMode && isOutOfStock) {
          toast.error(`Out of stock: ${matchedProduct.name}`);
          return;
        }

        const dbProduct: DBInventory = {
          id: matchedProduct.id || (matchedProduct as any)._id,
          sku: matchedProduct.sku || '',
          barcode: matchedProduct.barcode || '',
          name: matchedProduct.name,
          costPrice: matchedProduct.purchasePrice ?? (matchedProduct as any).costPrice ?? 0,
          salePrice: matchedProduct.price ?? (matchedProduct as any).salePrice ?? 0,
          stock: matchedProduct.stock ?? 0,
          reservedStock: 0,
          lastUpdated: Date.now(),
        };

        addToCart(dbProduct, isReturnMode);
        toast.success(`Scanned: ${matchedProduct.name}`, {
          icon: '🏷️',
          duration: 2000,
        });
      } else {
        toast.error(`Barcode not found: ${trimmed}`, {
          duration: 3000,
        });
      }
    },
    [products, isReturnMode, addToCart]
  );

  // Activate headless barcode scanner
  useBarcodeScanner({ onScan: handleScanComplete });

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden p-2 sm:p-2.5 gap-2 select-none">
      {/* Main Dual-Column Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 min-h-0 overflow-hidden">
        {/* Left Side: Full-Width Product Catalog (7 cols on lg, 8 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {/* Category Filter Pills Header */}
          <div className="p-2 border-b border-border/70 shrink-0 bg-surface-hover/20">
            <CategoryFilterBar
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
          </div>

          {/* Product Grid Area */}
          <div className="flex-1 min-h-0 overflow-hidden p-1">
            <ProductCardGrid selectedCategoryId={selectedCategoryId} />
          </div>
        </div>

        {/* Right Side: Unified Active Sale & Checkout (5 cols on lg, 4 cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col min-h-0 overflow-hidden">
          <CartPanel />
        </div>
      </div>
    </main>
  );
};

export default SaleWorkspace;