'use client';

import React, { useMemo } from 'react';
import { Activity, Clock, ArrowRight } from 'lucide-react';
import type { DailyRegisterEmployeeRow } from '@/features/hr/types/hr.types';
import { HRSectionCard, HRStatusBadge, HREmptyState } from './ui/HRPrimitives';

interface HRRecentAttendanceActivityProps {
  rows: DailyRegisterEmployeeRow[];
  selectedDate: string;
  format12H: (iso: string | null | undefined) => string;
  formatDuration: (mins: number | null | undefined) => string;
  onOpenProfile: (row: DailyRegisterEmployeeRow) => void;
  onEditRow: (row: DailyRegisterEmployeeRow) => void;
}

export const HRRecentAttendanceActivity: React.FC<HRRecentAttendanceActivityProps> = ({
  rows,
  selectedDate,
  format12H,
  formatDuration,
  onOpenProfile,
  onEditRow,
}) => {
  const { totalRecordedCount, recentActivity } = useMemo(() => {
    const marked = rows
      .filter((r) => Boolean(r.record_id))
      .map((r) => {
        const sortTs = r.updated_at || r.check_out_at || r.check_in_at || '';
        const ms = sortTs ? new Date(sortTs).getTime() : 0;
        return { row: r, ms, sortTs };
      })
      .sort((a, b) => b.ms - a.ms);
    return {
      totalRecordedCount: marked.length,
      recentActivity: marked.slice(0, 8),
    };
  }, [rows]);

  return (
    <HRSectionCard
      title="Recent Attendance Activity"
      subtitle={`Latest recorded punches and manual attendance updates for ${selectedDate}`}
      icon={<Activity className="w-4 h-4 text-[#006970] dark:text-[#33c9cf]" />}
      badge={
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 tabular-nums">
          {totalRecordedCount > 8
            ? `Latest 8 of ${totalRecordedCount} recorded`
            : `${totalRecordedCount} recorded`}
        </span>
      }
    >
      {recentActivity.length === 0 ? (
        <HREmptyState
          icon={<Clock className="w-5 h-5" />}
          title="No attendance activity recorded yet for this date"
          description="Use Check In, Quick Mark, or Bulk Attendance above to record staff attendance."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recentActivity.map(({ row, sortTs }) => (
            <div
              key={`${row.user_id}-${row.record_id}`}
              className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#006970]/10 dark:bg-[#006970]/30 text-[#006970] dark:text-[#33c9cf] font-bold flex items-center justify-center text-xs shrink-0">
                  {row.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(row)}
                      className="text-xs font-semibold text-slate-900 dark:text-white hover:text-[#006970] dark:hover:text-[#33c9cf] truncate cursor-pointer"
                    >
                      {row.full_name}
                    </button>
                    <HRStatusBadge status={row.status} showIcon={false} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex-wrap">
                    <span>In: {format12H(row.check_in_at)}</span>
                    <span>•</span>
                    <span>Out: {format12H(row.check_out_at)}</span>
                    {row.worked_minutes ? (
                      <>
                        <span>•</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatDuration(row.worked_minutes)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {row.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate max-w-xs">
                      {row.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {row.source && (
                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {row.source}
                  </span>
                )}
                {sortTs && (
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {format12H(sortTs)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onEditRow(row)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#006970] dark:text-[#33c9cf] hover:underline cursor-pointer"
                >
                  Edit <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </HRSectionCard>
  );
};
