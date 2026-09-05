import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { ProductColor } from '../types';

export const colorService = {
  getColors: async (): Promise<ProductColor[]> => {
    const response = await retry(() => axiosInstance.get('/api/v1/colors'), RETRY_COUNT);
    const dtos = response.data.data || response.data || [];
    return dtos.map((dto: any) => ({
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    }));
  },
  
  createColor: async (data: { name: string, organizationId?: string }): Promise<ProductColor> => {
    const response = await axiosInstance.post('/api/v1/colors', data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    const response = await axiosInstance.put(`/api/v1/colors/${id}`, data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  deleteColor: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/colors/${id}`);
  }
};
