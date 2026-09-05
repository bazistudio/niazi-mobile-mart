// src/features/realtime-sync/sync.adapters/sales.adapter.ts
//
// Phase 6 — Sales Sync Adapter
// Sales recalculates reactively on inventory events.
// Rule enforced: Sales NEVER imports inventory store. It receives events only.

import { domainEventBus, DomainEventName } from '../event.registry';

// Module-scoped reactive sales state (not a Zustand store — sales is read-only)
type SalesReactiveCallback = () => void;
const salesRefreshCallbacks = new Set<SalesReactiveCallback>();

export const salesAdapter = {
  /**
   * Call this from a React component or hook to subscribe to sales invalidation.
   * When inventory changes, the callback fires and the component re-fetches.
   */
  onInvalidate(callback: SalesReactiveCallback): () => void {
    salesRefreshCallbacks.add(callback);
    return () => salesRefreshCallbacks.delete(callback);
  },

  /**
   * Triggers all registered sales components to recalculate.
   */
  invalidate(trigger: DomainEventName): void {
    domainEventBus.emit('SALES_RECALCULATED', {
      trigger,
      timestamp: new Date().toISOString()
    });
    salesRefreshCallbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error('[SALES_ADAPTER] invalidate error:', e); }
    });
  },

  /**
   * Registers all sales-triggering events.
   * Returns cleanup function.
   */
  initialize(): () => void {
    const unsubs: (() => void)[] = [];

    // These inventory events invalidate sales metrics
    const triggers: DomainEventName[] = ['STOCK_ADJUSTED', 'STOCK_RESTOCKED', 'IMPORT_COMMITTED', 'PRODUCT_CREATED', 'PRODUCT_DELETED'];

    for (const trigger of triggers) {
      unsubs.push(domainEventBus.on(trigger as any, () => {
        salesAdapter.invalidate(trigger);
      }));
    }

    return () => unsubs.forEach(fn => fn());
  }
};
