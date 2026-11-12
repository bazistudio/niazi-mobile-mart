import React, { useState, useRef, useCallback } from 'react';
import { useHistoryStore } from '../store/history.store';
import { Search, Filter, Calendar, X } from 'lucide-react';
import { startOfWeek, startOfMonth } from 'date-fns';

type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

/** Convert a local calendar date to UTC ISO bounds for the backend.
 *  The backend casts the string to ::timestamptz (treats it as UTC).
 *  We pass proper UTC ISO strings so the comparison is timezone-correct.
 */
function localDayToUtcBounds(localDate: Date): { startDate: string; endDate: string } {
  const startOfDay = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 0, 0, 0, 0);
  const endOfDay   = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 23, 59, 59, 999);
  return { startDate: startOfDay.toISOString(), endDate: endOfDay.toISOString() };
}

export const HistoryFilters: React.FC = () => {
  const { filters, setFilters } = useHistoryStore();
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>(filters.search || '');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input — only fire setFilters 350ms after the user stops typing.
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setFilters({ search: val || undefined });
    }, 350);
  }, [setFilters]);

  // On mount the store is already seeded with today's UTC bounds (history.store.ts),
  // so we do NOT call setFilters here — avoids the double-fetch race condition.
  // The preset display state is synced from the store's initial filter.

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'today') {
      setCustomDate('');
      setFilters(localDayToUtcBounds(now));
    } else if (preset === 'week') {
      setCustomDate('');
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const { startDate } = localDayToUtcBounds(start);
      const { endDate }   = localDayToUtcBounds(now);
      setFilters({ startDate, endDate });
    } else if (preset === 'month') {
      setCustomDate('');
      const start = startOfMonth(now);
      const { startDate } = localDayToUtcBounds(start);
      const { endDate }   = localDayToUtcBounds(now);
      setFilters({ startDate, endDate });
    } else if (preset === 'all') {
      setCustomDate('');
      setFilters({ startDate: undefined, endDate: undefined });
    }
  };

  const handleCustomDateChange = (val: string) => {
    setCustomDate(val);
    if (!val) {
      handlePresetChange('today');
      return;
    }
    setDatePreset('custom');
    // Parse the YYYY-MM-DD string in local time
    const [year, month, day] = val.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    setFilters(localDayToUtcBounds(localDate));
  };

  const openDatePicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === 'function') {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.focus();
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 items-center justify-between">
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoice, customer..."
            className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-[#006970] focus:border-transparent outline-none w-64"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
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
          <option value="return">Return</option>
          <option value="payment">Payment</option>
          <option value="expense">Expense</option>
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

        {/* Day Selector (Presets Dropdown) */}
        <select
          value={datePreset}
          onChange={(e) => handlePresetChange(e.target.value as DatePreset)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm font-medium focus:ring-2 focus:ring-[#006970] outline-none"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
          {datePreset === 'custom' && <option value="custom">Custom Date</option>}
        </select>

        {/* Calendar Picker Button */}
        <div className="relative flex items-center">
          <input
            ref={dateInputRef}
            type="date"
            value={customDate}
            onChange={(e) => handleCustomDateChange(e.target.value)}
            className="sr-only"
            aria-label="Select custom date"
          />
          <button
            type="button"
            onClick={openDatePicker}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              datePreset === 'custom' && customDate
                ? 'border-[#006970] bg-[#006970]/10 text-[#006970] dark:border-[#00B4BB] dark:bg-[#00B4BB]/10 dark:text-[#00B4BB]'
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
            title="Set date using calendar"
          >
            <Calendar className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" />
            <span>{datePreset === 'custom' && customDate ? customDate : 'Calendar'}</span>
          </button>
          {datePreset === 'custom' && customDate && (
            <button
              type="button"
              onClick={() => handlePresetChange('today')}
              className="ml-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="Reset to Today"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors">
        <Filter className="w-4 h-4" />
        Advanced Filters
      </button>
    </div>
  );
};
