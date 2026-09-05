import { HistoryItem, HistoryStats, HistoryFilterParams, LedgerTraceItem } from '../types/history.types';
import axiosInstance from '@/lib/api/axios';

export const historyApi = {
  getHistory: async (filters: HistoryFilterParams): Promise<{ data: HistoryItem[], total: number }> => {
    const { data } = await axiosInstance.get('/api/v1/history', { params: filters });
    return data;
  },

  getStats: async (): Promise<HistoryStats> => {
    const { data } = await axiosInstance.get('/api/v1/history/stats');
    return data;
  },

  getLedgerTrace: async (id: string): Promise<LedgerTraceItem[]> => {
    const { data } = await axiosInstance.get(`/api/v1/history/trace/${id}`);
    return data;
  }
};
