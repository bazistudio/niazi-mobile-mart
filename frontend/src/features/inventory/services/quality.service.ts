import { ProductQuality } from '../types';

export const qualityService = {
  getQualities: async (): Promise<ProductQuality[]> => {
    return [];
  },
  
  createQuality: async (data: { name: string, organizationId?: string }): Promise<ProductQuality> => {
    return {
      id: `quality_${Date.now()}`,
      name: data.name,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
  },

  updateQuality: async (id: string, data: { name: string }): Promise<ProductQuality> => {
    return {
      id,
      name: data.name,
      organizationId: '00000000-0000-0000-0000-000000000001'
    };
  },

  deleteQuality: async (_id: string): Promise<void> => {
    return;
  }
};
