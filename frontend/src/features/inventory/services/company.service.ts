import { isTauriEnvironment, tauriClient, httpFetch } from '@/lib/tauri/tauriClient';
import { ProductCompany } from '../types';
import { readScopedMasterData, writeScopedMasterData, getActiveOrganizationId } from './masterDataCacheHelper';

const DOMAIN = 'companies';

const DEFAULT_COMPANIES: ProductCompany[] = [
  { id: '00000000-0000-0000-0000-000000000101', name: 'Official Importer' },
  { id: '00000000-0000-0000-0000-000000000102', name: 'China Direct' },
  { id: '00000000-0000-0000-0000-000000000103', name: 'Local Wholesale' },
  { id: '00000000-0000-0000-0000-000000000104', name: 'Niazi Trading' },
];

function getStoredCompanies(): ProductCompany[] {
  return readScopedMasterData<ProductCompany>(DOMAIN, DEFAULT_COMPANIES);
}

function saveStoredCompanies(list: ProductCompany[]) {
  writeScopedMasterData<ProductCompany>(DOMAIN, list);
}

export const companyService = {
  getCompanies: async (): Promise<ProductCompany[]> => {
    try {
      const list = await httpFetch<any[]>('/api/companies');
      if (list && list.length > 0) {
        const activeOrgId = getActiveOrganizationId();
        const mapped = list.map((c: any) => ({
          id: c.id,
          name: c.name,
          organizationId: c.organization_id || activeOrgId || undefined,
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
    const created = await httpFetch<any>('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const companyObj: ProductCompany = {
      id: created.id,
      name: created.name,
      organizationId: created.organization_id || activeOrgId || undefined,
    };
    const current = getStoredCompanies();
    saveStoredCompanies([...current.filter(c => c.id !== companyObj.id), companyObj]);
    return companyObj;
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    const cleanName = data.name.trim();
    const updated = await httpFetch<any>(`/api/companies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: cleanName }),
    });
    const activeOrgId = getActiveOrganizationId();
    const companyObj: ProductCompany = {
      id: updated.id,
      name: updated.name,
      organizationId: updated.organization_id || activeOrgId || undefined,
    };
    const current = getStoredCompanies();
    saveStoredCompanies(current.map(c => c.id === id ? companyObj : c));
    return companyObj;
  },

  deleteCompany: async (id: string): Promise<void> => {
    const current = getStoredCompanies();
    saveStoredCompanies(current.filter((c) => c.id !== id));
  }
};
