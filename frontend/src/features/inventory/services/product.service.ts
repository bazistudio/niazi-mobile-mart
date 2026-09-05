import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { InventoryProduct, PaginationParams } from '../types';

export const productService = {
  getProducts: async (params: PaginationParams): Promise<{ products: InventoryProduct[], total: number }> => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.search) query.append('search', params.search);
    if (params.categoryId) query.append('categoryId', params.categoryId);
    if (params.brandId) query.append('brandId', params.brandId);
    if (params.companyId) query.append('companyId', params.companyId);
    if (params.colorId) query.append('colorId', params.colorId);
    if (params.qualityId) query.append('qualityId', params.qualityId);

    const response = await retry(() => axiosInstance.get(`/api/v1/products/my-products?${query.toString()}`), RETRY_COUNT);
    const data = response.data;
    
    // The backend might return { data: [], pagination: {} } or { products: [], total: 0 }
    // Adjusting based on standard V4 response: { data: [...], pagination: { total, ... } }
    const items = data.data || data.products || [];
    const total = data.pagination?.total || data.total || 0;
    
    return {
      products: items.map((p: any) => {
        // Backend now provides flat *Name fields (categoryName, brandName, etc.)
        // Fall back to old nested approach for backwards compatibility
        const cat = p.categoryName || p.categoryId?.name || p.category?.name || 'Uncategorized';
        const brand = p.brandName || p.brandId?.name || p.brand?.name || '';
        const company = p.companyName || p.companyId?.name || p.company?.name || '';
        const color = p.colorName || p.colorId?.name || p.color?.name || '';
        const quality = p.qualityName || p.qualityId?.name || p.quality?.name || '';
        
        const stock = p.quantity ?? p.currentStock ?? 0;
        const minStock = p.minStock ?? p.minimumStock ?? 0;
        
        return {
          id: p._id,
          name: p.name,
          sku: p.sku || '',
          category: cat,
          categoryId: p.categoryId,
          brand: brand,
          brandId: p.brandId,
          company: company,
          companyId: p.companyId,
          color: color,
          colorId: p.colorId,
          quality: quality,
          qualityId: p.qualityId,
          stock: stock,
          minStockThreshold: minStock,
          price: p.price ?? p.salePrice ?? 0,
          purchasePrice: p.purchasePrice ?? 0,
          status: stock > minStock ? 'HEALTHY' : stock > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK',
        };
      }) as InventoryProduct[],
      total,
    };
  },

  createProduct: async (productData: any): Promise<InventoryProduct> => {
    const response = await axiosInstance.post('/api/v1/products', productData);
    return response.data.product;
  }
};
