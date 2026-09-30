import { HistoryItem, HistoryStats, HistoryFilterParams, LedgerTraceItem } from '../types/history.types';

export const historyApi = {
  getHistory: async (_filters: HistoryFilterParams): Promise<{ data: HistoryItem[], total: number }> => {
    return {
      data: [],
      total: 0,
    };
  },

  getStats: async (): Promise<HistoryStats> => {
    try {
      const summary = await import('@/lib/tauri/tauriClient').then(m => m.tauriClient.profitGetDashboardSummary());
      return {
        totalSales: summary.total.net_revenue,
        totalInvoices: summary.total.orders_count,
        totalExpenses: 0,
        netRevenue: summary.total.gross_profit,
        pendingPayments: 0,
      };
    } catch (e) {
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
  }
};
