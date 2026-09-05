import React from 'react';
import { useExpensesStore } from '../store/expenses.store';
import { Wallet, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';

export const ExpenseStatsCards: React.FC = () => {
  const { stats, isLoading } = useExpensesStore();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
        <div className="animate-pulse h-24 bg-gray-200 dark:bg-neutral-800 rounded-xl"></div>
      </div>
    );
  }

  const trendNum = parseFloat(stats.trend);
  const isTrendUp = trendNum > 0;
  
  const cards = [
    { 
      title: 'Total Monthly Expenses', 
      value: `Rs ${stats.totalMonthly.toLocaleString()}`, 
      icon: isTrendUp ? TrendingUp : TrendingDown, 
      color: isTrendUp ? 'text-red-600' : 'text-green-600', 
      bg: isTrendUp ? 'bg-red-100' : 'bg-green-100',
      trendIndicator: `${trendNum > 0 ? '+' : ''}${stats.trend}% vs last month`
    },
    { 
      title: 'Pending Payments', 
      value: `Rs ${stats.pendingAmount.toLocaleString()}`, 
      icon: AlertCircle, 
      color: 'text-orange-600', 
      bg: 'bg-orange-100' 
    },
    { 
      title: 'Highest Category', 
      value: stats.topCategory.charAt(0).toUpperCase() + stats.topCategory.slice(1), 
      subValue: `Rs ${(stats.breakdown[stats.topCategory] || 0).toLocaleString()} (${stats.breakdownPercentages[stats.topCategory] || 0}%)`, 
      icon: Wallet, 
      color: 'text-blue-600', 
      bg: 'bg-blue-100' 
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div key={idx} className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 flex items-center gap-4">
            <div className={`p-4 rounded-xl ${card.bg} dark:bg-opacity-10`}>
              <Icon className={`w-8 h-8 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{card.title}</p>
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white">{card.value}</h3>
              {card.subValue && <p className="text-xs text-neutral-500 mt-1">{card.subValue}</p>}
              {card.trendIndicator && (
                <p className={`text-xs mt-1 font-medium ${isTrendUp ? 'text-red-500' : 'text-green-500'}`}>
                  {card.trendIndicator}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
