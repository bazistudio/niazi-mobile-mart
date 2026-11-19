'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Coffee,
  Building2,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Shield,
  UserCheck,
  History,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Eye,
  CheckSquare,
  Square,
  Layers,
  AlertTriangle,
  X,
  Check,
  FileSpreadsheet,
  CalendarDays,
  CalendarRange,
  Loader2,
  Wand2,
  Percent,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useBranches } from '../hooks/useBranches';
import {
  useDailyAttendanceRegister,
  useAttendanceRange,
  useBulkMarkAttendance,
  useTriggerAbsenceProcess,
  useHRPolicies,
  useEffectiveHRPolicy,
} from '../hooks/useHR';
import {
  markStaffAttendance,
  updateStaffAttendance,
} from '../services/hr.api';
import type {
  AttendanceStatusType,
  DailyRegisterEmployeeRow,
  DailyRegisterSummary,
  BackendStaffMember,
} from '../types/hr.types';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import { HRRecentAttendanceActivity } from './HRRecentAttendanceActivity';
import { HRLeaveManagementView } from './HRLeaveManagementView';
import {
  HRSectionCard,
  HRStatCard,
  HRStatusBadge,
  HRConfirmDialog,
  HREmptyState,
  HRBanner,
} from './ui/HRPrimitives';

// ─── Asia/Karachi Safe Date & Time Helpers ───────────────────────────────────

export function getKarachiTodayCanonical(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '11';
    const d = parts.find((p) => p.type === 'day')?.value ?? '19';
    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }
}

