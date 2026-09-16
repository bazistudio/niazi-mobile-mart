import { ProductQuality } from '../types';

const STORAGE_KEY = 'niazi_master_qualities';

const DEFAULT_QUALITIES: ProductQuality[] = [
  { id: 'qlt_original', name: 'Original / 100% Genuine', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'qlt_master_copy', name: 'A+ Master Copy', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'qlt_high_copy', name: 'High Copy', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'qlt_standard', name: 'Standard Market Quality', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'qlt_refurbished', name: 'Refurbished / Used', organizationId: '00000000-0000-0000-0000-000000000001' },
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
  if (typeof window !== 'undefined') {
    saveStoredQualities(DEFAULT_QUALITIES);
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
    return getStoredQualities();
  },
  
  createQuality: async (data: { name: string, organizationId?: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    const current = getStoredQualities();
    const newQuality: ProductQuality = {
      id: `qlt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
    saveStoredQualities([...current, newQuality]);
    return newQuality;
  },

  updateQuality: async (id: string, data: { name: string }): Promise<ProductQuality> => {
    const cleanName = data.name.trim();
    const current = getStoredQualities();
    const updatedObj = { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
    saveStoredQualities(current.map((q) => q.id === id ? updatedObj : q));
    return updatedObj;
  },

  deleteQuality: async (id: string): Promise<void> => {
    const current = getStoredQualities();
    saveStoredQualities(current.filter((q) => q.id !== id));
  }
};
