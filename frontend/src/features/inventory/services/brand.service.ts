import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { ProductBrand } from '../types';

export const brandService = {
  getBrands: async (): Promise<ProductBrand[]> => {
    const response = await retry(() => axiosInstance.get('/api/v1/brands'), RETRY_COUNT);
    const dtos = response.data.data || response.data || [];
    return dtos.map((dto: any) => ({
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    }));
  },
  
  createBrand: async (data: { name: string, organizationId?: string }): Promise<ProductBrand> => {
    const response = await axiosInstance.post('/api/v1/brands', data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  updateBrand: async (id: string, data: { name: string }): Promise<ProductBrand> => {
    const response = await axiosInstance.put(`/api/v1/brands/${id}`, data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  deleteBrand: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/brands/${id}`);
  }
};