export function getKarachiCurrentTimeHHMM(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '09';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '30';
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  } catch {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

export function formatCanonicalToMMDDYYYY(canonicalDate: string): string {
  if (!canonicalDate || !/^\d{4}-\d{2}-\d{2}$/.test(canonicalDate)) return canonicalDate;
  const [yyyy, mm, dd] = canonicalDate.split('-');
  return `${mm}-${dd}-${yyyy}`;
}

export function formatDateWithWeekday(canonicalDate: string): string {
  if (!canonicalDate || !/^\d{4}-\d{2}-\d{2}$/.test(canonicalDate)) return canonicalDate;
  const [y, m, d] = canonicalDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ${formatCanonicalToMMDDYYYY(canonicalDate)}`;
}

export function addDaysCanonical(canonicalDate: string, deltaDays: number): string {
  const [y, m, d] = canonicalDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

/** Convert ISO UTC timestamp to 'HH:mm' in Asia/Karachi (24h) */
export function isoToKarachiHHMM(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '';
    if (!hh || !mm) return '';
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** Convert YYYY-MM-DD + HH:mm (Karachi UTC+5) to ISO UTC timestamp */
export function karachiHHMMToIso(date: string, timeHHMM: string | null | undefined): string | null {
  if (!timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM.trim())) return null;
  const [hh, mm] = timeHHMM.trim().split(':').map(Number);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const utcMs = new Date(`${date}T00:00:00Z`).getTime() + (hh * 60 + mm - 300) * 60_000;
  return new Date(utcMs).toISOString();
}

export function parseHHMMToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr.trim())) return null;
  const [hh, mm] = timeStr.trim().split(':').map(Number);
  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function calculateWorkedMinutesFromHHMM(
  checkInHHMM: string | null | undefined,
  checkOutHHMM: string | null | undefined
): number | null {
  const inMin = parseHHMMToMinutes(checkInHHMM);
  const outMin = parseHHMMToMinutes(checkOutHHMM);
  if (inMin === null || outMin === null || outMin <= inMin) return null;
  return outMin - inMin;
}

export function formatWorkedDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return '—';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h 00m`;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

export function formatIsoToKarachi12H(iso: string | null | undefined): string {
  if (!iso) return '—';
  const hhmm = isoToKarachiHHMM(iso);
  const total = parseHHMMToMinutes(hhmm);
  if (total === null) return '—';
  const hh24 = Math.floor(total / 60);
  const mm = total % 60;
  const period = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
}

// ─── Constants & Types ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<AttendanceStatusType, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  HALF_DAY: 'Half Day',
  LEAVE: 'On Leave',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly Off',
  NOT_MARKED: 'Not Marked',
};

const ALL_STATUS_OPTIONS: AttendanceStatusType[] = [
  'PRESENT',
  'LATE',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
  'NOT_MARKED',
];

const MARKABLE_STATUS_OPTIONS: Exclude<AttendanceStatusType, 'NOT_MARKED'>[] = [
  'PRESENT',
  'LATE',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
];

const NON_WORKING_SET = new Set<string>(['ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKLY_OFF']);

type RegisterViewMode = 'daily' | 'leave' | 'weekly' | 'monthly' | 'history';
type CheckInFilterType = 'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN';
type CheckOutFilterType = 'ALL' | 'CHECKED_OUT' | 'NOT_CHECKED_OUT' | 'OPEN_SHIFT';
type BulkScopeType = 'SELECTED' | 'VISIBLE_FILTERED' | 'ALL_ELIGIBLE';

interface BulkPreviewRow {
  user_id: string;
  employee_code: string;
  full_name: string;
  branch_name: string | null;
  currentStatus: AttendanceStatusType;
  currentCheckInHHMM: string | null;
  currentCheckOutHHMM: string | null;
  proposedStatus: Exclude<AttendanceStatusType, 'NOT_MARKED'>;
  proposedCheckInHHMM: string | null;
  proposedCheckOutHHMM: string | null;
  willSkip: boolean;
  skipReason?: string;
}

function deriveClientSummary(rows: DailyRegisterEmployeeRow[]): DailyRegisterSummary {
  let present = 0,
    late = 0,
    absent = 0,
    on_leave = 0,
    half_day = 0,
    holiday_or_off = 0,
    not_marked = 0,
    checked_in_open = 0,
    checked_out_complete = 0;

  for (const r of rows) {
    if (r.status === 'PRESENT') present++;
    else if (r.status === 'LATE') late++;
    else if (r.status === 'ABSENT') absent++;
    else if (r.status === 'LEAVE') on_leave++;
    else if (r.status === 'HALF_DAY') half_day++;
    else if (r.status === 'HOLIDAY' || r.status === 'WEEKLY_OFF') holiday_or_off++;
    else not_marked++;

    if (r.check_in_at && !r.check_out_at) checked_in_open++;
    if (r.check_in_at && r.check_out_at) checked_out_complete++;
  }

  return {
    total_employees: rows.length,
    present,
    late,
    absent,
    on_leave,
    half_day,
    holiday_or_off,
    not_marked,
    checked_in_open,
    checked_out_complete,
  };
}

// ─── Main Daily Attendance & Leave Page Component ─────────────────────────────

export const DailyAttendanceAndLeavePage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const { branches } = useBranches();

  const todayCanonical = useMemo(() => getKarachiTodayCanonical(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayCanonical);
  const [viewMode, setViewMode] = useState<RegisterViewMode>('daily');

  // Filter States
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilterType>('ALL');
  const [checkOutFilter, setCheckOutFilter] = useState<CheckOutFilterType>('ALL');

  const effectiveBranchParam = useMemo(() => {
    if (!isOrgAdmin) return user?.shopId ?? null;
    return branchFilter === 'ALL' ? null : branchFilter;
  }, [isOrgAdmin, branchFilter, user?.shopId]);

  // Active HR Policy resolution (safe guard: pass undefined when branch_id is absent)
  const { data: allPolicies = [] } = useHRPolicies();
  const { data: branchEffectivePolicy } = useEffectiveHRPolicy(
    effectiveBranchParam || undefined,
    selectedDate
  );

  const activePolicyRules = useMemo(() => {
    const resolved =
      branchEffectivePolicy?.policy ??
      allPolicies.find((p) => p.branch_id === null && p.effective_to === null) ??
      allPolicies[0];
    return {
      shiftMinutes: Number(resolved?.standard_shift_minutes ?? 660),
      lateThresholdMinutes: Number(resolved?.late_threshold_minutes ?? 20),
      latesForAbsence: Number(resolved?.lates_for_absence ?? 3),
    };
  }, [branchEffectivePolicy, allPolicies]);

  // Live Daily Register Query
  const {
    data: dailyRegister,
    isLoading: isLoadingRegister,
    isError: isErrorRegister,
    error: registerError,
    refetch: refetchRegister,
  } = useDailyAttendanceRegister(selectedDate, effectiveBranchParam);

  // Weekly Dates (Mon–Sun)
  const weekDates = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dow = dt.getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mondayCanonical = addDaysCanonical(selectedDate, mondayOffset);
    return Array.from({ length: 7 }, (_, i) => addDaysCanonical(mondayCanonical, i));
  }, [selectedDate]);

  // Monthly Dates (1st–last of selectedDate's month)
  const monthDates = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return Array.from({ length: daysInMonth }, (_, i) => `${y}-${mm}-${String(i + 1).padStart(2, '0')}`);
  }, [selectedDate]);

  // Historical 14-day window ending on selectedDate
  const historyDates = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDaysCanonical(selectedDate, -i));
  }, [selectedDate]);

  const rangeStart = useMemo(() => {
    if (viewMode === 'weekly') return weekDates[0];
    if (viewMode === 'monthly' || viewMode === 'leave') return monthDates[0];
    if (viewMode === 'history') return historyDates[historyDates.length - 1];
    return selectedDate;
  }, [viewMode, weekDates, monthDates, historyDates, selectedDate]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'weekly') return weekDates[6];
    if (viewMode === 'monthly' || viewMode === 'leave') return monthDates[monthDates.length - 1];
    if (viewMode === 'history') return historyDates[0];
    return selectedDate;
  }, [viewMode, weekDates, monthDates, historyDates, selectedDate]);

  const {
    data: rangeData,
    isLoading: isLoadingRange,
    isError: isErrorRange,
    error: rangeError,
  } = useAttendanceRange(rangeStart, rangeEnd, effectiveBranchParam, viewMode !== 'daily');

  const bulkMarkMutation = useBulkMarkAttendance();
  const absenceProcessMutation = useTriggerAbsenceProcess();

  // Notification banner & Absence confirm dialog
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [absenceConfirmOpen, setAbsenceConfirmOpen] = useState(false);

  // Selected rows & Inline draft state
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [quickMarkingUserId, setQuickMarkingUserId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{
    userId: string;
    action: 'CHECK_IN' | 'CHECK_OUT';
    timeValue: string;
    statusOverride?: Exclude<AttendanceStatusType, 'NOT_MARKED'>;
    notes: string;
    error: string | null;
    isSaving: boolean;
  } | null>(null);

  const showFeedback = useCallback(
    (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
      setBannerNotice({ message, type });
    },
    []
  );

  const invalidateAttendanceCaches = useCallback(
    async (targetUserId?: string, dateStr: string = selectedDate) => {
      const [yearStr, monthStr] = dateStr.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hr', 'attendance-register'] }),
        queryClient.invalidateQueries({ queryKey: ['hr', 'attendance-range'] }),
        targetUserId
          ? queryClient.invalidateQueries({ queryKey: ['hr', 'attendance', targetUserId, month, year] })
          : Promise.resolve(),
        targetUserId
          ? queryClient.invalidateQueries({ queryKey: ['hr', 'annual-summary', targetUserId, year] })
          : Promise.resolve(),
      ]);
    },
    [queryClient, selectedDate]
  );

  // Never carry over previous day's unsaved draft/selection on date switch
  const handleSelectDate = useCallback((newDateKey: string) => {
    if (!newDateKey || !/^\d{4}-\d{2}-\d{2}$/.test(newDateKey)) return;
    setSelectedDate(newDateKey);
    setSelectedEmployeeIds(new Set());
    setInlineDraft(null);
  }, []);

  const clearAllFilters = () => {
    setSearchQuery('');
    if (isOrgAdmin) setBranchFilter('ALL');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setCheckInFilter('ALL');
    setCheckOutFilter('ALL');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    (isOrgAdmin && branchFilter !== 'ALL') ||
    roleFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    checkInFilter !== 'ALL' ||
    checkOutFilter !== 'ALL';

  const branchScopedRows = useMemo(() => dailyRegister?.rows ?? [], [dailyRegister]);

  const filteredRows = useMemo(() => {
    return branchScopedRows.filter((row) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (
          !row.full_name.toLowerCase().includes(q) &&
          !row.employee_code.toLowerCase().includes(q) &&
          !row.role.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (roleFilter !== 'ALL' && row.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;

      if (checkInFilter === 'CHECKED_IN' && !row.check_in_at) return false;
      if (checkInFilter === 'NOT_CHECKED_IN' && row.check_in_at) return false;

      if (checkOutFilter === 'CHECKED_OUT' && !row.check_out_at) return false;
      if (checkOutFilter === 'NOT_CHECKED_OUT' && row.check_out_at) return false;
      if (checkOutFilter === 'OPEN_SHIFT' && (!row.check_in_at || row.check_out_at)) return false;

      return true;
    });
  }, [branchScopedRows, searchQuery, roleFilter, statusFilter, checkInFilter, checkOutFilter]);

  const registerSummary = useMemo(
    () => dailyRegister?.summary ?? deriveClientSummary(branchScopedRows),
    [dailyRegister, branchScopedRows]
  );

  const attendanceRatePct = useMemo(() => {
    if (!registerSummary.total_employees) return 0;
    const attended =
      registerSummary.present + registerSummary.late + registerSummary.half_day;
    return Math.round((attended / registerSummary.total_employees) * 100);
  }, [registerSummary]);

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const r of branchScopedRows) if (r.role) set.add(r.role);
    return Array.from(set);
  }, [branchScopedRows]);

  // ─── Quick Status Mark Handler ─────────────────────────────────────────────

  const handleQuickMarkStatus = async (
    row: DailyRegisterEmployeeRow,
    nextStatus: Exclude<AttendanceStatusType, 'NOT_MARKED'>
  ) => {
    setQuickMarkingUserId(row.user_id);
    try {
      const isNonWorking = NON_WORKING_SET.has(nextStatus);
      await markStaffAttendance({
        staffId: row.user_id,
        attendance_date: selectedDate,
        status: nextStatus,
        check_in_at: isNonWorking ? null : row.check_in_at ?? karachiHHMMToIso(selectedDate, getKarachiCurrentTimeHHMM()),
        check_out_at: isNonWorking ? null : row.check_out_at ?? null,
        notes: row.notes ?? `Marked ${STATUS_LABELS[nextStatus]}`,
      });
      await invalidateAttendanceCaches(row.user_id, selectedDate);
      showFeedback(`Updated ${row.full_name} → ${STATUS_LABELS[nextStatus]}.`, 'success');
    } catch (err: any) {
      showFeedback(
        err?.response?.data?.error || err?.message || `Failed to update status for ${row.full_name}`,
        'error'
      );
    } finally {
      setQuickMarkingUserId(null);
    }
  };

  // ─── Inline Check-In / Check-Out Handlers ──────────────────────────────────

  const startInlineCheckIn = (row: DailyRegisterEmployeeRow) => {
    setInlineDraft({
      userId: row.user_id,
      action: 'CHECK_IN',
      timeValue: getKarachiCurrentTimeHHMM(),
      statusOverride: 'PRESENT',
      notes: row.notes || '',
      error: null,
      isSaving: false,
    });
  };

  const startInlineCheckOut = (row: DailyRegisterEmployeeRow) => {
    if (!row.check_in_at) {
      showFeedback(
        `Cannot Check Out ${row.full_name} before Check In is recorded. Record Check In first or open Edit.`,
        'warning'
      );
      return;
    }
    const defaultTime = getKarachiCurrentTimeHHMM();
    const inHHMM = isoToKarachiHHMM(row.check_in_at);
    const inMin = parseHHMMToMinutes(inHHMM);
    const outMin = parseHHMMToMinutes(defaultTime);
    let safeDefault = defaultTime;
    if (inMin !== null && (outMin === null || outMin <= inMin)) {
      const clampedEnd = Math.min(23 * 60 + 59, inMin + 60);
      safeDefault = `${String(Math.floor(clampedEnd / 60)).padStart(2, '0')}:${String(
        clampedEnd % 60
      ).padStart(2, '0')}`;
    }

    setInlineDraft({
      userId: row.user_id,
      action: 'CHECK_OUT',
      timeValue: safeDefault,
      notes: row.notes || '',
      error: null,
      isSaving: false,
    });
  };

  const commitInlineDraft = async (row: DailyRegisterEmployeeRow) => {
    if (!inlineDraft || inlineDraft.userId !== row.user_id || inlineDraft.isSaving) return;

    const parsedTime = parseHHMMToMinutes(inlineDraft.timeValue);
    if (parsedTime === null) {
      setInlineDraft({ ...inlineDraft, error: 'Enter a valid 24-hour time (HH:mm).' });
      return;
    }

    if (inlineDraft.action === 'CHECK_IN') {
      const existingOutHHMM = isoToKarachiHHMM(row.check_out_at);
      if (existingOutHHMM) {
        const outMin = parseHHMMToMinutes(existingOutHHMM);
        if (outMin !== null && parsedTime >= outMin) {
          setInlineDraft({
            ...inlineDraft,
            error: `Check-in (${inlineDraft.timeValue}) must be earlier than check-out (${existingOutHHMM}).`,
          });
          return;
        }
      }

      const checkInIso = karachiHHMMToIso(selectedDate, inlineDraft.timeValue);
      const nextStatus = inlineDraft.statusOverride ?? 'PRESENT';

      setInlineDraft({ ...inlineDraft, isSaving: true, error: null });
      try {
        await markStaffAttendance({
          staffId: row.user_id,
          attendance_date: selectedDate,
          status: nextStatus,
          check_in_at: checkInIso,
          check_out_at: row.check_out_at,
          notes: inlineDraft.notes.trim() || null,
        });
        await invalidateAttendanceCaches(row.user_id, selectedDate);
        setInlineDraft(null);
        showFeedback(`Check-In saved for ${row.full_name} (${inlineDraft.timeValue}).`, 'success');
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Failed to save Check-In';
        setInlineDraft((prev) => (prev ? { ...prev, isSaving: false, error: msg } : null));
      }
    } else {
      const inHHMM = isoToKarachiHHMM(row.check_in_at);
      const inMin = parseHHMMToMinutes(inHHMM);
      if (inMin === null || !row.check_in_at) {
        setInlineDraft({ ...inlineDraft, error: 'Valid Check-In time is required before Check-Out.' });
        return;
      }
      if (parsedTime <= inMin) {
        setInlineDraft({
          ...inlineDraft,
          error: `Check-out (${inlineDraft.timeValue}) must be strictly later than Check-in (${inHHMM}).`,
        });
        return;
      }

      const checkOutIso = karachiHHMMToIso(selectedDate, inlineDraft.timeValue);
      setInlineDraft({ ...inlineDraft, isSaving: true, error: null });
      try {
        if (row.record_id) {
          await updateStaffAttendance({
            staffId: row.user_id,
            recordId: row.record_id,
            check_out_at: checkOutIso,
            notes: inlineDraft.notes.trim() || null,
          });
        } else {
          await markStaffAttendance({
            staffId: row.user_id,
            attendance_date: selectedDate,
            status: row.status === 'NOT_MARKED' ? 'PRESENT' : row.status,
            check_in_at: row.check_in_at,
            check_out_at: checkOutIso,
            notes: inlineDraft.notes.trim() || null,
          });
        }
        await invalidateAttendanceCaches(row.user_id, selectedDate);
        setInlineDraft(null);
        showFeedback(`Check-Out saved for ${row.full_name} (${inlineDraft.timeValue}).`, 'success');
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Failed to save Check-Out';
        setInlineDraft((prev) => (prev ? { ...prev, isSaving: false, error: msg } : null));
      }
    }
  };

  // ─── Manual Edit Drawer State ──────────────────────────────────────────────

  const [editingRow, setEditingRow] = useState<DailyRegisterEmployeeRow | null>(null);
  const [editStatus, setEditStatus] = useState<Exclude<AttendanceStatusType, 'NOT_MARKED'>>('PRESENT');
  const [editCheckIn, setEditCheckIn] = useState<string>('');
  const [editCheckOut, setEditCheckOut] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editValidationError, setEditValidationError] = useState<string | null>(null);
  const [isSavingManualEdit, setIsSavingManualEdit] = useState<boolean>(false);

  const openEditDrawer = (row: DailyRegisterEmployeeRow) => {
    setEditingRow(row);
    setEditStatus(row.status === 'NOT_MARKED' ? 'PRESENT' : row.status);
    setEditCheckIn(isoToKarachiHHMM(row.check_in_at));
    setEditCheckOut(isoToKarachiHHMM(row.check_out_at));
    setEditNotes(row.notes ?? '');
    setEditValidationError(null);
  };

  const handleSaveManualEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow || isSavingManualEdit) return;

    const cleanIn = editCheckIn.trim() || null;
    const cleanOut = editCheckOut.trim() || null;
    const isNonWorking = NON_WORKING_SET.has(editStatus);

    if (!isNonWorking) {
      if (cleanIn && parseHHMMToMinutes(cleanIn) === null) {
        setEditValidationError('Check-in time must be in valid HH:mm format.');
        return;
      }
      if (cleanOut && parseHHMMToMinutes(cleanOut) === null) {
        setEditValidationError('Check-out time must be in valid HH:mm format.');
        return;
      }
      if (cleanOut && !cleanIn) {
        setEditValidationError('Cannot record a Check-out time without a Check-in time.');
        return;
      }
      if (cleanIn && cleanOut) {
        const inM = parseHHMMToMinutes(cleanIn)!;
        const outM = parseHHMMToMinutes(cleanOut)!;
        if (outM <= inM) {
          setEditValidationError(
            `Check-out time (${cleanOut}) must be strictly later than Check-in time (${cleanIn}).`
          );
          return;
        }
      }
    }

    const checkInIso = isNonWorking ? null : karachiHHMMToIso(editingRow.attendance_date, cleanIn);
    const checkOutIso = isNonWorking ? null : karachiHHMMToIso(editingRow.attendance_date, cleanOut);

    setIsSavingManualEdit(true);
    setEditValidationError(null);

    try {
      await markStaffAttendance({
        staffId: editingRow.user_id,
        attendance_date: editingRow.attendance_date,
        status: editStatus,
        check_in_at: checkInIso,
        check_out_at: checkOutIso,
        notes: editNotes.trim() || null,
      });

      await invalidateAttendanceCaches(editingRow.user_id, editingRow.attendance_date);
      showFeedback(`Attendance record saved for ${editingRow.full_name}.`, 'success');
      setEditingRow(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save attendance record';
      setEditValidationError(msg);
    } finally {
      setIsSavingManualEdit(false);
    }
  };

  // ─── Full Staff Profile Drawer ─────────────────────────────────────────────

  const [profileStaff, setProfileStaff] = useState<BackendStaffMember | null>(null);

  const openFullProfileDrawer = (row: DailyRegisterEmployeeRow) => {
    setProfileStaff({
      user_id: row.user_id,
      username: row.username,
      full_name: row.full_name,
      email: null,
      role: row.role,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      is_active: true,
      created_at: '',
    });
  };

  // ─── Bulk Correction Modal ─────────────────────────────────────────────────

  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkScope, setBulkScope] = useState<BulkScopeType>('SELECTED');
  const [bulkStatus, setBulkStatus] = useState<Exclude<AttendanceStatusType, 'NOT_MARKED'>>('PRESENT');
  const [bulkApplyCheckIn, setBulkApplyCheckIn] = useState<boolean>(true);
  const [bulkCheckInTime, setBulkCheckInTime] = useState<string>('09:30');
  const [bulkApplyCheckOut, setBulkApplyCheckOut] = useState<boolean>(false);
  const [bulkCheckOutTime, setBulkCheckOutTime] = useState<string>('20:30');
  const [bulkOverwriteExisting, setBulkOverwriteExisting] = useState<boolean>(false);
  const [bulkNotes, setBulkNotes] = useState<string>('Bulk attendance update');
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingRow && !isSavingManualEdit) {
        setEditingRow(null);
      } else if (isBulkModalOpen && !bulkMarkMutation.isPending) {
        setIsBulkModalOpen(false);
      }
    };
    if (editingRow || isBulkModalOpen) {
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [editingRow, isSavingManualEdit, isBulkModalOpen, bulkMarkMutation.isPending]);

  const toggleSelectEmployee = (userId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredRows.map((r) => r.user_id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedEmployeeIds.has(id));
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const bulkTargetRows = useMemo(() => {
    if (bulkScope === 'SELECTED') {
      return branchScopedRows.filter((r) => selectedEmployeeIds.has(r.user_id));
    }
    if (bulkScope === 'VISIBLE_FILTERED') {
      return filteredRows;
    }
    return branchScopedRows;
  }, [bulkScope, branchScopedRows, filteredRows, selectedEmployeeIds]);

  const bulkPreviewItems: BulkPreviewRow[] = useMemo(() => {
    const isTargetNonWorking = NON_WORKING_SET.has(bulkStatus);

    return bulkTargetRows.map((row) => {
      const curInHHMM = isoToKarachiHHMM(row.check_in_at) || null;
      const curOutHHMM = isoToKarachiHHMM(row.check_out_at) || null;
      const hasExistingRecord = row.status !== 'NOT_MARKED' || Boolean(row.record_id);

      if (hasExistingRecord && !bulkOverwriteExisting) {
        return {
          user_id: row.user_id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          branch_name: row.branch_name,
          currentStatus: row.status,
          currentCheckInHHMM: curInHHMM,
          currentCheckOutHHMM: curOutHHMM,
          proposedStatus: bulkStatus,
          proposedCheckInHHMM: curInHHMM,
          proposedCheckOutHHMM: curOutHHMM,
          willSkip: true,
          skipReason: 'Already marked (enable overwrite to update)',
        };
      }

      const nextIn = isTargetNonWorking ? null : bulkApplyCheckIn ? bulkCheckInTime : curInHHMM;
      const nextOut = isTargetNonWorking ? null : bulkApplyCheckOut ? bulkCheckOutTime : curOutHHMM;

      if (nextIn && nextOut) {
        const inM = parseHHMMToMinutes(nextIn);
        const outM = parseHHMMToMinutes(nextOut);
        if (inM !== null && outM !== null && outM <= inM) {
          return {
            user_id: row.user_id,
            employee_code: row.employee_code,
            full_name: row.full_name,
            branch_name: row.branch_name,
            currentStatus: row.status,
            currentCheckInHHMM: curInHHMM,
            currentCheckOutHHMM: curOutHHMM,
            proposedStatus: bulkStatus,
            proposedCheckInHHMM: nextIn,
            proposedCheckOutHHMM: nextOut,
            willSkip: true,
            skipReason: `Invalid time order (${nextIn} to ${nextOut})`,
          };
        }
      }

      if (!isTargetNonWorking && nextOut && !nextIn) {
        return {
          user_id: row.user_id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          branch_name: row.branch_name,
          currentStatus: row.status,
          currentCheckInHHMM: curInHHMM,
          currentCheckOutHHMM: curOutHHMM,
          proposedStatus: bulkStatus,
          proposedCheckInHHMM: nextIn,
          proposedCheckOutHHMM: nextOut,
          willSkip: true,
          skipReason: 'Cannot set Check-Out without Check-In',
        };
      }

      return {
        user_id: row.user_id,
        employee_code: row.employee_code,
        full_name: row.full_name,
        branch_name: row.branch_name,
        currentStatus: row.status,
        currentCheckInHHMM: curInHHMM,
        currentCheckOutHHMM: curOutHHMM,
        proposedStatus: bulkStatus,
        proposedCheckInHHMM: nextIn,
        proposedCheckOutHHMM: nextOut,
        willSkip: false,
      };
    });
  }, [
    bulkTargetRows,
    bulkStatus,
    bulkApplyCheckIn,
    bulkCheckInTime,
    bulkApplyCheckOut,
    bulkCheckOutTime,
    bulkOverwriteExisting,
  ]);

  const handleConfirmBulkCorrection = async () => {
    setBulkError(null);
    const actionable = bulkPreviewItems.filter((i) => !i.willSkip);
    if (actionable.length === 0) {
      setBulkError('No eligible employees to update. Adjust your selection or enable overwrite.');
      return;
    }

    try {
      const itemsPayload = actionable.map((item) => ({
        user_id: item.user_id,
        status: item.proposedStatus,
        check_in_at: karachiHHMMToIso(selectedDate, item.proposedCheckInHHMM),
        check_out_at: karachiHHMMToIso(selectedDate, item.proposedCheckOutHHMM),
        notes: bulkNotes.trim() || null,
      }));

      const res = await bulkMarkMutation.mutateAsync({
        date: selectedDate,
        items: itemsPayload,
        overwrite_existing: bulkOverwriteExisting,
      });

      setIsBulkModalOpen(false);
      setSelectedEmployeeIds(new Set());
      showFeedback(
        `Bulk update committed: ${res.updated_count} updated, ${res.skipped_count} skipped.`,
        'success'
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Bulk attendance update failed';
      setBulkError(msg);
    }
  };

  // ─── Absence Process Action (Uses HRConfirmDialog) ─────────────────────────

  const isSelectedPastDate = selectedDate < todayCanonical;

  const handleConfirmAbsenceProcess = async () => {
    if (!isOrgAdmin) return;
    try {
      const res = await absenceProcessMutation.mutateAsync(isSelectedPastDate ? selectedDate : null);
      setAbsenceConfirmOpen(false);
      if (res.result) {
        showFeedback(
          `Absence processing complete for ${res.result.date}: ${res.result.absencesMarked} absence(s) marked across ${res.result.processedUsers} eligible staff.`,
          'success'
        );
      } else if (res.results) {
        const totalMarked = res.results.reduce((acc, r) => acc + r.absencesMarked, 0);
        showFeedback(`7-day absence backfill complete: ${totalMarked} absence(s) marked.`, 'success');
      }
    } catch (err: any) {
      setAbsenceConfirmOpen(false);
      const msg = err?.response?.data?.error || err?.message || 'Absence processing failed';
      showFeedback(msg, 'error');
    }
  };

  // Range lookup map
  const rangeRecordMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof rangeData>['records'][number]>();
    if (!rangeData?.records) return map;
    for (const r of rangeData.records) {
      map.set(`${r.user_id}_${r.attendance_date.slice(0, 10)}`, r);
    }
    return map;
  }, [rangeData]);

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedEmployeeIds.has(r.user_id));

  const monthLabel = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [selectedDate]);

  return (
    <div className="space-y-5">
      {/* Feedback Banner */}
      {bannerNotice && (
        <HRBanner
          type={bannerNotice.type}
          message={bannerNotice.message}
          onDismiss={() => setBannerNotice(null)}
        />
      )}

      {/* A. 6-Card Attendance Overview */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatDateWithWeekday(selectedDate)}
            </span>
            <span>·</span>
            <span>
              {!isOrgAdmin
                ? branches.find((b) => b.id === user?.shopId)?.name || 'My Branch'
                : branchFilter === 'ALL'
                ? 'All Authorized Branches'
                : branches.find((b) => b.id === branchFilter)?.name || 'Selected Branch'}
            </span>
            {selectedDate === todayCanonical && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800 text-[10px] font-semibold uppercase tracking-wide">
                Today (PKT)
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Policy: {(activePolicyRules.shiftMinutes / 60).toFixed(1)}h shift · {activePolicyRules.lateThresholdMinutes}m late grace · {activePolicyRules.latesForAbsence} lates = 1 absent
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <HRStatCard
            label="Total Active Staff"
            value={registerSummary.total_employees}
            subtext={`${registerSummary.not_marked} awaiting entry`}
            icon={<UserCheck className="w-4 h-4" />}
            tone="teal"
            loading={isLoadingRegister}
            active={statusFilter === 'ALL'}
            onClick={() => {
              setStatusFilter('ALL');
              setViewMode('daily');
            }}
          />
          <HRStatCard
            label={selectedDate === todayCanonical ? 'Present Today' : 'Present'}
            value={registerSummary.present}
            subtext={`${registerSummary.checked_in_open} on shift · ${registerSummary.half_day} half-day`}
            icon={<CheckCircle2 className="w-4 h-4" />}
            tone="emerald"
            loading={isLoadingRegister}
            active={statusFilter === 'PRESENT'}
            onClick={() => {
              setStatusFilter((prev) => (prev === 'PRESENT' ? 'ALL' : 'PRESENT'));
              setViewMode('daily');
            }}
          />
          <HRStatCard
            label={selectedDate === todayCanonical ? 'Absent Today' : 'Absent'}
            value={registerSummary.absent}
            subtext={`Unmarked: ${registerSummary.not_marked}`}
            icon={<XCircle className="w-4 h-4" />}
            tone="rose"
            loading={isLoadingRegister}
            active={statusFilter === 'ABSENT'}
            onClick={() => {
              setStatusFilter((prev) => (prev === 'ABSENT' ? 'ALL' : 'ABSENT'));
              setViewMode('daily');
            }}
          />
          <HRStatCard
            label="Late Arrivals"
            value={registerSummary.late}
            subtext={`>${activePolicyRules.lateThresholdMinutes}m threshold`}
            icon={<Clock className="w-4 h-4" />}
            tone="amber"
            loading={isLoadingRegister}
            active={statusFilter === 'LATE'}
            onClick={() => {
              setStatusFilter((prev) => (prev === 'LATE' ? 'ALL' : 'LATE'));
              setViewMode('daily');
            }}
          />
          <HRStatCard
            label="On Leave"
            value={registerSummary.on_leave}
            subtext={`Off/Holiday: ${registerSummary.holiday_or_off}`}
            icon={<Coffee className="w-4 h-4" />}
            tone="violet"
            loading={isLoadingRegister}
            active={statusFilter === 'LEAVE'}
            onClick={() => {
              setStatusFilter((prev) => (prev === 'LEAVE' ? 'ALL' : 'LEAVE'));
              setViewMode('daily');
            }}
          />
          <HRStatCard
            label="Attendance Rate"
            value={`${attendanceRatePct}%`}
            subtext={`${registerSummary.present + registerSummary.late + registerSummary.half_day} attended of ${registerSummary.total_employees}`}
            icon={<Percent className="w-4 h-4" />}
            tone="sky"
            loading={isLoadingRegister}
          />
        </div>
      </div>

      {/* B. Operational Controls & Sub-View Navigation */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Date Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectDate(addDaysCanonical(selectedDate, -1))}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>

            <button
              type="button"
              onClick={() => handleSelectDate(todayCanonical)}
              disabled={selectedDate === todayCanonical}
              className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedDate === todayCanonical
                  ? 'bg-[#006970] text-white border-[#006970] cursor-default'
                  : 'bg-white dark:bg-slate-800 text-[#006970] dark:text-[#33c9cf] border-[#006970]/40 hover:bg-teal-50 dark:hover:bg-teal-950/30 cursor-pointer'
              }`}
            >
              Today ({formatCanonicalToMMDDYYYY(todayCanonical)})
            </button>

            <button
              type="button"
              onClick={() => handleSelectDate(addDaysCanonical(selectedDate, 1))}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 h-9 bg-slate-50 dark:bg-slate-800 px-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                aria-label="Select attendance register date"
                value={selectedDate}
                onChange={(e) => handleSelectDate(e.target.value)}
                className="text-xs font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              />
            </div>

            {isOrgAdmin ? (
              <div className="flex items-center gap-1.5 h-9 bg-slate-50 dark:bg-slate-800 px-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <select
                  aria-label="Filter by branch"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="text-xs font-semibold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Branches ({branches.length})</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Shield className="w-3.5 h-3.5" /> Assigned Branch
              </span>
            )}
          </div>

          {/* Primary Operational Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refetchRegister()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRegister ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {isOrgAdmin && (
              <button
                type="button"
                disabled={absenceProcessMutation.isPending}
                onClick={() => setAbsenceConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Process Absences
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setBulkScope(selectedEmployeeIds.size > 0 ? 'SELECTED' : 'VISIBLE_FILTERED');
                setBulkError(null);
                setIsBulkModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Bulk Correction
              {selectedEmployeeIds.size > 0 && (
                <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[10px] tabular-nums">
                  {selectedEmployeeIds.size}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Sub-view Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl w-fit max-w-full overflow-x-auto">
          {(
            [
              { id: 'daily', label: 'Daily Register', icon: FileSpreadsheet },
              { id: 'leave', label: 'Leave Management', icon: Coffee },
              { id: 'weekly', label: 'Weekly View', icon: CalendarRange },
              { id: 'monthly', label: 'Monthly View', icon: CalendarDays },
              { id: 'history', label: 'Historical (14d)', icon: History },
            ] as Array<{ id: RegisterViewMode; label: string; icon: React.ElementType }>
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                viewMode === id
                  ? 'bg-white dark:bg-slate-900 text-[#006970] dark:text-[#33c9cf] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* API Error Banner */}
      {isErrorRegister && (
        <HRBanner
          type="error"
          message={
            (registerError as any)?.response?.data?.error ||
            (registerError as Error)?.message ||
            'Failed to load Daily Attendance Register from PostgreSQL.'
          }
        />
      )}

      {/* ─── VIEW 1: DAILY ATTENDANCE REGISTER + RECENT ACTIVITY ─────────────── */}
      {viewMode === 'daily' && (
        <div className="space-y-5">
          {/* Search & Filter Toolbar */}
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Filter className="w-3.5 h-3.5 text-[#006970] dark:text-[#33c9cf]" />
                <span>Filter Register Sheet</span>
                {hasActiveFilters && (
                  <span className="text-[11px] font-medium text-[#006970] dark:text-[#33c9cf]">
                    ({filteredRows.length} of {branchScopedRows.length} shown)
                  </span>
                )}
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search employee by name, code or designation"
                  placeholder="Search name, staff ID (e.g. NMM-001), or role…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#006970]/25"
                />
              </div>

              <select
                aria-label="Filter by role or designation"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Designations</option>
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by attendance status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Statuses</option>
                {ALL_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by check-in status"
                value={checkInFilter}
                onChange={(e) => setCheckInFilter(e.target.value as CheckInFilterType)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">Check-In: All</option>
                <option value="CHECKED_IN">Checked In</option>
                <option value="NOT_CHECKED_IN">Not Checked In</option>
              </select>

              <select
                aria-label="Filter by check-out status"
                value={checkOutFilter}
                onChange={(e) => setCheckOutFilter(e.target.value as CheckOutFilterType)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">Check-Out: All</option>
                <option value="CHECKED_OUT">Checked Out</option>
                <option value="OPEN_SHIFT">On Active Shift</option>
                <option value="NOT_CHECKED_OUT">No Check-Out</option>
              </select>
            </div>
          </div>

          {/* Daily Register Table */}
          <HRSectionCard
            title={`Employee Attendance Register — ${formatCanonicalToMMDDYYYY(selectedDate)}`}
            subtitle="Mark check-in/out times, quick statuses, or edit historical time adjustments"
            badge={
              selectedEmployeeIds.size > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf]">
                  {selectedEmployeeIds.size} selected
                </span>
              ) : undefined
            }
            actions={
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Showing <strong className="text-slate-800 dark:text-slate-200">{filteredRows.length}</strong> of{' '}
                <strong className="text-slate-800 dark:text-slate-200">{branchScopedRows.length}</strong>
              </span>
            }
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllVisible}
                        aria-label="Select all visible employees"
                        className="text-slate-400 hover:text-[#006970] cursor-pointer"
                      >
                        {allVisibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#006970]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-3">Employee &amp; ID</th>
                    <th className="px-3 py-3">Designation &amp; Branch</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Check-In</th>
                    <th className="px-3 py-3">Check-Out</th>
                    <th className="px-3 py-3">Worked</th>
                    <th className="px-3 py-3">Late</th>
                    <th className="px-3 py-3">Overtime</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoadingRegister ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#006970]" />
                          <span>Loading attendance register from PostgreSQL…</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6">
                        <HREmptyState
                          icon={<UserCheck className="w-5 h-5" />}
                          title={
                            branchScopedRows.length === 0
                              ? 'No active employees in selected branch scope'
                              : 'No staff match your active filter criteria'
                          }
                          action={
                            hasActiveFilters ? (
                              <button
                                type="button"
                                onClick={clearAllFilters}
                                className="px-3 py-1.5 rounded-lg bg-[#006970] text-white text-xs font-semibold cursor-pointer"
                              >
                                Reset Filters
                              </button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelected = selectedEmployeeIds.has(row.user_id);
                      const isRowDrafting = inlineDraft?.userId === row.user_id;
                      const isQuickBusy = quickMarkingUserId === row.user_id;
                      const canCheckIn = !row.check_in_at;
                      const canCheckOut = Boolean(row.check_in_at) && !row.check_out_at;

                      const shiftBaselineMins =
                        row.shift_duration_minutes || activePolicyRules.shiftMinutes;
                      const overtimeMins =
                        row.worked_minutes && row.worked_minutes > shiftBaselineMins
                          ? row.worked_minutes - shiftBaselineMins
                          : 0;

                      return (
                        <React.Fragment key={`${row.attendance_date}-${row.user_id}`}>
                          <tr
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-teal-50/40 dark:bg-teal-950/20'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/35'
                            }`}
                          >
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleSelectEmployee(row.user_id)}
                                aria-label={`Select ${row.full_name}`}
                                className="text-slate-400 hover:text-[#006970] cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#006970]" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#006970]/10 dark:bg-[#006970]/30 text-[#006970] dark:text-[#33c9cf] font-bold flex items-center justify-center text-xs shrink-0">
                                  {row.full_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => openFullProfileDrawer(row)}
                                    className="font-semibold text-sm text-slate-900 dark:text-white hover:text-[#006970] dark:hover:text-[#33c9cf] text-left cursor-pointer leading-tight"
                                  >
                                    {row.full_name}
                                  </button>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 font-mono">
                                    <span>{row.employee_code}</span>
                                    {row.notes && (
                                      <span
                                        className="font-sans text-slate-500 dark:text-slate-400 truncate max-w-[140px]"
                                        title={row.notes}
                                      >
                                        · {row.notes}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {row.role}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {row.branch_name || 'Organization Scope'}
                              </div>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <HRStatusBadge status={row.status} />
                            </td>

                            <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                              {row.check_in_at ? (
                                <div>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {formatIsoToKarachi12H(row.check_in_at)}
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    {isoToKarachiHHMM(row.check_in_at)} PKT
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                              {row.check_out_at ? (
                                <div>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {formatIsoToKarachi12H(row.check_out_at)}
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    {isoToKarachiHHMM(row.check_out_at)} PKT
                                  </span>
                                </div>
                              ) : row.check_in_at ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-sans text-[11px] font-semibold border border-sky-200/70 dark:border-sky-800">
                                  On Shift
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                              {formatWorkedDuration(row.worked_minutes)}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                              {row.late_minutes > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                                  +{row.late_minutes}m
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                              {overtimeMins > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">
                                  +{formatWorkedDuration(overtimeMins)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={!canCheckIn}
                                  onClick={() => startInlineCheckIn(row)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                    canCheckIn
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer'
                                      : 'bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                                  }`}
                                >
                                  <LogIn className="w-3 h-3" />
                                  In
                                </button>

                                <button
                                  type="button"
                                  disabled={!canCheckOut}
                                  onClick={() => startInlineCheckOut(row)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                    canCheckOut
                                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 cursor-pointer'
                                      : 'bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                                  }`}
                                >
                                  <LogOut className="w-3 h-3" />
                                  Out
                                </button>

                                <select
                                  aria-label={`Quick mark status for ${row.full_name}`}
                                  value=""
                                  disabled={isQuickBusy}
                                  onChange={(e) => {
                                    const val = e.target.value as Exclude<
                                      AttendanceStatusType,
                                      'NOT_MARKED'
                                    >;
                                    if (val) void handleQuickMarkStatus(row, val);
                                  }}
                                  className="h-7 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                                >
                                  <option value="">{isQuickBusy ? 'Saving…' : 'Mark…'}</option>
                                  <option value="PRESENT">Present</option>
                                  <option value="ABSENT">Absent</option>
                                  <option value="LEAVE">On Leave</option>
                                  <option value="HALF_DAY">Half Day</option>
                                  <option value="WEEKLY_OFF">Weekly Off</option>
                                  <option value="HOLIDAY">Holiday</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => openEditDrawer(row)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#006970]/10 dark:bg-[#006970]/30 text-[#006970] dark:text-[#33c9cf] border border-[#006970]/25 hover:bg-[#006970]/15 cursor-pointer"
                                  title="Manual Attendance & Time Correction"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openFullProfileDrawer(row)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                  title="View Full Staff Profile"
                                  aria-label={`View profile for ${row.full_name}`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Unsaved Inline Check-In / Check-Out Draft Row */}
                          {isRowDrafting && inlineDraft && (
                            <tr className="bg-teal-50/70 dark:bg-teal-950/30 border-l-4 border-l-[#006970]">
                              <td colSpan={10} className="px-4 py-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold uppercase">
                                      Unsaved {inlineDraft.action === 'CHECK_IN' ? 'Check-In' : 'Check-Out'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                      {row.full_name}
                                    </span>

                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                      <span>Time (PKT):</span>
                                      <input
                                        type="time"
                                        value={inlineDraft.timeValue}
                                        onChange={(e) =>
                                          setInlineDraft({
                                            ...inlineDraft,
                                            timeValue: e.target.value,
                                            error: null,
                                          })
                                        }
                                        className="px-2 py-1 rounded border border-[#006970] bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs"
                                      />
                                    </label>

                                    {inlineDraft.action === 'CHECK_IN' && (
                                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                        <span>Status:</span>
                                        <select
                                          value={inlineDraft.statusOverride ?? 'PRESENT'}
                                          onChange={(e) =>
                                            setInlineDraft({
                                              ...inlineDraft,
                                              statusOverride: e.target.value as Exclude<
                                                AttendanceStatusType,
                                                'NOT_MARKED'
                                              >,
                                            })
                                          }
                                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                        >
                                          <option value="PRESENT">Present</option>
                                          <option value="LATE">Late</option>
                                          <option value="HALF_DAY">Half Day</option>
                                        </select>
                                      </label>
                                    )}

                                    <input
                                      type="text"
                                      placeholder="Optional note..."
                                      value={inlineDraft.notes}
                                      onChange={(e) =>
                                        setInlineDraft({ ...inlineDraft, notes: e.target.value })
                                      }
                                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={inlineDraft.isSaving}
                                      onClick={() => void commitInlineDraft(row)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      {inlineDraft.isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                      Save {inlineDraft.action === 'CHECK_IN' ? 'Check-In' : 'Check-Out'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={inlineDraft.isSaving}
                                      onClick={() => setInlineDraft(null)}
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                                {inlineDraft.error && (
                                  <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-2 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    {inlineDraft.error}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </HRSectionCard>

          {/* C. Recent Attendance Activity Panel */}
          <HRRecentAttendanceActivity
            rows={branchScopedRows}
            selectedDate={formatCanonicalToMMDDYYYY(selectedDate)}
            format12H={formatIsoToKarachi12H}
            formatDuration={formatWorkedDuration}
            onOpenProfile={openFullProfileDrawer}
            onEditRow={openEditDrawer}
          />
        </div>
      )}

      {/* ─── VIEW 2: LEAVE MANAGEMENT SUB-VIEW ───────────────────────────────── */}
      {viewMode === 'leave' && (
        <HRLeaveManagementView
          selectedDate={selectedDate}
          monthLabel={monthLabel}
          registerRows={branchScopedRows}
          rangeData={rangeData}
          isLoadingRange={isLoadingRange}
          defaultShiftMinutes={activePolicyRules.shiftMinutes}
          defaultLateThreshold={activePolicyRules.lateThresholdMinutes}
          onRefreshCaches={invalidateAttendanceCaches}
          onEditLeaveRow={openEditDrawer}
          onOpenProfile={openFullProfileDrawer}
          formatMMDDYYYY={formatCanonicalToMMDDYYYY}
        />
      )}

      {/* ─── VIEW 3: WEEKLY ATTENDANCE MATRIX ──────────────────────────────── */}
      {viewMode === 'weekly' && (
        <HRSectionCard
          title="Weekly Attendance Matrix"
          subtitle={`Week of ${formatCanonicalToMMDDYYYY(weekDates[0])} through ${formatCanonicalToMMDDYYYY(
            weekDates[6]
          )}. Click any day cell to open its Daily Register.`}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectDate(addDaysCanonical(selectedDate, -7))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                ← Prev Week
              </button>
              <button
                type="button"
                onClick={() => handleSelectDate(addDaysCanonical(selectedDate, 7))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Next Week →
              </button>
            </div>
          }
          noPadding
        >
          {isLoadingRange ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#006970]" />
              <span>Loading weekly attendance records…</span>
            </div>
          ) : isErrorRange ? (
            <div className="p-4 text-xs text-rose-600">
              {(rangeError as any)?.message || 'Failed to load weekly attendance range.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">
                      Employee
                    </th>
                    {weekDates.map((dKey) => (
                      <th key={dKey} className="px-2.5 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectDate(dKey);
                            setViewMode('daily');
                          }}
                          className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                            dKey === selectedDate
                              ? 'bg-[#006970] text-white'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {formatCanonicalToMMDDYYYY(dKey)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(rangeData?.employees ?? []).map((emp) => (
                    <tr key={emp.user_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {emp.full_name}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {emp.employee_code} · {emp.role}
                        </span>
                      </td>
                      {weekDates.map((dKey) => {
                        const cell = rangeRecordMap.get(`${emp.user_id}_${dKey}`);
                        const st: AttendanceStatusType =
                          (cell?.status as AttendanceStatusType) ?? 'NOT_MARKED';
                        const inHHMM = isoToKarachiHHMM(cell?.check_in_at);
                        const outHHMM = isoToKarachiHHMM(cell?.check_out_at);
                        return (
                          <td key={dKey} className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectDate(dKey);
                                setViewMode('daily');
                              }}
                              className="inline-flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-85"
                            >
                              <HRStatusBadge status={st} showIcon={false} />
                              {inHHMM && (
                                <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                                  {inHHMM}
                                  {outHHMM ? `–${outHHMM}` : ''}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HRSectionCard>
      )}

      {/* ─── VIEW 4: MONTHLY ATTENDANCE ROLLUP ──────────────────────────────── */}
      {viewMode === 'monthly' && (
        <HRSectionCard
          title={`Monthly Attendance Rollup — ${monthLabel}`}
          subtitle={`Aggregated across ${monthDates.length} calendar days from live PostgreSQL records`}
          noPadding
        >
          {isLoadingRange ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#006970]" />
              <span>Loading monthly attendance rollup…</span>
            </div>
          ) : isErrorRange ? (
            <div className="p-4">
              <HRBanner
                type="error"
                message={(rangeError as any)?.message || 'Failed to load monthly attendance rollup.'}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Branch</th>
                    <th className="px-3 py-3 text-center">Present</th>
                    <th className="px-3 py-3 text-center">Late</th>
                    <th className="px-3 py-3 text-center">Absent</th>
                    <th className="px-3 py-3 text-center">Half Day</th>
                    <th className="px-3 py-3 text-center">Leave</th>
                    <th className="px-3 py-3 text-center">Off / Unmarked</th>
                    <th className="px-4 py-3 text-right">Total Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(rangeData?.employees ?? []).map((emp) => {
                    let p = 0,
                      l = 0,
                      a = 0,
                      hd = 0,
                      lv = 0,
                      other = 0,
                      workedMins = 0;

                    for (const dKey of monthDates) {
                      const r = rangeRecordMap.get(`${emp.user_id}_${dKey}`);
                      if (!r) {
                        other++;
                        continue;
                      }
                      if (r.status === 'PRESENT') p++;
                      else if (r.status === 'LATE') l++;
                      else if (r.status === 'ABSENT') a++;
                      else if (r.status === 'HALF_DAY') hd++;
                      else if (r.status === 'LEAVE') lv++;
                      else other++;
                      if (r.worked_minutes) workedMins += r.worked_minutes;
                    }

                    return (
                      <tr key={emp.user_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-500">{emp.employee_code}</td>
                        <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">
                          {emp.full_name}
                        </td>
                        <td className="px-3 py-3 text-slate-500">{emp.branch_name || '—'}</td>
                        <td className="px-3 py-3 text-center font-bold text-emerald-600 tabular-nums">{p}</td>
                        <td className="px-3 py-3 text-center font-bold text-amber-600 tabular-nums">{l}</td>
                        <td className="px-3 py-3 text-center font-bold text-rose-600 tabular-nums">{a}</td>
                        <td className="px-3 py-3 text-center font-bold text-orange-600 tabular-nums">{hd}</td>
                        <td className="px-3 py-3 text-center font-bold text-violet-600 tabular-nums">{lv}</td>
                        <td className="px-3 py-3 text-center text-slate-500 tabular-nums">{other}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                          {formatWorkedDuration(workedMins)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </HRSectionCard>
      )}

      {/* ─── VIEW 5: HISTORICAL 14-DAY REGISTERS ────────────────────────────── */}
      {viewMode === 'history' && (
        <HRSectionCard
          title="Historical Attendance Registers (Past 14 Days)"
          subtitle="Select any date card below to inspect or correct that day's PostgreSQL register"
        >
          {isLoadingRange ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#006970]" />
              <span>Loading historical attendance summary…</span>
            </div>
          ) : isErrorRange ? (
            <HRBanner
              type="error"
              message={(rangeError as any)?.message || 'Failed to load historical attendance summary.'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {historyDates.map((dKey) => {
                const emps = rangeData?.employees ?? [];
                let present = 0,
                  late = 0,
                  absent = 0,
                  onLeave = 0,
                  markedCount = 0;

                for (const emp of emps) {
                  const rec = rangeRecordMap.get(`${emp.user_id}_${dKey}`);
                  if (!rec) continue;
                  markedCount++;
                  if (rec.status === 'PRESENT') present++;
                  else if (rec.status === 'LATE') late++;
                  else if (rec.status === 'ABSENT') absent++;
                  else if (rec.status === 'LEAVE') onLeave++;
                }

                return (
                  <div
                    key={dKey}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      dKey === selectedDate
                        ? 'border-[#006970] bg-teal-50/30 dark:bg-teal-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          {formatCanonicalToMMDDYYYY(dKey)}
                        </span>
                        <p className="text-[11px] text-slate-500">{formatDateWithWeekday(dKey)}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#006970]/10 text-[#006970] dark:text-[#33c9cf] tabular-nums">
                        {markedCount}/{emps.length} Marked
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-[11px] pt-2.5 border-t border-slate-200/70 dark:border-slate-700 tabular-nums">
                      <div>
                        <span className="block text-slate-400">Present</span>
                        <strong className="text-emerald-600">{present}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Late</span>
                        <strong className="text-amber-600">{late}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Absent</span>
                        <strong className="text-rose-600">{absent}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Leave</span>
                        <strong className="text-violet-600">{onLeave}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleSelectDate(dKey);
                        setViewMode('daily');
                      }}
                      className="w-full py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#006970] dark:text-[#33c9cf] hover:bg-teal-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Open Register ({formatCanonicalToMMDDYYYY(dKey)})
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </HRSectionCard>
      )}

      {/* ─── DRAWER 1: MANUAL ATTENDANCE CORRECTION ─────────────────────────── */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Manual Attendance Correction"
            className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-y-auto"
          >
            <form onSubmit={handleSaveManualEdit} className="p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Manual Attendance Correction
                  </h3>
                  <p className="text-xs text-slate-500">
                    Date:{' '}
                    <span className="font-mono font-semibold">
                      {formatCanonicalToMMDDYYYY(editingRow.attendance_date)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close manual attendance correction drawer"
                  onClick={() => setEditingRow(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {editingRow.full_name}
                  </span>
                  <span className="font-mono font-semibold text-[#006970] dark:text-[#33c9cf]">
                    {editingRow.employee_code}
                  </span>
                </div>
                <p className="text-slate-500">
                  {editingRow.role} · {editingRow.branch_name || 'Organization Scope'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Attendance Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => {
                    const nextSt = e.target.value as Exclude<AttendanceStatusType, 'NOT_MARKED'>;
                    setEditStatus(nextSt);
                    if (NON_WORKING_SET.has(nextSt)) {
                      setEditCheckIn('');
                      setEditCheckOut('');
                    }
                    setEditValidationError(null);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  {MARKABLE_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>

              {!NON_WORKING_SET.has(editStatus) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Check-In Time (HH:mm)
                      </label>
                      <input
                        type="time"
                        value={editCheckIn}
                        onChange={(e) => {
                          setEditCheckIn(e.target.value);
                          setEditValidationError(null);
                        }}
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setEditCheckIn(getKarachiCurrentTimeHHMM())}
                        className="mt-1 text-[10px] font-semibold text-[#006970] dark:text-[#33c9cf] hover:underline cursor-pointer"
                      >
                        Set Current Time
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Check-Out Time (HH:mm)
                      </label>
                      <input
                        type="time"
                        value={editCheckOut}
                        onChange={(e) => {
                          setEditCheckOut(e.target.value);
                          setEditValidationError(null);
                        }}
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setEditCheckOut(getKarachiCurrentTimeHHMM())}
                        className="mt-1 text-[10px] font-semibold text-[#006970] dark:text-[#33c9cf] hover:underline cursor-pointer"
                      >
                        Set Current Time
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-[#006970]/25 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      Calculated Worked Duration:
                    </span>
                    <span className="font-bold text-[#006970] dark:text-[#33c9cf] tabular-nums">
                      {formatWorkedDuration(calculateWorkedMinutesFromHHMM(editCheckIn, editCheckOut))}
                    </span>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Notes / Correction Reason
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter reason for manual time adjustment or leave note…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {editValidationError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editValidationError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSavingManualEdit}
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingManualEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingManualEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Attendance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── FULL STAFF PROFILE DRAWER ──────────────────────────────────────── */}
      <StaffDetailDrawer
        open={profileStaff !== null}
        onClose={() => setProfileStaff(null)}
        staff={profileStaff}
      />

      {/* ─── ABSENCE PROCESS CONFIRMATION DIALOG ────────────────────────────── */}
      <HRConfirmDialog
        open={absenceConfirmOpen}
        title={
          isSelectedPastDate
            ? `Process Unmarked Absences for ${formatCanonicalToMMDDYYYY(selectedDate)}`
            : 'Run 7-Day Absence Backfill'
        }
        description={
          isSelectedPastDate
            ? 'Active staff with a scheduled shift on this date who have no existing attendance entry will be marked ABSENT.'
            : 'Scans the past 7 completed days up to yesterday and marks genuinely unmarked scheduled working days as ABSENT.'
        }
        details={[
          {
            label: 'Target Scope',
            value: isSelectedPastDate
              ? `Single Date (${formatCanonicalToMMDDYYYY(selectedDate)})`
              : 'Past 7 Completed Days',
          },
          { label: 'Organization Scope', value: 'All Scheduled Staff' },
          { label: 'Safety Rule', value: 'Existing Present/Leave records preserved' },
        ]}
        confirmLabel="Run Absence Processor"
        variant="warning"
        isPending={absenceProcessMutation.isPending}
        onConfirm={handleConfirmAbsenceProcess}
        onCancel={() => setAbsenceConfirmOpen(false)}
      />

      {/* ─── MODAL: BULK ATTENDANCE CORRECTION WITH PREVIEW ─────────────────── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-[1px] p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bulk Attendance Correction"
            className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Bulk Attendance Correction — {formatCanonicalToMMDDYYYY(selectedDate)}
                </h3>
                <p className="text-xs text-slate-500">
                  Review every affected employee row below before committing. Executed in one database transaction.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close bulk attendance correction modal"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    1. Target Employee Group
                  </label>
                  <select
                    value={bulkScope}
                    onChange={(e) => setBulkScope(e.target.value as BulkScopeType)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  >
                    <option value="SELECTED">
                      Selected Rows ({selectedEmployeeIds.size})
                    </option>
                    <option value="VISIBLE_FILTERED">
                      Visible Filtered Rows ({filteredRows.length})
                    </option>
                    <option value="ALL_ELIGIBLE">
                      All in Branch Scope ({branchScopedRows.length})
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    2. Target Status
                  </label>
                  <select
                    value={bulkStatus}
                    onChange={(e) =>
                      setBulkStatus(e.target.value as Exclude<AttendanceStatusType, 'NOT_MARKED'>)
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  >
                    {MARKABLE_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. Existing Records
                  </label>
                  <label className="flex items-center gap-2 pt-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkOverwriteExisting}
                      onChange={(e) => setBulkOverwriteExisting(e.target.checked)}
                    />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">
                      Overwrite already-marked records
                    </span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyCheckIn}
                      disabled={NON_WORKING_SET.has(bulkStatus)}
                      onChange={(e) => setBulkApplyCheckIn(e.target.checked)}
                    />
                    <span>Set Check-In (HH:mm)</span>
                  </label>
                  <input
                    type="time"
                    disabled={!bulkApplyCheckIn || NON_WORKING_SET.has(bulkStatus)}
                    value={bulkCheckInTime}
                    onChange={(e) => setBulkCheckInTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyCheckOut}
                      disabled={NON_WORKING_SET.has(bulkStatus)}
                      onChange={(e) => setBulkApplyCheckOut(e.target.checked)}
                    />
                    <span>Set Check-Out (HH:mm)</span>
                  </label>
                  <input
                    type="time"
                    disabled={!bulkApplyCheckOut || NON_WORKING_SET.has(bulkStatus)}
                    value={bulkCheckOutTime}
                    onChange={(e) => setBulkCheckOutTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Correction Note
                  </label>
                  <input
                    type="text"
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Confirmation Preview ({bulkPreviewItems.filter((i) => !i.willSkip).length} will update,{' '}
                  {bulkPreviewItems.filter((i) => i.willSkip).length} will be skipped)
                </h4>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Current</th>
                        <th className="px-3 py-2">Proposed</th>
                        <th className="px-3 py-2">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {bulkPreviewItems.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                            No employees in selected scope.
                          </td>
                        </tr>
                      ) : (
                        bulkPreviewItems.map((item) => (
                          <tr key={item.user_id}>
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                              {item.full_name}{' '}
                              <span className="font-mono text-[10px] text-slate-400">
                                ({item.employee_code})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 tabular-nums">
                              {STATUS_LABELS[item.currentStatus]} (
                              {item.currentCheckInHHMM ?? '—'} / {item.currentCheckOutHHMM ?? '—'})
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#006970] dark:text-[#33c9cf] tabular-nums">
                              {item.willSkip
                                ? 'Unchanged'
                                : `${STATUS_LABELS[item.proposedStatus]} (${
                                    item.proposedCheckInHHMM ?? '—'
                                  } / ${item.proposedCheckOutHHMM ?? '—'})`}
                            </td>
                            <td className="px-3 py-2">
                              {item.willSkip ? (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">
                                  Skipped: {item.skipReason}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  Will Update
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {bulkError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 font-semibold">
                  {bulkError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/30">
              <span className="text-[11px] text-slate-500">
                Commits transactionally via POST /api/v1/hr/attendance/bulk
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={bulkMarkMutation.isPending}
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkMarkMutation.isPending}
                  onClick={() => void handleConfirmBulkCorrection()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#006970] hover:bg-[#005a60] text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {bulkMarkMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm &amp; Apply ({bulkPreviewItems.filter((i) => !i.willSkip).length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
