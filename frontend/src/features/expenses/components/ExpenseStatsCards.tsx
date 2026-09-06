import React, { useMemo } from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { Wallet, Tag, CheckCircle2, Ban } from 'lucide-react';

export const ExpenseStatsCards: React.FC = () => {
  const { items, isLoading } = useExpensesStore();

  const stats = useMemo(() => {
    let totalCompleted = 0;
    let cashExpenses = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    const categoryTotals: Record<string, number> = {};

    items.forEach((exp) => {
      if (exp.status === 'COMPLETED') {
        totalCompleted += exp.amount;
        completedCount++;
        if (exp.payment_method === 'CASH') {
          cashExpenses += exp.amount;
        }
        const cat = exp.category_name || 'Operational';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.amount;
      } else {
        cancelledCount++;
      }
    });

    let topCategory = '—';
    let topCategoryAmount = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > topCategoryAmount) {
        topCategoryAmount = amt;
        topCategory = cat;
      }
    });

    return {
      totalCompleted,
      cashExpenses,
      completedCount,
      cancelledCount,
      topCategory,
      topCategoryAmount,
    };
  }, [items]);

  if (isLoading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Expenses',
      value: `PKR ${stats.totalCompleted.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      subValue: `${stats.completedCount} active records`,
      icon: Wallet,
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Physical Cash Expenses',
      value: `PKR ${stats.cashExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      subValue: 'Deducted from cash drawer',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      title: 'Top Category',
      value: stats.topCategory,
      subValue:
        stats.topCategoryAmount > 0
          ? `PKR ${stats.topCategoryAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : 'No data',
      icon: Tag,
      color: 'text-purple-600',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Cancelled Expenses',
      value: `${stats.cancelledCount}`,
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
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {card.title}
              </p>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mt-0.5">
                {card.value}
              </h3>
              <p className="text-xs text-neutral-400 mt-1">{card.subValue}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
