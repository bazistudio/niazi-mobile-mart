import axiosInstance from '@/lib/api/axios';
import { DBSupplier } from '@/types/db.types'; // Assuming this exists or we use any for now

export const supplierApi = {
  getSuppliers: async (page = 1, limit = 100) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>(`/api/v1/suppliers?page=${page}&limit=${limit}`);
    
    return {
      ...response.data,
      data: response.data.data.map(s => ({
        ...s,
        id: s._id || s.id,
      }))
    };
  },

  searchSuppliers: async (keyword: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
    }>(`/api/v1/suppliers/search?keyword=${keyword}`);
    
    return {
      ...response.data,
      data: response.data.data.map(s => ({
        ...s,
        id: s._id || s.id,
      }))
    };
  },

  addSupplier: async (supplierData: any) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: any;
      message: string;
    }>('/api/v1/suppliers', supplierData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      }
    };
  },

  updateSupplier: async (id: string, supplierData: any) => {
    const response = await axiosInstance.patch<{
      success: boolean;
      data: any;
      message: string;
    }>(`/api/v1/suppliers/${id}`, supplierData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      }
    };
  },

  deleteSupplier: async (id: string) => {
    const response = await axiosInstance.delete<{
      success: boolean;
      message: string;
    }>(`/api/v1/suppliers/${id}`);
    return response.data;
  },

  getSupplierDetail: async (id: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: {
        supplier: any;
        stats: {
          totalPurchases: number;
          payable: number;
          purchaseCount: number;
          lastTransactionDate: string | null;
          recentPurchases: any[];
        }
      };
    }>(`/api/v1/suppliers/${id}/detail`);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        supplier: {
          ...response.data.data.supplier,
          id: response.data.data.supplier._id || response.data.data.supplier.id,
        }
      }
    };
  }
};
