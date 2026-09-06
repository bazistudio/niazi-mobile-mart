import { ProductCompany } from '../types';

export const companyService = {
  getCompanies: async (): Promise<ProductCompany[]> => {
    return [];
  },
  
  createCompany: async (data: { name: string, organizationId?: string }): Promise<ProductCompany> => {
    return {
      id: `company_${Date.now()}`,
      name: data.name,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    return {
      id,
      name: data.name,
      organizationId: '00000000-0000-0000-0000-000000000001'
    };
  },

  deleteCompany: async (_id: string): Promise<void> => {
    return;
  }
};
