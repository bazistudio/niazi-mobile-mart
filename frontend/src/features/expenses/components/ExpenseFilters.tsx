import React from 'react';
import { Search, Filter, Calendar, CreditCard, User } from 'lucide-react';
import { useExpensesStore } from '../store/expenses.store';

interface ExpenseFiltersProps {
  isAdminView?: boolean;
}

export const ExpenseFilters: React.FC<ExpenseFiltersProps> = ({ isAdminView = false }) => {
  const { filters, categories, items, setFilters } = useExpensesStore();

  // FEATURE-01: Derive unique users from loaded expenses for ADMIN creator filter
  // This avoids a separate /api/users call; builds from data already in store
  const uniqueCreators = React.useMemo(() => {
    if (!isAdminView) return [];
    const seen = new Map<string, string>();
    for (const e of items) {
      if (e.performed_by && e.performed_by_name) {
        seen.set(e.performed_by, e.performed_by_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [isAdminView, items]);

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
            <option value="BANK_TRANSFER">BANK</option>
            <option value="EASYPAISA">EASYPAISA</option>
            <option value="JAZZCASH">JAZZCASH</option>
            <option value="CARD">CARD</option>
            <option value="OTHER">OTHER</option>
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

        {/* FEATURE-01: Created By filter — ADMIN only */}
        {isAdminView && (
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <select
              className="pl-10 pr-8 py-2 bg-neutral-50 dark:bg-neutral-800 border-none rounded-lg text-sm appearance-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-neutral-900 transition-colors cursor-pointer text-neutral-900 dark:text-white"
              value={filters.created_by_user_id || ''}
              onChange={(e) => setFilters({ created_by_user_id: e.target.value || undefined })}
            >
              <option value="">All Users</option>
              {uniqueCreators.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* EXP-L02: Date preset quick buttons */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-neutral-400" />
          {[
            {
              label: 'Today',
              getRange: () => {
                // DEFECT-06 FIX: local date components avoid UTC shift in PKT (UTC+5).
                const now = new Date();
                const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                return { start_date: d, end_date: d };
              },
            },
            {
              label: 'This Week',
              getRange: () => {
                // DEFECT-06 FIX: shift Monday back using local date, then format with local components.
                const now = new Date();
                const day = now.getDay();
                const mon = new Date(now);
                mon.setDate(now.getDate() - ((day + 6) % 7));
                const fmtLocal = (dt: Date) =>
                  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                return {
                  start_date: fmtLocal(mon),
                  end_date: fmtLocal(now),
                };
              },
            },
            {
              label: 'This Month',
              getRange: () => {
                // DEFECT-06 FIX: local year/month avoids UTC midnight shift that placed
                // start_date on the last day of the previous month between 00:00–04:59 PKT.
                const now = new Date();
                const fmtLocal = (dt: Date) =>
                  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                return {
                  start_date: fmtLocal(firstOfMonth),
                  end_date: fmtLocal(now),
                };
              },
            },
          ].map(({ label, getRange }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const r = getRange();
                setFilters({ start_date: r.start_date, end_date: r.end_date });
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {label}
            </button>
          ))}
          {(filters.start_date || filters.end_date) && (
            <button
              type="button"
              onClick={() => setFilters({ start_date: undefined, end_date: undefined })}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-neutral-100 dark:bg-neutral-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              Clear
            </button>
          )}
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
