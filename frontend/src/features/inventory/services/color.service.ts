import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductColor } from '../types';

const STORAGE_KEY = 'niazi_master_colors';

const DEFAULT_COLORS: ProductColor[] = [
  { id: '00000000-0000-0000-0000-000000000301', name: 'Black', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000302', name: 'White', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000303', name: 'Blue', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000304', name: 'Gold', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000305', name: 'Silver', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000306', name: 'Green', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000307', name: 'Red', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000308', name: 'Purple', organizationId: '00000000-0000-0000-0000-000000000001' },
];

function getStoredColors(): ProductColor[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_COLORS;
}

function saveStoredColors(list: ProductColor[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore
  }
}

export const colorService = {
  getColors: async (): Promise<ProductColor[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.colorList();
        if (list && list.length > 0) {
          return list.map((c) => ({
            id: c.id,
            name: c.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri colorList fallback to stored colors', err);
      }
      return getStoredColors();
    }

    try {
      const list = await httpFetch<any[]>('/api/colors');
      if (list && list.length > 0) {
        const mapped = list.map((c: any) => ({
          id: c.id,
          name: c.name,
          organizationId: c.organization_id || '00000000-0000-0000-0000-000000000001',
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
    if (isTauriEnvironment()) {
      try {
        const created = await tauriClient.colorCreate({ name: cleanName });
        const colorObj = {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredColors();
        saveStoredColors([...current.filter(c => c.id !== colorObj.id), colorObj]);
        return colorObj;
      } catch (err) {
        console.warn('Tauri colorCreate fallback to local storage', err);
      }
    }

    const created = await httpFetch<any>('/api/colors', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const colorObj: ProductColor = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredColors();
    saveStoredColors([...current.filter(c => c.id !== colorObj.id), colorObj]);
    return colorObj;
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.colorUpdate(id, { name: cleanName });
        const colorObj = {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredColors();
        saveStoredColors(current.map(c => c.id === id ? colorObj : c));
        return colorObj;
      } catch (err) {
        console.warn('Tauri colorUpdate fallback to local storage', err);
      }
    }

    const updated = await httpFetch<any>(`/api/colors/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const colorObj: ProductColor = {
      id: updated.id,
      name: updated.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredColors();
    saveStoredColors(current.map(c => c.id === id ? colorObj : c));
    return colorObj;
  },

  deleteColor: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
