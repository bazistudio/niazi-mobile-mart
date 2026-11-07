import React, { useState, useMemo } from 'react';
import { Search, User, ChevronDown, X } from 'lucide-react';
import { useStaff } from '@/features/settings/hooks/useStaff';
import type { StaffUser } from '@/features/settings/types/staff.types';
import { mapRoleIdToStaffRole, mapStaffRoleToDisplay } from '@/features/settings/services/settings.api';

interface HRStaffSelectorProps {
  value?: string;           // staffId
  onChange: (staffId: string | undefined, staff?: StaffUser) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  /** If provided, only staff with this role prefix are shown */
  roleFilter?: string[];
  className?: string;
}

/**
 * HRStaffSelector
 *
 * Searchable staff dropdown backed by real useStaff() hook.
 * Used in salary config, settlement modal, advance form, and report filters.
 */
export const HRStaffSelector: React.FC<HRStaffSelectorProps> = ({
  value,
  onChange,
  label = 'Staff Member',
  placeholder = 'Search staff...',
  disabled = false,
  error,
  required = false,
  roleFilter,
  className = '',
}) => {
  const { data: allStaff = [], isLoading } = useStaff();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Find currently selected staff
  const selectedStaff = useMemo(
    () => allStaff.find((s) => s._id === value),
    [allStaff, value]
  );

  // Filtered & searched staff list
  const filteredStaff = useMemo(() => {
    let list = allStaff.filter((s) => s.status === 'active' || !s.status);

    if (roleFilter && roleFilter.length > 0) {
      list = list.filter((s) => {
        const role = s.roleName || mapRoleIdToStaffRole(s.roleId);
        return roleFilter.some((r) =>
          role?.toLowerCase().includes(r.toLowerCase())
        );
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.roleName || '').toLowerCase().includes(q) ||
          (s.branchName || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [allStaff, searchTerm, roleFilter]);

  const handleSelect = (staff: StaffUser) => {
    onChange(staff._id, staff);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined, undefined);
    setSearchTerm('');
  };

  const displayRole = (staff: StaffUser) => {
    if (staff.roleName) return mapStaffRoleToDisplay(staff.roleName as any) || staff.roleName;
    const role = mapRoleIdToStaffRole(staff.roleId);
    return role ? mapStaffRoleToDisplay(role as any) || role : 'Staff';
  };

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
          {label}
          {!required && (
            <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal text-xs">(optional)</span>
          )}
        </label>
      )}

      <div className="relative">
        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen((v) => !v)}
          disabled={disabled || isLoading}
          className={`w-full flex items-center justify-between gap-2 h-10 px-3 text-sm
            bg-white dark:bg-gray-900 border rounded-lg transition-all duration-150
            focus:outline-none focus:ring-2 focus:ring-blue-500/30
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error
              ? 'border-red-400 dark:border-red-500 focus:border-red-400'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500'
            }
            ${isOpen ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20' : ''}
          `}
        >
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
            {selectedStaff ? (
              <span className="text-gray-900 dark:text-white truncate font-medium">
                {selectedStaff.name}
              </span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                {isLoading ? 'Loading staff...' : placeholder}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedStaff && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => e.key === 'Enter' && handleClear(e as any)}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or role..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
                    focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Staff List */}
            <div className="max-h-56 overflow-y-auto">
              {/* Clear selection option */}
              {!required && (
                <button
                  type="button"
                  onClick={() => { onChange(undefined); setIsOpen(false); setSearchTerm(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400
                    hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <span className="text-xs italic">— No selection —</span>
                </button>
              )}

              {filteredStaff.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                  {searchTerm ? `No staff match "${searchTerm}"` : 'No staff available'}
                </div>
              ) : (
                filteredStaff.map((staff) => (
                  <button
                    key={staff._id}
                    type="button"
                    onClick={() => handleSelect(staff)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm
                      transition-colors text-left
                      ${staff._id === value
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-semibold">
                          {staff.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{staff.name}</div>
                        {staff.branchName && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {staff.branchName}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                      {displayRole(staff)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Click-outside backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setIsOpen(false); setSearchTerm(''); }}
        />
      )}

      {error && (
        <span className="text-xs font-medium text-red-500 dark:text-red-400">{error}</span>
      )}
    </div>
  );
};

export default HRStaffSelector;
