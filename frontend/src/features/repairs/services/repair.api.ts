import axiosInstance from '@/lib/api/axios';
import { RepairJob } from '../types/repair.types';

export const repairApi = {
  getRepairJobs: async (filters: any = {}): Promise<{ data: RepairJob[], total: number, page: number, limit: number }> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.search) params.append('search', filters.search);
    if (filters.customerId) params.append('customerId', filters.customerId);

    const response = await axiosInstance.get(`/api/v1/repairs?${params.toString()}`);
    return {
      data: response.data.data.map((job: any) => ({
        ...job,
        id: job._id || job.id
      })) as RepairJob[],
      total: response.data.pagination.total,
      page: response.data.pagination.page,
      limit: response.data.pagination.limit
    };
  },

  getRepairJobById: async (id: string): Promise<RepairJob> => {
    const response = await axiosInstance.get(`/api/v1/repairs/${id}`);
    const job = response.data.data;
    return {
      ...job,
      id: job._id || job.id
    } as RepairJob;
  },

  createRepairJob: async (jobData: any): Promise<RepairJob> => {
    const response = await axiosInstance.post(`/api/v1/repairs`, jobData);
    const job = response.data.data;
    return {
      ...job,
      id: job._id || job.id
    } as RepairJob;
  },

  updateStatus: async (id: string, status: string, note?: string): Promise<RepairJob> => {
    const response = await axiosInstance.patch(`/api/v1/repairs/${id}/status`, { status, note });
    const job = response.data.data;
    return {
      ...job,
      id: job._id || job.id
    } as RepairJob;
  },

  addPart: async (id: string, partData: { productId: string, qty: number, cost: number, price: number }): Promise<RepairJob> => {
    const response = await axiosInstance.post(`/api/v1/repairs/${id}/parts`, partData);
    const job = response.data.data;
    return {
      ...job,
      id: job._id || job.id
    } as RepairJob;
  },

  addPayment: async (id: string, paymentData: { amount: number, method: string }): Promise<RepairJob> => {
    const response = await axiosInstance.post(`/api/v1/repairs/${id}/payments`, paymentData);
    const job = response.data.data;
    return {
      ...job,
      id: job._id || job.id
    } as RepairJob;
  }
};
