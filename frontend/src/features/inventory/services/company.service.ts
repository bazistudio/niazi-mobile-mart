import { ProductCompany } from '../types';

const STORAGE_KEY = 'niazi_master_companies';

const DEFAULT_COMPANIES: ProductCompany[] = [
  { id: 'cmp_niazi', name: 'Niazi Trading', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cmp_official', name: 'Official Importer', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cmp_local', name: 'Local Wholesale', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: 'cmp_china', name: 'China Direct', organizationId: '00000000-0000-0000-0000-000000000001' },
];

function getStoredCompanies(): ProductCompany[] {
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
    saveStoredCompanies(DEFAULT_COMPANIES);
  }
  return DEFAULT_COMPANIES;
}

function saveStoredCompanies(list: ProductCompany[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore
  }
}

export const companyService = {
  getCompanies: async (): Promise<ProductCompany[]> => {
    return getStoredCompanies();
  },
  
  createCompany: async (data: { name: string, organizationId?: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    const current = getStoredCompanies();
    const newCompany: ProductCompany = {
      id: `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
    saveStoredCompanies([...current, newCompany]);
    return newCompany;
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    const current = getStoredCompanies();
    const updatedObj = { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
    saveStoredCompanies(current.map((c) => c.id === id ? updatedObj : c));
    return updatedObj;
  },

  deleteCompany: async (id: string): Promise<void> => {
    const current = getStoredCompanies();
    saveStoredCompanies(current.filter((c) => c.id !== id));
  }
};
