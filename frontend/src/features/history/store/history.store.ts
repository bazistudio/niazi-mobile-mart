import { create } from 'zustand';
import { HistoryItem, HistoryStats, HistoryFilterParams } from '../types/history.types';
import { historyApi } from '../services/history.api';

interface HistoryState {
  items: HistoryItem[];
  total: number;
  stats: HistoryStats | null;
  isLoading: boolean;
  isStatsLoading: boolean;
  filters: HistoryFilterParams;
  error: string | null;

  setFilters: (filters: Partial<HistoryFilterParams>) => void;
  fetchHistory: () => Promise<void>;
  /** Pass the active branch UUID, or null/undefined for org-wide stats. */
  fetchStats: (branchId?: string | null) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  total: 0,
  stats: null,
  isLoading: false,
  isStatsLoading: false,
  filters: (() => {
    // Pre-seed today's UTC bounds so the very first fetch is already date-scoped.
    // This avoids a race where HistoryPage and HistoryFilters both call setFilters
    // on mount and the first fetch returns unfiltered (all-time) data.
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      page: 1,
      limit: 10,
      startDate: startOfDay.toISOString(),
      endDate:   endOfDay.toISOString(),
    };
  })(),
  error: null,

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters, page: newFilters.page || 1 }
    }));
    get().fetchHistory();
  },

  fetchHistory: async () => {
    try {
      set({ isLoading: true, error: null });
      // filters.branch_id is included when set; the API layer forwards it as a query param.
      const { data, total } = await historyApi.getHistory(get().filters);
      set({ items: data, total, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch history', isLoading: false });
    }
  },

  fetchStats: async (branchId?: string | null) => {
    try {
      set({ isStatsLoading: true, error: null });
      const stats = await historyApi.getStats(branchId);
      set({ stats, isStatsLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch stats', isStatsLoading: false });
    }
  }
}));
