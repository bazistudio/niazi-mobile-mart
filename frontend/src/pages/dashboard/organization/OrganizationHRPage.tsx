/**
 * OrganizationHRPage — HR Management (Phase 1–3 Implementation)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  REAL STAFF DATA — Staff list from /api/v1/users via useStaff()         ║
 * ║  PREVIEW-ONLY — Salary calculations, advances, and settlements are       ║
 * ║  React-state previews only. No HR data is persisted to any database.    ║
 * ║  Backend HR endpoints (POST /api/v1/hr/*) are not yet implemented.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Business rules applied:
 *  - Standard shift: 11 hours/day
 *  - Late threshold: 20 minutes
 *  - Absence deduction: 1/26 of monthly salary per absent day
 *  - Overtime trigger: 9 hours (KNOWN DISCREPANCY from 11hr standard — both kept as separate values)
 *  - Overtime multiplier: 1.5×
 *
 * Scope constraints (unchanged from original):
 *  - No new database tables or migrations
 *  - No new HR backend endpoints or services
 *  - No production attendance recording
 *  - No real salary payment or deduction transactions
 *  - No localStorage used for financial records
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
} from 'lucide-react';

// ─── Feature Imports ──────────────────────────────────────────────────────────
import { useStaff } from '@/features/settings/hooks/useStaff';
import type { StaffUser } from '@/features/settings/types/staff.types';
import { BackendIntegrationNotice } from '@/features/hr/components/BackendIntegrationNotice';
import { HRStaffSelector } from '@/features/hr/components/HRStaffSelector';
import { StaffSalaryConfiguration } from '@/features/hr/components/StaffSalaryConfiguration';
import { SalaryCalculationBreakdown } from '@/features/hr/components/SalaryCalculationBreakdown';
import { SalarySettlementModal } from '@/features/hr/components/SalarySettlementModal';
import { StaffAdvanceForm } from '@/features/hr/components/StaffAdvanceForm';
import { HRReportFilters } from '@/features/hr/components/HRReportFilters';
import { DEFAULT_ATTENDANCE_RULES } from '@/features/hr/types/hr.types';
import type { HRReportFilters as HRFiltersType } from '@/features/hr/types/hr.types';

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
        let list = await tauriClient.branchList().catch(() => []);
        if (!list || list.length === 0) {
          const res = await shopApi.getAllShops().catch(() => ({ success: false, data: [] }));
          if (res.success && res.data?.length > 0) {
            list = res.data.map((s: any) => ({ id: s._id, name: s.name, is_active: s.status === 'active' || s.status === 'ACTIVE' }));
          }
        }
        if (!cancelled && list?.length > 0) {
          setBranches(
            list
              .filter((b: any) => b.is_active !== false && b.is_active !== 0)
              .map((b: any) => ({ id: b.id, name: b.name }))
          );
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

type TabId = 'staff' | 'salary' | 'salary-config' | 'advances' | 'reports' | 'rules';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'staff',        label: 'Staff',         icon: Users },
  { id: 'salary',       label: 'Salary Review',  icon: DollarSign },
  { id: 'salary-config', label: 'Salary Config',  icon: Settings },
  { id: 'advances',     label: 'Advances',       icon: Banknote },
  { id: 'reports',      label: 'Reports',        icon: FileText },
  { id: 'rules',        label: 'Rules & Leave',  icon: Calendar },
];

// ─── STAFF TAB ────────────────────────────────────────────────────────────────

const StaffTab: React.FC = () => {
  const { data: staff = [], isLoading, error, refetch } = useStaff();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const { branches } = useBranches();

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
        title="Real Staff Data"
        description="Staff list below is fetched from the live /api/v1/users endpoint. Attendance check-in/check-out status requires a separate attendance backend that is not yet implemented."
        requiredEndpoints={['GET /api/v1/hr/attendance (pending)']}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Today's Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
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
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
            Showing {filtered.length} of {staff.length} staff · Attendance status requires backend
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SALARY REVIEW TAB ────────────────────────────────────────────────────────

const SalaryReviewTab: React.FC = () => {
  const { data: staff = [], isLoading } = useStaff();

  // Per-staff salary preview state (monthlySalary + attendance inputs)
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>();
  const [monthlySalary, setMonthlySalary] = useState(30000);
  const [presentDays, setPresentDays] = useState(24);
  const [absentDays, setAbsentDays] = useState(2);
  const [lateDays, setLateDays] = useState(1);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [advanceDeduction, setAdvanceDeduction] = useState(0);

  const now = new Date();

  // Settlement modal
  const [settlementOpen, setSettlementOpen] = useState(false);

  const previewInput = selectedStaff
    ? {
        staffId: selectedStaff._id,
        staffName: selectedStaff.name,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        monthlySalary,
        standardShiftHours: DEFAULT_ATTENDANCE_RULES.standardShiftHours,
        workingDays: DEFAULT_ATTENDANCE_RULES.workingDaysPerMonth,
        presentDays,
        absentDays,
        lateDays,
        overtimeHours,
        overtimeMultiplier: DEFAULT_ATTENDANCE_RULES.overtimeMultiplier,
        bonusAmount,
        advanceDeduction,
      }
    : null;

  // Estimated net for settlement modal
  const estimatedNet = previewInput
    ? Math.max(
        0,
        monthlySalary -
          absentDays * (monthlySalary / 26) -
          lateDays * (monthlySalary / 26 * 0.5) +
          overtimeHours * (monthlySalary / 26 / DEFAULT_ATTENDANCE_RULES.standardShiftHours) * DEFAULT_ATTENDANCE_RULES.overtimeMultiplier +
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
              {/* Salary Input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Salary (PKR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₨</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlySalary || ''}
                    onChange={e => setMonthlySalary(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                      rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-gray-900 dark:text-white"
                  />
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

const AdvancesTab: React.FC = () => {
  const [showForm, setShowForm] = useState(false);

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
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400
            border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
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
      />

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

const LEAVE_POLICIES = [
  { type: 'Casual Leave', icon: Coffee, daysAllowed: 12, description: 'For personal or family needs, short-notice allowed.', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  { type: 'Sick Leave', icon: AlertCircle, daysAllowed: 10, description: 'Medical emergencies; doctor note required after 2 days.', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
  { type: 'Annual Leave', icon: Umbrella, daysAllowed: 14, description: 'Planned vacations; minimum 1-week notice required.', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  { type: 'Performance Bonus Leave', icon: Star, daysAllowed: 3, description: 'Extra leave awarded on exceeding quarterly targets.', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
];

const AttendanceRulesTab: React.FC = () => (
  <div className="space-y-6">
    <BackendIntegrationNotice
      title="Attendance Rules — Display Only"
      description="These are the authorized business rules. They are not yet enforced by any backend system — no attendance recording endpoint exists."
      requiredEndpoints={['POST /api/v1/hr/attendance/check-in', 'POST /api/v1/hr/attendance/check-out']}
    />

    {/* Authorized Business Rules */}
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Authorized Business Rules</span>
      </div>
      <div className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
        {[
          {
            label: 'Standard Shift',
            value: `${DEFAULT_ATTENDANCE_RULES.standardShiftHours} hours/day`,
            note: 'Business rule applied across HR calculations',
          },
          {
            label: 'Late Threshold',
            value: `${DEFAULT_ATTENDANCE_RULES.lateThresholdMinutes} minutes`,
            note: 'Staff arriving after this delay get a late mark',
          },
          {
            label: 'Absence Deduction',
            value: '1/26 of monthly salary per absent day',
            note: 'Uses 26 working days per month as divisor',
          },
          {
            label: 'Overtime Trigger',
            value: `${DEFAULT_ATTENDANCE_RULES.overtimeTriggerHours} hours/day`,
            note: 'KNOWN DISCREPANCY: triggers at 9hrs though standard shift is 11hrs — both values are kept as separate configurables',
          },
          {
            label: 'Overtime Rate',
            value: `${DEFAULT_ATTENDANCE_RULES.overtimeMultiplier}× hourly rate`,
            note: 'Requires manager approval before counted toward pay',
          },
        ].map(({ label, value, note }) => (
          <div key={label} className="px-4 py-3.5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
              {note && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{note}</div>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-lg">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* Leave Policies */}
    <div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        Leave Policies
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LEAVE_POLICIES.map(policy => {
          const Icon = policy.icon;
          return (
            <div key={policy.type} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${policy.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{policy.type}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0">
                      {policy.daysAllowed} days/yr
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{policy.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 font-medium">
        ⚠ Leave balances and requests require a backend endpoint — not yet implemented.
      </p>
    </div>
  </div>
);

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export const OrganizationHRPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('staff');

  return (
    <OrganizationPageShell
      title="HR Management"
      description="Staff management, salary review, advance requests, and HR policy configuration."
    >
      {/* Top-level integration notice */}
      <BackendIntegrationNotice
        title="HR Module — Real Staff, Pending Payroll Backend"
        description="Staff list is sourced from the live API. Salary calculations, attendance records, advances, and settlements are previews only — no HR financial data is persisted. See individual sections for specific endpoint requirements."
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
      {activeTab === 'staff'         && <StaffTab />}
      {activeTab === 'salary'        && <SalaryReviewTab />}
      {activeTab === 'salary-config' && <SalaryConfigTab />}
      {activeTab === 'advances'      && <AdvancesTab />}
      {activeTab === 'reports'       && <ReportsTab />}
      {activeTab === 'rules'         && <AttendanceRulesTab />}
    </OrganizationPageShell>
  );
};

export default OrganizationHRPage;
