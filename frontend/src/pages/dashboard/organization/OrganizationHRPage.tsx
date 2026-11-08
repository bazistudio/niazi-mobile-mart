/**
 * OrganizationHRPage — HR Management (Phase 2 Implementation)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  REAL STAFF DATA — Staff list from /api/v1/users via useStaff()         ║
 * ║  PHASE 2 LIVE — HR backend endpoints at /api/v1/hr/* are now live.      ║
 * ║  Salary config, attendance, advances, payroll periods, shift templates  ║
 * ║  and salary records are persisted to the database.                      ║
 * ║  PREVIEW — Salary calculation breakdowns rendered from local React      ║
 * ║  state remain previews until saved via POST /api/v1/hr/:userId/salary-config. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Business rules applied:
 *  - Standard shift: 11 hours/day
 *  - Late threshold: 20 minutes
 *  - Absence deduction: 1/26 of monthly salary per absent day
 *  - Overtime trigger: 9 hours (KNOWN DISCREPANCY from 11hr standard — both kept as separate values)
 *  - Overtime multiplier: 1.5× (configurable per staff via salary-config)
 *
 * Phase 2 backend endpoints available:
 *  GET/POST /api/v1/hr/staff/:userId/salary-config
 *  GET      /api/v1/hr/staff/:userId/attendance
 *  GET/POST /api/v1/hr/staff/:userId/advances
 *  GET/POST /api/v1/hr/payroll-periods
 *  POST     /api/v1/hr/payroll-periods/:id/generate
 *  GET      /api/v1/hr/payroll-periods/:id/records
 *  POST     /api/v1/hr/salary-records/:id/pay
 */

import React, { useState, useMemo, useEffect } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import {
  Users,
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Coffee,
  Umbrella,
  Star,
  Plus,
  Settings,
  Banknote,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  Edit2,
  Save,
  X,
} from 'lucide-react';

// ─── Feature Imports ──────────────────────────────────────────────────────────
import { useQueryClient } from '@tanstack/react-query';
import { useStaff } from '@/features/settings/hooks/useStaff';
import type { StaffUser } from '@/features/settings/types/staff.types';
import { BackendIntegrationNotice } from '@/features/hr/components/BackendIntegrationNotice';
import { HRStaffSelector } from '@/features/hr/components/HRStaffSelector';
import { StaffSalaryConfiguration } from '@/features/hr/components/StaffSalaryConfiguration';
import { SalaryCalculationBreakdown } from '@/features/hr/components/SalaryCalculationBreakdown';
import { SalarySettlementModal } from '@/features/hr/components/SalarySettlementModal';
import { StaffAdvanceForm } from '@/features/hr/components/StaffAdvanceForm';
import { HRReportFilters } from '@/features/hr/components/HRReportFilters';
import { UserFormDrawer } from '@/features/settings/components/UserFormDrawer';
import { DEFAULT_ATTENDANCE_RULES } from '@/features/hr/types/hr.types';
import type { HRReportFilters as HRFiltersType } from '@/features/hr/types/hr.types';
import { useStaffSalaryConfig } from '@/features/hr/hooks/useHR';
import { saveStaffSalaryConfig } from '@/features/hr/services/hr.api';
import { queryKeys } from '@/lib/react-query/queryKeys';

// ─── Branch Loading (same pattern as BranchSelect.tsx) ────────────────────────
import { tauriClient } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';

interface BranchOption {
  id: string;
  name: string;
}

