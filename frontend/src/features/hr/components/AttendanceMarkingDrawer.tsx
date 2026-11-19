/**
 * AttendanceMarkingDrawer — slide-in panel for marking/editing one day's attendance.
 *
 * Used by MonthlyAttendanceGrid when an admin clicks a day cell.
 * Supports: status selection, check-in/check-out time (Karachi), notes.
 * On submit calls useMarkAttendance (POST) or useUpdateAttendance (PATCH).
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import type { BackendAttendanceRecord } from '../types/hr.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  staffName: string;
  staffId: string;
  date: string;                              // YYYY-MM-DD
  existing?: BackendAttendanceRecord;        // undefined = new record
  month: number;
  year: number;
  onSubmit: (payload: AttendancePayload) => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export interface AttendancePayload {
  attendance_date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  notes: string | null;
  recordId?: string;   // set for PATCH
}

// ─── Status Options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'PRESENT',    label: 'Present',    color: 'bg-emerald-500' },
  { value: 'LATE',       label: 'Late',        color: 'bg-amber-500' },
  { value: 'ABSENT',     label: 'Absent',      color: 'bg-red-500' },
  { value: 'HALF_DAY',   label: 'Half Day',    color: 'bg-orange-500' },
  { value: 'LEAVE',      label: 'Leave',       color: 'bg-purple-500' },
  { value: 'HOLIDAY',    label: 'Holiday',     color: 'bg-blue-500' },
  { value: 'WEEKLY_OFF', label: 'Weekly Off',  color: 'bg-gray-400' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert ISO UTC to 'HH:mm' in Karachi time for <input type="time"> */
function isoToKarachiTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const h = d.toLocaleString('en-PK', { hour: '2-digit', hour12: false, timeZone: 'Asia/Karachi' });
    const m = d.toLocaleString('en-PK', { minute: '2-digit', timeZone: 'Asia/Karachi' });
    return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
  } catch { return ''; }
}

/** Convert YYYY-MM-DD + HH:mm (Karachi) to ISO UTC string */
function karachiTimeToIso(date: string, time: string): string | null {
  if (!time) return null;
  // Karachi is UTC+5
  const [hh, mm] = time.split(':').map(Number);
  const utcMs = new Date(`${date}T00:00:00Z`).getTime() + (hh * 60 + mm - 300) * 60_000;
  return new Date(utcMs).toISOString();
}

function formatDisplayDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-PK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Karachi',
    });
  } catch { return dateStr; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AttendanceMarkingDrawer({
  open,
  onClose,
  staffName,
  date,
  existing,
  onSubmit,
  isSubmitting = false,
  submitError = null,
}: Props) {
  const isEdit = Boolean(existing?.id);

  const [status, setStatus] = useState('PRESENT');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [notes, setNotes] = useState('');

  // Populate form when existing record provided
  useEffect(() => {
    if (existing) {
      setStatus(existing.status ?? 'PRESENT');
      setCheckInTime(isoToKarachiTime(existing.check_in_at ?? existing.first_login_at));
      setCheckOutTime(isoToKarachiTime(existing.check_out_at ?? existing.checked_out_at));
      setNotes(existing.notes ?? '');
    } else {
      setStatus('PRESENT');
      setCheckInTime('');
      setCheckOutTime('');
      setNotes('');
    }
  }, [existing, open]);

  const needsTimes = ['PRESENT', 'LATE', 'HALF_DAY'].includes(status);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: AttendancePayload = {
      attendance_date: date,
      status,
      check_in_at:  needsTimes ? karachiTimeToIso(date, checkInTime) : null,
      check_out_at: needsTimes ? karachiTimeToIso(date, checkOutTime) : null,
      notes: notes.trim() || null,
    };
    if (isEdit && existing?.id) payload.recordId = existing.id;
    onSubmit(payload);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {isEdit ? 'Edit Attendance' : 'Mark Attendance'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{staffName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Date */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm">
            <span className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide font-medium block mb-0.5">Date</span>
            <span className="text-gray-900 dark:text-white font-semibold">{formatDisplayDate(date)}</span>
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={[
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all',
                    status === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
                  ].join(' ')}
                >
                  <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time inputs — only for time-tracked statuses */}
          {needsTimes && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Check-in (PKT)
                </label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={e => setCheckInTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Check-out (PKT)
                </label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={e => setCheckOutTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Medical leave, official holiday…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {submitError}
            </div>
          )}
        </form>

        {/* Footer actions */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="attendance-form"
            onClick={e => { e.preventDefault(); const f = document.querySelector<HTMLFormElement>('form'); f?.requestSubmit(); }}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Check className="w-4 h-4" /> {isEdit ? 'Update' : 'Mark'}</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
