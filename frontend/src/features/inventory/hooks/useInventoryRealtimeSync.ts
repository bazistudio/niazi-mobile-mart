// src/features/inventory/hooks/useInventoryRealtimeSync.ts
//
// PERF-D: Subscribes to WebSocket NotifyHints and applies targeted inventory
// updates without triggering a full product refetch.
//
// Strategy:
// - 'stock' hints     → updateStockForProduct() for targeted quantity patch
// - 'product' hints   → full fetchProducts() re-fetch (master data changed)
// - Other hints       → ignored (handled by their own domain hooks)

import { useCallback } from 'react';
import { useWebSocketClient, NotifyHint } from '@/lib/websocket/useWebSocketClient';
import { useInventoryStore } from '../core/inventory.store';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { invalidateMasterDataCache } from '../api/inventory.api';

export function useInventoryRealtimeSync(): void {
  const fetchProducts = useInventoryStore((s) => s.fetchProducts);
  const fetchCategories = useInventoryStore((s) => s.fetchCategories);
  const updateStockForProduct = useInventoryStore((s) => s.updateStockForProduct);
  const activeShopId = useOrganizationStore((s) => s.activeShop?._id || s.activeShopId);

  const handleHint = useCallback(async (hint: NotifyHint) => {
    // Backend emits entityType in lowercase: 'stock', 'product', 'sale', 'category', 'brand'
    const entityType = (hint.entityType || '').toLowerCase();

    // Branch isolation check: if hint has a branchId, ensure it matches current active branch
    if (hint.branchId && activeShopId && hint.branchId !== activeShopId) {
      // Discard event meant for a different branch
      return;
    }

    if (entityType === 'stock' && hint.entityId && activeShopId) {
      // Fetch the latest stock for this single product and patch in-place.
      // This avoids re-loading all ~hundreds of products for a single qty change.
      try {
        const newQty = await tauriClient.inventoryGetStock(hint.entityId, activeShopId);
        updateStockForProduct(hint.entityId, newQty);
      } catch {
        // If targeted fetch fails, fall back to full refresh
        fetchProducts();
      }
    } else if (entityType === 'product') {
      // Product master data changed (name, price, barcode, category/brand link) —
      // Invalidate master-data cache so fresh mappings are retrieved on fetchProducts()
      invalidateMasterDataCache();
      fetchProducts();
    } else if (entityType === 'category' || entityType === 'brand') {
      // Category / Brand master definitions changed
      invalidateMasterDataCache();
      fetchCategories();
      fetchProducts();
    }
    // SALE / CUSTOMER / SUPPLIER hints are handled by their own domain hooks
  }, [fetchProducts, fetchCategories, updateStockForProduct, activeShopId]);

  useWebSocketClient({ onHint: handleHint });
}
