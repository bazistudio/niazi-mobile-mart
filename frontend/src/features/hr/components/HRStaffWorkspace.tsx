'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Building2,
  Clock,
  Search,
  RefreshCw,
  Edit2,
  Save,
  X,
  Settings,
  Calendar,
  Mail,
  Phone,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useStaff } from '@/features/settings/hooks/useStaff';
import type { StaffUser } from '@/features/settings/types/staff.types';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { saveStaffSalaryConfig } from '../services/hr.api';
import {
  useStaffSalaryConfig,
  useHRStaff,
  useDailyAttendanceRegister,
} from '../hooks/useHR';
import { useBranches } from '../hooks/useBranches';
import { getStaffExtraConfig, saveStaffExtraConfig } from '../hooks/useStaffExtraConfig';
import { getKarachiTodayCanonical } from './DailyAttendanceAndLeavePage';
import { StaffSalaryConfiguration } from './StaffSalaryConfiguration';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import type { BackendStaffMember, DailyRegisterEmployeeRow } from '../types/hr.types';
import {
  HRSectionCard,
  HRStatCard,
  HRStatusBadge,
  HREmptyState,
  HRBanner,
} from './ui/HRPrimitives';

function displayRole(staff: StaffUser): string {
  return staff.roleName || staff.roleId || 'Staff';
}

function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Salary Cell ──────────────────────────────────────────────────────────────

interface StaffSalaryCellProps {
  staff: StaffUser;
  canEdit: boolean;
  onOpenConfigModal: (staff: StaffUser, currentConfig?: any) => void;
}

