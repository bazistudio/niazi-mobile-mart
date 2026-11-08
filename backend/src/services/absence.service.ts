/**
 * Absence Processor Service
 *
 * Runs daily (and on-demand for recovery) to detect scheduled working days where an active
 * employee did not log in, and idempotently records an 'ABSENT' attendance row.
 *
 * Rules:
 *  1. Only completed days (attendance_date < today in Asia/Karachi).
 *  2. Uses the shift assignment effective on each attendance date.
 *  3. Excludes weekly offs (working_days_json e.g. [1,2,3,4,5,6]).
 *  4. Idempotent: INSERT ... ON CONFLICT (user_id, attendance_date) DO NOTHING.
 *  5. Attributed to source: 'ABSENCE_AUTO', recorded_by: NULL.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getKarachiDate } from './hr.service';

export interface AbsenceProcessResult {
  date: string;
  processedUsers: number;
  absencesMarked: number;
}

export async function processAbsencesForDate(
  pool: Pool,
  targetDate: string // YYYY-MM-DD
): Promise<AbsenceProcessResult> {
  const todayKarachi = getKarachiDate(new Date());
  if (targetDate >= todayKarachi) {
    throw new Error(`Cannot mark absences for current or future date: ${targetDate}`);
  }

  // Determine day of week in Karachi (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const [y, m, d] = targetDate.split('-').map(Number);
  const targetObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = targetObj.getUTCDay();

  const nowIso = new Date().toISOString();

  // Find all active employees who have an active shift assignment on targetDate
  // and where dayOfWeek is in working_days_json, but have NO staff_attendance record for targetDate.
  const eligibleSql = `
    SELECT
      u.id AS user_id,
      b.organization_id,
      st.shift_start_time,
      st.shift_duration_minutes,
      st.late_threshold_minutes,
      st.break_duration_minutes,
      st.working_days_json
    FROM users u
    JOIN branches b ON u.branch_id = b.id
    JOIN staff_shift_assignments ssa ON ssa.user_id = u.id
      AND ssa.effective_from <= $1
      AND (ssa.effective_to IS NULL OR ssa.effective_to >= $1)
    JOIN staff_shift_templates st ON st.id = ssa.shift_template_id
      AND st.is_active = 1
    WHERE u.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM staff_attendance sa
        WHERE sa.user_id = u.id
          AND sa.attendance_date = $1
      )
  `;

  const eligibleRes = await pool.query(eligibleSql, [targetDate]);
  let absencesMarked = 0;

  for (const row of eligibleRes.rows) {
    let workingDays: number[] = [1, 2, 3, 4, 5, 6];
    try {
      if (row.working_days_json) {
        workingDays = JSON.parse(row.working_days_json);
      }
    } catch {
      workingDays = [1, 2, 3, 4, 5, 6];
    }

    if (!workingDays.includes(dayOfWeek)) {
      // Weekly off - do not mark absent
      continue;
    }

    const insertSql = `
      INSERT INTO staff_attendance (
        id, user_id, organization_id, attendance_date, first_login_at,
        shift_start_time_snapshot, shift_duration_minutes_snap, late_threshold_minutes_snap,
        break_duration_minutes_snap, status, late_minutes, source, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ABSENT', 0, 'ABSENCE_AUTO', 'Auto-marked absent: no login on scheduled working day', $10, $10)
      ON CONFLICT (user_id, attendance_date) DO NOTHING
    `;

    const res = await pool.query(insertSql, [
      uuidv4(),
      row.user_id,
      row.organization_id,
      targetDate,
      `${targetDate}T00:00:00Z`,
      row.shift_start_time,
      row.shift_duration_minutes,
      row.late_threshold_minutes,
      row.break_duration_minutes ?? 0,
      nowIso,
    ]);

    if ((res.rowCount ?? 0) > 0) {
      absencesMarked++;
    }
  }

  return {
    date: targetDate,
    processedUsers: eligibleRes.rows.length,
    absencesMarked,
  };
}

/**
 * Scan the last N days (default 7 days) and backfill any missing absences
 * up to yesterday.
 */
export async function backfillMissingAbsences(
  pool: Pool,
  lookbackDays: number = 7
): Promise<AbsenceProcessResult[]> {
  const results: AbsenceProcessResult[] = [];
  const todayStr = getKarachiDate(new Date());
  const [y, m, d] = todayStr.split('-').map(Number);

  for (let i = 1; i <= lookbackDays; i++) {
    const target = new Date(Date.UTC(y, m - 1, d - i, 12, 0, 0));
    const targetDateStr = target.toISOString().slice(0, 10);
    try {
      const res = await processAbsencesForDate(pool, targetDateStr);
      results.push(res);
    } catch (err) {
      console.error(`[absence.service] Error processing absences for ${targetDateStr}:`, err);
    }
  }

  return results;
}

