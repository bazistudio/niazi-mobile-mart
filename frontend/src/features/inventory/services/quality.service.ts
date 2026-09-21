import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
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

export const qualityService = {
  getQualities: async (): Promise<ProductQuality[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.qualityList();
        if (list && list.length > 0) {
          // Perform one-time migration of legacy localStorage custom qualities into DB
          try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) {
              const legacy: ProductQuality[] = JSON.parse(raw);
              if (Array.isArray(legacy)) {
                for (const item of legacy) {
                  const clean = item.name?.trim();
                  if (clean && !list.some(q => q.name.toLowerCase() === clean.toLowerCase())) {
                    await tauriClient.qualityCreate({ name: clean });
                  }
                }
              }
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            // Ignore legacy migration error
          }

          const refreshed = await tauriClient.qualityList();
          return refreshed.map((q) => ({
            id: q.id,
            name: q.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri qualityList fallback to local storage', err);
      }
    }
    return getStoredQualities();
  },
  
  createQuality: async (data: { name: string; organizationId?: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const created = await tauriClient.qualityCreate({ name: cleanName });
        return {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri qualityCreate fallback to local storage', err);
      }
    }
    const newQuality: ProductQuality = {
      id: `qlt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001',
    };
    return newQuality;
  },

  updateQuality: async (id: string, data: { name: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.qualityUpdate(id, { name: cleanName });
        return {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri qualityUpdate fallback to local storage', err);
      }
    }
    return { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
  },

  deleteQuality: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
