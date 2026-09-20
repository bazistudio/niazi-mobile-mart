import { tauriClient } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { platformAdapter } from '@/lib/platformAdapter';
import { InventoryProduct, PaginationParams, StockStatus } from '../types';
import { categoryService } from './category.service';
import { brandService } from './brand.service';
import { companyService } from './company.service';
import { colorService } from './color.service';
import { qualityService } from './quality.service';

function getActiveBranchId(): string {
  try {
    const store = useOrganizationStore.getState();
    const branchId = store.activeShop?._id || store.activeShopId;
    if (branchId && branchId.length === 36) {
      return branchId;
    }
  } catch {}
  return '00000000-0000-0000-0000-000000000002';
}

export const productService = {
  getProducts: async (params: PaginationParams): Promise<{ products: InventoryProduct[], total: number }> => {
    const branchId = getActiveBranchId();

    const [items, stockMap, categories, brands, companies, colors, qualities] = await Promise.all([
      tauriClient.productList({
        search: params.search,
        category_id: params.categoryId,
        brand_id: params.brandId,
        company_id: params.companyId,
        color_id: params.colorId,
        quality_id: params.qualityId,
        is_active: true,
      }).catch(() => []),
      tauriClient.inventoryGetStockMap(branchId).catch(() => ({}) as Record<string, number>),
      categoryService.getCategories().catch(() => []),
      brandService.getBrands().catch(() => []),
      companyService.getCompanies().catch(() => []),
      colorService.getColors().catch(() => []),
      qualityService.getQualities().catch(() => []),
    ]);

    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const companyMap = new Map(companies.map(c => [c.id, c.name]));
    const colorMap = new Map(colors.map(c => [c.id, c.name]));
    const qualityMap = new Map(qualities.map(q => [q.id, q.name]));

    const mapped: InventoryProduct[] = items.map((p) => {
      const minStock = p.low_stock_threshold ?? 5;
      const currentStock = stockMap[p.id] ?? 0;

      let status = StockStatus.HEALTHY;
      if (currentStock === 0) {
        status = StockStatus.OUT_OF_STOCK;
      } else if (currentStock <= minStock) {
        status = StockStatus.LOW_STOCK;
      }

      const catName = p.category_id ? (categoryMap.get(p.category_id) || p.category_id) : 'General';
      const brandName = p.brand_id ? (brandMap.get(p.brand_id) || p.brand_id) : '-';
      const compName = p.company_id ? (companyMap.get(p.company_id) || p.company_id) : '-';
      const colorName = p.color_id ? (colorMap.get(p.color_id) || p.color_id) : '-';
      const qualityName = p.quality_id ? (qualityMap.get(p.quality_id) || p.quality_id) : '-';

      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        barcode: p.barcode || undefined,
        category: catName,
        categoryId: p.category_id,
        brand: brandName,
        brandId: p.brand_id || undefined,
        company: compName,
        companyId: p.company_id || undefined,
        color: colorName,
        colorId: p.color_id || undefined,
        quality: qualityName,
        qualityId: p.quality_id || undefined,
        stock: currentStock,
        minStockThreshold: minStock,
        price: p.sale_price,
        purchasePrice: p.purchase_price,
        averageCost: p.average_cost,
        status,
        updatedAt: p.updated_at,
      };
    });

    let filtered = mapped;
    if (params.companyId) {
      filtered = filtered.filter(p => p.companyId === params.companyId);
    }
    if (params.colorId) {
      filtered = filtered.filter(p => p.colorId === params.colorId);
    }
    if (params.qualityId) {
      filtered = filtered.filter(p => p.qualityId === params.qualityId);
    }

    return {
      products: filtered,
      total: filtered.length,
    };
  },

  createProduct: async (productData: any): Promise<InventoryProduct> => {
    const initialQty = Number(productData.initial_quantity ?? productData.initialQuantity ?? productData.quantity ?? 0);

    let branchId = productData.branch_id || productData.branchId || null;
    if (initialQty > 0 && !branchId) {
      branchId = getActiveBranchId();
    }

    const rawCatId = productData.categoryId || productData.category_id;
    const categoryId = (rawCatId && rawCatId.length === 36) ? rawCatId : '00000000-0000-0000-0000-000000000010';

    const rawBrandId = productData.brandId || productData.brand_id;
    const brandId = (rawBrandId && rawBrandId.length === 36) ? rawBrandId : null;

    const rawUnitId = productData.unitId || productData.unit_id;
    const unitId = (rawUnitId && rawUnitId.length === 36) ? rawUnitId : null;

    const created = await tauriClient.productCreate({
      name: productData.name,
      sku: productData.sku || `SKU-${Date.now()}`,
      barcode: productData.barcode || null,
      category_id: categoryId,
      brand_id: brandId,
      company_id: productData.companyId || productData.company_id || null,
      color_id: productData.colorId || productData.color_id || null,
      quality_id: productData.qualityId || productData.quality_id || null,
      unit_id: unitId,
      purchase_price: Math.round(Number(productData.purchasePrice || productData.purchase_price || 0)),
      sale_price: Math.round(Number(productData.price || productData.sale_price || 0)),
      low_stock_threshold: Number(productData.lowStockThreshold || productData.minStock || 5),
      description: productData.description || null,
      initial_quantity: initialQty > 0 ? initialQty : null,
      branch_id: initialQty > 0 ? branchId : null,
      initial_branch_id: initialQty > 0 ? branchId : null,
    });

    const [categories, brands, companies, colors, qualities] = await Promise.all([
      categoryService.getCategories().catch(() => []),
      brandService.getBrands().catch(() => []),
      companyService.getCompanies().catch(() => []),
      colorService.getColors().catch(() => []),
      qualityService.getQualities().catch(() => []),
    ]);

    const catName = categories.find(c => c.id === created.category_id)?.name || 'General';
    const brandName = created.brand_id ? (brands.find(b => b.id === created.brand_id)?.name || created.brand_id) : '-';
    const compName = created.company_id ? (companies.find(c => c.id === created.company_id)?.name || created.company_id) : '-';
    const colorName = created.color_id ? (colors.find(c => c.id === created.color_id)?.name || created.color_id) : '-';
    const qualityName = created.quality_id ? (qualities.find(q => q.id === created.quality_id)?.name || created.quality_id) : '-';

    platformAdapter.emitEvent('inventory-updated');

    return {
      id: created.id,
      name: created.name,
      sku: created.sku,
      category: catName,
      categoryId: created.category_id,
      brand: brandName,
      brandId: created.brand_id || undefined,
      company: compName,
      companyId: created.company_id || undefined,
      color: colorName,
      colorId: created.color_id || undefined,
      quality: qualityName,
      qualityId: created.quality_id || undefined,
      stock: initialQty > 0 ? initialQty : 0,
      minStockThreshold: created.low_stock_threshold,
      price: created.sale_price,
      purchasePrice: created.purchase_price,
      status: initialQty > 0 ? StockStatus.HEALTHY : StockStatus.OUT_OF_STOCK,
    };
  },

  updateProduct: async (id: string, productData: any): Promise<InventoryProduct> => {
    const rawCatId = productData.categoryId || productData.category_id;
    const categoryId = (rawCatId && rawCatId.length === 36) ? rawCatId : undefined;

    const rawBrandId = productData.brandId || productData.brand_id;
    const brandId = (rawBrandId && rawBrandId.length === 36) ? rawBrandId : undefined;

    const rawUnitId = productData.unitId || productData.unit_id;
    const unitId = (rawUnitId && rawUnitId.length === 36) ? rawUnitId : undefined;

    const updated = await tauriClient.productUpdate(id, {
      name: productData.name,
      sku: productData.sku,
      barcode: productData.barcode || null,
      category_id: categoryId,
      brand_id: brandId,
      company_id: productData.companyId || productData.company_id || null,
      color_id: productData.colorId || productData.color_id || null,
      quality_id: productData.qualityId || productData.quality_id || null,
      unit_id: unitId,
      purchase_price: productData.purchasePrice !== undefined ? Math.round(Number(productData.purchasePrice)) : undefined,
      sale_price: productData.price !== undefined ? Math.round(Number(productData.price)) : undefined,
      low_stock_threshold: productData.lowStockThreshold !== undefined ? Number(productData.lowStockThreshold) : undefined,
      description: productData.description || null,
    });

    if (productData.quantity !== undefined && productData.quantity !== null && !isNaN(Number(productData.quantity))) {
      try {
        await tauriClient.inventoryAdjust({
          product_id: id,
          branch_id: getActiveBranchId(),
          target_quantity: Number(productData.quantity),
        });
      } catch (err) {
        console.warn('inventoryAdjust non-fatal warning during product update:', err);
      }
    }

    const [categories, brands, companies, colors, qualities, stockMap] = await Promise.all([
      categoryService.getCategories().catch(() => []),
      brandService.getBrands().catch(() => []),
      companyService.getCompanies().catch(() => []),
      colorService.getColors().catch(() => []),
      qualityService.getQualities().catch(() => []),
      tauriClient.inventoryGetStockMap(getActiveBranchId()).catch(() => ({}) as Record<string, number>),
    ]);

    const catName = categories.find(c => c.id === updated.category_id)?.name || 'General';
    const brandName = updated.brand_id ? (brands.find(b => b.id === updated.brand_id)?.name || updated.brand_id) : '-';
    const compName = updated.company_id ? (companies.find(c => c.id === updated.company_id)?.name || updated.company_id) : '-';
    const colorName = updated.color_id ? (colors.find(c => c.id === updated.color_id)?.name || updated.color_id) : '-';
    const qualityName = updated.quality_id ? (qualities.find(q => q.id === updated.quality_id)?.name || updated.quality_id) : '-';
    const currentStock = productData.quantity !== undefined ? Number(productData.quantity) : (stockMap[updated.id] ?? 0);

    return {
      id: updated.id,
      name: updated.name,
      sku: updated.sku,
      category: catName,
      categoryId: updated.category_id,
      brand: brandName,
      brandId: updated.brand_id || undefined,
      company: compName,
      companyId: updated.company_id || undefined,
      color: colorName,
      colorId: updated.color_id || undefined,
      quality: qualityName,
      qualityId: updated.quality_id || undefined,
      stock: currentStock,
      minStockThreshold: updated.low_stock_threshold,
      price: updated.sale_price,
      purchasePrice: updated.purchase_price,
      status: currentStock > 0 ? StockStatus.HEALTHY : StockStatus.OUT_OF_STOCK,
    };
  },

  deleteProduct: async (id: string): Promise<void> => {
    await tauriClient.productDeactivate(id);
  }
};


