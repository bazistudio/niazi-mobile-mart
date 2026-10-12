// src/features/inventory/core/inventory.store.ts

import { create } from 'zustand';
import { 
  InventoryProduct, 
  InventoryFilterType, 
  InventorySortConfig, 
  RequestStatus, 
  PaginationParams, 
  InventoryAdjustmentType,
  ProductCategory
} from '../types';
import { inventoryService } from '../services/inventory.service';
import { DEFAULT_PAGE_SIZE } from '../constants/inventory.constants';
import { CreateProductDTO } from '../dto/inventory.dto';
import { productService } from '../product/product.service';
import { tauriClient } from '@/lib/tauri/tauriClient';


interface InventoryState {
  products: InventoryProduct[];
  totalProducts: number;
  searchTerm: string;
  activeFilter: InventoryFilterType;
  sort: InventorySortConfig;
  status: RequestStatus;
  error: string | null;
  categories: ProductCategory[];
  isCategoriesLoading: boolean;
  scope: 'branch' | 'organization';

  // actions
  setSearch: (term: string) => void;
  setFilter: (filter: InventoryFilterType) => void;
  setSort: (sort: InventorySortConfig) => void;
  setScope: (scope: 'branch' | 'organization') => void;
  
  // async thunks
  fetchProducts: (params?: Partial<PaginationParams>) => Promise<void>;
  forceSync: () => Promise<void>;
  updateProduct: (id: string, data: import('../dto/inventory.dto').UpdateProductDTO, image?: File) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  createProduct: (data: CreateProductDTO, image?: File) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  products: [],
  totalProducts: 0,
  searchTerm: '',
  activeFilter: 'all',
  sort: { field: 'name', direction: 'asc' },
  status: 'idle',
  error: null,
  categories: [],
  isCategoriesLoading: false,
  scope: 'branch',

  setSearch: (term) => set({ searchTerm: term }),

  setFilter: (filter) => set({ activeFilter: filter }),

  setSort: (sort) => set({ sort }),

  setScope: (scope) => set({ scope }),

  fetchProducts: async (params) => {
    if (get().status === 'loading') return;
    console.log("[DEBUG] FETCH PRODUCTS CALLED");
    try {
      set({ status: 'loading', error: null });
      
      const currentScope = params?.scope ?? get().scope ?? 'branch';
      if (params?.scope && params.scope !== get().scope) {
        set({ scope: params.scope });
      }

      const requestParams: PaginationParams = {
        page: params?.page || 1,
        limit: params?.limit || DEFAULT_PAGE_SIZE,
        search: params?.search || get().searchTerm,
        scope: currentScope,
      };
      
      const { products, total } = await inventoryService.getProducts(requestParams);
      
      set({ 
        products, 
        totalProducts: total,
        status: 'success',
        error: null
      });
    } catch (error: any) {
      set({ 
        status: 'error', 
        error: error.message || 'Failed to fetch inventory data' 
      });
    }
  },

  forceSync: async () => {
    try {
      set({ status: 'loading', error: null });
      await tauriClient.syncTriggerNow().catch((err) => console.warn('[forceSync] Tauri sync warning:', err));
      const requestParams: PaginationParams = {
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        search: get().searchTerm,
        scope: get().scope ?? 'branch',
      };
      const { products, total } = await inventoryService.getProducts(requestParams);
      set({
        products,
        totalProducts: total,
        status: 'success',
        error: null,
      });
    } catch (error: any) {
      set({
        status: 'error',
        error: error.message || 'Failed to sync inventory data',
      });
    }
  },

  updateProduct: async (id, data, image) => {
    try {
      set({ status: 'loading', error: null });
      await productService.updateProduct(id, data, image);
      await get().fetchProducts(); // single refresh from backend
    } catch (error: any) {
      set({ status: 'error', error: error.message || 'Failed to update product' });
      throw error;
    }
  },

  deleteProduct: async (id) => {
    try {
      set({ status: 'loading', error: null });
      await productService.deleteProduct(id);
      await get().fetchProducts(); // single refresh — soft-deleted product disappears from list
    } catch (error: any) {
      set({ status: 'error', error: error.message || 'Failed to delete product' });
      throw error;
    }
  },

  fetchCategories: async () => {
    try {
      set({ isCategoriesLoading: true });
      const categories = await inventoryService.getCategories();
      
      // Ensure "Uncategorized" fallback is always available for robust mobile entry
      const hasUncategorized = categories.some(c => c.name.toLowerCase() === 'uncategorized');
      if (!hasUncategorized) {
        // Pseudo ID for Uncategorized to allow frontend to function if backend doesn't provide it
        categories.push({ id: 'uncategorized', name: 'Uncategorized' });
      }

      set({ categories, isCategoriesLoading: false });
    } catch (error) {
      console.error('Failed to fetch categories', error);
      set({ isCategoriesLoading: false, categories: [{ id: 'uncategorized', name: 'Uncategorized' }] }); // Fallback
    }
  },

  createProduct: async (data: CreateProductDTO, image?: File) => {
    try {
      set({ status: 'loading', error: null });
      
      // Delegate to productService which handles category resolution and API calls
      await productService.createProduct(data, image);
      
      // Auto-refresh: Completely reload inventory from backend source of truth
      await get().fetchProducts();

    } catch (error: any) {
      set({ 
        status: 'error', 
        error: error.message || 'Failed to create product' 
      });
      throw error; // Re-throw so the form can show an error
    }
  }
}));

if (typeof window !== 'undefined') {
  window.addEventListener('inventory-updated', () => {
    console.log('[DEBUG] Inventory updated event received, forcing sync...');
    useInventoryStore.getState().forceSync().catch(console.error);
  });
}
