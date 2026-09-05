// src/features/inventory/stock/stock.service.ts

import { inventoryRepository } from '../repositories/inventory.repository';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { InventoryAdjustmentType } from '../types';
import { transactionLedger, generateTxnId } from '@/features/audit/services/transaction-integrity.service';

type StockEventName = 'STOCK_ADJUSTED' | 'STOCK_RESTOCKED' | 'STOCK_DAMAGED';

type EventCallback = (payload: any) => void;

class StockEventBus {
  private listeners: Record<string, EventCallback[]> = {};

  on(event: StockEventName, callback: EventCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  emit(event: StockEventName, payload: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(payload));
    }
  }
}

export const stockEventBus = new StockEventBus();

export const stockService = {
  adjustStock: async (productId: string, quantityChange: number, type: InventoryAdjustmentType, reason?: string): Promise<number> => {
    if (quantityChange < 0) throw new Error('Quantity change must be positive. Use DECREASE type for reductions.');
    
    const txnId = generateTxnId('stock-adjust');
    transactionLedger.begin(txnId);

    try {
      // API execution
      const response = await retry(() => inventoryRepository.adjustStock(productId, quantityChange, type, reason), RETRY_COUNT);
      
      if (!response.success || response.newStock === undefined) {
        transactionLedger.fail(txnId, response.message || 'Failed to adjust stock');
        throw new Error(response.message || 'Failed to adjust stock');
      }

      // Emit event strictly bounded to stock domain
      const eventType = type === InventoryAdjustmentType.RESTOCK ? 'STOCK_RESTOCKED' : 'STOCK_ADJUSTED';
      stockEventBus.emit(eventType, {
        productId,
        quantityChange,
        newStock: response.newStock,
        type,
        reason,
        timestamp: new Date().toISOString()
      });

      transactionLedger.record(txnId, eventType === 'STOCK_RESTOCKED' ? 'STOCK_RESTOCKED' : 'STOCK_ADJUSTED', {
        productId, quantityChange, newStock: response.newStock, type, reason
      });
      transactionLedger.record(txnId, 'STOCK_EVENT_EMITTED', { eventType });
      transactionLedger.complete(txnId);
      
      return response.newStock;
    } catch (err: any) {
      transactionLedger.fail(txnId, err.message);
      throw err;
    }
  },

  getStockHistory: async (productId: string) => {
    // Phase 4: Mocked history for now, or if backend supports it, call repository
    // return await inventoryRepository.getStockHistory(productId);
    return [];
  }
};