const StaffSalaryCell: React.FC<StaffSalaryCellProps> = ({
  staff,
  canEdit,
  onOpenConfigModal,
}) => {
  const queryClient = useQueryClient();
  const { data: salaryConfig, isLoading } = useStaffSalaryConfig(staff._id);
  const [isEditing, setIsEditing] = useState(false);
  const [editSalary, setEditSalary] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const extraCfg = useMemo(() => getStaffExtraConfig(staff._id), [staff._id, salaryConfig]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditSalary(Number(salaryConfig?.monthly_salary ?? 0));
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
      const todayStr = getKarachiTodayCanonical();
      const isCommission =
        salaryConfig?.salary_type === 'COMMISSION_PERCENTAGE' ||
        extraCfg.employmentType === 'COMMISSION_PERCENTAGE';
      await saveStaffSalaryConfig({
        staffId: staff._id,
        salary_type: isCommission ? 'COMMISSION_PERCENTAGE' : 'MONTHLY',
        monthly_salary: isCommission ? (editSalary > 0 ? editSalary : null) : editSalary,
        commission_percentage: isCommission
          ? salaryConfig?.commission_percentage !== null &&
            salaryConfig?.commission_percentage !== undefined
            ? Number(salaryConfig.commission_percentage)
            : extraCfg.commissionPercentage ?? undefined
          : undefined,
        effective_from: todayStr,
        overtime_multiplier: Number(salaryConfig?.overtime_multiplier ?? 1.5),
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
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
              ₨
            </span>
            <input
              type="number"
              min={0}
              autoFocus
              value={editSalary || ''}
              onChange={(e) => setEditSalary(Number(e.target.value))}
              placeholder="0"
              className="w-28 pl-5 pr-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-[#006970] rounded focus:outline-none text-slate-900 dark:text-white tabular-nums"
            />
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveSalary}
            title="Save Salary"
            className="p-1.5 rounded bg-[#006970] hover:bg-[#005a60] text-white disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancelEdit}
            title="Cancel"
            className="p-1.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        {errorMsg && <span className="text-[10px] text-rose-500 font-medium">{errorMsg}</span>}
      </div>
    );
  }

  const currentSalary =
    salaryConfig?.monthly_salary !== null && salaryConfig?.monthly_salary !== undefined
      ? Number(salaryConfig.monthly_salary)
      : null;
  const isCommissionMode =
    salaryConfig?.salary_type === 'COMMISSION_PERCENTAGE' ||
    (!salaryConfig && extraCfg.employmentType === 'COMMISSION_PERCENTAGE');
  const activeCommissionPct =
    salaryConfig?.commission_percentage !== null && salaryConfig?.commission_percentage !== undefined
      ? Number(salaryConfig.commission_percentage)
      : extraCfg.commissionPercentage ?? null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isCommissionMode ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeCommissionPct !== null ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {activeCommissionPct}% Profit Share
            </span>
          ) : (
            <span className="text-xs text-amber-600 font-medium">Commission Not Set</span>
          )}
          {currentSalary !== null && currentSalary > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              +₨ {currentSalary.toLocaleString('en-PK')}
            </span>
          )}
        </div>
      ) : currentSalary !== null && currentSalary > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-slate-900 dark:text-white text-xs tabular-nums">
            ₨ {currentSalary.toLocaleString('en-PK')}
            <span className="text-[10px] text-slate-400 font-normal ml-0.5">/mo</span>
          </span>
          {extraCfg.individualBonus > 0 && (
            <span
              className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 tabular-nums"
              title={extraCfg.bonusReason || 'Individual Staff Bonus'}
            >
              +₨ {extraCfg.individualBonus.toLocaleString('en-PK')}
            </span>
          )}
        </div>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70">
          Not Fixed
        </span>
      )}

      {canEdit && (
        <>
          <button
            type="button"
            onClick={handleStartEdit}
            title="Quick Edit Salary"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#006970] transition-colors cursor-pointer"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onOpenConfigModal(staff, salaryConfig)}
            title="Full Compensation Configuration"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#006970] transition-colors cursor-pointer"
          >
            <Settings className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
};

// ─── Main Staff Workspace ─────────────────────────────────────────────────────

export const HRStaffWorkspace: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const { data: staff = [], isLoading, error, refetch } = useStaff();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const { branches } = useBranches();
  const { data: hrStaff = [] } = useHRStaff(branchFilter || null);

  const todayCanonical = useMemo(() => getKarachiTodayCanonical(), []);
  const {
    data: dailyRegister,
    isLoading: isRegisterLoading,
    isError: isRegisterError,
    refetch: refetchRegister,
  } = useDailyAttendanceRegister(todayCanonical, branchFilter || null);

  const registerRowByUserId = useMemo(() => {
    const map = new Map<string, DailyRegisterEmployeeRow>();
    if (dailyRegister?.rows) {
      for (const r of dailyRegister.rows) map.set(r.user_id, r);
    }
    return map;
  }, [dailyRegister]);

  const [detailStaff, setDetailStaff] = useState<BackendStaffMember | null>(null);
  const [modalStaff, setModalStaff] = useState<StaffUser | null>(null);
  const [modalInitialBackendConfig, setModalInitialBackendConfig] = useState<any>(null);

  const rolesList = useMemo(() => {
    const set = new Set<string>();
    for (const s of staff) set.add(displayRole(s));
    return Array.from(set);
  }, [staff]);

  const filtered = useMemo(() => {
    let list = staff;
    if (branchFilter) {
      list = list.filter((s) => s.branchId === branchFilter || s.branchName === branchFilter);
    }
    if (roleFilter) {
      list = list.filter((s) => displayRole(s) === roleFilter);
    }
    if (statusFilter === 'ACTIVE') {
      list = list.filter((s) => !s.status || s.status === 'active');
    } else if (statusFilter === 'INACTIVE') {
      list = list.filter((s) => s.status && s.status !== 'active');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.roleName || '').toLowerCase().includes(q) ||
          (s.branchName || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [staff, search, branchFilter, roleFilter, statusFilter]);

  const summary = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((s) => !s.status || s.status === 'active').length,
    }),
    [staff]
  );

  const todayPresentDisplay = useMemo(() => {
    if (isRegisterLoading) return '…';
    if (isRegisterError || !dailyRegister?.summary) return '—';
    const s = dailyRegister.summary;
    return `${s.present + s.late + s.half_day}/${s.total_employees}`;
  }, [dailyRegister, isRegisterLoading, isRegisterError]);

  const openStaffDrawer = (s: StaffUser) => {
    const matched = hrStaff.find((h) => h.user_id === s._id);
    if (matched) {
      setDetailStaff({
        ...matched,
        email: matched.email ?? s.email ?? null,
        created_at: matched.created_at || s.createdAt || '',
      });
    } else {
      setDetailStaff({
        user_id: s._id,
        username: s.username || s.name.toLowerCase().replace(/\s+/g, '_'),
        full_name: s.name,
        email: s.email ?? null,
        role: s.roleName || 'STAFF',
        branch_id: s.branchId ?? null,
        branch_name: s.branchName ?? null,
        is_active: !s.status || s.status === 'active',
        created_at: s.createdAt || '',
      });
    }
  };

  if (error) {
    return (
      <HRBanner
        type="error"
        message="Could not load employee directory from /api/v1/users. Check your connection and try again."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Staff Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HRStatCard
          label="Total Staff"
          value={summary.total}
          subtext="Employees registered in organization"
          icon={<Users className="w-4 h-4" />}
          tone="teal"
          loading={isLoading}
        />
        <HRStatCard
          label="Active Accounts"
          value={summary.active}
          subtext={`${summary.total - summary.active} inactive / suspended`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
          loading={isLoading}
        />
        <HRStatCard
          label="Active Branches"
          value={branches.length || '—'}
          subtext="Configured store locations"
          icon={<Building2 className="w-4 h-4" />}
          tone="violet"
        />
        <HRStatCard
          label="Present Today"
          value={todayPresentDisplay}
          subtext="From live daily register"
          icon={<Clock className="w-4 h-4" />}
          tone="sky"
          loading={isRegisterLoading}
        />
      </div>

      {/* Employee Directory Card */}
      <HRSectionCard
        title="Employee Directory"
        subtitle="Manage compensation structures, review individual attendance calendars, and inspect advance histories"
        icon={<Users className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
        actions={
          <button
            type="button"
            onClick={() => {
              void refetch();
              void refetchRegister();
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
        noPadding
      >
        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, email, or phone…"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {branches.length > 0 && (
            <select
              aria-label="Filter directory by branch"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter directory by designation"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">All Designations</option>
            {rolesList.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter directory by account status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Employee &amp; Contact</th>
                <th className="px-3 py-3">Designation &amp; Branch</th>
                <th className="px-3 py-3">Joined &amp; Status</th>
                <th className="px-3 py-3">Salary Structure</th>
                <th className="px-3 py-3">Today</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Loading employee directory…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6">
                    <HREmptyState
                      icon={<Users className="w-5 h-5" />}
                      title="No staff match your filters"
                      description="Try clearing the search query or selecting All Branches."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const todayRow = registerRowByUserId.get(s._id);
                  return (
                    <tr
                      key={s._id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#006970]/10 dark:bg-[#006970]/30 text-[#006970] dark:text-[#33c9cf] flex items-center justify-center font-bold text-xs shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openStaffDrawer(s)}
                              className="font-semibold text-sm text-slate-900 dark:text-white hover:text-[#006970] dark:hover:text-[#33c9cf] text-left cursor-pointer truncate max-w-[190px] block"
                            >
                              {s.name}
                            </button>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                              {s.phone && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" /> {s.phone}
                                </span>
                              )}
                              {s.email && (
                                <span className="inline-flex items-center gap-0.5 truncate max-w-[160px]">
                                  <Mail className="w-2.5 h-2.5" /> {s.email}
                                </span>
                              )}
                              {!s.phone && !s.email && s.username && (
                                <span className="font-mono">@{s.username}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {displayRole(s)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {s.branchName || 'Organization Level'}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="mb-1">
                          <HRStatusBadge
                            status={!s.status || s.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                            showIcon={false}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Joined: {formatShortDate(s.createdAt)}
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        <StaffSalaryCell
                          staff={s}
                          canEdit={isOrgAdmin}
                          onOpenConfigModal={(staffUser, currentConfig) => {
                            setModalInitialBackendConfig(currentConfig ?? null);
                            setModalStaff(staffUser);
                          }}
                        />
                      </td>

                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {isRegisterLoading ? (
                          <span className="text-[11px] text-slate-400 italic">Loading…</span>
                        ) : (
                          <HRStatusBadge status={todayRow?.status ?? 'NOT_MARKED'} />
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openStaffDrawer(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#006970]/50 hover:text-[#006970] dark:hover:text-[#33c9cf] transition-colors cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          View Profile
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="tabular-nums">
              Showing {filtered.length} of {staff.length} staff members
            </span>
            <span>
              {isOrgAdmin
                ? 'Click Edit or Settings on salary column to revise pay structure'
                : 'Read-only branch staff view'}
            </span>
          </div>
        )}
      </HRSectionCard>

      {/* Staff Detail Drawer */}
      <StaffDetailDrawer
        open={detailStaff !== null}
        onClose={() => setDetailStaff(null)}
        staff={detailStaff}
      />

      {/* Full Salary Configuration Modal */}
      {modalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[1px] p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl p-6 relative my-auto">
            <button
              type="button"
              onClick={() => setModalStaff(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4 pr-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Compensation Configuration — {modalStaff.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure base monthly salary, shift hours, overtime multiplier, or mechanic commission split.
              </p>
            </div>
            {(() => {
              const extraCfg = getStaffExtraConfig(modalStaff._id);
              const backendSalary =
                modalInitialBackendConfig?.monthly_salary !== null &&
                modalInitialBackendConfig?.monthly_salary !== undefined
                  ? Number(modalInitialBackendConfig.monthly_salary)
                  : 0;
              const backendCommissionPct =
                modalInitialBackendConfig?.commission_percentage !== null &&
                modalInitialBackendConfig?.commission_percentage !== undefined
                  ? Number(modalInitialBackendConfig.commission_percentage)
                  : extraCfg.commissionPercentage ?? undefined;
              const resolvedEmploymentType =
                modalInitialBackendConfig?.salary_type === 'COMMISSION_PERCENTAGE'
                  ? 'COMMISSION_PERCENTAGE'
                  : extraCfg.employmentType;
              return (
                <StaffSalaryConfiguration
                  staff={modalStaff}
                  initialConfig={{
                    staffId: modalStaff._id,
                    monthlySalary: backendSalary,
                    employmentType: resolvedEmploymentType,
                    commissionPercentage: backendCommissionPct,
                    standardShiftHours: extraCfg.standardShiftHours,
                    individualBonus: extraCfg.individualBonus,
                    bonusReason: extraCfg.bonusReason,
                    lateThresholdMinutes: extraCfg.lateThresholdMinutes || 20,
                  }}
                  onSave={async (config, overtimeConfig) => {
                    const todayStr = getKarachiTodayCanonical();
                    const derivedSalaryType =
                      config.employmentType === 'COMMISSION_PERCENTAGE'
                        ? 'COMMISSION_PERCENTAGE'
                        : 'MONTHLY';
                    await saveStaffSalaryConfig({
                      staffId: modalStaff._id,
                      salary_type: derivedSalaryType,
                      monthly_salary:
                        config.employmentType === 'COMMISSION_PERCENTAGE'
                          ? null
                          : config.monthlySalary ?? 0,
                      commission_percentage:
                        config.employmentType === 'COMMISSION_PERCENTAGE'
                          ? config.commissionPercentage
                          : undefined,
                      effective_from: todayStr,
                      overtime_multiplier: overtimeConfig.overtimeMultiplier,
                    });
                    saveStaffExtraConfig(modalStaff._id, {
                      employmentType:
                        config.employmentType ||
                        (config.standardShiftHours < 11 ? 'PART_TIME' : 'FULL_TIME'),
                      commissionPercentage: config.commissionPercentage,
                      standardShiftHours: config.standardShiftHours,
                      individualBonus: config.individualBonus || 0,
                      bonusReason: config.bonusReason || '',
                      lateThresholdMinutes: config.lateThresholdMinutes || 20,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: queryKeys.hr.salaryConfig(modalStaff._id),
                    });
                    setModalStaff(null);
                    setModalInitialBackendConfig(null);
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
