// src/features/realtime-sync/event.registry.ts
//
// Phase 6 — Centralized Domain Event Registry
// Single source of truth for ALL events that flow through the ERP system.
// Every domain service emits events here. Only SyncEngine may write to stores.

// ─── Event Names ─────────────────────────────────────────────────────────────

export type DomainEventName =
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_RESTOCKED'
  | 'IMPORT_PARSED'
  | 'IMPORT_COMMITTED'
  | 'SALES_RECALCULATED';

// ─── Typed Payloads ──────────────────────────────────────────────────────────

export interface ProductCreatedPayload {
  productId: string;
  product: Record<string, any>;
  timestamp: string;
}

export interface ProductUpdatedPayload {
  productId: string;
  changes: Record<string, any>;
  timestamp: string;
}

export interface ProductDeletedPayload {
  productId: string;
  timestamp: string;
}

export interface StockAdjustedPayload {
  productId: string;
  quantityChange: number;
  newStock: number;
  type: string;
  reason?: string;
  timestamp: string;
}

export interface StockRestockedPayload extends StockAdjustedPayload {}

export interface ImportParsedPayload {
  totalRaw: number;
  timestamp: string;
}

export interface ImportCommittedPayload {
  successCount: number;
  failedCount: number;
  productIds: string[];
  timestamp: string;
}

export interface SalesRecalculatedPayload {
  trigger: DomainEventName;
  timestamp: string;
}

export type DomainEventPayloadMap = {
  PRODUCT_CREATED: ProductCreatedPayload;
  PRODUCT_UPDATED: ProductUpdatedPayload;
  PRODUCT_DELETED: ProductDeletedPayload;
  STOCK_ADJUSTED: StockAdjustedPayload;
  STOCK_RESTOCKED: StockRestockedPayload;
  IMPORT_PARSED: ImportParsedPayload;
  IMPORT_COMMITTED: ImportCommittedPayload;
  SALES_RECALCULATED: SalesRecalculatedPayload;
};

// ─── Typed Event Bus ─────────────────────────────────────────────────────────

type EventCallback<T> = (payload: T) => void;

class DomainEventBus {
  private listeners = new Map<string, Set<EventCallback<any>>>();
  private eventHistory: { event: DomainEventName; payload: any; ts: string }[] = [];
  private readonly MAX_HISTORY = 100;

  emit<E extends DomainEventName>(event: E, payload: DomainEventPayloadMap[E]): void {
    // Record history (last 100 events)
    this.eventHistory.push({ event, payload, ts: new Date().toISOString() });
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory.shift();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[EVENT_BUS] ⚡ ${event}`, payload);
    }

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[EVENT_BUS] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  on<E extends DomainEventName>(event: E, callback: EventCallback<DomainEventPayloadMap[E]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  getHistory(): { event: DomainEventName; payload: any; ts: string }[] {
    return [...this.eventHistory];
  }

  getListenerCount(event: DomainEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
    this.eventHistory = [];
  }
}

// Singleton — imported by all services and sync engine
export const domainEventBus = new DomainEventBus();
