import {
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  CreateExpenseDto,
  ExpenseFilterDto,
} from '@/lib/tauri/tauriClient';

export type { Expense, ExpenseCategory, ExpenseStatus, CreateExpenseDto, ExpenseFilterDto };

// Backward compatibility alias for UI
export type ExpenseItem = Expense;

export interface ExpenseStats {
  totalMonthly: number;
  totalExpenses: number;
  activeCount: number;
  cancelledCount: number;
  categoryBreakdown: { name: string; amount: number }[];
}
