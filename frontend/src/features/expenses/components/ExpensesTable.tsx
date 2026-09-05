import React, { useState } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { FileText, MoreHorizontal, Activity, Trash2, Edit, Download, Printer } from 'lucide-react';
import { ExpenseLedgerTraceModal } from './ExpenseLedgerTraceModal';
import { CashFlowSummaryCard } from './CashFlowSummaryCard';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';

export const ExpensesTable: React.FC = () => {
  const { items, total, filters, setFilters, deleteExpense, isLoading } = useExpensesStore();
  const { openPreview } = usePrintStore();
  const { settings, shopHeader } = usePrinterStore();
  const [traceExpenseId, setTraceExpenseId] = useState<string | null>(null);

  const handlePrint = (expense: any) => {
    if (!settings || !shopHeader) return;
    const html = printFormatter.formatExpenseVoucher(expense, settings, shopHeader);
    openPreview({ html, documentType: 'ExpenseVoucher', referenceId: expense.id, title: `Expense Voucher - ${expense.title}` });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'rent': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400';
      case 'utilities': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400';
      case 'salary': return 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400';
      case 'purchase': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
      case 'repair': return ' text-red-700 dark:/10 dark:text-red-400';
      case 'transport': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400';
      default: return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ page: newPage });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this expense? This will create a ledger reversal.')) {
      await deleteExpense(id);
    }
  };

  if (isLoading && items.length === 0) {
    return <div className="h-64 flex items-center justify-center text-neutral-500 font-medium">Loading expenses...</div>;
  }

  const totalPages = Math.ceil(total / filters.limit);

  return (
    <>
      <CashFlowSummaryCard />
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-visible">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Title</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-center">Payment</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                    {new Date(item.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-neutral-900 dark:text-white">{item.title}</div>
                    {item.note && <div className="text-xs text-neutral-500">{item.note}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getCategoryColor(item.category)}`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-neutral-900 dark:text-white">
                    Rs {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2.5 py-1 border rounded-full text-xs font-semibold uppercase tracking-wider ${
                      item.status === 'paid' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                        : 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">{item.paymentMethod}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right relative">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setTraceExpenseId(item.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded tooltip-trigger"
                        title="Ledger Trace"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handlePrint(item)}
                        className="p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded tooltip-trigger"
                        title="Print Voucher"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded tooltip-trigger"
                        title="View Details"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-red-600 hover: dark:hover:/10 rounded tooltip-trigger"
                        title="Delete (Reverse)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-neutral-500 dark:text-neutral-400 mb-2 font-medium">No expenses recorded yet.</p>
                      <p className="text-sm text-neutral-400 dark:text-neutral-500">Click "Add Expense" to create your first expense.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Showing {(filters.page - 1) * filters.limit + 1} to {Math.min(filters.page * filters.limit, total)} of {total} expenses
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => handlePageChange(filters.page - 1)}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-white"
              >
                Previous
              </button>
              <button 
                onClick={() => handlePageChange(filters.page + 1)}
                disabled={filters.page === totalPages}
                className="px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {traceExpenseId && (
        <ExpenseLedgerTraceModal 
          expenseId={traceExpenseId} 
          onClose={() => setTraceExpenseId(null)} 
        />
      )}
    </>
  );
};
