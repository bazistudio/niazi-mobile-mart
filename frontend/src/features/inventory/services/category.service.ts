import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
import { ProductCategory } from '../types';

const STORAGE_KEY = 'niazi_master_categories';

const DEFAULT_CATEGORIES: ProductCategory[] = [
  { id: 'cat_smartphones', name: 'Smartphones', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_feature_phones', name: 'Feature Phones', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_accessories', name: 'Accessories', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_chargers', name: 'Chargers & Cables', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_earbuds', name: 'Headphones & Earbuds', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_covers', name: 'Covers & Protectors', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cat_spare_parts', name: 'Spare Parts & Displays', organizationId: '00000000-0000-0000-0000-000000000001' },
];

function getStoredCategories(): ProductCategory[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // ignore
  }
  if (typeof window !== 'undefined') {
    saveStoredCategories(DEFAULT_CATEGORIES);
  }
  return DEFAULT_CATEGORIES;
}

function saveStoredCategories(list: ProductCategory[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore
  }
}

export const categoryService = {
  getCategories: async (): Promise<ProductCategory[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.categoryList();
        if (list && list.length > 0) {
          return list.map((cat) => ({
            id: cat.id,
            name: cat.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri categoryList fallback to stored categories', err);
      }
    }
    return getStoredCategories();
  },
  
  createCategory: async (data: { name: string; organizationId?: string }): Promise<ProductCategory> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const code = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const created = await tauriClient.categoryCreate({
          name: cleanName,
          code: code || 'CAT',
          description: null,
        });
        const catObj = {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredCategories();
        saveStoredCategories([...current.filter(c => c.id !== catObj.id), catObj]);
        return catObj;
      } catch (err) {
        console.warn('Tauri categoryCreate fallback to local storage', err);
      }
    }
    const current = getStoredCategories();
    const newCat: ProductCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001',
    };
    saveStoredCategories([...current, newCat]);
    return newCat;
  },

  updateCategory: async (id: string, data: { name: string }): Promise<ProductCategory> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.categoryUpdate(id, {
          name: cleanName,
        });
        const catObj = {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredCategories();
        saveStoredCategories(current.map(c => c.id === id ? catObj : c));
        return catObj;
      } catch (err) {
        console.warn('Tauri categoryUpdate fallback to local storage', err);
      }
    }
    const current = getStoredCategories();
    const updatedObj = { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
    saveStoredCategories(current.map((cat) => cat.id === id ? updatedObj : cat));
    return updatedObj;
  },

  deleteCategory: async (id: string): Promise<void> => {
    const current = getStoredCategories();
    saveStoredCategories(current.filter((cat) => cat.id !== id));
  }
};
