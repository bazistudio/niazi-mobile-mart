import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { ProductCompany } from '../types';

export const companyService = {
  getCompanies: async (): Promise<ProductCompany[]> => {
    const response = await retry(() => axiosInstance.get('/api/v1/companies'), RETRY_COUNT);
    const dtos = response.data.data || response.data || [];
    return dtos.map((dto: any) => ({
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    }));
  },
  
  createCompany: async (data: { name: string, organizationId?: string }): Promise<ProductCompany> => {
    const response = await axiosInstance.post('/api/v1/companies', data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  updateCompany: async (id: string, data: { name: string }): Promise<ProductCompany> => {
    const response = await axiosInstance.put(`/api/v1/companies/${id}`, data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  deleteCompany: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/companies/${id}`);
  }
};
