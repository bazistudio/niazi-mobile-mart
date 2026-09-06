import React from 'react';
import { Search, Filter, Calendar, CreditCard } from 'lucide-react';
import { useExpensesStore } from '../store/expenses.store';

export const ExpenseFilters: React.FC = () => {
  const { filters, categories, setFilters } = useExpensesStore();

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search by expense #, description, category..."
          className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors text-neutral-900 dark:text-white"
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Category filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <select
            className="pl-10 pr-8 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer text-neutral-900 dark:text-white"
            value={filters.category_id || ''}
            onChange={(e) => setFilters({ category_id: e.target.value || undefined })}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Payment Method filter */}
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <select
            className="pl-10 pr-8 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer text-neutral-900 dark:text-white"
            value={filters.payment_method || ''}
            onChange={(e) => setFilters({ payment_method: e.target.value || undefined })}
          >
            <option value="">All Methods</option>
            <option value="CASH">CASH</option>
            <option value="BANK">BANK</option>
            <option value="ONLINE">ONLINE</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer text-neutral-900 dark:text-white"
            value={filters.status || ''}
            onChange={(e) => setFilters({ status: e.target.value || undefined })}
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Start Date */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">From:</span>
          <input
            type="date"
            className="px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 text-neutral-900 dark:text-white"
            value={filters.start_date || ''}
            onChange={(e) => setFilters({ start_date: e.target.value || undefined })}
          />
        </div>

        {/* End Date */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">To:</span>
          <input
            type="date"
            className="px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 text-neutral-900 dark:text-white"
            value={filters.end_date || ''}
            onChange={(e) => setFilters({ end_date: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  );
};
