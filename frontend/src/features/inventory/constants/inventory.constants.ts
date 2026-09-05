// src/features/inventory/constants/inventory.constants.ts

export const DEFAULT_PAGE_SIZE = 50;
export const RETRY_COUNT = 3;
export const LOW_STOCK_DEFAULT = 5;

export const INVENTORY_ENDPOINTS = {
  GET_PRODUCTS: '/api/v1/products/my-products',
  ADJUST_STOCK: '/api/v1/inventory/adjust',
  CREATE_PRODUCT: '/api/v1/products/add',
  GET_CATEGORIES: '/api/v1/categories/my-categories',
  UPDATE_PRODUCT: '/api/v1/products/update',   // PUT /api/products/update/:id
  DELETE_PRODUCT: '/api/v1/products/delete',   // DELETE /api/products/delete/:id
  CHECK_DUPLICATE: '/api/v1/products/check-duplicate',
};
