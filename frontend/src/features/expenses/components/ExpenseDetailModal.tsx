import React from 'react';
import { Expense } from '../types/expenses.types';
import { X, Calendar, Hash, Tag, CreditCard, User, FileText, Ban } from 'lucide-react';

interface Props {
  expense: Expense | null;
  onClose: () => void;
  onCancel: (id: string) => void;
}

export const ExpenseDetailModal: React.FC<Props> = ({ expense, onClose, onCancel }) => {
  if (!expense) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Hash className="w-5 h-5 text-blue-600" />
              {expense.expense_number}
            </h2>
            <p className="text-xs text-neutral-400">Expense Details</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Total Amount</span>
              <div className="text-2xl font-black text-neutral-900 dark:text-white">
                PKR {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                expense.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
              }`}
            >
              {expense.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" /> Category
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.category_name || 'Operational Expense'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> Payment Method
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.payment_method}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Date
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {new Date(expense.expense_date).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Performed By
              </span>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {expense.performed_by || 'System / Admin'}
              </p>
            </div>
          </div>

          {expense.description && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-sm">
              <span className="text-xs font-semibold text-neutral-500 block mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Description
              </span>
              <p className="text-neutral-800 dark:text-neutral-200">{expense.description}</p>
            </div>
          )}

          {expense.notes && (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-sm">
              <span className="text-xs font-semibold text-neutral-500 block mb-1">Notes</span>
              <p className="text-neutral-600 dark:text-neutral-400">{expense.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
            {expense.status === 'COMPLETED' ? (
              <button
                type="button"
                onClick={() => onCancel(expense.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
              >
                <Ban className="w-4 h-4" /> Cancel Expense
              </button>
            ) : (
              <span className="text-xs text-neutral-400 italic">Expense is already cancelled</span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
