import React from 'react';
import { Search, Filter, Calendar } from 'lucide-react';
import { useExpensesStore } from '../store/expenses.store';

export const ExpenseFilters: React.FC = () => {
  const { filters, setFilters } = useExpensesStore();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ category: e.target.value === 'all' ? undefined : e.target.value });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'date-desc') setFilters({ sortBy: 'date', sortOrder: 'desc' });
    if (value === 'date-asc') setFilters({ sortBy: 'date', sortOrder: 'asc' });
    if (value === 'amount-desc') setFilters({ sortBy: 'amount', sortOrder: 'desc' });
    if (value === 'amount-asc') setFilters({ sortBy: 'amount', sortOrder: 'asc' });
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search expenses by title..."
          className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors"
          value={filters.search || ''}
          onChange={handleSearchChange}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <select
            className="pl-10 pr-8 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer"
            onChange={handleCategoryChange}
            value={filters.category || 'all'}
          >
            <option value="all">All Categories</option>
            <option value="rent">Rent</option>
            <option value="salary">Salary</option>
            <option value="utilities">Utilities</option>
            <option value="transport">Transport</option>
            <option value="purchase">Purchase</option>
            <option value="repair">Repair</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <select
            className="pl-10 pr-8 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer"
            onChange={handleSortChange}
            defaultValue="date-desc"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
          </select>
        </div>
      </div>
    </div>
  );
};
