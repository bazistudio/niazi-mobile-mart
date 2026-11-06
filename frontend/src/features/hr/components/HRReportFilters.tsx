import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { HRStaffSelector } from './HRStaffSelector';
import type { HRReportFilters as HRReportFiltersType } from '../types/hr.types';
import type { StaffUser } from '@/features/settings/types/staff.types';

interface HRReportFiltersProps {
  filters: HRReportFiltersType;
  onChange: (filters: HRReportFiltersType) => void;
  onReset?: () => void;
  /** Branch options loaded from tauriClient / shopApi — passed in from parent */
  branchOptions?: Array<{ id: string; name: string }>;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'SALESMAN', label: 'Salesman' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'REPAIR_MECHANIC', label: 'Repair Mechanic' },
  { value: 'STAFF', label: 'Staff' },
];

/**
 * HRReportFilters
 *
 * Filter bar for HR reports: branch, employee, role, month, year.
 * All values are React state — no backend round-trip from this component.
 */
export const HRReportFilters: React.FC<HRReportFiltersProps> = ({
  filters,
  onChange,
  onReset,
  branchOptions = [],
}) => {
  const update = (patch: Partial<HRReportFiltersType>) => {
    onChange({ ...filters, ...patch });
  };

  const hasActiveFilters =
    filters.branchId || filters.staffId || filters.role || filters.month || filters.year;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Report Filters</span>
          {hasActiveFilters && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium">
              Active
            </span>
          )}
        </div>
        {onReset && hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* Filters Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Branch Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Branch
          </label>
          <select
            value={filters.branchId ?? ''}
            onChange={(e) => update({ branchId: e.target.value || undefined })}
            className="w-full h-9 px-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          >
            <option value="">All Branches</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Employee Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Employee
          </label>
          <HRStaffSelector
            value={filters.staffId}
            onChange={(id) => update({ staffId: id || undefined })}
            label=""
            placeholder="All employees"
          />
        </div>

        {/* Role Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Role
          </label>
          <select
            value={filters.role ?? ''}
            onChange={(e) => update({ role: e.target.value || undefined })}
            className="w-full h-9 px-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Month Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Month
          </label>
          <select
            value={filters.month ?? ''}
            onChange={(e) => update({ month: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full h-9 px-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          >
            <option value="">All Months</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Year
          </label>
          <select
            value={filters.year ?? ''}
            onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full h-9 px-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          >
            <option value="">All Years</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default HRReportFilters;
