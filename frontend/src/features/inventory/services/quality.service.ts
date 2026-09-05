import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { ProductQuality } from '../types';

export const qualityService = {
  getQualities: async (): Promise<ProductQuality[]> => {
    const response = await retry(() => axiosInstance.get('/api/v1/qualities'), RETRY_COUNT);
    const dtos = response.data.data || response.data || [];
    return dtos.map((dto: any) => ({
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    }));
  },
  
  createQuality: async (data: { name: string, organizationId?: string }): Promise<ProductQuality> => {
    const response = await axiosInstance.post('/api/v1/qualities', data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  updateQuality: async (id: string, data: { name: string }): Promise<ProductQuality> => {
    const response = await axiosInstance.put(`/api/v1/qualities/${id}`, data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  deleteQuality: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/qualities/${id}`);
  }
};
