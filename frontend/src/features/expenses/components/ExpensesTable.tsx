import React, { useState } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { Expense } from '../types/expenses.types';
import { Eye, Ban, X, AlertTriangle, Building2, User } from 'lucide-react';
import { ExpenseDetailModal } from './ExpenseDetailModal';

// FEATURE-01: PKT date helper for table display
function formatPKTDate(isoTs: string): string {
  const pktOffsetMs = 5 * 60 * 60 * 1000;
  const pktDate = new Date(new Date(isoTs).getTime() + pktOffsetMs);
  const y = pktDate.getUTCFullYear();
  const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pktDate.getUTCDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

interface ExpensesTableProps {
  isAdminView?: boolean;
}

export const ExpensesTable: React.FC<ExpensesTableProps> = ({ isAdminView = false }) => {
  const { items, isLoading, cancelExpense } = useExpensesStore();
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  // EXP-FIX-06: Cancel reason modal state
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // EXP-FIX-06: Opens cancel reason modal; actual cancel in handleConfirmCancel
  const handleCancel = (id: string) => {
    setCancelTarget(id);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      setIsCancelling(true);
      await cancelExpense(cancelTarget, cancelReason.trim() || undefined);
      if (selectedExpense && selectedExpense.id === cancelTarget) {
        setSelectedExpense(null);
      }
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
      setCancelReason('');
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
                {/* FEATURE-01: ADMIN-only audit columns */}
                {isAdminView && <th className="px-6 py-4 font-semibold">Branch</th>}
                {isAdminView && <th className="px-6 py-4 font-semibold">Created By</th>}
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
                  {/* FEATURE-01: Branch column — ADMIN only */}
                  {isAdminView && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[120px]" title={item.branch_name ?? item.branch_id}>
                          {item.branch_name || item.branch_id || '—'}
                        </span>
                      </div>
                    </td>
                  )}
                  {/* FEATURE-01: Created By column — ADMIN only */}
                  {isAdminView && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                      {item.performed_by_name ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate max-w-[120px] font-medium" title={item.performed_by_name}>
                              {item.performed_by_name}
                            </div>
                            {item.performed_by_role && (
                              <div className="text-xs text-neutral-400">{item.performed_by_role}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">—</span>
                      )}
                    </td>
                  )}
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
                    {/* Show expense business date as PKT; fallback to expense_date */}
                    {formatPKTDate(item.created_at || item.expense_date)}
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
                  <td colSpan={isAdminView ? 10 : 8} className="px-6 py-12 text-center">
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

      {/* EXP-FIX-06: Cancel Reason Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Cancel Expense
              </h3>
              <button
                onClick={() => setCancelTarget(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                This will permanently cancel the expense and issue a compensating cash entry if it was a CASH payment. This action cannot be undone.
              </p>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Reason <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Duplicate entry, wrong amount..."
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-lg transition-colors uppercase tracking-wider"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors uppercase tracking-wider flex items-center gap-1.5"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
