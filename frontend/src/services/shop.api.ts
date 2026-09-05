import axiosInstance from '@/lib/api/axios';

export interface ShopData {
  _id: string;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  cashBalance: number;
  status: string;
  planId: any;
}

export const shopApi = {
  getMyShop: async () => {
    const response = await axiosInstance.get<{ success: boolean; data: ShopData; message: string }>('/api/v1/shops/me');
    return response.data;
  },
  getAllShops: async (params?: { status?: string }) => {
    const response = await axiosInstance.get<{ success: boolean; data: ShopData[]; message: string }>('/api/v1/shops', { params });
    return response.data;
  },
  getShopById: async (shopId: string) => {
    const response = await axiosInstance.get<{ success: boolean; data: ShopData; message: string }>(`/api/v1/shops/${shopId}`);
    return response.data;
  },
  createShop: async (payload: Partial<ShopData>) => {
    const response = await axiosInstance.post<{ success: boolean; data: ShopData; message: string }>('/api/v1/shops', payload);
    return response.data;
  },
  updateShop: async (shopId: string, payload: Partial<ShopData>) => {
    const response = await axiosInstance.patch<{ success: boolean; data: ShopData; message: string }>(`/api/v1/shops/${shopId}`, payload);
    return response.data;
  },
  toggleShopStatus: async (shopId: string, status: 'active' | 'suspended' | 'inactive') => {
    const response = await axiosInstance.patch<{ success: boolean; data: ShopData; message: string }>(`/api/v1/shops/${shopId}/status`, { status });
    return response.data;
  },
  deleteShop: async (shopId: string) => {
    const response = await axiosInstance.delete<{ success: boolean; message: string }>(`/api/v1/shops/${shopId}`);
    return response.data;
  }
};

