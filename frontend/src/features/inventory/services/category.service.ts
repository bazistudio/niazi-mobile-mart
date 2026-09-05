import axiosInstance from '@/lib/api/axios';
import { retry } from '@/shared/lib/retry';
import { RETRY_COUNT } from '../constants/inventory.constants';
import { ProductCategory } from '../types';

export const categoryService = {
  getCategories: async (): Promise<ProductCategory[]> => {
    const response = await retry(() => axiosInstance.get('/api/v1/categories'), RETRY_COUNT);
    const dtos = response.data.data || response.data || [];
    return dtos.map((dto: any) => ({
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    }));
  },
  
  createCategory: async (data: { name: string, organizationId?: string }): Promise<ProductCategory> => {
    const response = await axiosInstance.post('/api/v1/categories', data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  updateCategory: async (id: string, data: { name: string }): Promise<ProductCategory> => {
    const response = await axiosInstance.put(`/api/v1/categories/${id}`, data);
    const dto = response.data.data;
    return {
      id: dto.uuid || dto._id,
      name: dto.name,
      organizationId: dto.organizationId
    };
  },

  deleteCategory: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/categories/${id}`);
  }
};
