import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductColor } from '../types';
import { readScopedMasterData, writeScopedMasterData, getActiveOrganizationId } from './masterDataCacheHelper';

const DOMAIN = 'colors';

const DEFAULT_COLORS: ProductColor[] = [
  { id: 'clr_black', name: 'Black' },
  { id: 'clr_white', name: 'White' },
  { id: 'clr_blue', name: 'Blue' },
  { id: 'clr_gold', name: 'Gold' },
  { id: 'clr_silver', name: 'Silver' },
  { id: 'clr_green', name: 'Green' },
  { id: 'clr_purple', name: 'Purple' },
  { id: 'clr_grey', name: 'Grey / Space Grey' },
];

function getStoredColors(): ProductColor[] {
  return readScopedMasterData<ProductColor>(DOMAIN, DEFAULT_COLORS);
}

function saveStoredColors(list: ProductColor[]) {
  writeScopedMasterData<ProductColor>(DOMAIN, list);
}

export const colorService = {
  getColors: async (): Promise<ProductColor[]> => {
    try {
      const list = await httpFetch<any[]>('/api/colors');
      if (list && list.length > 0) {
        const activeOrgId = getActiveOrganizationId();
        const mapped = list.map((c: any) => ({
          id: c.id,
          name: c.name,
          organizationId: c.organization_id || activeOrgId || undefined,
        }));
        saveStoredColors(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('API colorList failed, using cache', err);
    }
    return getStoredColors();
  },
  
  createColor: async (data: { name: string; organizationId?: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    const created = await httpFetch<any>('/api/colors', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const colorObj: ProductColor = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || activeOrgId || undefined,
    };
    const current = getStoredColors();
    saveStoredColors([...current.filter(c => c.id !== colorObj.id), colorObj]);
    return colorObj;
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    const updated = await httpFetch<any>(`/api/colors/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const colorObj: ProductColor = {
      id: updated.id,
      name: updated.name,
      organizationId: updated.organization_id || activeOrgId || undefined,
    };
    const current = getStoredColors();
    saveStoredColors(current.map(c => c.id === id ? colorObj : c));
    return colorObj;
  },

  deleteColor: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
