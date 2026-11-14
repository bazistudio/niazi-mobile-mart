import React, { useEffect, useState } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { expensesApi } from '../services/expenses.api';
import { ExpenseSummary } from '@/lib/tauri/tauriClient';
import { Wallet, Tag, CheckCircle2, Ban, Loader2 } from 'lucide-react';

export const ExpenseStatsCards: React.FC = () => {
  const { isLoading, filters, mutationRevision } = useExpensesStore();
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // EXP-M02: Wire to authoritative summary API instead of in-memory aggregation
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsFetching(true);
        const data = await expensesApi.getExpenseSummary({
          branch_id: filters.branch_id,
          category_id: filters.category_id,
          start_date: filters.start_date,
          end_date: filters.end_date,
        });
        setSummary(data);
      } catch {
        // silent — summary is non-critical; keep prior data
      } finally {
        setIsFetching(false);
      }
    };
    fetchSummary();
  // DEFECT-03 FIX: mutationRevision increments after every create/update/cancel,
  // forcing a re-fetch of the summary even when filter values are unchanged.
  }, [filters.branch_id, filters.category_id, filters.start_date, filters.end_date, mutationRevision]);

  if ((isLoading || isFetching) && !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl" />
        ))}
      </div>
    );
  }

  const topMethod = summary?.by_payment_method?.reduce(
    (best, cur) => (!best || cur.total_amount > best.total_amount ? cur : best),
    null as ExpenseSummary['by_payment_method'][number] | null
  );

  const cards = [
    {
      title: 'Total Expenses',
      value: `PKR ${(summary?.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      subValue: `${summary?.total_count ?? 0} active records`,
      icon: Wallet,
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Physical Cash Expenses',
      value: `PKR ${(summary?.cash_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      subValue: 'Deducted from cash drawer',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      title: 'Top Payment Channel',
      value: topMethod?.payment_method ?? '—',
      subValue:
        topMethod
          ? `PKR ${topMethod.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : 'No data',
      icon: Tag,
      color: 'text-purple-600',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Cancelled Expenses',
      value: `${summary?.cancelled_count ?? 0}`,
      subValue: 'Immutable reversals',
      icon: Ban,
      color: 'text-neutral-500',
      bg: 'bg-neutral-100 dark:bg-neutral-800',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-white dark:bg-neutral-900 p-5 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 flex items-center gap-4"
          >
            <div className={`p-3.5 rounded-xl ${card.bg}`}>
              <Icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 truncate">
                {card.title}
              </p>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mt-0.5 truncate">
                {card.value}
              </h3>
              <p className="text-xs text-neutral-400 mt-1 truncate">{card.subValue}</p>
            </div>
            {isFetching && (
              <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
};
