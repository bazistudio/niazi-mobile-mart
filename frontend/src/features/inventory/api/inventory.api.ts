// src/features/inventory/api/inventory.api.ts

import { tauriClient } from '@/lib/tauri/tauriClient';
import { PaginatedProductsDTO, AdjustStockResponseDTO, ProductCategoryDTO, UpdateProductDTO, CheckDuplicateResponseDTO, ProductDTO } from '../dto/inventory.dto';
import { InventoryAdjustmentType, PaginationParams } from '../types';

export const inventoryApi = {
  getProducts: async (params: PaginationParams): Promise<PaginatedProductsDTO> => {
    const items = await tauriClient.productList({
      search: params.search,
      category_id: params.category && params.category !== 'all' ? params.category : undefined,
      is_active: true,
    });

    const products: ProductDTO[] = items.map((p) => ({
      _id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || undefined,
      category: p.category_id,
      categoryId: { _id: p.category_id, name: 'Catalog' },
      price: p.sale_price,
      purchasePrice: p.purchase_price,
      quantity: 0,
      lowStockThreshold: p.low_stock_threshold,
      description: p.description || undefined,
      status: 'active',
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return {
      success: true,
      products,
      pagination: {
        total: products.length,
        page: params.page || 1,
        pages: Math.ceil(products.length / (params.limit || 10)) || 1,
        limit: params.limit || 10,
      },
    };
  },

  adjustStock: async (
    productId: string, 
    quantity: number, 
    _type: InventoryAdjustmentType, 
    reason?: string
  ): Promise<AdjustStockResponseDTO> => {
    const newStock = await tauriClient.inventoryAdjust({
      product_id: productId,
      branch_id: '00000000-0000-0000-0000-000000000002',
      target_quantity: quantity,
      reason: reason || 'Manual Adjustment',
    });

    return {
      success: true,
      message: 'Stock adjusted successfully',
      newStock,
      adjustment: {
        _id: `adj-${Date.now()}`,
        productId,
        type: _type,
        quantity,
        previousStock: 0,
        newStock,
        reason,
        adjustedBy: 'admin',
        createdAt: new Date().toISOString(),
      },
    };
  },

  getCategories: async (): Promise<ProductCategoryDTO[]> => {
    const list = await tauriClient.categoryList();
    return list.map((c) => ({
      _id: c.id,
      name: c.name,
      code: c.code,
      description: c.description || undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  },

  createProduct: async (formData: FormData): Promise<{ message: string; product: ProductDTO }> => {
    const name = (formData.get('name') as string) || 'New Product';
    const sku = (formData.get('sku') as string) || `SKU-${Date.now()}`;
    const barcode = (formData.get('barcode') as string) || null;
    const category = (formData.get('category') as string) || '00000000-0000-0000-0000-000000000001';
    const price = Math.round(Number(formData.get('price')) || 0);
    const purchasePrice = Math.round(Number(formData.get('purchasePrice')) || 0);
    const lowStockThreshold = Number(formData.get('lowStockThreshold')) || 5;
    const description = (formData.get('description') as string) || null;

    const created = await tauriClient.productCreate({
      name,
      sku,
      barcode,
      category_id: category,
      brand_id: null,
      unit_id: '00000000-0000-0000-0000-000000000001',
      purchase_price: purchasePrice,
      sale_price: price,
      low_stock_threshold: lowStockThreshold,
      description,
    });

    const product: ProductDTO = {
      _id: created.id,
      name: created.name,
      sku: created.sku,
      barcode: created.barcode || undefined,
      category: created.category_id,
      price: created.sale_price,
      purchasePrice: created.purchase_price,
      quantity: 0,
      lowStockThreshold: created.low_stock_threshold,
      description: created.description || undefined,
      status: 'active',
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };

    return {
      message: 'Product created successfully',
      product,
    };
  },

  updateProduct: async (id: string, data: UpdateProductDTO | FormData): Promise<{ message: string; product: ProductDTO }> => {
    let name: string | undefined;
    let salePrice: number | undefined;
    let purchasePrice: number | undefined;
    let lowStockThreshold: number | undefined;
    let description: string | undefined;

    if (data instanceof FormData) {
      name = data.get('name') ? (data.get('name') as string) : undefined;
      salePrice = data.get('price') ? Math.round(Number(data.get('price'))) : undefined;
      purchasePrice = data.get('purchasePrice') ? Math.round(Number(data.get('purchasePrice'))) : undefined;
      lowStockThreshold = data.get('lowStockThreshold') ? Number(data.get('lowStockThreshold')) : undefined;
      description = data.get('description') ? (data.get('description') as string) : undefined;
    } else {
      name = data.name;
      salePrice = data.price !== undefined ? Math.round(data.price) : undefined;
      purchasePrice = data.purchasePrice !== undefined ? Math.round(data.purchasePrice) : undefined;
      lowStockThreshold = data.lowStockThreshold;
      description = data.description;
    }

    const updated = await tauriClient.productUpdate(id, {
      name,
      sale_price: salePrice,
      purchase_price: purchasePrice,
      low_stock_threshold: lowStockThreshold,
      description,
    });

    const product: ProductDTO = {
      _id: updated.id,
      name: updated.name,
      sku: updated.sku,
      barcode: updated.barcode || undefined,
      category: updated.category_id,
      price: updated.sale_price,
      purchasePrice: updated.purchase_price,
      quantity: 0,
      lowStockThreshold: updated.low_stock_threshold,
      description: updated.description || undefined,
      status: 'active',
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    return {
      message: 'Product updated successfully',
      product,
    };
  },

  deleteProduct: async (id: string): Promise<{ message: string }> => {
    await tauriClient.productDeactivate(id);
    return {
      message: 'Product deactivated successfully',
    };
  },

  checkDuplicate: async (_params: { sku?: string; barcode?: string; name?: string }): Promise<CheckDuplicateResponseDTO> => {
    return {
      exists: false,
    };
  }
};

