import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductQuality } from '../types';

const STORAGE_KEY = 'niazi_master_qualities';

const DEFAULT_QUALITIES: ProductQuality[] = [
  { id: '00000000-0000-0000-0000-000000000201', name: 'Original / 100% Genuine', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000202', name: 'A+ Master Copy', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000203', name: 'High Copy', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000204', name: 'Standard Market Quality', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000205', name: 'Refurbished / Used', organizationId: '00000000-0000-0000-0000-000000000001' },
];

function getStoredQualities(): ProductQuality[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_QUALITIES;
}

function saveStoredQualities(list: ProductQuality[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore
  }
}

export const qualityService = {
  getQualities: async (): Promise<ProductQuality[]> => {
    try {
      const list = await httpFetch<any[]>('/api/qualities');
      if (list && list.length > 0) {
        const mapped = list.map((q: any) => ({
          id: q.id,
          name: q.name,
          organizationId: q.organization_id || '00000000-0000-0000-0000-000000000001',
        }));
        saveStoredQualities(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('API qualityList failed, using cache', err);
    }
    return getStoredQualities();
  },
  
  createQuality: async (data: { name: string; organizationId?: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    const created = await httpFetch<any>('/api/qualities', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const qltObj: ProductQuality = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredQualities();
    saveStoredQualities([...current.filter(q => q.id !== qltObj.id), qltObj]);
    return qltObj;
  },

  updateQuality: async (id: string, data: { name: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    const updated = await httpFetch<any>(`/api/qualities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const qltObj: ProductQuality = {
      id: updated.id,
      name: updated.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredQualities();
    saveStoredQualities(current.map(q => q.id === id ? qltObj : q));
    return qltObj;
  },

  deleteQuality: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
