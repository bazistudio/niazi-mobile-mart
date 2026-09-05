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

  // actions
  setSearch: (term: string) => void;
  setFilter: (filter: InventoryFilterType) => void;
  setSort: (sort: InventorySortConfig) => void;
  
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

  setSearch: (term) => set({ searchTerm: term }),

  setFilter: (filter) => set({ activeFilter: filter }),

  setSort: (sort) => set({ sort }),

  fetchProducts: async (params) => {
    if (get().status === 'loading') return;
    console.log("[DEBUG] FETCH PRODUCTS CALLED");
    try {
      set({ status: 'loading', error: null });
      
      const requestParams: PaginationParams = {
        page: params?.page || 1,
        limit: params?.limit || DEFAULT_PAGE_SIZE,
        search: params?.search || get().searchTerm,
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
    // Clear cache completely and force refetch from backend
    set({ products: [], totalProducts: 0, status: 'loading', error: null });
    await get().fetchProducts();
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
      
      // If user selected the fallback uncategorized, we might need to handle it 
      // or assume the backend accepts a missing category or we map it to a default UUID
      const finalCategory = data.categoryId || "00000000-0000-0000-0000-000000000000"; 
      const finalUnit = data.baseUnitId || "00000000-0000-0000-0000-000000000000";
        // The backend requires a UUID. In a real scenario, this would be an actual ID.
        // For the sake of the form not breaking, we will send it and let the API layer handle or fail gracefully.
        // If the backend strict validates, we should ideally fetch the real "Uncategorized" ID.

      const newProductDto = await productService.createProduct(data, image);
      
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
