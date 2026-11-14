import { create } from 'zustand';
import { Expense, ExpenseCategory, CreateExpenseDto, ExpenseFilterDto } from '../types/expenses.types';
import { expensesApi } from '@/services/expenses.api';
import toast from 'react-hot-toast';

export interface ExpenseFilterState {
  search?: string;
  branch_id?: string;
  organization_id?: string;      // FEATURE-01: ADMIN org-wide mode
  created_by_user_id?: string;   // FEATURE-01: filter by creator
  category_id?: string;
  payment_method?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit: number;
  offset: number;
}

interface ExpensesState {
  items: Expense[];
  categories: ExpenseCategory[];
  isLoading: boolean;
  isAdding: boolean;
  filters: ExpenseFilterState;
  isGlobalModalOpen: boolean;
  error: string | null;
  /** DEFECT-03 FIX: Incremented after every successful create/update/cancel mutation.
   * ExpenseStatsCards watches this to trigger a summary re-fetch without polling. */
  mutationRevision: number;

  setGlobalModalOpen: (open: boolean) => void;
  setFilters: (filters: Partial<ExpenseFilterState>) => void;
  fetchCategories: () => Promise<void>;
  fetchExpenses: () => Promise<void>;
  addExpense: (dto: CreateExpenseDto) => Promise<void>;
  cancelExpense: (id: string, reason?: string) => Promise<void>;
  updateExpense: (id: string, dto: import('@/lib/tauri/tauriClient').UpdateExpenseDto) => Promise<void>;
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  items: [],
  categories: [],
  isLoading: false,
  isAdding: false,
  isGlobalModalOpen: false,
  filters: { limit: 100, offset: 0 },
  error: null,
  mutationRevision: 0,

  setGlobalModalOpen: (open) => set({ isGlobalModalOpen: open }),

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters }
    }));
    get().fetchExpenses();
  },

  fetchCategories: async () => {
    try {
      const categories = await expensesApi.getCategories(true);
      set({ categories });
    } catch (err: any) {
      console.error('Failed to fetch expense categories:', err);
    }
  },

  fetchExpenses: async () => {
    try {
      set({ isLoading: true, error: null });
      const { filters } = get();
      // EXP-FIX-07: forward branch_id; EXP-FIX-08: pass search to server (server-side)
      const filterDto: ExpenseFilterDto = {
        branch_id: filters.branch_id || undefined,
        organization_id: filters.organization_id || undefined,   // FEATURE-01
        created_by_user_id: filters.created_by_user_id || undefined, // FEATURE-01
        category_id: filters.category_id || undefined,
        payment_method: filters.payment_method || undefined,
        status: filters.status || undefined,
        search: filters.search?.trim() || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        limit: filters.limit,
        offset: filters.offset,
      };

      const items = await expensesApi.getExpenses(filterDto);
      set({ items, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch expenses', isLoading: false });
    }
  },

  addExpense: async (dto) => {
    try {
      set({ isAdding: true, error: null });
      await expensesApi.createExpense(dto);
      await get().fetchExpenses();
      // DEFECT-03 FIX: increment mutationRevision so stats cards re-fetch
      set((s) => ({ isAdding: false, mutationRevision: s.mutationRevision + 1 }));
      toast.success('Expense recorded successfully');
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to record expense';
      set({ error: errorMsg, isAdding: false });
      toast.error(errorMsg);
      throw error;
    }
  },

  cancelExpense: async (id, reason) => {
    try {
      set({ isLoading: true, error: null });
      await expensesApi.cancelExpense(id, reason);
      await get().fetchExpenses();
      // DEFECT-03 FIX: increment mutationRevision
      set((s) => ({ mutationRevision: s.mutationRevision + 1 }));
      toast.success('Expense cancelled successfully');
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to cancel expense';
      set({ error: errorMsg, isLoading: false });
      toast.error(errorMsg);
      throw error;
    }
  },

  updateExpense: async (id, dto) => {
    try {
      set({ isLoading: true, error: null });
      await expensesApi.updateExpense(id, dto);
      await get().fetchExpenses();
      // DEFECT-03 FIX: increment mutationRevision
      set((s) => ({ mutationRevision: s.mutationRevision + 1 }));
      toast.success('Expense updated successfully');
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to update expense';
      set({ error: errorMsg, isLoading: false });
      toast.error(errorMsg);
      throw error;
    }
  },
}));
