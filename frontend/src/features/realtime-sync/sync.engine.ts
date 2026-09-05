// src/features/realtime-sync/sync.engine.ts
//
// Phase 6 — Real-Time Sync Engine
//
// CRITICAL RULE: This is the ONLY authorized writer to UI stores.
// Services emit events → SyncEngine listens → SyncEngine updates stores.
// No service may bypass this layer to write to stores directly.
//
// Architecture:
//   Service emits event on domainEventBus
//     ↓
//   SyncEngine listener fires
//     ↓
//   Appropriate adapter applies store patch
//     ↓
//   Zustand store updates
//     ↓
//   React components re-render (zero manual refresh)

import { inventoryAdapter } from './sync.adapters/inventory.adapter';
import { salesAdapter } from './sync.adapters/sales.adapter';
import { domainEventBus } from './event.registry';

// Also bridge the existing stockEventBus into domainEventBus
import { stockEventBus } from '@/features/inventory/stock/stock.service';

class SyncEngine {
  private isInitialized = false;
  private cleanupFns: (() => void)[] = [];

  /**
   * Initializes the sync engine.
   * Should be called ONCE at the dashboard layout level.
   * Idempotent — safe to call multiple times.
   */
  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // ── Bridge stockEventBus → domainEventBus ────────────────────────────────
    // stockEventBus is the legacy event bus in stock.service.ts.
    // We bridge it so all existing stock events flow into domainEventBus.
    this.cleanupFns.push(
      stockEventBus.on('STOCK_ADJUSTED', (payload) => {
        domainEventBus.emit('STOCK_ADJUSTED', {
          productId: payload.productId,
          quantityChange: payload.quantityChange,
          newStock: payload.newStock,
          type: payload.type,
          reason: payload.reason,
          timestamp: payload.timestamp,
        });
      })
    );

    this.cleanupFns.push(
      stockEventBus.on('STOCK_RESTOCKED', (payload) => {
        domainEventBus.emit('STOCK_RESTOCKED', {
          productId: payload.productId,
          quantityChange: payload.quantityChange,
          newStock: payload.newStock,
          type: payload.type,
          reason: payload.reason,
          timestamp: payload.timestamp,
        });
      })
    );

    // ── Initialize domain adapters ────────────────────────────────────────────
    this.cleanupFns.push(inventoryAdapter.initialize());
    this.cleanupFns.push(salesAdapter.initialize());

    if (process.env.NODE_ENV === 'development') {
      console.log('[SYNC_ENGINE] 🟢 Initialized — Real-time sync active');
      console.log(`[SYNC_ENGINE] Adapters: inventory, sales`);
      console.log(`[SYNC_ENGINE] Event bridges: stockEventBus → domainEventBus`);
    }
  }

  /**
   * Tears down all subscriptions.
   * Called on layout unmount.
   */
  dispose(): void {
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    this.isInitialized = false;

    if (process.env.NODE_ENV === 'development') {
      console.log('[SYNC_ENGINE] 🔴 Disposed');
    }
  }

  /**
   * Emit a domain event manually (for product service integration).
   */
  emit = domainEventBus.emit.bind(domainEventBus);

  isReady(): boolean {
    return this.isInitialized;
  }

  getEventHistory() {
    return domainEventBus.getHistory();
  }
}

// Singleton — one engine per application instance
export const syncEngine = new SyncEngine();
