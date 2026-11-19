'use client';

import React, { useState, useMemo } from 'react';
import {
  Coffee,
  Calendar,
  Users,
  Clock,
  Plus,
  Edit2,
  Eye,
  Info,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import { markStaffAttendance } from '@/features/hr/services/hr.api';
import type {
  AttendanceRangeResponse,
  DailyRegisterEmployeeRow,
} from '@/features/hr/types/hr.types';
import {
  HRSectionCard,
  HRStatCard,
  HRStatusBadge,
  HREmptyState,
  HRConfirmDialog,
  HRBanner,
} from './ui/HRPrimitives';

type LeaveCategory = 'Casual Leave' | 'Sick Leave' | 'Annual Leave' | 'Emergency / Unpaid Leave';

const LEAVE_TYPES: LeaveCategory[] = [
  'Casual Leave',
  'Sick Leave',
  'Annual Leave',
  'Emergency / Unpaid Leave',
];

function parseLeaveType(notes: string | null | undefined): { leaveType: string; reason: string } {
  const raw = (notes || '').trim();
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (match) {
    return { leaveType: match[1], reason: match[2] || '—' };
  }
  return { leaveType: 'Leave', reason: raw || '—' };
}

function enumerateDatesInclusive(start: string, end: string): string[] {
  if (!start || !end || end < start) return [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const endDt = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  const out: string[] = [];
  while (cur <= endDt && out.length < 32) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cur.getUTCDate()
      ).padStart(2, '0')}`
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

interface HRLeaveManagementViewProps {
  selectedDate: string;
  monthLabel: string;
  registerRows: DailyRegisterEmployeeRow[];
  rangeData?: AttendanceRangeResponse;
  isLoadingRange: boolean;
  defaultShiftMinutes?: number;
  defaultLateThreshold?: number;
  onRefreshCaches: (staffId?: string, dateStr?: string) => Promise<void>;
  onEditLeaveRow: (row: DailyRegisterEmployeeRow) => void;
  onOpenProfile: (row: DailyRegisterEmployeeRow) => void;
  formatMMDDYYYY: (canonicalDate: string) => string;
}

export const HRLeaveManagementView: React.FC<HRLeaveManagementViewProps> = ({
  selectedDate,
  monthLabel,
  registerRows,
  rangeData,
  isLoadingRange,
  defaultShiftMinutes = 660,
  defaultLateThreshold = 20,
  onRefreshCaches,
  onEditLeaveRow,
  onOpenProfile,
  formatMMDDYYYY,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveCategory>('Casual Leave');
  const [startDate, setStartDate] = useState(selectedDate);
  const [endDate, setEndDate] = useState(selectedDate);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('ALL');

  const employeeOptions = useMemo(() => {
    if (rangeData?.employees?.length) return rangeData.employees;
    return registerRows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      full_name: r.full_name,
      employee_code: r.employee_code,
      role: r.role,
      branch_id: r.branch_id,
      branch_name: r.branch_name,
    }));
  }, [rangeData, registerRows]);

  const leaveDates = useMemo(() => enumerateDatesInclusive(startDate, endDate), [startDate, endDate]);

  const leaveRecords = useMemo(() => {
    const empMap = new Map(employeeOptions.map((e) => [e.user_id, e]));
    const list = (rangeData?.records ?? [])
      .filter((r) => r.status === 'LEAVE')
      .map((r) => {
        const emp = empMap.get(r.user_id);
        const parsed = parseLeaveType(r.notes);
        return {
          ...r,
          full_name: emp?.full_name || r.user_id,
          employee_code: emp?.employee_code || '—',
          role: emp?.role || '—',
          branch_name: emp?.branch_name || 'Organization Scope',
          leaveType: parsed.leaveType,
          reasonText: parsed.reason,
        };
      })
      .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));

    if (employeeFilter === 'ALL') return list;
    return list.filter((l) => l.user_id === employeeFilter);
  }, [rangeData, employeeOptions, employeeFilter]);

  const stats = useMemo(() => {
    const onSelectedDay = leaveRecords.filter((l) => l.attendance_date.slice(0, 10) === selectedDate).length;
    const uniqueStaff = new Set(leaveRecords.map((l) => l.user_id)).size;
    return {
      onSelectedDay,
      monthTotalDays: leaveRecords.length,
      uniqueStaff,
    };
  }, [leaveRecords, selectedDate]);

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!selectedStaffId) {
      setFeedback({ type: 'error', msg: 'Please select a staff member.' });
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setFeedback({ type: 'error', msg: 'End date must be on or after start date.' });
      return;
    }
    if (leaveDates.length === 0 || leaveDates.length > 31) {
      setFeedback({ type: 'error', msg: 'Leave duration must be between 1 and 31 days per entry.' });
      return;
    }
    if (!reason.trim()) {
      setFeedback({ type: 'error', msg: 'Please enter a leave reason or approval note.' });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmRecordLeave = async () => {
    if (!selectedStaffId || leaveDates.length === 0) return;
    setIsSubmitting(true);
    setFeedback(null);
    let savedCount = 0;
    try {
      const formattedNotes = `[${leaveType}] ${reason.trim()}`;
      for (const dateStr of leaveDates) {
        await markStaffAttendance({
          staffId: selectedStaffId,
          attendance_date: dateStr,
          status: 'LEAVE',
          check_in_at: null,
          check_out_at: null,
          notes: formattedNotes,
        });
        savedCount++;
      }
      const empName =
        employeeOptions.find((e) => e.user_id === selectedStaffId)?.full_name || 'Employee';
      setFeedback({
        type: 'success',
        msg: `Recorded ${leaveDates.length} ${leaveType} day(s) for ${empName} (${formatMMDDYYYY(startDate)} – ${formatMMDDYYYY(endDate)}).`,
      });
      setConfirmOpen(false);
      setShowCreateForm(false);
      setReason('');
    } catch (err: any) {
      const baseErr = err?.response?.data?.error || err?.message || 'Failed to save leave attendance records.';
      setFeedback({
        type: 'error',
        msg:
          savedCount > 0
            ? `Partially saved ${savedCount} of ${leaveDates.length} leave day(s) before error: ${baseErr}`
            : baseErr,
      });
      setConfirmOpen(false);
    } finally {
      if (savedCount > 0) {
        await onRefreshCaches(selectedStaffId, startDate);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <HRBanner
          type={feedback.type}
          message={feedback.msg}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Backend capability clarity banner */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 px-4 py-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
        <Info className="w-4 h-4 text-[#006970] dark:text-[#33c9cf] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-800 dark:text-slate-100">Leave Persistence Model:</strong>{' '}
          Approved leave days are recorded directly in PostgreSQL via{' '}
          <code className="px-1 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
            staff_attendance (status = &apos;LEAVE&apos;)
          </code>{' '}
          and feed payroll attendance summaries automatically. Dedicated employee self-service pending-leave requests / multi-step leave balances are not yet implemented in the backend.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HRStatCard
          label={`On Leave (${formatMMDDYYYY(selectedDate)})`}
          value={isLoadingRange ? '…' : stats.onSelectedDay}
          subtext="Selected register date"
          icon={<Coffee className="w-4 h-4" />}
          tone="violet"
        />
        <HRStatCard
          label={`Leave Days (${monthLabel})`}
          value={isLoadingRange ? '…' : stats.monthTotalDays}
          subtext="Persisted leave records in month"
          icon={<Calendar className="w-4 h-4" />}
          tone="teal"
        />
        <HRStatCard
          label="Staff Taking Leave"
          value={isLoadingRange ? '…' : stats.uniqueStaff}
          subtext={`Across ${monthLabel}`}
          icon={<Users className="w-4 h-4" />}
          tone="sky"
        />
        <HRStatCard
          label="Self-Service Queue"
          value="N/A"
          subtext="Recorded directly by Admin"
          icon={<Clock className="w-4 h-4" />}
          tone="neutral"
        />
      </div>

      <HRSectionCard
        title={`Recorded Staff Leaves — ${monthLabel}`}
        subtitle="Filter by employee or record an authorized multi-day leave period into PostgreSQL"
        icon={<CalendarDays className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filter leave history by employee"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="ALL">All Employees ({employeeOptions.length})</option>
              {employeeOptions.map((emp) => (
                <option key={emp.user_id} value={emp.user_id}>
                  {emp.full_name} ({emp.employee_code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setStartDate(selectedDate);
                setEndDate(selectedDate);
                setShowCreateForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {showCreateForm ? 'Close Leave Form' : 'Record Staff Leave'}
            </button>
          </div>
        }
        noPadding
      >
        {showCreateForm && (
          <form
            onSubmit={handleOpenConfirm}
            className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Staff Member <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">Select staff member…</option>
                  {employeeOptions.map((emp) => (
                    <option key={emp.user_id} value={emp.user_id}>
                      {emp.full_name} — {emp.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveCategory)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  required
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <span className="font-bold text-[#006970] dark:text-[#33c9cf] tabular-nums">
                    {leaveDates.length} day{leaveDates.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason / Approval Note <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  placeholder="Enter reason for leave (saved directly to attendance notes)..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white font-semibold cursor-pointer"
                >
                  Review &amp; Save Leave
                </button>
              </div>
            </div>
          </form>
        )}

        {isLoadingRange ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#006970]" />
            <span>Loading monthly leave records from PostgreSQL…</span>
          </div>
        ) : leaveRecords.length === 0 ? (
          <div className="p-6">
            <HREmptyState
              icon={<Coffee className="w-5 h-5" />}
              title={`No leave records recorded in ${monthLabel}`}
              description="Click 'Record Staff Leave' above to log an authorized leave day or range for any active employee."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason / Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leaveRecords.map((rec) => {
                  const dateKey = rec.attendance_date.slice(0, 10);
                  const rowObj: DailyRegisterEmployeeRow = {
                    user_id: rec.user_id,
                    username: rec.full_name,
                    full_name: rec.full_name,
                    employee_code: rec.employee_code,
                    role: rec.role,
                    branch_id: rec.branch_id,
                    branch_name: rec.branch_name,
                    attendance_date: dateKey,
                    record_id: rec.id,
                    status: 'LEAVE',
                    check_in_at: null,
                    check_out_at: null,
                    worked_minutes: null,
                    late_minutes: 0,
                    shift_duration_minutes: defaultShiftMinutes,
                    late_threshold_minutes: defaultLateThreshold,
                    source: rec.source,
                    notes: rec.notes,
                    recorded_by: null,
                    updated_at: null,
                  };
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                        {formatMMDDYYYY(dateKey)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {rec.full_name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {rec.employee_code} · {rec.role}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {rec.branch_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800 text-[11px] font-semibold">
                          {rec.leaveType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <HRStatusBadge status="LEAVE" />
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                        {rec.reasonText}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditLeaveRow(rowObj)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenProfile(rowObj)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Open Staff Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HRSectionCard>

      <HRConfirmDialog
        open={confirmOpen}
        title="Confirm Staff Leave Recording"
        description="Leave dates will be recorded immediately as LEAVE entries in PostgreSQL attendance and reflected in payroll summaries."
        details={[
          {
            label: 'Employee',
            value:
              employeeOptions.find((e) => e.user_id === selectedStaffId)?.full_name ||
              selectedStaffId,
          },
          { label: 'Leave Type', value: leaveType },
          { label: 'Date Range', value: `${formatMMDDYYYY(startDate)} → ${formatMMDDYYYY(endDate)}` },
          { label: 'Total Calendar Days', value: `${leaveDates.length} day(s)` },
          { label: 'Reason', value: reason.trim() },
        ]}
        confirmLabel={`Save ${leaveDates.length} Leave Day(s)`}
        isPending={isSubmitting}
        onConfirm={handleConfirmRecordLeave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
