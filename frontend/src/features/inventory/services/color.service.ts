import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
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

export const colorService = {
  getColors: async (): Promise<ProductColor[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.colorList();
        if (list && list.length > 0) {
          // Perform one-time migration of legacy localStorage custom colors into DB
          try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) {
              const legacy: ProductColor[] = JSON.parse(raw);
              if (Array.isArray(legacy)) {
                for (const item of legacy) {
                  const clean = item.name?.trim();
                  if (clean && !list.some(c => c.name.toLowerCase() === clean.toLowerCase())) {
                    await tauriClient.colorCreate({ name: clean });
                  }
                }
              }
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            // Ignore legacy migration error
          }

          const refreshed = await tauriClient.colorList();
          return refreshed.map((c) => ({
            id: c.id,
            name: c.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri colorList fallback to local storage', err);
      }
    }
    return getStoredColors();
  },
  
  createColor: async (data: { name: string; organizationId?: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const created = await tauriClient.colorCreate({ name: cleanName });
        return {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri colorCreate fallback to local storage', err);
      }
    }
    const newColor: ProductColor = {
      id: `clr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001',
    };
    return newColor;
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.colorUpdate(id, { name: cleanName });
        return {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri colorUpdate fallback to local storage', err);
      }
    }
    return { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
  },

  deleteColor: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
