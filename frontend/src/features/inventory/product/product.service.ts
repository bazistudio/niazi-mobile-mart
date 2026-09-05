// src/features/inventory/product/product.service.ts

import { inventoryRepository } from '../repositories/inventory.repository';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { CreateProductDTO, UpdateProductDTO } from '../dto/inventory.dto';
import { ProductEntity } from './product.types';
import { syncEngine } from '@/features/realtime-sync/sync.engine';

export const productService = {
  /**
   * Validates if the product can be created based on strict Duplicate Checks.
   * SKU: Hard Block
   * Name: Hard Block
   */
  validateNewProduct: async (name: string, sku?: string): Promise<void> => {
    const params: { name?: string; sku?: string } = { name };
    if (sku && sku.trim() !== '') {
      params.sku = sku;
    }

    try {
      const duplicateRes = await inventoryRepository.checkDuplicate(params);
      
      if (duplicateRes.exists) {
        if (duplicateRes.matchType === 'sku') {
          throw new Error('A product with this SKU already exists.');
        }
        if (duplicateRes.matchType === 'name' || duplicateRes.matchType === 'possible') {
          throw new Error('A product with this Exact Name already exists.');
        }
        throw new Error('Duplicate product detected.');
      }
    } catch (err: any) {
      // If the duplicate check endpoint doesn't exist yet on the backend, 
      // it might throw a 404 or 500. For now, if the check throws an explicit duplicate error, we throw it.
      if (err.message && err.message.includes('already exists')) {
        throw err;
      }
      // Otherwise, we log and proceed (fallback to let backend handle constraints)
      console.warn('Duplicate check failed to execute cleanly:', err);
    }
  },

  createProduct: async (productData: CreateProductDTO, imageFile?: File): Promise<any> => {
    // Auto-generate human-readable SKU if empty
    let skuToUse = productData.sku;
    if (!skuToUse || skuToUse.trim() === '') {
      const prefix = productData.name
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 4)
        .toUpperCase();
      const randomId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      skuToUse = `${prefix}-${randomId}`;
    }

    // Strict validation before creation
    await productService.validateNewProduct(productData.name, skuToUse);

    const formData = new FormData();
    formData.append('name', productData.name);
    formData.append('price', productData.price.toString());
    formData.append('quantity', productData.quantity.toString());
    formData.append('category', productData.category);
    formData.append('sku', skuToUse);
    
    if (productData.purchasePrice !== undefined) formData.append('purchasePrice', productData.purchasePrice.toString());
    if (productData.barcode) formData.append('barcode', productData.barcode);
    if (productData.brand) formData.append('brand', productData.brand);
    if (productData.description) formData.append('description', productData.description);
    if (productData.lowStockThreshold !== undefined) formData.append('lowStockThreshold', productData.lowStockThreshold.toString());

    if (imageFile) {
      formData.append('image', imageFile);
    }

    // Call repository
    const response = await inventoryRepository.createProduct(formData);
    
    // Emit real-time event
    syncEngine.emit('PRODUCT_CREATED', {
      productId: response.product._id,
      product: response.product,
      timestamp: new Date().toISOString()
    });

    return response.product;
  },

  updateProduct: async (id: string, data: UpdateProductDTO, imageFile?: File): Promise<any> => {
    let payload: UpdateProductDTO | FormData = data;
    
    if (imageFile) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined) formData.append(key, String(val));
      });
      formData.append('image', imageFile);
      payload = formData;
    }

    const response = await inventoryRepository.updateProduct(id, payload);
    
    syncEngine.emit('PRODUCT_UPDATED', {
      productId: id,
      changes: data,
      timestamp: new Date().toISOString()
    });

    return response.product;
  },

  deleteProduct: async (id: string): Promise<void> => {
    await inventoryRepository.deleteProduct(id);
    
    syncEngine.emit('PRODUCT_DELETED', {
      productId: id,
      timestamp: new Date().toISOString()
    });
  }
};
