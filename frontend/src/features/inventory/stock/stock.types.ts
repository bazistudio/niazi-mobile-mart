// src/features/inventory/stock/stock.types.ts

import { InventoryAdjustmentType } from '../types';

export enum StockStatus {
  HEALTHY = 'HEALTHY',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK'
}

export interface StockState {
  productId: string; // Foreign key to ProductEntity
  quantity: number;
  minStockThreshold: number;
  status: StockStatus;
  lastUpdatedAt: string;
}

export interface StockAdjustmentEvent {
  id: string;
  productId: string;
  type: InventoryAdjustmentType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  timestamp: string;
  userId?: string;
}

export interface StockAlert {
  productId: string;
  currentQuantity: number;
  threshold: number;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK';
}
