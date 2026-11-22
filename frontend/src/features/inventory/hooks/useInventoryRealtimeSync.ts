// src/features/inventory/hooks/useInventoryRealtimeSync.ts
//
// PERF-D: Subscribes to WebSocket NotifyHints and applies targeted inventory
// updates without triggering a full product refetch.
//
// Strategy:
// - INVENTORY hints  → updateStockForProduct() for targeted quantity patch
// - PRODUCT hints    → full fetchProducts() re-fetch (master data changed)
// - Other hints      → ignored (handled by their own domain hooks)

import { useCallback } from 'react';
import { useWebSocketClient, NotifyHint } from '@/lib/websocket/useWebSocketClient';
import { useInventoryStore } from '../core/inventory.store';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { useOrganizationStore } from '@/store/useOrganizationStore';

export function useInventoryRealtimeSync(): void {
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const updateStockForProduct = useInventoryStore((s) => s.updateStockForProduct);
  const activeShopId = useOrganizationStore((s) => s.activeShop?._id || s.activeShopId);

  const handleHint = useCallback(async (hint: NotifyHint) => {
    if (hint.entityType === 'INVENTORY' && hint.entityId && activeShopId) {
      // Fetch the latest stock for this single product and patch in-place.
      // This avoids re-loading all ~hundreds of products for a single qty change.
      try {
        const stockMap = await tauriClient.inventoryGetStockMap(activeShopId);
        const newQty = stockMap[hint.entityId] ?? 0;
        updateStockForProduct(hint.entityId, newQty);
      } catch {
        // If targeted fetch fails, fall back to full refresh
        fetchProducts();
      }
    } else if (hint.entityType === 'PRODUCT') {
      // Product master data changed (name, price, barcode…) — full refresh needed
      fetchProducts();
    }
    // SALE / CUSTOMER / SUPPLIER hints are handled by their own domain hooks
  }, [fetchProducts, updateStockForProduct, activeShopId]);

  useWebSocketClient({ onHint: handleHint });
}
