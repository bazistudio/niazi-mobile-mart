import { ExpenseItem, ExpenseStats } from '../types/expenses.types';

export const expensesApi = {
  getExpenses: async (_filters: { page?: number, limit?: number, sortBy?: string, sortOrder?: string, category?: string, search?: string }): Promise<{ data: ExpenseItem[], total: number, page: number, limit: number }> => {
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 20
    };
  },

  getStats: async (): Promise<ExpenseStats> => {
    return {
      totalExpenses: 0,
      thisMonthExpenses: 0,
      categoryBreakdown: [],
    };
  },

  addExpense: async (expense: Omit<ExpenseItem, 'id'>): Promise<ExpenseItem> => {
    return {
      id: `exp_${Date.now()}`,
      ...expense,
    } as ExpenseItem;
  },

  updateExpense: async (id: string, expense: Partial<ExpenseItem>): Promise<ExpenseItem> => {
    return {
      id,
      ...expense,
    } as ExpenseItem;
  },

  deleteExpense: async (_id: string): Promise<void> => {
    return;
  },

  getTrace: async (_id: string): Promise<any> => {
    return null;
  }
};