function useBranches() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    async function load() {
      try {
        const rawList = await tauriClient.branchList().catch(() => []);
        let mapped: BranchOption[] = [];
        if (rawList && rawList.length > 0) {
          mapped = rawList
            .filter((b: any) => b.is_active !== false && b.is_active !== 0)
            .map((b: any) => ({ id: b.id, name: b.name }));
        } else {
          const res = await shopApi.getAllShops().catch(() => ({ success: false, data: [] }));
          if (res.success && res.data?.length > 0) {
            mapped = res.data
              .filter((s: any) => s.status === 'active' || s.status === 'ACTIVE')
              .map((s: any) => ({ id: s._id || s.id, name: s.name }));
          }
        }
        if (!cancelled) {
          setBranches(mapped);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { branches, isLoading };
}

// ─── Helper: role display ─────────────────────────────────────────────────────

function displayRole(staff: StaffUser): string {
  return staff.roleName || staff.roleId || 'Staff';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Attendance status badge
function AttendanceBadge({ status }: { status: 'Present' | 'Absent' | 'Late' | 'Unknown' }) {
  const cfg = {
    Present: { icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40' },
    Absent:  { icon: XCircle,      cls: 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40' },
    Late:    { icon: Clock,        cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' },
    Unknown: { icon: AlertCircle,  cls: 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60' },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

type TabId = 'staff' | 'reports' | 'rules';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'staff',   label: 'Staff & Salary', icon: Users },
  { id: 'reports', label: 'Reports',        icon: FileText },
  { id: 'rules',   label: 'Rules & Leave',  icon: Calendar },
];

// ─── STAFF SALARY ROW CELL COMPONENT ────────────────────────────────────────

export const HR_STAFF_EXTRA_CONFIG_PREFIX = 'nmm_hr_staff_extra_cfg_';

export interface StaffExtraConfig {
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'COMMISSION_PERCENTAGE';
  commissionPercentage?: number;
  standardShiftHours: number;
  individualBonus: number;
  bonusReason?: string;
  lateThresholdMinutes?: number;
}

export function getStaffExtraConfig(staffId: string): StaffExtraConfig {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${HR_STAFF_EXTRA_CONFIG_PREFIX}${staffId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.error('Failed to get staff extra config', e);
  }
  return {
    employmentType: 'FULL_TIME',
    commissionPercentage: 50,
    standardShiftHours: 11,
    individualBonus: 0,
    bonusReason: '',
    lateThresholdMinutes: 20,
  };
}

export function saveStaffExtraConfig(staffId: string, cfg: Partial<StaffExtraConfig>) {
  try {
    if (typeof window !== 'undefined') {
      const existing = getStaffExtraConfig(staffId);
      const updated = { ...existing, ...cfg };
      localStorage.setItem(`${HR_STAFF_EXTRA_CONFIG_PREFIX}${staffId}`, JSON.stringify(updated));
      return updated;
    }
  } catch (e) {
    console.error('Failed to save staff extra config', e);
  }
}

interface StaffSalaryCellProps {
  staff: StaffUser;
  onOpenConfigModal: (staff: StaffUser) => void;
}

const StaffSalaryCell: React.FC<StaffSalaryCellProps> = ({ staff, onOpenConfigModal }) => {
  const queryClient = useQueryClient();
  const { data: salaryConfig, isLoading } = useStaffSalaryConfig(staff._id);
  const [isEditing, setIsEditing] = useState(false);
  const [editSalary, setEditSalary] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const extraCfg = useMemo(() => getStaffExtraConfig(staff._id), [staff._id, salaryConfig]);

  // Initialize edit value when opening quick edit
  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditSalary(salaryConfig?.monthly_salary ?? 0);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setErrorMsg(null);
  };

  const handleSaveSalary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editSalary < 0) {
      setErrorMsg('Salary cannot be negative');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await saveStaffSalaryConfig({
        staffId: staff._id,
        salary_type: 'MONTHLY',
        monthly_salary: editSalary,
        effective_from: todayStr,
        overtime_multiplier: salaryConfig?.overtime_multiplier ?? 1.5,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.hr.salaryConfig(staff._id),
      });
      setIsEditing(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save salary');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">₨</span>
            <input
              type="number"
              min={0}
              autoFocus
              value={editSalary || ''}
              onChange={e => setEditSalary(Number(e.target.value))}
              placeholder="0"
              className="w-28 pl-5 pr-2 py-1 text-xs font-semibold bg-white dark:bg-gray-800 border border-blue-500 rounded
                focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveSalary}
            title="Save Salary"
            className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancelEdit}
            title="Cancel"
            className="p-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {errorMsg && <span className="text-[10px] text-red-500 font-medium">{errorMsg}</span>}
      </div>
    );
  }

  const currentSalary = salaryConfig?.monthly_salary;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {extraCfg.employmentType === 'COMMISSION_PERCENTAGE' ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span className="text-[10px]">⚙</span>
            {extraCfg.commissionPercentage || 50}% Profit Share
          </span>
          {currentSalary !== undefined && currentSalary !== null && currentSalary > 0 && (
            <span className="text-[11px] text-gray-500 font-medium">
              + ₨ {currentSalary.toLocaleString('en-PK')} base
            </span>
          )}
          {extraCfg.individualBonus > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title={extraCfg.bonusReason || 'Individual Staff Bonus'}>
              +₨ {extraCfg.individualBonus.toLocaleString('en-PK')}
            </span>
          )}
        </div>
      ) : currentSalary !== undefined && currentSalary !== null && currentSalary > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-900 dark:text-white text-xs">
            ₨ {currentSalary.toLocaleString('en-PK')}
            <span className="text-[10px] text-gray-400 font-normal ml-0.5">/mo</span>
          </span>
          {extraCfg.individualBonus > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title={extraCfg.bonusReason || 'Individual Staff Bonus'}>
              +₨ {extraCfg.individualBonus.toLocaleString('en-PK')}
            </span>
          )}
          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border ${
            extraCfg.employmentType === 'PART_TIME'
              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
              : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
          }`}>
            {extraCfg.employmentType === 'PART_TIME' ? `${extraCfg.standardShiftHours}h part-time` : `${extraCfg.standardShiftHours}h`}
          </span>
        </div>
      ) : (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50">
          Not Fixed
        </span>
      )}

      <button
        type="button"
        onClick={handleStartEdit}
        title="Quick Edit Salary"
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
      >
        <Edit2 className="w-3 h-3" />
      </button>

      <button
        type="button"
        onClick={() => onOpenConfigModal(staff)}
        title="Full Compensation & Percentage Configuration"
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
      >
        <Settings className="w-3 h-3" />
      </button>
    </div>
  );
};

// ─── STAFF TAB ────────────────────────────────────────────────────────────────

interface StaffTabProps {
  onConfigureStaff?: (staff: StaffUser) => void;
  isAdvanceFormOpen?: boolean;
  onCloseAdvanceForm?: () => void;
}

const StaffTab: React.FC<StaffTabProps> = ({
  onConfigureStaff,
  isAdvanceFormOpen,
  onCloseAdvanceForm,
}) => {
  const { data: staff = [], isLoading, error, refetch } = useStaff();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const { branches } = useBranches();
  const queryClient = useQueryClient();

  // Modal for editing full salary & overtime config directly from staff table
  const [modalStaff, setModalStaff] = useState<StaffUser | null>(null);

  const filtered = useMemo(() => {
    let list = staff;
    if (branchFilter) {
      list = list.filter(s => s.branchId === branchFilter || s.branchName === branchFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.roleName || '').toLowerCase().includes(q) ||
        (s.branchName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [staff, search, branchFilter]);

  // Summary counts — attendance data not available from backend yet
  const summary = useMemo(() => ({
    total: staff.length,
    active: staff.filter(s => !s.status || s.status === 'active').length,
  }), [staff]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading staff...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <BackendIntegrationNotice
        title="Failed to Load Staff"
        description="Could not fetch staff list from /api/v1/users. Please check your connection."
        variant="warning"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Real data notice */}
      <BackendIntegrationNotice
        title="Staff & Salary Management"
        description="View, fix, and update monthly salaries for every staff member below. You can quick-edit salaries directly in the table or open full configuration to adjust shift and overtime multipliers."
        variant="info"
        compact
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Staff', value: summary.total, icon: Users, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' },
          { label: 'Active', value: summary.active, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40' },
          { label: 'Branches', value: branches.length || '—', icon: Building2, color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40' },
          { label: 'Attendance API', value: 'Pending', icon: Clock, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-black text-gray-900 dark:text-white">{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search staff by name or role..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          />
        </div>
        {branches.length > 0 && (
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="sm:w-48 h-9 px-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white"
          >
            <option value="">All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400
            border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Staff Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Staff</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Branch</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Monthly Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Today's Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                    {search || branchFilter ? 'No staff match your filters.' : 'No staff found.'}
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-bold">{s.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[140px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{displayRole(s)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.branchName || '—'}</td>
                    <td className="px-4 py-3">
                      <StaffSalaryCell
                        staff={s}
                        onOpenConfigModal={(staffUser) => {
                          if (onConfigureStaff) {
                            onConfigureStaff(staffUser);
                          } else {
                            setModalStaff(staffUser);
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${s.status === 'active'
                          ? 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}>
                        {s.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AttendanceBadge status="Unknown" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 flex items-center justify-between">
            <span>Showing {filtered.length} of {staff.length} staff</span>
            <span className="text-gray-500">Click ₨ / Edit icon to fix or update salary anytime</span>
          </div>
        )}
      </div>

      {/* Section 2: Salary Review & Settlement Calculator */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-xs">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Salary Review & Settlement Breakdown
            </span>
          </div>
          <span className="text-xs text-gray-400">
            Preview net pay with attendance deductions, overtime & advances
          </span>
        </div>
        <div className="p-4">
          <SalaryReviewTab />
        </div>
      </div>

      {/* Section 3: Staff Advance Requests */}
      <div id="hr-advance-requests-section" className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-xs">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Staff Advance Requests
            </span>
          </div>
          <span className="text-xs text-gray-400">
            Record employee salary advance requests
          </span>
        </div>
        <div className="p-4">
          <AdvancesTab
            showForm={isAdvanceFormOpen}
            onCloseForm={onCloseAdvanceForm}
          />
        </div>
      </div>

      {/* Direct Salary Configuration Modal */}
      {modalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-4xl lg:max-w-5xl shadow-2xl p-5 sm:p-6 md:p-7 relative my-auto animate-in fade-in-50 zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setModalStaff(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4 pr-10">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Salary & Attendance Configuration: {modalStaff.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Fix base salary, shift hours (Full-Time / Part-Time / Mechanic Commission), overtime rules, and individual bonus/reward for this staff member.
              </p>
            </div>
            {(() => {
              const extraCfg = getStaffExtraConfig(modalStaff._id);
              return (
                <StaffSalaryConfiguration
                  staff={modalStaff}
                  initialConfig={{
                    staffId: modalStaff._id,
                    monthlySalary: 0,
                    employmentType: extraCfg.employmentType,
                    commissionPercentage: extraCfg.commissionPercentage ?? 50,
                    standardShiftHours: extraCfg.standardShiftHours,
                    individualBonus: extraCfg.individualBonus,
                    bonusReason: extraCfg.bonusReason,
                    lateThresholdMinutes: extraCfg.lateThresholdMinutes || 20,
                  }}
                  onSave={async (config, overtimeConfig) => {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    // 1. Save core salary to live HR endpoints
                    await saveStaffSalaryConfig({
                      staffId: modalStaff._id,
                      salary_type: 'MONTHLY',
                      monthly_salary: config.monthlySalary,
                      effective_from: todayStr,
                      overtime_multiplier: overtimeConfig.overtimeMultiplier,
                    });
                    // 2. Persist part-time shift hours, employment type, mechanic commission % and individual bonus
                    saveStaffExtraConfig(modalStaff._id, {
                      employmentType: config.employmentType || (config.standardShiftHours < 11 ? 'PART_TIME' : 'FULL_TIME'),
                      commissionPercentage: config.commissionPercentage ?? 50,
                      standardShiftHours: config.standardShiftHours,
                      individualBonus: config.individualBonus || 0,
                      bonusReason: config.bonusReason || '',
                      lateThresholdMinutes: config.lateThresholdMinutes || 20,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: queryKeys.hr.salaryConfig(modalStaff._id),
                    });
                    setModalStaff(null);
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SALARY REVIEW TAB ────────────────────────────────────────────────────────

const SalaryReviewTab: React.FC = () => {
  const { data: staff = [], isLoading } = useStaff();

  // Per-staff salary preview state (monthlySalary + attendance inputs)
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>();
  const [monthlySalary, setMonthlySalary] = useState(30000);
  const [customShiftHours, setCustomShiftHours] = useState(11);
  const [presentDays, setPresentDays] = useState(24);
  const [absentDays, setAbsentDays] = useState(2);
  const [lateDays, setLateDays] = useState(1);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [advanceDeduction, setAdvanceDeduction] = useState(0);

  const now = new Date();

  // Settlement modal
  const [settlementOpen, setSettlementOpen] = useState(false);

  const effectiveRules = useMemo(() => getEffectiveAttendanceRules(), []);

  // Sync staff defaults when selected
  useEffect(() => {
    if (selectedStaff) {
      const extraCfg = getStaffExtraConfig(selectedStaff._id);
      setCustomShiftHours(extraCfg.standardShiftHours || effectiveRules.standardShiftHours);
      if (extraCfg.individualBonus > 0) {
        setBonusAmount(extraCfg.individualBonus);
      } else {
        setBonusAmount(0);
      }
    }
  }, [selectedStaff, effectiveRules]);

  const previewInput = selectedStaff
    ? {
        staffId: selectedStaff._id,
        staffName: selectedStaff.name,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        monthlySalary,
        standardShiftHours: customShiftHours || effectiveRules.standardShiftHours,
        workingDays: effectiveRules.workingDaysPerMonth,
        presentDays,
        absentDays,
        lateDays,
        overtimeHours,
        overtimeMultiplier: effectiveRules.overtimeMultiplier,
        bonusAmount,
        advanceDeduction,
      }
    : null;

  // Estimated net for settlement modal
  const estimatedNet = previewInput
    ? Math.max(
        0,
        monthlySalary -
          absentDays * (monthlySalary / effectiveRules.workingDaysPerMonth) -
          lateDays * (monthlySalary / effectiveRules.workingDaysPerMonth * 0.5) +
          overtimeHours * (monthlySalary / effectiveRules.workingDaysPerMonth / (customShiftHours || effectiveRules.standardShiftHours)) * effectiveRules.overtimeMultiplier +
          bonusAmount -
          advanceDeduction
      )
    : 0;

  return (
    <div className="space-y-5">
      <BackendIntegrationNotice
        title="Salary Review — Preview Mode"
        description="Select a staff member and enter their attendance data to generate a salary calculation preview. No data is saved. Payment recording requires the HR settlements backend."
        requiredEndpoints={[
          'GET /api/v1/hr/attendance',
          'POST /api/v1/hr/settlements',
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Input Panel */}
        <div className="space-y-4">
          {/* Staff Selector */}
          <HRStaffSelector
            value={selectedStaff?._id}
            onChange={(_id, s) => setSelectedStaff(s)}
            label="Select Staff Member"
            placeholder="Choose a staff member..."
          />

          {selectedStaff && (
            <>
              {/* Salary & Shift Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Salary (PKR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₨</span>
                    <input
                      type="number"
                      min={0}
                      value={monthlySalary || ''}
                      onChange={e => setMonthlySalary(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                        rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Shift Hours / Day
                    <span className="text-xs text-gray-400 font-normal ml-1">({customShiftHours < 11 ? 'Part-Time' : 'Full-Time'})</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={customShiftHours || ''}
                      onChange={e => setCustomShiftHours(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                        rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-gray-900 dark:text-white"
                    />
                    <span className="text-xs font-semibold text-gray-500">hrs</span>
                  </div>
                </div>
              </div>

              {/* Attendance Inputs */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Attendance Data (manual entry)</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 bg-white dark:bg-gray-900">
                  {[
                    { label: 'Present Days', value: presentDays, setter: setPresentDays, max: 31 },
                    { label: 'Absent Days', value: absentDays, setter: setAbsentDays, max: 31 },
                    { label: 'Late Days', value: lateDays, setter: setLateDays, max: 31 },
                    { label: 'Overtime Hours', value: overtimeHours, setter: setOvertimeHours, max: 200 },
                    { label: 'Bonus (PKR)', value: bonusAmount, setter: setBonusAmount, max: 999999 },
                    { label: 'Advance Deduct (PKR)', value: advanceDeduction, setter: setAdvanceDeduction, max: 999999 },
                  ].map(({ label, value, setter, max }) => (
                    <div key={label} className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
                      <input
                        type="number"
                        min={0}
                        max={max}
                        value={value || ''}
                        onChange={e => setter(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                          rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/30 text-gray-900 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Settlement button */}
              <button
                type="button"
                onClick={() => setSettlementOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                  border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400
                  hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <DollarSign className="w-4 h-4" />
                Preview Settlement
              </button>
            </>
          )}
        </div>

        {/* Right: Calculation Breakdown */}
        <div>
          {previewInput ? (
            <SalaryCalculationBreakdown input={previewInput} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center p-8">
              <DollarSign className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                Select a staff member and enter attendance data to see the salary breakdown.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Settlement Modal */}
      {selectedStaff && settlementOpen && (
        <SalarySettlementModal
          isOpen={settlementOpen}
          onClose={() => setSettlementOpen(false)}
          staffName={selectedStaff.name}
          staffId={selectedStaff._id}
          month={now.getMonth() + 1}
          year={now.getFullYear()}
          netSalary={estimatedNet}
        />
      )}
    </div>
  );
};

// ─── SALARY CONFIG TAB ────────────────────────────────────────────────────────

const SalaryConfigTab: React.FC = () => {
  const { data: staff = [] } = useStaff();
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>();

  return (
    <div className="space-y-5">
      {!selectedStaff ? (
        <>
          <BackendIntegrationNotice
            title="Salary Configuration — Preview Mode"
            description="Configure per-staff salary and overtime rules. Settings are stored in React state for the current session only — they reset on page refresh until a backend is built."
            requiredEndpoints={[
              'POST /api/v1/hr/salary-configs',
              'GET /api/v1/hr/salary-configs/:staffId',
              'POST /api/v1/hr/overtime-configs',
            ]}
          />
          <HRStaffSelector
            value={selectedStaff}
            onChange={(_id, s) => setSelectedStaff(s)}
            label="Select Staff Member to Configure"
            placeholder="Choose a staff member..."
          />
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            Select a staff member above to view and configure their salary settings.
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedStaff(undefined)}
              className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← All Staff
            </button>
          </div>
          <StaffSalaryConfiguration
            staff={selectedStaff}
            onSave={async () => {
              // Backend not available — StaffSalaryConfiguration handles the error display
            }}
          />
        </>
      )}
    </div>
  );
};

// ─── ADVANCES TAB ─────────────────────────────────────────────────────────────

interface AdvancesTabProps {
  showForm?: boolean;
  onCloseForm?: () => void;
}

const AdvancesTab: React.FC<AdvancesTabProps> = ({ showForm: externalShowForm, onCloseForm }) => {
  const [internalShowForm, setInternalShowForm] = useState(false);
  const showForm = externalShowForm !== undefined ? externalShowForm : internalShowForm;
  const setShowForm = (val: boolean) => {
    if (externalShowForm !== undefined && onCloseForm && !val) {
      onCloseForm();
    } else {
      setInternalShowForm(val);
    }
  };

  return (
    <div className="space-y-5">
      <BackendIntegrationNotice
        title="Staff Advances — Backend Pending"
        description="Advance requests cannot be recorded or retrieved until the HR advances backend is implemented. No historical advance data from previous prototype sessions is shown."
        requiredEndpoints={[
          'POST /api/v1/hr/advances',
          'GET /api/v1/hr/advances?staffId=:staffId',
        ]}
        variant="warning"
      />

      {/* Action header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Request New Advance (Preview Form)
        </h3>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400
            border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {showForm ? 'Close Form' : 'New Advance Request'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
          <StaffAdvanceForm
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Empty state for advance history */}
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-12 text-center">
        <Banknote className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
          No advance history available
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Advance records will appear here once the backend endpoint is implemented.
        </p>
      </div>
    </div>
  );
};

// ─── REPORTS TAB ─────────────────────────────────────────────────────────────

const ReportsTab: React.FC = () => {
  const { branches } = useBranches();
  const [filters, setFilters] = useState<HRFiltersType>({});
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div className="space-y-5">
      <BackendIntegrationNotice
        title="HR Reports — Attendance & Payroll Data Pending"
        description="Detailed HR reports require attendance tracking and payroll history from the backend. The filter controls below are ready — data will populate when backend endpoints are built."
        requiredEndpoints={[
          'GET /api/v1/hr/attendance',
          'GET /api/v1/hr/payroll',
          'GET /api/v1/hr/advances',
        ]}
      />

      <HRReportFilters
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
        branchOptions={branches}
        onAddUser={() => setIsAddUserOpen(true)}
      />

      {/* Add User Drawer */}
      {isAddUserOpen && (
        <UserFormDrawer
          isOpen={isAddUserOpen}
          onClose={() => {
            setIsAddUserOpen(false);
            queryClient.invalidateQueries({ queryKey: ['staff'] });
          }}
        />
      )}

      {/* Placeholder report sections */}
      {(['Monthly Payroll Summary', 'Attendance Report', 'Advance Register'] as const).map(title => (
        <div
          key={title}
          className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-10 text-center"
        >
          <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">{title}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Requires backend data
          </p>
        </div>
      ))}
    </div>
  );
};

// ─── RULES TAB ────────────────────────────────────────────────────────────────

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
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_ATTENDANCE_RULES,
          ...parsed,
        };
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
      if (saved) {
        return JSON.parse(saved);
      }
    }
  } catch (e) {
    console.error('Failed to parse saved leave policies:', e);
  }
  return DEFAULT_LEAVE_POLICIES;
}

const AttendanceRulesTab: React.FC = () => {
  const [rules, setRules] = useState(getEffectiveAttendanceRules);
  const [leavePolicies, setLeavePolicies] = useState<EditableLeavePolicy[]>(getEffectiveLeavePolicies);

  // Edit state for business rules
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [ruleDraftVal, setRuleDraftVal] = useState<number>(0);

  // Edit state for leave policies
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyDraftDays, setPolicyDraftDays] = useState<number>(0);
  const [policyDraftDesc, setPolicyDraftDesc] = useState<string>('');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Save rule change
  const handleSaveRule = (key: string) => {
    const updated = {
      ...rules,
      [key]: ruleDraftVal,
    };
    if (key === 'workingDaysPerMonth' && ruleDraftVal > 0) {
      updated.absenceDeductionFraction = 1 / ruleDraftVal;
    }
    setRules(updated);
    try {
      localStorage.setItem(HR_RULES_STORAGE_KEY, JSON.stringify(updated));
      showToast(`Rule updated successfully! New ${key} set to ${ruleDraftVal}.`);
    } catch (e) {
      console.error('Failed to save rules to localStorage:', e);
    }
    setEditingRuleKey(null);
  };

  // Save policy change
  const handleSavePolicy = (id: string) => {
    const updated = leavePolicies.map(p => {
      if (p.id === id) {
        return {
          ...p,
          daysAllowed: policyDraftDays,
          description: policyDraftDesc.trim() || p.description,
        };
      }
      return p;
    });
    setLeavePolicies(updated);
    try {
      localStorage.setItem(HR_LEAVE_POLICIES_STORAGE_KEY, JSON.stringify(updated));
      showToast(`Leave policy updated successfully!`);
    } catch (e) {
      console.error('Failed to save leave policies to localStorage:', e);
    }
    setEditingPolicyId(null);
  };

  // Reset all to defaults
  const handleResetToDefaults = () => {
    if (window.confirm('Reset all HR business rules and leave allowances back to system defaults?')) {
      setRules(DEFAULT_ATTENDANCE_RULES);
      setLeavePolicies(DEFAULT_LEAVE_POLICIES);
      localStorage.removeItem(HR_RULES_STORAGE_KEY);
      localStorage.removeItem(HR_LEAVE_POLICIES_STORAGE_KEY);
      showToast('All rules and leave policies restored to default values.');
    }
  };

  const getPolicyIcon = (name: string) => {
    switch (name) {
      case 'Coffee': return Coffee;
      case 'AlertCircle': return AlertCircle;
      case 'Umbrella': return Umbrella;
      case 'Star': return Star;
      default: return Calendar;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Rules Notice */}
      <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Authorized HR Business Rules & Leave Policies</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
              All rules below are fully editable. When you adjust thresholds (e.g. changing Late Threshold from 20 to 15 mins), the new rule is saved and applied immediately across attendance and salary calculations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetToDefaults}
          className="shrink-0 ml-4 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 hover:border-red-300 rounded-lg transition-colors cursor-pointer"
        >
          Reset Defaults
        </button>
      </div>

      {/* Authorized Business Rules Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Attendance & Calculation Rules</span>
          <span className="text-xs text-gray-400">Click Edit to change any rule threshold</span>
        </div>
        <div className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
          {/* 1. Standard Shift */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Standard Shift Duration</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Base expected daily working hours across HR calculations</div>
            </div>
            {editingRuleKey === 'standardShiftHours' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={ruleDraftVal || ''}
                  onChange={e => setRuleDraftVal(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded focus:outline-none text-right font-bold text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">hrs/day</span>
                <button
                  type="button"
                  onClick={() => handleSaveRule('standardShiftHours')}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  title="Save"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRuleKey(null)}
                  className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-lg">
                  {rules.standardShiftHours} hours/day
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleKey('standardShiftHours');
                    setRuleDraftVal(rules.standardShiftHours);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Edit Rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 2. Late Arrival Threshold */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Late Threshold</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Staff arriving after this delay grace period are marked as Late</div>
            </div>
            {editingRuleKey === 'lateThresholdMinutes' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={ruleDraftVal || ''}
                  onChange={e => setRuleDraftVal(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded focus:outline-none text-right font-bold text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">mins</span>
                <button
                  type="button"
                  onClick={() => handleSaveRule('lateThresholdMinutes')}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  title="Save"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRuleKey(null)}
                  className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-lg">
                  {rules.lateThresholdMinutes} minutes
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleKey('lateThresholdMinutes');
                    setRuleDraftVal(rules.lateThresholdMinutes);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Edit Rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 3. Working Days per Month / Absence Deduction */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Absence Deduction Divisor</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Calculates deduction as 1/{rules.workingDaysPerMonth} of monthly salary per absent day</div>
            </div>
            {editingRuleKey === 'workingDaysPerMonth' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={ruleDraftVal || ''}
                  onChange={e => setRuleDraftVal(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded focus:outline-none text-right font-bold text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">days</span>
                <button
                  type="button"
                  onClick={() => handleSaveRule('workingDaysPerMonth')}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  title="Save"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRuleKey(null)}
                  className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-3 py-1 rounded-lg">
                  1/{rules.workingDaysPerMonth} of monthly salary per day
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleKey('workingDaysPerMonth');
                    setRuleDraftVal(rules.workingDaysPerMonth);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Edit Rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 4. Overtime Trigger Hours */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Overtime Trigger</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Hours worked in a day before overtime calculation begins</div>
            </div>
            {editingRuleKey === 'overtimeTriggerHours' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={ruleDraftVal || ''}
                  onChange={e => setRuleDraftVal(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded focus:outline-none text-right font-bold text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">hrs</span>
                <button
                  type="button"
                  onClick={() => handleSaveRule('overtimeTriggerHours')}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  title="Save"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRuleKey(null)}
                  className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-lg">
                  {rules.overtimeTriggerHours} hours/day
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleKey('overtimeTriggerHours');
                    setRuleDraftVal(rules.overtimeTriggerHours);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Edit Rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 5. Overtime Multiplier */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Overtime Rate Multiplier</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Rate multiplier applied to regular hourly pay for approved overtime hours</div>
            </div>
            {editingRuleKey === 'overtimeMultiplier' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={ruleDraftVal || ''}
                  onChange={e => setRuleDraftVal(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded focus:outline-none text-right font-bold text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">×</span>
                <button
                  type="button"
                  onClick={() => handleSaveRule('overtimeMultiplier')}
                  className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  title="Save"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRuleKey(null)}
                  className="p-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-3 py-1 rounded-lg">
                  {rules.overtimeMultiplier}× hourly rate
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleKey('overtimeMultiplier');
                    setRuleDraftVal(rules.overtimeMultiplier);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 cursor-pointer"
                  title="Edit Rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leave Policies Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Annual Leave Policies & Entitlements
          </h3>
          <span className="text-xs text-gray-400">Click any policy to edit yearly allowance</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {leavePolicies.map(policy => {
            const Icon = getPolicyIcon(policy.iconName);
            const isEditing = editingPolicyId === policy.id;

            return (
              <div
                key={policy.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 hover:shadow-md transition-shadow relative group"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${policy.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{policy.type}</p>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={policyDraftDays}
                            onChange={e => setPolicyDraftDays(Number(e.target.value))}
                            className="w-16 px-1.5 py-0.5 text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-blue-500 rounded text-right text-gray-900 dark:text-white"
                          />
                          <span className="text-xs text-gray-400">days</span>
                          <button
                            type="button"
                            onClick={() => handleSavePolicy(policy.id)}
                            className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                            title="Save Policy"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPolicyId(null)}
                            className="p-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">
                            {policy.daysAllowed} days/yr
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPolicyId(policy.id);
                              setPolicyDraftDays(policy.daysAllowed);
                              setPolicyDraftDesc(policy.description);
                            }}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                            title="Edit Allowance"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={policyDraftDesc}
                        onChange={e => setPolicyDraftDesc(e.target.value)}
                        className="w-full mt-2 p-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white"
                        placeholder="Leave policy conditions..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        {policy.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export const OrganizationHRPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('staff');
  const [isAdvanceFormOpen, setIsAdvanceFormOpen] = useState(false);

  const handleToggleAdvanceForm = () => {
    if (activeTab !== 'staff') {
      setActiveTab('staff');
    }
    const nextState = !isAdvanceFormOpen;
    setIsAdvanceFormOpen(nextState);
    if (nextState) {
      setTimeout(() => {
        const el = document.getElementById('hr-advance-requests-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  return (
    <OrganizationPageShell
      title="HR Management"
      description="Staff management, salary review, advance requests, and HR policy configuration."
      action={
        <button
          type="button"
          onClick={handleToggleAdvanceForm}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold
            bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {isAdvanceFormOpen ? 'Close Advance Form' : 'New Advance Request'}
        </button>
      }
    >
      {/* Top-level integration notice */}
      <BackendIntegrationNotice
        title="HR Module — Phase 2 Live"
        description="Staff list, salary configuration, attendance records, advances, payroll periods, and salary records are now persisted via /api/v1/hr/* endpoints. Salary calculation breakdowns rendered in-page remain previews until saved. See individual sections for details."
        compact
      />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'staff'   && (
        <StaffTab
          isAdvanceFormOpen={isAdvanceFormOpen}
          onCloseAdvanceForm={() => setIsAdvanceFormOpen(false)}
        />
      )}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'rules'   && <AttendanceRulesTab />}
    </OrganizationPageShell>
  );
};

export default OrganizationHRPage;
