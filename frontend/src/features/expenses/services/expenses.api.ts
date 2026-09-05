import axiosInstance from '@/lib/api/axios';
import { ExpenseItem, ExpenseStats } from '../types/expenses.types';

export const expensesApi = {
  getExpenses: async (filters: { page?: number, limit?: number, sortBy?: string, sortOrder?: string, category?: string, search?: string }): Promise<{ data: ExpenseItem[], total: number, page: number, limit: number }> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters.category) params.append('category', filters.category);
    if (filters.search) params.append('search', filters.search);

    const response = await axiosInstance.get<{
      data: any[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/v1/expenses?${params.toString()}`);
    return {
      data: response.data.data.map(exp => ({
        ...exp,
        id: exp._id || exp.id,
      })) as ExpenseItem[],
      total: response.data.total,
      page: response.data.page,
      limit: response.data.limit
    };
  },

  getStats: async (): Promise<ExpenseStats> => {
    const response = await axiosInstance.get<ExpenseStats>('/api/v1/expenses/stats');
    return response.data;
  },

  addExpense: async (expense: Omit<ExpenseItem, 'id'>): Promise<ExpenseItem> => {
    const response = await axiosInstance.post<any>('/api/v1/expenses', expense);
    return {
      ...response.data,
      id: response.data._id || response.data.id,
    } as ExpenseItem;
  },

  updateExpense: async (id: string, expense: Partial<ExpenseItem>): Promise<ExpenseItem> => {
    const response = await axiosInstance.put<any>(`/api/v1/expenses/${id}`, expense);
    return {
      ...response.data,
      id: response.data._id || response.data.id,
    } as ExpenseItem;
  },

  deleteExpense: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/v1/expenses/${id}`);
  },

  getTrace: async (id: string): Promise<any> => {
    const response = await axiosInstance.get<any>(`/api/v1/expenses/${id}/trace`);
    return response.data;
  }
};
