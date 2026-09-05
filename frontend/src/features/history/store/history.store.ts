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
  fetchStats: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  total: 0,
  stats: null,
  isLoading: false,
  isStatsLoading: false,
  filters: {
    page: 1,
    limit: 10,
  },
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
      const { data, total } = await historyApi.getHistory(get().filters);
      set({ items: data, total, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch history', isLoading: false });
    }
  },

  fetchStats: async () => {
    try {
      set({ isStatsLoading: true, error: null });
      const stats = await historyApi.getStats();
      set({ stats, isStatsLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch stats', isStatsLoading: false });
    }
  }
}));
