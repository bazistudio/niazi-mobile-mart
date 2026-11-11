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

  const displayRole = (staff: StaffUser): string => {
    if (staff.roleName) {
      const mapped = mapStaffRoleToDisplay(staff.roleName);
      return mapped?.roleName || staff.roleName;
    }
    const role = mapRoleIdToStaffRole(staff.roleId);
    if (role) {
      const mapped = mapStaffRoleToDisplay(role);
      return mapped?.roleName || role;
    }
    return 'Staff';
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
        {/* Trigger / Inline Search Input */}
        <div
          className={`w-full flex items-center justify-between gap-2 h-9 px-2.5 text-sm
            bg-gray-50 dark:bg-gray-800 border rounded-lg transition-all duration-150
            ${error
              ? 'border-red-400 dark:border-red-500'
              : 'border-gray-200 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30'
            }
            ${isOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}
          `}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
            <input
              type="text"
              disabled={disabled || isLoading}
              value={isOpen ? searchTerm : (selectedStaff?.name || '')}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => {
                if (!disabled) {
                  setSearchTerm('');
                  setIsOpen(true);
                }
              }}
              placeholder={isLoading ? 'Loading staff...' : placeholder}
              className="w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedStaff && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                title="Clear employee"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => !disabled && setIsOpen((v) => !v)}
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Dropdown Options List */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
            {/* Staff List */}
            <div className="max-h-56 overflow-y-auto">
              {/* Clear selection option */}
              {!required && (
                <button
                  type="button"
                  onClick={() => { onChange(undefined); setIsOpen(false); setSearchTerm(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400
                    hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left cursor-pointer"
                >
                  <span>— All Employees (Clear) —</span>
                </button>
              )}

              {filteredStaff.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  {searchTerm ? `No staff match "${searchTerm}"` : 'No staff available'}
                </div>
              ) : (
                filteredStaff.map((staff) => (
                  <button
                    key={staff._id}
                    type="button"
                    onClick={() => handleSelect(staff)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs
                      transition-colors text-left cursor-pointer
                      ${staff._id === value
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">
                          {staff.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate">{staff.name}</div>
                        {staff.branchName && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                            {staff.branchName}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 ml-2">
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
