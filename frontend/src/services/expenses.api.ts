import {
  tauriClient,
  Expense,
  ExpenseCategory,
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
  CreateExpenseDto,
  ExpenseFilterDto,
} from '@/lib/tauri/tauriClient';

export const expensesApi = {
  createCategory: async (dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> => {
    return await tauriClient.expenseCategoryCreate(dto);
  },

  updateCategory: async (id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> => {
    return await tauriClient.expenseCategoryUpdate(id, dto);
  },

  getCategories: async (includeInactive: boolean = false): Promise<ExpenseCategory[]> => {
    return await tauriClient.expenseCategoryList(includeInactive);
  },

  createExpense: async (dto: CreateExpenseDto): Promise<Expense> => {
    return await tauriClient.expenseCreate(dto);
  },

  cancelExpense: async (id: string, reason?: string): Promise<Expense> => {
    return await tauriClient.expenseCancel(id, reason);
  },

  getExpenses: async (filter?: ExpenseFilterDto): Promise<Expense[]> => {
    return await tauriClient.expenseList(filter);
  },

  getExpenseById: async (id: string): Promise<Expense | null> => {
    return await tauriClient.expenseGetById(id);
  },
};
