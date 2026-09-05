import axiosInstance from '@/lib/api/axios';
import { DBTransaction } from '@/types/db.types';

export interface CreateOrderPayload {
  items: {
    productId: string;
    quantity: number;
    price: number;
  }[];
  customerId?: string;
  paymentMethod: string;
  transactionType?: string;
  taxRate?: number;
  discount?: number;
  idempotencyKey?: string;
}

export const salesApi = {
  createOrder: async (payload: CreateOrderPayload) => {
    const { idempotencyKey, ...data } = payload;
    const response = await axiosInstance.post<{
      success: boolean;
      order: any;
      message: string;
    }>('/api/v1/orders', data, {
      headers: idempotencyKey ? {
        'idempotency-key': idempotencyKey
      } : {}
    });
    return response.data;
  },

  getOrders: async (params?: { startDate?: string; endDate?: string; limit?: number; orderNumber?: string }) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
    }>('/api/v1/orders', { params });
    return response.data;
  },

  updateOrderStatus: async (orderId: string, status: string) => {
    const response = await axiosInstance.patch<{
      success: boolean;
      message: string;
      order?: any;
    }>(`/api/v1/orders/${orderId}/status`, { status });
    return response.data;
  },

  cancelOrder: async (orderId: string) => {
    const response = await axiosInstance.patch<{
      success: boolean;
      message: string;
    }>(`/api/v1/orders/${orderId}/status`, { status: 'cancelled' });
    return response.data;
  }
};
