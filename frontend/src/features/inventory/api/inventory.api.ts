// src/features/inventory/api/inventory.api.ts

import axiosInstance from '@/lib/api/axios';
import { INVENTORY_ENDPOINTS } from '../constants/inventory.constants';
import { PaginatedProductsDTO, AdjustStockResponseDTO, ProductCategoryDTO, UpdateProductDTO, CheckDuplicateResponseDTO } from '../dto/inventory.dto';
import { InventoryAdjustmentType, PaginationParams } from '../types';
import { ProductDTO } from '../dto/inventory.dto';

export const inventoryApi = {
  getProducts: async (params: PaginationParams) => {
    console.log("[DEBUG] API CALLED", params);
    const { page, limit, category } = params;
    
    // Using URLSearchParams cleanly formats the query string
    const searchParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (category && category !== 'all') {
      searchParams.append('category', category);
    }

    const response = await axiosInstance.get<PaginatedProductsDTO>(
      `${INVENTORY_ENDPOINTS.GET_PRODUCTS}?${searchParams.toString()}`
    );
    return response.data;
  },

  adjustStock: async (
    productId: string, 
    quantity: number, 
    type: InventoryAdjustmentType, 
    reason?: string
  ) => {
    const response = await axiosInstance.post<AdjustStockResponseDTO>(
      INVENTORY_ENDPOINTS.ADJUST_STOCK,
      {
        productId,
        type,
        quantity,
        reason,
        notes: reason
      }
    );
    return response.data;
  },

  getCategories: async () => {
    const response = await axiosInstance.get<{ success: boolean; data?: ProductCategoryDTO[], categories?: ProductCategoryDTO[] }>(
      INVENTORY_ENDPOINTS.GET_CATEGORIES
    );
    // Handle different possible backend envelope structures
    return response.data.categories || response.data.data || [];
  },

  createProduct: async (formData: FormData) => {
    const response = await axiosInstance.post<{ message: string; product: ProductDTO }>(
      INVENTORY_ENDPOINTS.CREATE_PRODUCT,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  updateProduct: async (id: string, data: UpdateProductDTO | FormData) => {
    const isFormData = data instanceof FormData;
    const response = await axiosInstance.put<{ message: string; product: ProductDTO }>(
      `${INVENTORY_ENDPOINTS.UPDATE_PRODUCT}/${id}`,
      data,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}
    );
    return response.data;
  },

  deleteProduct: async (id: string) => {
    const response = await axiosInstance.delete<{ message: string }>(
      `${INVENTORY_ENDPOINTS.DELETE_PRODUCT}/${id}`
    );
    return response.data;
  },

  checkDuplicate: async (params: { sku?: string; barcode?: string; name?: string }) => {
    const query = new URLSearchParams();
    if (params.sku) query.append('sku', params.sku);
    if (params.barcode) query.append('barcode', params.barcode);
    if (params.name) query.append('name', params.name);
    const response = await axiosInstance.get<CheckDuplicateResponseDTO>(
      `${INVENTORY_ENDPOINTS.CHECK_DUPLICATE}?${query.toString()}`
    );
    return response.data;
  }
};
