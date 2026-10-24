// src/features/inventory/dto/inventory.dto.ts

export interface ProductCategoryDTO {
  _id: string;
  name: string;
}

export interface ProductDTO {
  _id: string;
  name: string;
  price: number;
  purchasePrice?: number;
  averageCost?: number;
  lastPurchaseCost?: number;
  sku?: string;
  barcode?: string;
  quantity: number;
  reservedStock?: number;
  lowStockThreshold: number;
  category: ProductCategoryDTO | string;
  brand?: string;
  description?: string;
  image?: string;
  status: 'active' | 'inactive';
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
  // Product versioning — foundation for offline sync and multi-device conflict detection
  version?: number;
  /** Stock in the Central Warehouse. Present when scope='organization'. */
  warehouseStock?: number;
  /** Total organization-wide stock. Present when scope='organization'. */
  totalOrgStock?: number;
  /** Compatible phone/device model names. */
  compatibleModels?: string[];
  brandName?: string;
  companyName?: string;
  qualityName?: string;
  colorName?: string;
  unitName?: string;
  categoryName?: string;
}

export interface PaginatedProductsDTO {
  products: ProductDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AdjustStockResponseDTO {
  success: boolean;
  message?: string;
  newStock?: number;
}

export interface CreateProductDTO {
  name: string;
  price: number;
  quantity: number;
  category: string;
  purchasePrice?: number;
  sku?: string;
  barcode?: string;
  brand?: string;
  description?: string;
  lowStockThreshold?: number;
}

export interface UpdateProductDTO {
  name?: string;
  price?: number;
  purchasePrice?: number;
  quantity?: number;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  description?: string;
  lowStockThreshold?: number;
}

export interface CheckDuplicateResponseDTO {
  exists: boolean;
  productId?: string;
  matchType: 'sku' | 'barcode' | 'name' | 'possible' | 'none';
  product?: Pick<ProductDTO, '_id' | 'name' | 'sku' | 'barcode'>;
  possibleMatches?: Pick<ProductDTO, '_id' | 'name' | 'sku' | 'barcode'>[];
}

