/**
 * MonthlyAttendanceGrid — full-month calendar grid for a single staff member.
 *
 * Shows all days in the selected month as a 7-col calendar. Each cell is
 * colour-coded by attendance status and shows check-in / check-out times.
 * Clicking a cell opens the AttendanceMarkingDrawer for that date.
 */

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertCircle } from 'lucide-react';
import type { BackendAttendanceRecord } from '../types/hr.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  staffId: string;
  month: number;   // 1-12
  year: number;
  records: BackendAttendanceRecord[];
  isLoading?: boolean;
  onMonthChange: (month: number, year: number) => void;
  onDayClick: (date: string, existing?: BackendAttendanceRecord) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-PK', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi',
    });
  } catch { return '—'; }
}

function statusColors(status: string | undefined): string {
  switch (status) {
    case 'PRESENT':     return 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100';
    case 'LATE':        return 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100';
    case 'ABSENT':      return 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100';
    case 'HALF_DAY':    return 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100';
    case 'LEAVE':       return 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100';
    case 'HOLIDAY':     return 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100';
    case 'WEEKLY_OFF':  return 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400';
    default:            return 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800';
  }
}

function statusDot(status: string | undefined): string {
  switch (status) {
    case 'PRESENT':    return 'bg-emerald-500';
    case 'LATE':       return 'bg-amber-500';
    case 'ABSENT':     return 'bg-red-500';
    case 'HALF_DAY':   return 'bg-orange-500';
    case 'LEAVE':      return 'bg-purple-500';
    case 'HOLIDAY':    return 'bg-blue-500';
    case 'WEEKLY_OFF': return 'bg-gray-400';
    default:           return '';
  }
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'PRESENT':    return 'Present';
    case 'LATE':       return 'Late';
    case 'ABSENT':     return 'Absent';
    case 'HALF_DAY':   return 'Half Day';
    case 'LEAVE':      return 'Leave';
    case 'HOLIDAY':    return 'Holiday';
    case 'WEEKLY_OFF': return 'Off';
    default:           return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthlyAttendanceGrid({
  month,
  year,
  records,
  isLoading = false,
  onMonthChange,
  onDayClick,
}: Props) {
  // Map records by YYYY-MM-DD date string
  const recordMap = useMemo(() => {
    const m = new Map<string, BackendAttendanceRecord>();
    for (const r of records) {
      const dateKey = r.attendance_date?.slice(0, 10) ?? '';
      if (dateKey) m.set(dateKey, r);
    }
    return m;
  }, [records]);

  // Build calendar grid
  const { cells, totalDays } = useMemo(() => {
    const totalDays = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const cells: Array<{ day: number | null; dateStr: string }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: '' });
    for (let d = 1; d <= totalDays; d++) {
      const mm = String(month).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${year}-${mm}-${dd}` });
    }
    return { cells, totalDays };
  }, [month, year]);

  const today = new Date().toISOString().slice(0, 10);

  // Summary counts
  const counts = useMemo(() => {
    let present = 0, late = 0, absent = 0, leave = 0;
    for (const r of records) {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'ABSENT') absent++;
      else if (r.status === 'LEAVE' || r.status === 'HALF_DAY') leave++;
    }
    return { present, late, absent, leave };
  }, [records]);

  function prevMonth() {
    if (month === 1) onMonthChange(12, year - 1);
    else onMonthChange(month - 1, year);
  }
  function nextMonth() {
    if (month === 12) onMonthChange(1, year + 1);
    else onMonthChange(month + 1, year);
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white min-w-[130px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h3>
          <button
            onClick={nextMonth}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            disabled={`${year}-${String(month).padStart(2,'0')}` >= today.slice(0,7)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* Summary badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
            {counts.present}P
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
            {counts.late}L
          </span>
          <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
            {counts.absent}A
          </span>
          <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium">
            {counts.leave}Lv
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="p-3">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="text-sm text-gray-400 dark:text-gray-500">Loading attendance…</div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.day) return <div key={`empty-${idx}`} />;
              const rec = recordMap.get(cell.dateStr);
              const isToday = cell.dateStr === today;
              const isFuture = cell.dateStr > today;
              return (
                <button
                  key={cell.dateStr}
                  onClick={() => !isFuture && onDayClick(cell.dateStr, rec)}
                  disabled={isFuture}
                  className={[
                    'relative rounded-lg border p-1.5 text-left transition-all min-h-[64px]',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                    statusColors(rec?.status),
                    isToday ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
                    isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-90',
                  ].join(' ')}
                >
                  {/* Day number */}
                  <div className="flex items-start justify-between mb-0.5">
                    <span className={[
                      'text-xs font-bold',
                      isToday ? 'text-blue-600 dark:text-blue-400' : '',
                    ].join(' ')}>
                      {cell.day}
                    </span>
                    {rec?.status && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${statusDot(rec.status)}`} />
                    )}
                  </div>
                  {/* Status label */}
                  {rec?.status && (
                    <div className="text-[9px] font-semibold uppercase tracking-wide leading-none mb-0.5">
                      {statusLabel(rec.status)}
                    </div>
                  )}
                  {/* Check-in time */}
                  {(rec?.check_in_at || rec?.first_login_at) && (
                    <div className="flex items-center gap-0.5 text-[9px] leading-none opacity-80">
                      <Clock className="w-2 h-2" />
                      {formatTime(rec.check_in_at ?? rec.first_login_at)}
                    </div>
                  )}
                  {/* Check-out time */}
                  {(rec?.check_out_at ?? rec?.checked_out_at) && (
                    <div className="flex items-center gap-0.5 text-[9px] leading-none opacity-70 mt-0.5">
                      <Clock className="w-2 h-2" />
                      {formatTime(rec?.check_out_at ?? rec?.checked_out_at)}
                    </div>
                  )}
                  {/* Late indicator */}
                  {(rec?.late_minutes ?? 0) > 0 && (
                    <div className="text-[8px] text-amber-600 dark:text-amber-400 leading-none mt-0.5">
                      +{rec?.late_minutes}m late
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 pb-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
        {[
          { status: 'PRESENT', label: 'Present', dot: 'bg-emerald-500' },
          { status: 'LATE',    label: 'Late',    dot: 'bg-amber-500' },
          { status: 'ABSENT',  label: 'Absent',  dot: 'bg-red-500' },
          { status: 'HALF_DAY',label: 'Half Day',dot: 'bg-orange-500' },
          { status: 'LEAVE',   label: 'Leave',   dot: 'bg-purple-500' },
          { status: 'HOLIDAY', label: 'Holiday', dot: 'bg-blue-500' },
        ].map(({ label, dot }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-[10px] italic">
          {totalDays} days · tap any past date to mark
        </span>
      </div>
    </div>
  );
}
