import { tauriClient } from '@/lib/tauri/tauriClient';
import { ProductBrand } from '../types';

export const brandService = {
  getBrands: async (): Promise<ProductBrand[]> => {
    const list = await tauriClient.brandList();
    return list.map((b) => ({
      id: b.id,
      name: b.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    }));
  },
  
  createBrand: async (data: { name: string; organizationId?: string }): Promise<ProductBrand> => {
    const code = data.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const created = await tauriClient.brandCreate({
      name: data.name,
      code: code || 'BRD',
      description: null,
    });
    return {
      id: created.id,
      name: created.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
  },

  updateBrand: async (id: string, data: { name: string }): Promise<ProductBrand> => {
    const updated = await tauriClient.brandUpdate(id, {
      name: data.name,
    });
    return {
      id: updated.id,
      name: updated.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
  },

  deleteBrand: async (_id: string): Promise<void> => {
    // Desktop SQLite brand retention
  }
};
