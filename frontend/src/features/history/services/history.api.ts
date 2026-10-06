import { HistoryItem, HistoryStats, HistoryFilterParams, LedgerTraceItem } from '../types/history.types';
import { httpFetch } from '@/lib/tauri/tauriClient';

export const historyApi = {
  getHistory: async (filters?: HistoryFilterParams): Promise<{ data: HistoryItem[]; total: number }> => {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.type) params.set('type', filters.type);
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);
      if (filters?.search) params.set('search', filters.search);

      const qs = params.toString();
      return await httpFetch<{ data: HistoryItem[]; total: number }>(`/api/history${qs ? '?' + qs : ''}`);
    } catch (err) {
      console.error('Failed to fetch financial history:', err);
      return { data: [], total: 0 };
    }
  },

  getStats: async (): Promise<HistoryStats> => {
    try {
      const stats = await httpFetch<any>('/api/history/stats');
      return {
        totalSales: Number(stats?.totalSales ?? 0),
        totalInvoices: Number(stats?.totalInvoices ?? 0),
        totalExpenses: Number(stats?.totalExpenses ?? 0),
        netRevenue: Number(stats?.netRevenue ?? 0),
        pendingPayments: Number(stats?.pendingPayments ?? 0),
      };
    } catch (err) {
      console.error('Failed to fetch history stats:', err);
      return {
        totalSales: 0,
        totalInvoices: 0,
        totalExpenses: 0,
        netRevenue: 0,
        pendingPayments: 0,
      };
    }
  },

  getLedgerTrace: async (_id: string): Promise<LedgerTraceItem[]> => {
    return [];
  },
};
