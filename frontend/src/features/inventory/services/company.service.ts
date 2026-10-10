import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductCompany } from '../types';

const STORAGE_KEY = 'niazi_master_companies';

const DEFAULT_COMPANIES: ProductCompany[] = [
  { id: '00000000-0000-0000-0000-000000000101', name: 'Official Importer', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000102', name: 'China Direct', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000103', name: 'Local Wholesale', organizationId: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000104', name: 'Niazi Trading', organizationId: '00000000-0000-0000-0000-000000000001' },
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
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.companyList();
        if (list && list.length > 0) {
          return list.map((c) => ({
            id: c.id,
            name: c.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri companyList fallback to stored companies', err);
      }
      return getStoredCompanies();
    }

    try {
      const list = await httpFetch<any[]>('/api/companies');
      if (list && list.length > 0) {
        const mapped = list.map((c: any) => ({
          id: c.id,
          name: c.name,
          organizationId: c.organization_id || '00000000-0000-0000-0000-000000000001',
        }));
        saveStoredCompanies(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('API companyList failed, using cache', err);
    }
    return getStoredCompanies();
  },
  
  createCompany: async (data: { name: string; organizationId?: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const created = await tauriClient.companyCreate({ name: cleanName });
        const compObj = {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredCompanies();
        saveStoredCompanies([...current.filter(c => c.id !== compObj.id), compObj]);
        return compObj;
      } catch (err) {
        console.warn('Tauri companyCreate fallback to local storage', err);
      }
    }

    const created = await httpFetch<any>('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const compObj: ProductCompany = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredCompanies();
    saveStoredCompanies([...current.filter(c => c.id !== compObj.id), compObj]);
    return compObj;
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.companyUpdate(id, { name: cleanName });
        const compObj = {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
        const current = getStoredCompanies();
        saveStoredCompanies(current.map(c => c.id === id ? compObj : c));
        return compObj;
      } catch (err) {
        console.warn('Tauri companyUpdate fallback to local storage', err);
      }
    }

    const updated = await httpFetch<any>(`/api/companies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const compObj: ProductCompany = {
      id: updated.id,
      name: updated.name,
      organizationId: '00000000-0000-0000-0000-000000000001',
    };
    const current = getStoredCompanies();
    saveStoredCompanies(current.map(c => c.id === id ? compObj : c));
    return compObj;
  },

  deleteCompany: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
