import React from 'react';
import { useHistoryStore } from '../store/history.store';
import { Banknote, FileText, ArrowRightLeft, TrendingUp, AlertCircle } from 'lucide-react';

export const HistoryStatsCards: React.FC = () => {
  const { stats, isStatsLoading } = useHistoryStore();

  if (isStatsLoading || !stats) {
    return <div className="animate-pulse h-24 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>;
  }

  const cards = [
    { title: 'Total Sales', value: `Rs ${stats.totalSales.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100' },
    { title: 'Total Invoices', value: stats.totalInvoices.toString(), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Total Expenses', value: `Rs ${stats.totalExpenses.toLocaleString()}`, icon: ArrowRightLeft, color: 'text-red-600', bg: 'bg-red-100' },
    { title: 'Net Revenue', value: `Rs ${stats.netRevenue.toLocaleString()}`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { title: 'Pending Payments', value: `Rs ${stats.pendingPayments.toLocaleString()}`, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${card.bg} dark:bg-opacity-20`}>
              <Icon className={`w-6 h-6 ${card.color} dark:opacity-80`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.title}</p>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{card.value}</h3>
            </div>
          </div>
        );
      })}
    </div>
  );
};
