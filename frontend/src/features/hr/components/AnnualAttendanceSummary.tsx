/**
 * AnnualAttendanceSummary — 12-month attendance table for a single staff member.
 *
 * Displays one row per month with:
 *   Present | Late | Absent | Leave | Worked hours | Late minutes | OT hours
 * plus a full-year totals footer row.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, Loader2 } from 'lucide-react';
import type { AnnualAttendanceSummaryRow } from '../services/hr.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  staffName: string;
  year: number;
  data: AnnualAttendanceSummaryRow[];
  isLoading?: boolean;
  onYearChange: (year: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtHours(minutes: number): string {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function attendanceRate(row: AnnualAttendanceSummaryRow): number {
  if (!row.total_records) return 0;
  return Math.round(((row.present_days + row.late_days) / row.total_records) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnnualAttendanceSummary({
  staffName,
  year,
  data,
  isLoading = false,
  onYearChange,
}: Props) {
  const currentYear = new Date().getFullYear();

  // Totals row
  const totals = data.reduce(
    (acc, row) => ({
      present_days:           acc.present_days           + row.present_days,
      absent_days:            acc.absent_days            + row.absent_days,
      late_days:              acc.late_days              + row.late_days,
      leave_days:             acc.leave_days             + row.leave_days,
      total_worked_minutes:   acc.total_worked_minutes   + row.total_worked_minutes,
      total_late_minutes:     acc.total_late_minutes     + row.total_late_minutes,
      total_overtime_minutes: acc.total_overtime_minutes + row.total_overtime_minutes,
      total_records:          acc.total_records          + row.total_records,
    }),
    {
      present_days: 0, absent_days: 0, late_days: 0, leave_days: 0,
      total_worked_minutes: 0, total_late_minutes: 0, total_overtime_minutes: 0,
      total_records: 0,
    }
  );

  const overallRate = totals.total_records
    ? Math.round(((totals.present_days + totals.late_days) / totals.total_records) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Annual Attendance Report
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{staffName}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Attendance rate badge */}
          {!isLoading && totals.total_records > 0 && (
            <span className={[
              'flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
              overallRate >= 90
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : overallRate >= 75
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
            ].join(' ')}>
              <TrendingUp className="w-3 h-3" />
              {overallRate}%
            </span>
          )}
          {/* Year picker */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onYearChange(year - 1)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 w-10 text-center">
              {year}
            </span>
            <button
              onClick={() => onYearChange(year + 1)}
              disabled={year >= currentYear}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium">Month</th>
              <th className="text-center px-3 py-2.5 font-medium text-emerald-600 dark:text-emerald-400">Present</th>
              <th className="text-center px-3 py-2.5 font-medium text-amber-600 dark:text-amber-400">Late</th>
              <th className="text-center px-3 py-2.5 font-medium text-red-600 dark:text-red-400">Absent</th>
              <th className="text-center px-3 py-2.5 font-medium text-purple-600 dark:text-purple-400">Leave</th>
              <th className="text-center px-3 py-2.5 font-medium">Worked</th>
              <th className="text-center px-3 py-2.5 font-medium">Late Mins</th>
              <th className="text-center px-3 py-2.5 font-medium text-blue-600 dark:text-blue-400">OT</th>
              <th className="text-center px-3 py-2.5 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-10 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                </td>
              </tr>
            ) : (
              data.map(row => {
                const rate = attendanceRate(row);
                const hasData = row.total_records > 0;
                return (
                  <tr
                    key={row.month}
                    className={[
                      'border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors',
                      !hasData ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                      {MONTH_SHORT[row.month - 1]}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{row.present_days}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={row.late_days > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-gray-400'}>
                        {row.late_days}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={row.absent_days > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-400'}>
                        {row.absent_days}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={row.leave_days > 0 ? 'font-semibold text-purple-600 dark:text-purple-400' : 'text-gray-400'}>
                        {row.leave_days}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300 text-xs">
                      {fmtHours(row.total_worked_minutes)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      <span className={row.total_late_minutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}>
                        {row.total_late_minutes > 0 ? `${row.total_late_minutes}m` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      <span className={row.total_overtime_minutes > 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}>
                        {row.total_overtime_minutes > 0 ? fmtHours(row.total_overtime_minutes) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {hasData ? (
                        <span className={[
                          'inline-block px-1.5 py-0.5 rounded text-xs font-semibold',
                          rate >= 90 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                          rate >= 75 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                       'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                        ].join(' ')}>
                          {rate}%
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {/* Totals row */}
          {!isLoading && totals.total_records > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 font-semibold text-sm">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white">Total</td>
                <td className="px-3 py-2.5 text-center text-emerald-700 dark:text-emerald-400">{totals.present_days}</td>
                <td className="px-3 py-2.5 text-center text-amber-600 dark:text-amber-400">{totals.late_days}</td>
                <td className="px-3 py-2.5 text-center text-red-600 dark:text-red-400">{totals.absent_days}</td>
                <td className="px-3 py-2.5 text-center text-purple-600 dark:text-purple-400">{totals.leave_days}</td>
                <td className="px-3 py-2.5 text-center text-gray-800 dark:text-gray-200 text-xs">{fmtHours(totals.total_worked_minutes)}</td>
                <td className="px-3 py-2.5 text-center text-amber-600 dark:text-amber-400 text-xs">{totals.total_late_minutes}m</td>
                <td className="px-3 py-2.5 text-center text-blue-600 dark:text-blue-400 text-xs">{fmtHours(totals.total_overtime_minutes)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={[
                    'inline-block px-1.5 py-0.5 rounded text-xs font-bold',
                    overallRate >= 90 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                    overallRate >= 75 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                       'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                  ].join(' ')}>
                    {overallRate}%
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
