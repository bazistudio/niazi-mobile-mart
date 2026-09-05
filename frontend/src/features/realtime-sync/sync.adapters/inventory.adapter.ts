// src/features/realtime-sync/sync.adapters/inventory.adapter.ts
//
// Phase 6 — Inventory Sync Adapter
// Listens to domain events and applies targeted store patches.
// This is the ONLY place that may call useInventoryStore.setState indirectly.

import { domainEventBus } from '../event.registry';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { inventoryService } from '@/features/inventory/services/inventory.service';

export const inventoryAdapter = {
  /**
   * Registers all inventory-related event subscriptions.
   * Returns a cleanup function to unsubscribe all listeners.
   */
  initialize(): () => void {
    const unsubs: (() => void)[] = [];

    // ── STOCK_ADJUSTED: Patch stock in-place, no refetch ─────────────────────
    unsubs.push(domainEventBus.on('STOCK_ADJUSTED', ({ productId, newStock }) => {
      const store = useInventoryStore.getState();
      const products = store.products;
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const updatedStatus = inventoryService.calculateStockStatus(newStock, product.minStockThreshold);
      useInventoryStore.setState({
        products: products.map(p =>
          p.id === productId ? { ...p, stock: newStock, status: updatedStatus } : p
        )
      });
    }));

    // ── STOCK_RESTOCKED: Same as adjusted (same payload shape) ───────────────
    unsubs.push(domainEventBus.on('STOCK_RESTOCKED', ({ productId, newStock }) => {
      const store = useInventoryStore.getState();
      const products = store.products;
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const updatedStatus = inventoryService.calculateStockStatus(newStock, product.minStockThreshold);
      useInventoryStore.setState({
        products: products.map(p =>
          p.id === productId ? { ...p, stock: newStock, status: updatedStatus } : p
        )
      });
    }));

    // ── PRODUCT_CREATED: Full refetch to get clean server record ─────────────
    // We refetch instead of patching because the server may set fields we don't have locally
    unsubs.push(domainEventBus.on('PRODUCT_CREATED', () => {
      useInventoryStore.getState().fetchProducts();
    }));

    // ── PRODUCT_UPDATED: Patch only changed fields in store ──────────────────
    unsubs.push(domainEventBus.on('PRODUCT_UPDATED', ({ productId, changes }) => {
      const store = useInventoryStore.getState();
      useInventoryStore.setState({
        products: store.products.map(p =>
          p.id === productId ? { ...p, ...changes } : p
        )
      });
    }));

    // ── PRODUCT_DELETED: Remove from local store immediately ─────────────────
    unsubs.push(domainEventBus.on('PRODUCT_DELETED', ({ productId }) => {
      const store = useInventoryStore.getState();
      useInventoryStore.setState({
        products: store.products.filter(p => p.id !== productId),
        totalProducts: store.totalProducts - 1,
      });
    }));

    // ── IMPORT_COMMITTED: Full refetch — many products may have changed ───────
    unsubs.push(domainEventBus.on('IMPORT_COMMITTED', () => {
      useInventoryStore.getState().fetchProducts();
    }));

    return () => unsubs.forEach(fn => fn());
  }
};
