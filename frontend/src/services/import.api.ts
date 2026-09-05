import axiosInstance from '@/lib/api/axios';

export const importApi = {
  uploadPDF: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axiosInstance.post<{
      success: boolean;
      pages: number;
      rawLines: string[];
      products: any[];
      meta: { parsedCount: number; matchedCount: number };
    }>('/api/v1/import/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  commitImport: async (payload: any) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: {
        supplierId: string;
        totalCost: number;
      };
      message: string;
    }>('/api/v1/import/commit', payload);
    return response.data;
  },

  manualImport: async (payload: any) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: any;
      message: string;
    }>('/api/v1/inventory/manual-import', payload);
    return response.data;
  }
};
