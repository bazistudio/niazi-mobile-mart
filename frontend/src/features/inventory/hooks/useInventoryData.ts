// src/features/inventory/hooks/useInventoryData.ts

import { useMemo } from 'react';
import { 
  selectProducts, 
  selectSearchTerm, 
  selectActiveFilter, 
  selectSortConfig,
  selectInventoryStatus,
  selectInventoryError
} from '../core/inventory.selectors';
import { filterBySearch, computeInventoryStats } from '../utils';
import { InventoryProduct, InventoryFilterType, SortField, SortDirection, StockStatus } from '../types';

function applyStatusFilter(products: InventoryProduct[], filter: InventoryFilterType) {
  if (filter === 'low_stock') return products.filter((p) => p.status === StockStatus.LOW_STOCK);
  if (filter === 'out_of_stock') return products.filter((p) => p.status === StockStatus.OUT_OF_STOCK);
  return products;
}

function applySort(products: InventoryProduct[], field: SortField, direction: SortDirection) {
  return [...products].sort((a, b) => {
    let aVal: string | number = a[field] ?? '';
    let bVal: string | number = b[field] ?? '';

    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function useInventoryData() {
  const products = selectProducts();
  const searchTerm = selectSearchTerm();
  const activeFilter = selectActiveFilter();
  const sort = selectSortConfig();
  const status = selectInventoryStatus();
  const error = selectInventoryError();

  const filtered = useMemo(() => {
    let result = filterBySearch(products, searchTerm);
    result = applyStatusFilter(result, activeFilter);
    result = applySort(result, sort.field, sort.direction);
    return result;
  }, [products, searchTerm, activeFilter, sort]);

  const stats = useMemo(() => computeInventoryStats(products), [products]);

  return { filtered, stats, status, error };
}
