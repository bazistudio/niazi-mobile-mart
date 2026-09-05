export type ExpenseCategory = "rent" | "salary" | "utilities" | "transport" | "purchase" | "repair" | "other";

export type ExpenseItem = {
  id: string;
  date: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: "cash" | "bank" | "online";
  ledgerEntryId?: string;
  status: "paid" | "pending" | "deleted";
  note?: string;
};

export type ExpenseStats = {
  totalMonthly: number;
  prevMonthlyExpenses: number;
  trend: string;
  pendingAmount: number;
  breakdown: Record<ExpenseCategory, number>;
  breakdownPercentages: Record<ExpenseCategory, string>;
  totalExpenses: number;
  topCategory: ExpenseCategory;
};
