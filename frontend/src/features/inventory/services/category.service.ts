import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductCategory } from '../types';

const STORAGE_KEY = 'niazi_master_categories';

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
  return [];
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
        console.warn('Tauri categoryList error', err);
      }
      return [];
    }

    // Browser mode -> call live PostgreSQL API
    try {
      const list = await httpFetch<any[]>('/api/categories');
      if (list && list.length > 0) {
        const mapped = list.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          organizationId: cat.organization_id || '00000000-0000-0000-0000-000000000001',
        }));
        saveStoredCategories(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('API categoryList failed, using cache', err);
      return getStoredCategories();
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
        console.warn('Tauri categoryCreate failed', err);
        throw err;
      }
    }

    // Browser mode -> POST to live PostgreSQL API
    const code = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20) || 'CAT';
    const created = await httpFetch<any>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName, code, description: null }),
    });
    const catObj: ProductCategory = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredCategories();
    saveStoredCategories([...current.filter(c => c.id !== catObj.id), catObj]);
    return catObj;
  },

  updateCategory: async (id: string, data: { name: string }): Promise<ProductCategory> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.categoryUpdate(id, { name: cleanName });
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
