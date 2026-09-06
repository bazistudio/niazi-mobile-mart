import React from 'react';
import { useCashStore } from '../store/cash.store';
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';

export const CashMovementsTable: React.FC = () => {
  const { movements, isLoading } = useCashStore();

  if (isLoading && movements.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-neutral-500 font-medium">
        Loading cash drawer movements...
      </div>
    );
  }

  const formatMovementType = (type: string) => {
    switch (type) {
      case 'SALE_PAYMENT':
        return 'Sale Payment (IN)';
      case 'CUSTOMER_PAYMENT':
        return 'Customer Payment (IN)';
      case 'SUPPLIER_PAYMENT':
        return 'Supplier Payment (OUT)';
      case 'EXPENSE':
        return 'Expense (OUT)';
      case 'CASH_ADJUSTMENT':
        return 'Drawer Adjustment';
      default:
        return type;
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
        <History className="w-5 h-5 text-blue-600" />
        <h3 className="text-base font-bold text-neutral-900 dark:text-white">
          Real-Time Cash Drawer Movements
        </h3>
        <span className="text-xs text-neutral-400 ml-auto">Authoritative Append-Only Ledger</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-6 py-3.5 font-semibold">Direction</th>
              <th className="px-6 py-3.5 font-semibold">Movement Type</th>
              <th className="px-6 py-3.5 font-semibold text-right">Amount</th>
              <th className="px-6 py-3.5 font-semibold">Reference</th>
              <th className="px-6 py-3.5 font-semibold">Description</th>
              <th className="px-6 py-3.5 font-semibold">Time</th>
              <th className="px-6 py-3.5 font-semibold">Performed By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {movements.map((m) => {
              const isIn = m.direction === 'IN';
              return (
                <tr
                  key={m.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                        isIn
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                      }`}
                    >
                      {isIn ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      {m.direction}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap font-medium text-neutral-900 dark:text-white">
                    {formatMovementType(m.movement_type)}
                  </td>
                  <td
                    className={`px-6 py-3.5 whitespace-nowrap text-right font-bold tabular-nums ${
                      isIn
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isIn ? '+' : '-'}PKR{' '}
                    {m.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap font-mono text-xs text-blue-600 dark:text-blue-400">
                    {m.reference_number || '—'}
                  </td>
                  <td className="px-6 py-3.5 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                    {m.description || '—'}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-xs text-neutral-500">
                    {m.performed_by || 'System'}
                  </td>
                </tr>
              );
            })}
            {movements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-neutral-400">
                  No cash movements recorded yet in this session.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
