// src/features/inventory/utils.ts

import { InventoryProduct, InventoryStats, StockStatus } from './types';

/**
 * Compute overall inventory stats from a product list.
 */
export function computeInventoryStats(products: InventoryProduct[]): InventoryStats {
  const total = products.length;
  const outOfStock = products.filter((p) => p.status === StockStatus.OUT_OF_STOCK).length;
  const lowStock = products.filter((p) => p.status === StockStatus.LOW_STOCK).length;
  const healthy = products.filter((p) => p.status === StockStatus.HEALTHY).length;

  return {
    totalProducts: total,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock,
    healthyCount: healthy,
    healthPercentage: total > 0 ? Math.round((healthy / total) * 100) : 0,
  };
}

/**
 * Filter products by search term (name or SKU).
 */
export function filterBySearch(products: InventoryProduct[], term: string): InventoryProduct[] {
  if (!term.trim()) return products;
  const lower = term.toLowerCase();
  return products.filter(
    (p) => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower)
  );
}
