import React from 'react';
import { useCashStore } from '../store/cash.store';
import { Calendar, CheckCircle, Clock } from 'lucide-react';

export const CashSessionHistoryTable: React.FC = () => {
  const { historySessions, isLoading } = useCashStore();

  if (isLoading && historySessions.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-neutral-500 font-medium">
        Loading session history...
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-blue-600" />
        <h3 className="text-base font-bold text-neutral-900 dark:text-white">
          Session History & Past Reconciliations
        </h3>
        <span className="text-xs text-neutral-400 ml-auto">Authoritative Daily Closings</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-6 py-3.5 font-semibold">Business Date</th>
              <th className="px-6 py-3.5 font-semibold text-right">Opening</th>
              <th className="px-6 py-3.5 font-semibold text-right">Expected</th>
              <th className="px-6 py-3.5 font-semibold text-right">Actual Count</th>
              <th className="px-6 py-3.5 font-semibold text-right">Variance</th>
              <th className="px-6 py-3.5 font-semibold text-center">Status</th>
              <th className="px-6 py-3.5 font-semibold">Opened At</th>
              <th className="px-6 py-3.5 font-semibold">Closed At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {historySessions.map((s) => {
              const variance = s.cash_variance ?? 0;
              const isClosed = s.status === 'CLOSED';

              return (
                <tr
                  key={s.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-6 py-3.5 whitespace-nowrap font-medium text-neutral-900 dark:text-white">
                    {s.business_date}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                    PKR {s.opening_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-neutral-900 dark:text-white">
                    {s.expected_closing_cash !== null
                      ? `PKR ${s.expected_closing_cash.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}`
                      : '—'}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right tabular-nums font-semibold text-neutral-900 dark:text-white">
                    {s.actual_closing_cash !== null
                      ? `PKR ${s.actual_closing_cash.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}`
                      : '—'}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right tabular-nums font-bold">
                    {s.cash_variance !== null ? (
                      <span
                        className={
                          variance === 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : variance > 0
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {variance > 0 ? '+' : ''}
                        PKR {variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isClosed
                          ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-xs text-neutral-500">
                    {new Date(s.opened_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-xs text-neutral-500">
                    {s.closed_at
                      ? new Date(s.closed_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {historySessions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-neutral-400">
                  No past sessions recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
