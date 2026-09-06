import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { expensesApi } from '../services/expenses.api';
import { Expense } from '../types/expenses.types';

interface ExpenseLedgerTraceModalProps {
  expenseId: string;
  onClose: () => void;
}

export const ExpenseLedgerTraceModal: React.FC<ExpenseLedgerTraceModalProps> = ({ expenseId, onClose }) => {
  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        setIsLoading(true);
        const data = await expensesApi.getExpenseById(expenseId);
        setExpense(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load expense data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrace();
  }, [expenseId]);

  if (!expenseId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-lg p-6 border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Expense Details
          </h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : expense ? (
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Number:</span> {expense.expense_number}</p>
              <p><span className="font-semibold">Category:</span> {expense.category_name || 'Operational'}</p>
              <p><span className="font-semibold">Amount:</span> PKR {expense.amount.toLocaleString()}</p>
              <p><span className="font-semibold">Payment:</span> {expense.payment_method}</p>
              <p><span className="font-semibold">Status:</span> {expense.status}</p>
              <p><span className="font-semibold">Date:</span> {new Date(expense.expense_date).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No data found</p>
          )}
        </div>
      </div>
    </div>
  );
};
