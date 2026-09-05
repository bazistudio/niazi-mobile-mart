// src/features/inventory/types.ts

export enum StockStatus {
  HEALTHY = 'HEALTHY',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK'
}

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export type InventoryFilterType = 'all' | 'low_stock' | 'out_of_stock';

export type SortField = 'name' | 'stock' | 'category' | 'price' | 'purchasePrice';
export type SortDirection = 'asc' | 'desc';

export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  category?: string; // Legacy
  categoryId?: string;
  brandId?: string;
  companyId?: string;
  colorId?: string;
  qualityId?: string;
}

export enum InventoryAdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
  DAMAGE = 'DAMAGE',
  RETURN = 'RETURN',
  RESTOCK = 'RESTOCK'
}

export interface MasterDataEntity {
  id: string;
  name: string;
  organizationId?: string;
}

export interface ProductCategory extends MasterDataEntity {}
export interface ProductBrand extends MasterDataEntity {}
export interface ProductCompany extends MasterDataEntity {}
export interface ProductColor extends MasterDataEntity {}
export interface ProductQuality extends MasterDataEntity {}

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  categoryId?: string;
  brand?: string;
  brandId?: string;
  company?: string;
  companyId?: string;
  color?: string;
  colorId?: string;
  quality?: string;
  qualityId?: string;
  description?: string;
  stock: number;
  minStockThreshold: number;
  price: number; // Sale price
  purchasePrice?: number;
  unit?: string;
  status: StockStatus;
  image?: string;
  updatedAt?: string;
  version?: number;
}

export interface InventoryStats {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyCount: number;
  healthPercentage: number;
}

export interface InventorySortConfig {
  field: SortField;
  direction: SortDirection;
}
