'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ProductCardGrid } from './ProductCardGrid';
import { CartPanel } from './CartPanel';
import { PosCustomerLedgerPanel } from './PosCustomerLedgerPanel';
import { InvoiceLookupModal } from './modals/InvoiceLookupModal';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { usePosStore } from '../store/usePosStore';
import { DBInventory } from '@/types/db.types';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import toast from 'react-hot-toast';

export const SaleWorkspace: React.FC = () => {
  const [isInvoiceLookupOpen, setInvoiceLookupOpen] = useState(false);
  const [invoiceLookupHeading, setInvoiceLookupHeading] = useState<string | undefined>(undefined);
  const [isSaleSuccess, setIsSaleSuccess] = useState(false);
  // Mobile panel toggle: 'cart' | 'customer'
  const [mobilePanel, setMobilePanel] = useState<'cart' | 'customer'>('cart');

  const activeShopId = useOrganizationStore((s) => s.activeShop?._id || s.activeShopId);
  const products = useInventoryStore((s) => s.products);
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const addToCart = usePosStore((s) => s.addToCart);
  const activeSession = usePosStore((s) => s.saleTabs.find(t => t.id === s.activeTabId));
  const isReturnMode = activeSession?.mode === 'replace';

  // Listen for custom event to open invoice lookup from extra actions toolbar
  useEffect(() => {
    const handleOpenLookup = (e: Event) => {
      // GAP-02: read optional heading from event detail (e.g. 'Select Sale Invoice for Cash Return')
      const detail = (e as CustomEvent<{ heading?: string }>).detail;
      setInvoiceLookupHeading(detail?.heading);
      setInvoiceLookupOpen(true);
    };
    window.addEventListener('pos:open-invoice-lookup', handleOpenLookup);
    return () => window.removeEventListener('pos:open-invoice-lookup', handleOpenLookup);
  }, []);

  // Listen for sale completion to trigger green animated border
  useEffect(() => {
    const handleSaleDone = () => {
      setIsSaleSuccess(true);
      setTimeout(() => setIsSaleSuccess(false), 3500);
    };
    window.addEventListener('pos:sale-completed', handleSaleDone);
    return () => window.removeEventListener('pos:sale-completed', handleSaleDone);
  }, []);

  // Reload inventory on initial mount and when activeShopId changes
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, activeShopId]);

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
    <main className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden p-2 sm:p-3 gap-2 select-none">
      {/* Mobile Panel Toggle Strip — hidden on lg+ (desktop uses side-by-side columns) */}
      <div className="lg:hidden flex shrink-0 rounded-xl overflow-hidden border border-border shadow-xs">
        <button
          type="button"
          onClick={() => setMobilePanel('cart')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
            mobilePanel === 'cart'
              ? 'bg-primary text-white'
              : 'bg-surface text-text-secondary hover:bg-surface-hover'
          }`}
        >
          🛒 POS Cart
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('customer')}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
            mobilePanel === 'customer'
              ? 'bg-primary text-white'
              : 'bg-surface text-text-secondary hover:bg-surface-hover'
          }`}
        >
          👤 Customer
        </button>
      </div>

      {/* Main Dual-Column Content: Left 2/3 (8 cols) & Right 1/3 (4 cols) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* Left 2/3: Full-Width POS Cart Workspace */}
        {/* On mobile: only visible when mobilePanel === 'cart' */}
        <div className={`lg:col-span-8 min-h-0 overflow-hidden ${
          mobilePanel === 'cart' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        }`}>
          <CartPanel isSaleSuccess={isSaleSuccess} />
        </div>

        {/* Right 1/3: Customer & Ledger Panel */}
        {/* On mobile: only visible when mobilePanel === 'customer' */}
        <div className={`lg:col-span-4 min-h-0 overflow-hidden ${
          mobilePanel === 'customer' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        }`}>
          <PosCustomerLedgerPanel isSaleSuccess={isSaleSuccess} />
        </div>
      </div>

      {/* Invoice Lookup Modal for Return by Invoice action */}
      {isInvoiceLookupOpen && (
        <InvoiceLookupModal
          isOpen={isInvoiceLookupOpen}
          onClose={() => { setInvoiceLookupOpen(false); setInvoiceLookupHeading(undefined); }}
          heading={invoiceLookupHeading}
        />
      )}
    </main>
  );
};

export default SaleWorkspace;