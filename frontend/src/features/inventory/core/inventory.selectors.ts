// src/features/inventory/core/inventory.selectors.ts

import { useInventoryStore } from './inventory.store';
import { useShallow } from 'zustand/react/shallow';

/**
 * Granular selectors to prevent unnecessary component re-renders.
 */
export const selectProducts = () => useInventoryStore(state => state.products);
export const selectInventoryStatus = () => useInventoryStore(state => state.status);
export const selectInventoryError = () => useInventoryStore(state => state.error);
export const selectSearchTerm = () => useInventoryStore(state => state.searchTerm);
export const selectActiveFilter = () => useInventoryStore(state => state.activeFilter);
export const selectSortConfig = () => useInventoryStore(state => state.sort);
export const selectCategories = () => useInventoryStore(state => state.categories);
export const selectIsCategoriesLoading = () => useInventoryStore(state => state.isCategoriesLoading);

export const selectSetSearch = () => useInventoryStore(state => state.setSearch);
export const selectSetFilter = () => useInventoryStore(state => state.setFilter);
export const selectSetSort = () => useInventoryStore(state => state.setSort);
export const selectFetchProducts = () => useInventoryStore(state => state.fetchProducts);
export const selectForceSync = () => useInventoryStore(state => state.forceSync);
export const selectFetchCategories = () => useInventoryStore(state => state.fetchCategories);
export const selectCreateProduct = () => useInventoryStore(state => state.createProduct);
export const selectUpdateProduct = () => useInventoryStore(state => state.updateProduct);
export const selectDeleteProduct = () => useInventoryStore(state => state.deleteProduct);
export const selectTotalProducts = () => useInventoryStore(state => state.totalProducts);
export const selectStatus = () => useInventoryStore(state => state.status);
