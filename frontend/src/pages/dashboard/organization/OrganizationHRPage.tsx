/**
 * OrganizationHRPage — Enterprise HRMS Workspace
 *
 * 6-Tab Architecture (Attendance & Leave as default landing page):
 *   1. Attendance & Leave  (default)
 *   2. Staff
 *   3. Payroll
 *   4. Advances
 *   5. Reports
 *   6. HR Settings
 */

import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  Users,
  DollarSign,
  Banknote,
  FileText,
  Settings,
  Plus,
} from 'lucide-react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { DEFAULT_ATTENDANCE_RULES } from '@/features/hr/types/hr.types';
import { useHRPolicies } from '@/features/hr/hooks/useHR';
import { useBranches, type BranchOption } from '@/features/hr/hooks/useBranches';
import {
  HR_STAFF_EXTRA_CONFIG_PREFIX,
  type StaffExtraConfig,
  getStaffExtraConfig,
  saveStaffExtraConfig,
} from '@/features/hr/hooks/useStaffExtraConfig';
import { DailyAttendanceAndLeavePage } from '@/features/hr/components/DailyAttendanceAndLeavePage';
import { HRStaffWorkspace } from '@/features/hr/components/HRStaffWorkspace';
import { HRPayrollWorkspace } from '@/features/hr/components/HRPayrollWorkspace';
import { HRAdvancesWorkspace } from '@/features/hr/components/HRAdvancesWorkspace';
import { HRAttendanceReportsTab } from '@/features/hr/components/HRAttendanceReportsTab';
import { PolicySettingsManager } from '@/features/hr/components/PolicySettingsManager';

// ─── Re-exports Preserved for Backward Compatibility ──────────────────────────

export {
  useBranches,
  HR_STAFF_EXTRA_CONFIG_PREFIX,
  getStaffExtraConfig,
  saveStaffExtraConfig,
};
export type { BranchOption, StaffExtraConfig };

export const HR_RULES_STORAGE_KEY = 'nmm_hr_attendance_rules';
export const HR_LEAVE_POLICIES_STORAGE_KEY = 'nmm_hr_leave_policies';

interface EditableLeavePolicy {
  id: string;
  type: string;
  iconName: 'Coffee' | 'AlertCircle' | 'Umbrella' | 'Star';
  daysAllowed: number;
  description: string;
  color: string;
}

const DEFAULT_LEAVE_POLICIES: EditableLeavePolicy[] = [
  { id: 'casual', type: 'Casual Leave', iconName: 'Coffee', daysAllowed: 12, description: 'For personal or family needs, short-notice allowed.', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'sick', type: 'Sick Leave', iconName: 'AlertCircle', daysAllowed: 10, description: 'Medical emergencies; doctor note required after 2 days.', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
  { id: 'annual', type: 'Annual Leave', iconName: 'Umbrella', daysAllowed: 14, description: 'Planned vacations; minimum 1-week notice required.', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  { id: 'bonus', type: 'Performance Bonus Leave', iconName: 'Star', daysAllowed: 3, description: 'Extra leave awarded on exceeding quarterly targets.', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
];

export function getEffectiveAttendanceRules() {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HR_RULES_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_ATTENDANCE_RULES, ...JSON.parse(saved) };
      }
    }
  } catch (e) {
    console.error('Failed to parse saved attendance rules:', e);
  }
  return DEFAULT_ATTENDANCE_RULES;
}

export function getEffectiveLeavePolicies(): EditableLeavePolicy[] {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HR_LEAVE_POLICIES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to parse saved leave policies:', e);
  }
  return DEFAULT_LEAVE_POLICIES;
}

// ─── Primary 6-Tab Architecture (Default: 'attendance') ───────────────────────

type HRTabId = 'attendance' | 'staff' | 'payroll' | 'advances' | 'reports' | 'settings';

const HR_TABS: Array<{
  id: HRTabId;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  { id: 'attendance', label: 'Attendance & Leave', icon: Clock, description: 'Daily sheet & leaves' },
  { id: 'staff', label: 'Staff', icon: Users, description: 'Directory & pay setup' },
  { id: 'payroll', label: 'Payroll', icon: DollarSign, description: 'Cycles & settlements' },
  { id: 'advances', label: 'Advances', icon: Banknote, description: 'Requests & recovery' },
  { id: 'reports', label: 'Reports', icon: FileText, description: 'Analytics & exports' },
  { id: 'settings', label: 'HR Settings', icon: Settings, description: 'Policies & shifts' },
];

const VALID_TABS = new Set<string>(HR_TABS.map((t) => t.id));

// ─── Main Page Component ──────────────────────────────────────────────────────

export const OrganizationHRPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAdvanceFormOpen, setIsAdvanceFormOpen] = React.useState(false);

  const rawTab = searchParams.get('tab');
  const activeTab: HRTabId = rawTab && VALID_TABS.has(rawTab) ? (rawTab as HRTabId) : 'attendance';

  const setActiveTab = (tab: HRTabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    if (tab !== 'advances') {
      setIsAdvanceFormOpen(false);
    }
  };

  const handleRequestAdvanceShortcut = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'advances');
    setSearchParams(next, { replace: true });
    setIsAdvanceFormOpen(true);
  };

  const { data: allPolicies = [] } = useHRPolicies();
  const orgBaseline = useMemo(() => {
    const def =
      allPolicies.find((p) => p.branch_id === null && p.effective_to === null) ?? allPolicies[0];
    if (!def) {
      return '11h shift · 20m grace · 1/26 deduction';
    }
    return `${(def.standard_shift_minutes / 60).toFixed(1)}h shift · ${def.late_threshold_minutes}m grace · 1/${def.monthly_working_days} deduction`;
  }, [allPolicies]);

  return (
    <OrganizationPageShell
      title="HR Management"
      description="Enterprise workforce attendance, staff directory, payroll cycles, salary advances, analytics, and configurable policies."
      badge={orgBaseline}
      fullWidth
      action={
        <button
          type="button"
          onClick={handleRequestAdvanceShortcut}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#006970] hover:bg-[#005a60] text-white shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Advance Request
        </button>
      }
    >
      <div className="max-w-[1520px] mx-auto w-full min-w-0 space-y-5">
        {/* Enterprise 6-Tab Navigation Strip */}
        <nav
          aria-label="HR workspace navigation"
          className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 rounded-t-xl px-2 pt-1.5"
        >
          <div role="tablist" className="flex items-center gap-1 min-w-max">
            {HR_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'border-[#006970] text-[#006970] dark:border-[#33c9cf] dark:text-[#33c9cf]'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Active Workspace View */}
        <div role="tabpanel" className="min-w-0">
          {activeTab === 'attendance' && <DailyAttendanceAndLeavePage />}
          {activeTab === 'staff' && <HRStaffWorkspace />}
          {activeTab === 'payroll' && <HRPayrollWorkspace />}
          {activeTab === 'advances' && (
            <HRAdvancesWorkspace
              showForm={isAdvanceFormOpen}
              onCloseForm={() => setIsAdvanceFormOpen(false)}
            />
          )}
          {activeTab === 'reports' && <HRAttendanceReportsTab />}
          {activeTab === 'settings' && <PolicySettingsManager />}
        </div>
      </div>
    </OrganizationPageShell>
  );
};

export default OrganizationHRPage;
