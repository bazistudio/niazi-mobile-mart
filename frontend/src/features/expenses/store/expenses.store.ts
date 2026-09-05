import { create } from 'zustand';
import { ExpenseItem, ExpenseStats } from '../types/expenses.types';
import { expensesApi } from '../services/expenses.api';
import toast from 'react-hot-toast';

export type ExpenseFilterState = {
  page: number;
  limit: number;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

interface ExpensesState {
  items: ExpenseItem[];
  total: number;
  stats: ExpenseStats | null;
  isLoading: boolean;
  isAdding: boolean;
  isGlobalModalOpen: boolean;
  filters: ExpenseFilterState;
  error: string | null;

  setGlobalModalOpen: (isOpen: boolean) => void;
  setFilters: (filters: Partial<ExpenseFilterState>) => void;
  fetchExpenses: () => Promise<void>;
  addExpense: (expense: Omit<ExpenseItem, 'id'>) => Promise<void>;
  updateExpense: (id: string, expense: Partial<ExpenseItem>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  items: [],
  total: 0,
  stats: null,
  isLoading: false,
  isAdding: false,
  isGlobalModalOpen: false,
  filters: { page: 1, limit: 50 },
  error: null,

  setGlobalModalOpen: (isOpen) => set({ isGlobalModalOpen: isOpen }),

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters, page: newFilters.page || 1 }
    }));
    get().fetchExpenses();
  },

  fetchExpenses: async () => {
    try {
      set({ isLoading: true, error: null });
      const { filters } = get();
      
      const [expensesResponse, stats] = await Promise.all([
        expensesApi.getExpenses(filters),
        expensesApi.getStats()
      ]);
      set({ items: expensesResponse.data, total: expensesResponse.total, stats, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch expenses', isLoading: false });
    }
  },

  addExpense: async (expense) => {
    try {
      set({ isAdding: true, error: null });
      await expensesApi.addExpense(expense);
      await get().fetchExpenses(); // Refresh list and stats
      set({ isAdding: false });
      toast.success('Expense recorded and posted to ledger');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Operation failed';
      set({ error: errorMsg, isAdding: false });
      toast.error(errorMsg);
      throw error;
    }
  },

  updateExpense: async (id, expense) => {
    try {
      set({ isLoading: true, error: null });
      await expensesApi.updateExpense(id, expense);
      await get().fetchExpenses(); // Refresh to get accurate sorted list and new stats
      toast.success('Expense updated and posted to ledger');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Operation failed';
      set({ error: errorMsg, isLoading: false });
      toast.error(errorMsg);
      throw error;
    }
  },

  deleteExpense: async (id) => {
    try {
      set({ isLoading: true, error: null });
      await expensesApi.deleteExpense(id);
      await get().fetchExpenses(); // Refresh to reflect deletion
      toast.success('Expense deleted and ledger reversed');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Operation failed';
      set({ error: errorMsg, isLoading: false });
      toast.error(errorMsg);
      throw error;
    }
  }
}));
