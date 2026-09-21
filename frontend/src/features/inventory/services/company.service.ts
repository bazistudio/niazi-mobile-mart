import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';
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

export const companyService = {
  getCompanies: async (): Promise<ProductCompany[]> => {
    if (isTauriEnvironment()) {
      try {
        const list = await tauriClient.companyList();
        if (list && list.length > 0) {
          // Perform one-time migration of legacy localStorage custom companies into DB
          try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) {
              const legacy: ProductCompany[] = JSON.parse(raw);
              if (Array.isArray(legacy)) {
                for (const item of legacy) {
                  const clean = item.name?.trim();
                  if (clean && !list.some(c => c.name.toLowerCase() === clean.toLowerCase())) {
                    await tauriClient.companyCreate({ name: clean });
                  }
                }
              }
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            // Ignore legacy migration error
          }

          const refreshed = await tauriClient.companyList();
          return refreshed.map((c) => ({
            id: c.id,
            name: c.name,
            organizationId: '00000000-0000-0000-0000-000000000001',
          }));
        }
      } catch (err) {
        console.warn('Tauri companyList fallback to local storage', err);
      }
    }
    return getStoredCompanies();
  },
  
  createCompany: async (data: { name: string; organizationId?: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const created = await tauriClient.companyCreate({ name: cleanName });
        return {
          id: created.id,
          name: created.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri companyCreate fallback to local storage', err);
      }
    }
    const newCompany: ProductCompany = {
      id: `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001',
    };
    return newCompany;
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    if (isTauriEnvironment()) {
      try {
        const updated = await tauriClient.companyUpdate(id, { name: cleanName });
        return {
          id: updated.id,
          name: updated.name,
          organizationId: '00000000-0000-0000-0000-000000000001',
        };
      } catch (err) {
        console.warn('Tauri companyUpdate fallback to local storage', err);
      }
    }
    return { id, name: cleanName, organizationId: '00000000-0000-0000-0000-000000000001' };
  },

  deleteCompany: async (_id: string): Promise<void> => {
    // Master entity deactivation handled via update is_active = false if needed
  }
};
