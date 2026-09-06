import { tauriClient } from '@/lib/tauri/tauriClient';
import { InventoryProduct, PaginationParams } from '../types';

export const productService = {
  getProducts: async (params: PaginationParams): Promise<{ products: InventoryProduct[], total: number }> => {
    const items = await tauriClient.productList({
      search: params.search,
      category_id: params.categoryId,
      brand_id: params.brandId,
      is_active: true,
    });

    const mapped = items.map((p) => {
      const minStock = p.low_stock_threshold ?? 5;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        category: 'Catalog Item',
        categoryId: p.category_id,
        brand: '',
        brandId: p.brand_id || undefined,
        stock: 0,
        minStockThreshold: minStock,
        price: p.sale_price,
        purchasePrice: p.purchase_price,
        status: 'HEALTHY' as const,
      };
    });

    return {
      products: mapped,
      total: mapped.length,
    };
  },

  createProduct: async (productData: any): Promise<InventoryProduct> => {
    const created = await tauriClient.productCreate({
      name: productData.name,
      sku: productData.sku || `SKU-${Date.now()}`,
      barcode: productData.barcode || null,
      category_id: productData.categoryId || productData.category_id || '00000000-0000-0000-0000-000000000001',
      brand_id: productData.brandId || productData.brand_id || null,
      unit_id: productData.unitId || productData.unit_id || '00000000-0000-0000-0000-000000000001',
      purchase_price: Math.round(Number(productData.purchasePrice || productData.purchase_price || 0)),
      sale_price: Math.round(Number(productData.price || productData.sale_price || 0)),
      low_stock_threshold: Number(productData.lowStockThreshold || productData.minStock || 5),
      description: productData.description || null,
    });

    return {
      id: created.id,
      name: created.name,
      sku: created.sku,
      category: 'Catalog Item',
      categoryId: created.category_id,
      stock: 0,
      minStockThreshold: created.low_stock_threshold,
      price: created.sale_price,
      purchasePrice: created.purchase_price,
      status: 'HEALTHY',
    };
  }
};

