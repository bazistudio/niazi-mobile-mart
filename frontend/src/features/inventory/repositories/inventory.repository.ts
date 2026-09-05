// src/features/inventory/repositories/inventory.repository.ts

import { inventoryApi } from '../api/inventory.api';
import { PaginationParams, InventoryAdjustmentType } from '../types';

/**
 * Repository Layer
 * Intermediary between the Service and API layer.
 * Prepares the architecture for Phase 5 Offline Sync (IndexedDB/local queue).
 */
export const inventoryRepository = {
  getProducts: async (params: PaginationParams) => {
    console.log("[DEBUG] REPOSITORY CALLED");
    // Future Phase 5: Check IndexedDB / Network Status here
    return await inventoryApi.getProducts(params);
  },

  adjustStock: async (productId: string, quantity: number, type: InventoryAdjustmentType, reason?: string) => {
    // Future Phase 5: Add to local sync queue if offline
    return await inventoryApi.adjustStock(productId, quantity, type, reason);
  },

  getCategories: async () => {
    return await inventoryApi.getCategories();
  },

  createProduct: async (formData: FormData) => {
    // Future Phase 5: Add to local sync queue if offline
    return await inventoryApi.createProduct(formData);
  },

  updateProduct: async (id: string, data: import('../dto/inventory.dto').UpdateProductDTO | FormData) => {
    return await inventoryApi.updateProduct(id, data);
  },

  deleteProduct: async (id: string) => {
    // Soft delete — backend sets status: 'inactive'
    return await inventoryApi.deleteProduct(id);
  },

  checkDuplicate: async (params: { sku?: string; barcode?: string; name?: string }) => {
    return await inventoryApi.checkDuplicate(params);
  }
};
