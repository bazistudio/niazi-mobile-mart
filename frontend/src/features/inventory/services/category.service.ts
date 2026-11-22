import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductCategory } from '../types';
import { readScopedMasterData, writeScopedMasterData, getActiveOrganizationId } from './masterDataCacheHelper';

const DOMAIN = 'categories';

function getStoredCategories(): ProductCategory[] {
  return readScopedMasterData<ProductCategory>(DOMAIN, []);
}

function saveStoredCategories(list: ProductCategory[]) {
  writeScopedMasterData<ProductCategory>(DOMAIN, list);
}

export const categoryService = {
  getCategories: async (): Promise<ProductCategory[]> => {
    try {
      const list = await httpFetch<any[]>('/api/categories');
      if (list && list.length > 0) {
        const activeOrgId = getActiveOrganizationId();
        const mapped = list.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          organizationId: cat.organization_id || activeOrgId || undefined,
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
    const code = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20) || 'CAT';
    const created = await httpFetch<any>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName, code, description: null }),
    });
    const activeOrgId = getActiveOrganizationId();
    const catObj: ProductCategory = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || activeOrgId || undefined,
    };
    const current = getStoredCategories();
    saveStoredCategories([...current.filter(c => c.id !== catObj.id), catObj]);
    return catObj;
  },

  updateCategory: async (id: string, data: { name: string }): Promise<ProductCategory> => {
    const cleanName = data.name.trim();
    const updated = await httpFetch<any>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const catObj: ProductCategory = {
      id: updated.id,
      name: updated.name,
      organizationId: updated.organization_id || activeOrgId || undefined,
    };
    const current = getStoredCategories();
    saveStoredCategories(current.map(c => c.id === id ? catObj : c));
    return catObj;
  },

  deleteCategory: async (id: string): Promise<void> => {
    const current = getStoredCategories();
    saveStoredCategories(current.filter((cat) => cat.id !== id));
  }
};
