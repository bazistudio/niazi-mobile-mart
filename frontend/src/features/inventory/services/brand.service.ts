import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
import { ProductBrand } from '../types';

const STORAGE_KEY = 'niazi_master_brands';

const DEFAULT_BRANDS: ProductBrand[] = [
  { id: 'brd_samsung', name: 'Samsung', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_apple', name: 'Apple (iPhone)', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_infinix', name: 'Infinix', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_tecno', name: 'Tecno', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_vivo', name: 'Vivo', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_oppo', name: 'Oppo', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_realme', name: 'Realme', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_xiaomi', name: 'Xiaomi / Redmi', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_nokia', name: 'Nokia', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_itel', name: 'Itel', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_ronin', name: 'Ronin', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_audionic', name: 'Audionic', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_faster', name: 'Faster', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'brd_anker', name: 'Anker', organizationId: '00000000-0000-0000-0000-000000000001' },
];

function getStoredBrands(): ProductBrand[] {
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
    saveStoredBrands(DEFAULT_BRANDS);
  }
  return DEFAULT_BRANDS;
}

function saveStoredBrands(list: ProductBrand[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore
  }
}

export const brandService = {
  getBrands: async (): Promise<ProductBrand[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.brandList();
        if (list && list.length > 0) {
          return list.map((b) => ({
            id: b.id,
            name: b.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri brandList fallback to stored brands', err);
      }
    }
    return getStoredBrands();
  },
  
  createBrand: async (data: { name: string; organizationId?: string }): Promise<ProductBrand> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const code = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const created = await tauriClient.brandCreate({
          name: cleanName,
          code: code || 'BRD',
          description: null,
        });
        const brandObj = {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredBrands();
        saveStoredBrands([...current.filter(b => b.id !== brandObj.id), brandObj]);
        return brandObj;
      } catch (err) {
        console.warn('Tauri brandCreate fallback to local storage', err);
      }
    }
    const current = getStoredBrands();
    const newBrand: ProductBrand = {
      id: `brd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001',
    };
    saveStoredBrands([...current, newBrand]);
    return newBrand;
  },

  updateBrand: async (id: string, data: { name: string }): Promise<ProductBrand> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.brandUpdate(id, {
          name: cleanName,
        });
        const brandObj = {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredBrands();
        saveStoredBrands(current.map(b => b.id === id ? brandObj : b));
        return brandObj;
      } catch (err) {
        console.warn('Tauri brandUpdate fallback to local storage', err);
      }
    }
    const current = getStoredBrands();
    const updatedObj = { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
    saveStoredBrands(current.map((b) => b.id === id ? updatedObj : b));
    return updatedObj;
  },

  deleteBrand: async (id: string): Promise<void> => {
    const current = getStoredBrands();
    saveStoredBrands(current.filter((b) => b.id !== id));
  }
};
