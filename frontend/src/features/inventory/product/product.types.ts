// src/features/inventory/product/product.types.ts

export interface ProductCategory {
  id: string;
  name: string;
}

export interface ProductEntity {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  categoryId?: string;
  brand?: string;
  description?: string;
  price: number;
  purchasePrice?: number;
  unit?: string;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface ProductCreateDTO extends Omit<ProductEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
  // Create payload
}

export interface ProductUpdateDTO extends Partial<ProductCreateDTO> {
  // Update payload
}
