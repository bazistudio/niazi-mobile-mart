import { tauriClient } from '@/lib/tauri/tauriClient';
import { ProductCategory } from '../types';

export const categoryService = {
  getCategories: async (): Promise<ProductCategory[]> => {
    const list = await tauriClient.categoryList();
    return list.map((cat) => ({
      id: cat.id,
      name: cat.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    }));
  },
  
  createCategory: async (data: { name: string; organizationId?: string }): Promise<ProductCategory> => {
    const code = data.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const created = await tauriClient.categoryCreate({
      name: data.name,
      code: code || 'CAT',
      description: null,
    });
    return {
      id: created.id,
      name: created.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
  },

  updateCategory: async (id: string, data: { name: string }): Promise<ProductCategory> => {
    const updated = await tauriClient.categoryUpdate(id, {
      name: data.name,
    });
    return {
      id: updated.id,
      name: updated.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
  },

  deleteCategory: async (_id: string): Promise<void> => {
    // Desktop SQLite category retention
  }
};
