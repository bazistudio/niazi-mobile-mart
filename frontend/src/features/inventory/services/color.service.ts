import { ProductColor } from '../types';

const STORAGE_KEY = 'niazi_master_colors';

const DEFAULT_COLORS: ProductColor[] = [
  { id: 'clr_black', name: 'Black', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_white', name: 'White', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_blue', name: 'Blue', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_gold', name: 'Gold', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_silver', name: 'Silver', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_green', name: 'Green', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_red', name: 'Red', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'clr_purple', name: 'Purple', organizationId: '00000000-0000-0000-0000-000000000001' },
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
  if (typeof window !== 'undefined') {
    saveStoredColors(DEFAULT_COLORS);
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
    return getStoredColors();
  },
  
  createColor: async (data: { name: string, organizationId?: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    const current = getStoredColors();
    const newColor: ProductColor = {
      id: `clr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
    saveStoredColors([...current, newColor]);
    return newColor;
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    const cleanName = data.name.trim();
    const current = getStoredColors();
    const updatedObj = { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
    saveStoredColors(current.map((c) => c.id === id ? updatedObj : c));
    return updatedObj;
  },

  deleteColor: async (id: string): Promise<void> => {
    const current = getStoredColors();
    saveStoredColors(current.filter((c) => c.id !== id));
  }
};
