import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductBrand } from '../types';
import { readScopedMasterData, writeScopedMasterData, getActiveOrganizationId } from './masterDataCacheHelper';

const DOMAIN = 'brands';

const DEFAULT_BRANDS: ProductBrand[] = [
  { id: 'brd_samsung', name: 'Samsung' },
  { id: 'brd_apple', name: 'Apple (iPhone)' },
  { id: 'brd_infinix', name: 'Infinix' },
  { id: 'brd_tecno', name: 'Tecno' },
  { id: 'brd_vivo', name: 'Vivo' },
  { id: 'brd_oppo', name: 'Oppo' },
  { id: 'brd_realme', name: 'Realme' },
  { id: 'brd_xiaomi', name: 'Xiaomi / Redmi' },
  { id: 'brd_nokia', name: 'Nokia' },
  { id: 'brd_itel', name: 'Itel' },
  { id: 'brd_ronin', name: 'Ronin' },
  { id: 'brd_audionic', name: 'Audionic' },
  { id: 'brd_faster', name: 'Faster' },
  { id: 'brd_anker', name: 'Anker' },
];

function getStoredBrands(): ProductBrand[] {
  return readScopedMasterData<ProductBrand>(DOMAIN, DEFAULT_BRANDS);
}

function saveStoredBrands(list: ProductBrand[]) {
  writeScopedMasterData<ProductBrand>(DOMAIN, list);
}

export const brandService = {
  getBrands: async (): Promise<ProductBrand[]> => {
    try {
      const list = await httpFetch<any[]>('/api/brands');
      if (list && list.length > 0) {
        const activeOrgId = getActiveOrganizationId();
        const mapped = list.map((b: any) => ({
          id: b.id,
          name: b.name,
          organizationId: b.organization_id || activeOrgId || undefined,
        }));
        saveStoredBrands(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('API brandList failed, using cache', err);
    }
    return getStoredBrands();
  },
  
  createBrand: async (data: { name: string; organizationId?: string }): Promise<ProductBrand> => {
    const cleanName = data.name.trim();
    const created = await httpFetch<any>('/api/brands', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const brandObj: ProductBrand = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || activeOrgId || undefined,
    };
    const current = getStoredBrands();
    saveStoredBrands([...current.filter(b => b.id !== brandObj.id), brandObj]);
    return brandObj;
  },

  updateBrand: async (id: string, data: { name: string }): Promise<ProductBrand> => {
    const cleanName = data.name.trim();
    const updated = await httpFetch<any>(`/api/brands/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const brandObj: ProductBrand = {
      id: updated.id,
      name: updated.name,
      organizationId: updated.organization_id || activeOrgId || undefined,
    };
    const current = getStoredBrands();
    saveStoredBrands(current.map(b => b.id === id ? brandObj : b));
    return brandObj;
  },

  deleteBrand: async (id: string): Promise<void> => {
    const current = getStoredBrands();
    saveStoredBrands(current.filter((b) => b.id !== id));
  }
};
