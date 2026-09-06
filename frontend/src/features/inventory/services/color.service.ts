import { ProductColor } from '../types';

export const colorService = {
  getColors: async (): Promise<ProductColor[]> => {
    return [];
  },
  
  createColor: async (data: { name: string, organizationId?: string }): Promise<ProductColor> => {
    return {
      id: `color_${Date.now()}`,
      name: data.name,
      organizationId: data.organizationId || '00000000-0000-0000-0000-000000000001'
    };
  },

  updateColor: async (id: string, data: { name: string }): Promise<ProductColor> => {
    return {
      id,
      name: data.name,
      organizationId: '00000000-0000-0000-0000-000000000001'
    };
  },

  deleteColor: async (_id: string): Promise<void> => {
    return;
  }
};
