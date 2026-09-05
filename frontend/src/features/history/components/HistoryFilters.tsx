import React from 'react';
import { useHistoryStore } from '../store/history.store';
import { Search, Filter } from 'lucide-react';

export const HistoryFilters: React.FC = () => {
  const { filters, setFilters } = useHistoryStore();

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 items-center justify-between">
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoice, customer..."
            className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-[#006970] focus:border-transparent outline-none w-64"
            value={filters.search || ''}
            onChange={(e) => setFilters({ search: e.target.value })}
          />
        </div>

        <select
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-[#006970] outline-none"
          value={filters.type || ''}
          onChange={(e) => setFilters({ type: e.target.value })}
        >
          <option value="">All Types</option>
          <option value="sale">Sale Invoice</option>
          <option value="purchase">Purchase Invoice</option>
          <option value="payment">Payment</option>
          <option value="expense">Expense</option>
          <option value="import">Import</option>
        </select>

        <select
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-[#006970] outline-none"
          value={filters.status || ''}
          onChange={(e) => setFilters({ status: e.target.value })}
        >
          <option value="">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
        <Filter className="w-4 h-4" />
        Advanced Filters
      </button>
    </div>
  );
};
