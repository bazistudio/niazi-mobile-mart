import { HistoryItem, HistoryStats, HistoryFilterParams, LedgerTraceItem } from '../types/history.types';

export const historyApi = {
  getHistory: async (_filters: HistoryFilterParams): Promise<{ data: HistoryItem[], total: number }> => {
    return {
      data: [],
      total: 0,
    };
  },

  getStats: async (): Promise<HistoryStats> => {
    return {
      totalTransactions: 0,
      totalSales: 0,
      totalReturns: 0,
      totalVoids: 0,
    };
  },

  getLedgerTrace: async (_id: string): Promise<LedgerTraceItem[]> => {
    return [];
  }
};
