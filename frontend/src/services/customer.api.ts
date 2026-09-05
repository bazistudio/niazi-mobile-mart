import axiosInstance from '@/lib/api/axios';
import { DBCustomer } from '@/types/db.types';

export const customerApi = {
  getCustomers: async (page = 1, limit = 100) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>(`/api/v1/customers?page=${page}&limit=${limit}`);
    
    return {
      ...response.data,
      data: response.data.data.map(c => ({
        ...c,
        id: c._id || c.id,
      })) as DBCustomer[]
    };
  },

  searchCustomers: async (keyword: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
    }>(`/api/v1/customers/search?keyword=${keyword}`);
    
    return {
      ...response.data,
      data: response.data.data.map(c => ({
        ...c,
        id: c._id || c.id,
      })) as DBCustomer[]
    };
  },

  addCustomer: async (customerData: Partial<DBCustomer>) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: any;
      message: string;
    }>('/api/v1/customers', customerData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      } as DBCustomer
    };
  },

  updateCustomer: async (id: string, customerData: Partial<DBCustomer>) => {
    const response = await axiosInstance.put<{
      success: boolean;
      data: any;
      message: string;
    }>(`/api/v1/customers/${id}`, customerData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      } as DBCustomer
    };
  },

  deleteCustomer: async (id: string) => {
    const response = await axiosInstance.delete<{
      success: boolean;
      message: string;
    }>(`/api/v1/customers/${id}`);
    return response.data;
  },

  getCustomerDetail: async (id: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: {
        customer: DBCustomer;
        stats: {
          totalSales: number;
          outstanding: number;
          invoiceCount: number;
          lastTransactionDate: string | null;
          recentInvoices: any[];
        }
      };
    }>(`/api/v1/customers/${id}/detail`);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        customer: {
          ...response.data.data.customer,
          id: (response.data.data.customer as any)._id || response.data.data.customer.id,
        }
      }
    };
  }
};
