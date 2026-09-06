import { create } from 'zustand';
import { Expense, ExpenseCategory, CreateExpenseDto, ExpenseFilterDto } from '../types/expenses.types';
import { expensesApi } from '@/services/expenses.api';
import toast from 'react-hot-toast';

export interface ExpenseFilterState {
  search?: string;
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

  setGlobalModalOpen: (open: boolean) => void;
  setFilters: (filters: Partial<ExpenseFilterState>) => void;
  fetchCategories: () => Promise<void>;
  fetchExpenses: () => Promise<void>;
  addExpense: (dto: CreateExpenseDto) => Promise<void>;
  cancelExpense: (id: string, reason?: string) => Promise<void>;
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  items: [],
  categories: [],
  isLoading: false,
  isAdding: false,
  isGlobalModalOpen: false,
  filters: { limit: 100, offset: 0 },
  error: null,

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
      const filterDto: ExpenseFilterDto = {
        category_id: filters.category_id || undefined,
        payment_method: filters.payment_method || undefined,
        status: filters.status || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        limit: filters.limit,
        offset: filters.offset,
      };

      let items = await expensesApi.getExpenses(filterDto);

      // In-memory search filter if search term provided
      if (filters.search && filters.search.trim() !== '') {
        const query = filters.search.toLowerCase().trim();
        items = items.filter((exp) =>
          exp.expense_number.toLowerCase().includes(query) ||
          (exp.description && exp.description.toLowerCase().includes(query)) ||
          (exp.notes && exp.notes.toLowerCase().includes(query)) ||
          (exp.category_name && exp.category_name.toLowerCase().includes(query))
        );
      }

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
      set({ isAdding: false });
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
      toast.success('Expense cancelled successfully');
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to cancel expense';
      set({ error: errorMsg, isLoading: false });
      toast.error(errorMsg);
      throw error;
    }
  },
}));
