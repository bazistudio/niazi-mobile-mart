// src/features/inventory/api/inventory.api.ts

import { tauriClient } from '@/lib/tauri/tauriClient';
import { httpClient } from '@/lib/http/httpClient';
import { PaginatedProductsDTO, AdjustStockResponseDTO, ProductCategoryDTO, UpdateProductDTO, CheckDuplicateResponseDTO, ProductDTO } from '../dto/inventory.dto';
import { InventoryAdjustmentType, PaginationParams } from '../types';
import { useOrganizationStore } from '@/store/useOrganizationStore';

function getActiveBranchId(): string {
  const store = useOrganizationStore.getState();
  const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
  if (!branchId) {
    throw new Error('No active branch selected. Please select a shop/branch before performing stock operations.');
  }
  return branchId;
}

export const inventoryApi = {
  getProducts: async (params: PaginationParams): Promise<PaginatedProductsDTO> => {
    const isOrgScope = params.scope === 'organization';
    let branchId: string | undefined = undefined;

    if (!isOrgScope) {
      const store = useOrganizationStore.getState();
      branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId || undefined;
    }

    const items = await tauriClient.productList({
      search: params.search,
      category_id: params.category && params.category !== 'all' ? params.category : undefined,
      is_active: true,
      branch_id: branchId,
    });

    // Obtain active branch stock map only if in branch-scoped mode
    let stockMap: Record<string, number> = {};
    if (!isOrgScope && branchId) {
      try {
        stockMap = await tauriClient.inventoryGetStockMap(branchId);
      } catch (err) {
        console.warn('[inventoryApi.getProducts] Failed to fetch branch stock map', err);
      }
    }

    const products: ProductDTO[] = items.map((p) => {
      // P0-1 fix: in org scope, preserve warehouse_stock and total org stock separately.
      // Do NOT map org-wide total (p.quantity) to the quantity field that the UI
      // presents as warehouse stock. Branch-scoped views use the branch stock map.
      const warehouseStock = isOrgScope ? (p.warehouse_stock ?? 0) : undefined;
      const totalOrgStock = isOrgScope ? (p.quantity ?? 0) : undefined;
      const quantity = isOrgScope
        ? (p.warehouse_stock ?? 0)           // org catalog: show warehouse stock
        : (branchId ? (stockMap[p.id] ?? 0) : (p.quantity ?? 0));

      return {
        _id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode || undefined,
        category: p.category_id,
        categoryId: { _id: p.category_id, name: 'Catalog' },
        price: p.sale_price,
        purchasePrice: p.purchase_price,
        averageCost: p.average_cost,
        lastPurchaseCost: p.purchase_price,
        quantity,
        warehouseStock,
        totalOrgStock,
        compatibleModels: Array.isArray(p.compatible_models) ? p.compatible_models : [],
        brandName: p.brand_name || undefined,
        companyName: p.company_name || undefined,
        qualityName: p.quality_name || undefined,
        colorName: p.color_name || undefined,
        unitName: p.unit_name || undefined,
        categoryName: p.category_name || undefined,
        lowStockThreshold: p.low_stock_threshold,
        description: p.description || undefined,
        status: 'active',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        isLowStock: quantity <= (p.low_stock_threshold || 5),
      };
    });

    return {
      products,
      pagination: {
        total: products.length,
        page: params.page || 1,
        pages: Math.ceil(products.length / (params.limit || 10)) || 1,
        limit: params.limit || 10,
      },
    };
  },

  getOrganizationProducts: async (params?: Partial<PaginationParams>): Promise<PaginatedProductsDTO> => {
    return inventoryApi.getProducts({
      page: params?.page || 1,
      limit: params?.limit || 10,
      search: params?.search,
      category: params?.category,
      categoryId: params?.categoryId,
      brandId: params?.brandId,
      companyId: params?.companyId,
      colorId: params?.colorId,
      qualityId: params?.qualityId,
      scope: 'organization',
    });
  },

  adjustStock: async (
    productId: string, 
    quantity: number, 
    type: InventoryAdjustmentType, 
    reason?: string
  ): Promise<AdjustStockResponseDTO> => {
    const branchId = getActiveBranchId();

    // Determine target quantity based on adjustment type
    let targetQuantity = quantity;
    if (type === InventoryAdjustmentType.INCREASE || type === InventoryAdjustmentType.RESTOCK) {
      const currentStock = await tauriClient.inventoryGetStock(productId, branchId);
      targetQuantity = currentStock + quantity;
    } else if (type === InventoryAdjustmentType.DECREASE || type === InventoryAdjustmentType.DAMAGE) {
      const currentStock = await tauriClient.inventoryGetStock(productId, branchId);
      targetQuantity = currentStock - quantity;
    }

    // NOTE: Using HTTP Axum Postgres endpoint instead of Tauri IPC
    const res = await httpClient.post<{ data?: any, newStock?: number }>('/api/v1/inventory/adjust', {
      product_id: productId,
      branch_id: branchId,
      target_quantity: targetQuantity,
      reason: reason || 'Manual Adjustment',
    });
    
    // Extrapolate the new stock count from response (depends on how backend returns the single number)
    const newStock = typeof res.data === 'number' ? res.data : typeof res === 'number' ? res : targetQuantity;

    return {
      success: true,
      message: 'Stock adjusted successfully',
      newStock,
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
    const category = (formData.get('category') as string) || '00000000-0000-0000-0000-000000000010';
    const price = Math.round(Number(formData.get('price')) || 0);
    const purchasePrice = Math.round(Number(formData.get('purchasePrice')) || 0);
    const lowStockThreshold = Number(formData.get('lowStockThreshold')) || 5;
    const initialQuantity = Number(formData.get('quantity')) || 0;
    const description = (formData.get('description') as string) || null;
    let branchId: string | undefined;
    try {
      const store = useOrganizationStore.getState();
      branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId || undefined;
    } catch {}

    const payload = {
      name,
      sku,
      barcode,
      category_id: category,
      brand_id: null,
      unit_id: '00000000-0000-0000-0000-000000000012',
      purchase_price: purchasePrice,
      sale_price: price,
      low_stock_threshold: lowStockThreshold,
      description,
      initial_quantity: initialQuantity,
      branch_id: branchId,
    };

    console.info('[inventoryApi.createProduct] Sending product payload to Axum API:', payload);

    try {
      // NOTE: Using HTTP Axum Postgres endpoint instead of Tauri IPC
      const res = await httpClient.post<{ product?: any, data?: any }>('/api/v1/products', payload);
      const created = res.data || res.product || res; // depending on how exactly axum responds, we handle variations

      const product: ProductDTO = {
        _id: created.id,
        name: created.name,
        sku: created.sku,
        barcode: created.barcode || undefined,
        category: created.category_id,
        price: created.sale_price,
        purchasePrice: created.purchase_price,
        quantity: initialQuantity,
        lowStockThreshold: created.low_stock_threshold,
        description: created.description || undefined,
        status: 'active',
        createdAt: created.created_at,
        updatedAt: created.updated_at,
        isLowStock: initialQuantity <= created.low_stock_threshold,
      };

      console.info('[inventoryApi.createProduct] Product created successfully in Postgres:', product);

      return {
        message: 'Product created successfully',
        product,
      };
    } catch (err: any) {
      console.error('PRODUCT CREATION FAILED:', {
        error: err,
        message: err?.message || err,
        payload,
        stack: err?.stack,
      });
      throw err;
    }
  },

  updateProduct: async (id: string, data: UpdateProductDTO | FormData): Promise<{ message: string; product: ProductDTO }> => {
    let name: string | undefined;
    let barcode: string | undefined;
    let categoryId: string | undefined;
    let brandId: string | undefined;
    let companyId: string | undefined;
    let colorId: string | undefined;
    let qualityId: string | undefined;
    let unitId: string | undefined;
    let salePrice: number | undefined;
    let purchasePrice: number | undefined;
    let lowStockThreshold: number | undefined;
    let description: string | undefined;
    let compatibleModels: string[] | undefined;

    if (data instanceof FormData) {
      name = data.get('name') ? (data.get('name') as string) : undefined;
      barcode = data.get('barcode') ? (data.get('barcode') as string) : undefined;
      categoryId = (data.get('categoryId') || data.get('category_id')) as string || undefined;
      brandId = (data.get('brandId') || data.get('brand_id')) as string || undefined;
      companyId = (data.get('companyId') || data.get('company_id')) as string || undefined;
      colorId = (data.get('colorId') || data.get('color_id')) as string || undefined;
      qualityId = (data.get('qualityId') || data.get('quality_id')) as string || undefined;
      unitId = (data.get('unitId') || data.get('unit_id')) as string || undefined;
      salePrice = data.get('price') || data.get('salePrice') || data.get('sale_price') ? Math.round(Number(data.get('price') || data.get('salePrice') || data.get('sale_price'))) : undefined;
      purchasePrice = data.get('purchasePrice') || data.get('purchase_price') ? Math.round(Number(data.get('purchasePrice') || data.get('purchase_price'))) : undefined;
      lowStockThreshold = data.get('lowStockThreshold') || data.get('minStockThreshold') || data.get('low_stock_threshold') ? Number(data.get('lowStockThreshold') || data.get('minStockThreshold') || data.get('low_stock_threshold')) : undefined;
      description = data.get('description') ? (data.get('description') as string) : undefined;
      // compatible_models in FormData: multiple entries under 'compatible_models' key
      const rawModels = data.getAll('compatible_models');
      if (rawModels.length > 0) {
        compatibleModels = rawModels.map((m) => String(m)).filter((m) => m.length > 0);
      }
    } else {
      const d = data as any;
      name = d.name;
      barcode = d.barcode;
      categoryId = d.categoryId || d.category_id;
      brandId = d.brandId || d.brand_id;
      companyId = d.companyId || d.company_id;
      colorId = d.colorId || d.color_id;
      qualityId = d.qualityId || d.quality_id;
      unitId = d.unitId || d.unit_id;
      salePrice = d.price !== undefined ? Math.round(Number(d.price)) : d.sale_price !== undefined ? Math.round(Number(d.sale_price)) : undefined;
      purchasePrice = d.purchasePrice !== undefined ? Math.round(Number(d.purchasePrice)) : d.purchase_price !== undefined ? Math.round(Number(d.purchase_price)) : undefined;
      lowStockThreshold = d.minStockThreshold !== undefined ? Number(d.minStockThreshold) : d.lowStockThreshold !== undefined ? Number(d.lowStockThreshold) : d.low_stock_threshold !== undefined ? Number(d.low_stock_threshold) : undefined;
      description = d.description;
      // compatible_models: honour omit-preserves / empty-clears contract (matches primary service)
      if (d.compatible_models !== undefined) {
        compatibleModels = Array.isArray(d.compatible_models) ? d.compatible_models : [];
      } else if (d.compatibleModels !== undefined) {
        compatibleModels = Array.isArray(d.compatibleModels) ? d.compatibleModels : [];
      }
    }

    const payload = {
      name,
      barcode,
      category_id: categoryId,
      brand_id: brandId,
      company_id: companyId,
      color_id: colorId,
      quality_id: qualityId,
      unit_id: unitId,
      sale_price: salePrice,
      purchase_price: purchasePrice,
      low_stock_threshold: lowStockThreshold,
      description,
      compatible_models: compatibleModels,
    };

    const res = await httpClient.put<{ data?: any, product?: any }>(`/api/v1/products/${id}`, payload);
    const updated = res.data || res.product || res;

    let currentStock = 0;
    try {
      const branchId = getActiveBranchId();
      // Keep Tauri IPC for read stock for now
      currentStock = await tauriClient.inventoryGetStock(updated.id, branchId);
    } catch {}

    const product: ProductDTO = {
      _id: updated.id,
      name: updated.name,
      sku: updated.sku,
      barcode: updated.barcode || undefined,
      category: updated.category_id,
      price: updated.sale_price,
      purchasePrice: updated.purchase_price,
      quantity: currentStock,
      lowStockThreshold: updated.low_stock_threshold,
      description: updated.description || undefined,
      status: 'active',
      isLowStock: currentStock <= (updated.low_stock_threshold || 5),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    return {
      message: 'Product updated successfully',
      product,
    };
  },

  deleteProduct: async (id: string): Promise<{ message: string }> => {
    await httpClient.delete(`/api/v1/products/${id}`);
    return {
      message: 'Product deactivated successfully',
    };
  },


  receiveStock: async (dto: ReceiveStockApiDto): Promise<ReceiveStockApiResult> => {
    return await httpClient.post<ReceiveStockApiResult>('/api/v1/inventory/receive', dto);
  },

  checkDuplicate: async (_params: { sku?: string; barcode?: string; name?: string }): Promise<CheckDuplicateResponseDTO> => {
    return {
      exists: false,
      matchType: 'none',
    };
  }
};


export interface ReceiveStockApiDto {
  product_id: string;
  branch_id: string;
  quantity_received: number;
  unit_cost: number;
  new_sale_price?: number | null;
  supplier_id?: string | null;
  notes?: string | null;
}

export interface ReceiveStockApiResult {
  new_quantity: number;
  new_average_cost: number;
  new_purchase_price?: number;
  new_sale_price?: number;
  movement_id: string;
}
