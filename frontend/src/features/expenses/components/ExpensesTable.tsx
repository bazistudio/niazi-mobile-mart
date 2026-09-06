import React, { useState } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { Expense } from '../types/expenses.types';
import { Eye, Ban } from 'lucide-react';
import { ExpenseDetailModal } from './ExpenseDetailModal';

export const ExpensesTable: React.FC = () => {
  const { items, isLoading, cancelExpense } = useExpensesStore();
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const handleCancel = async (id: string) => {
    const reason = window.prompt('Enter reason for cancelling this expense:');
    if (reason === null) return; // User pressed cancel in prompt
    await cancelExpense(id, reason.trim() || undefined);
    if (selectedExpense && selectedExpense.id === id) {
      setSelectedExpense(null);
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-500 font-medium">
        Loading expenses...
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Expense #</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold">Description</th>
                <th className="px-6 py-4 font-semibold text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-center">Payment Method</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap font-mono font-medium text-blue-600 dark:text-blue-400">
                    {item.expense_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-neutral-900 dark:text-white">
                    {item.category_name || 'Operational'}
                  </td>
                  <td className="px-6 py-4 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                    {item.description || item.notes || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-neutral-900 dark:text-white">
                    PKR {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                        item.payment_method === 'CASH'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {item.payment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                    {new Date(item.expense_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2.5 py-1 border rounded-full text-xs font-semibold uppercase tracking-wider ${
                        item.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end items-center gap-2">
                      <button
                        onClick={() => setSelectedExpense(item)}
                        className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {item.status === 'COMPLETED' && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                          title="Cancel Expense"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-neutral-500 dark:text-neutral-400 mb-2 font-medium">
                        No expenses found.
                      </p>
                      <p className="text-sm text-neutral-400 dark:text-neutral-500">
                        Click "Add Expense" to record shop operational expenses.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseDetailModal
        expense={selectedExpense}
        onClose={() => setSelectedExpense(null)}
        onCancel={handleCancel}
      />
    </>
  );
};
