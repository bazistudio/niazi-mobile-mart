/**
 * HR Attendance Service — Manual attendance recording, daily register, range queries,
 * bulk transactional attendance, and annual summary.
 *
 * Business rules applied:
 *  - UPSERT semantics: recording attendance for a date that already has a
 *    LOGIN record overlays admin-supplied fields without erasing the original
 *    login time (unless the admin explicitly provides a new check_in_at or marks
 *    a non-working status like ABSENT/LEAVE/HOLIDAY/WEEKLY_OFF).
 *  - first_login_at is NOT NULL in staff_attendance (Migration 042).
 *    When check_in_at is null on a non-working status (ABSENT / LEAVE / HOLIDAY / WEEKLY_OFF),
 *    midnight UTC of the attendance_date (`${date}T00:00:00Z`) is stored to satisfy the DB
 *    constraint, and normalized back to `check_in_at: null` on every read/write boundary
 *    (DEF-HR-03 fix) while preserving genuine midnight check-ins for PRESENT/LATE/HALF_DAY.
 *  - Effective HR Policy resolution (DEF-HR-05 fix): resolves the active branch override
 *    or organization default policy for (organization_id, branch_id, attendance_date)
 *    via resolveEffectivePolicyForCalculation() instead of hardcoding 660 / 20.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { resolveEffectivePolicyForCalculation } from './hr.policy.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export const VALID_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
] as const;

export type ValidAttendanceStatus = (typeof VALID_ATTENDANCE_STATUSES)[number];

export const NON_WORKING_STATUSES = new Set<string>([
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
  'OFF',
]);

export interface ManualAttendanceInput {
  user_id: string;
  organization_id: string;
  attendance_date: string;         // YYYY-MM-DD
  check_in_at: string | null;      // ISO UTC timestamp or null
  check_out_at: string | null;     // ISO UTC timestamp or null
  status: string;                  // PRESENT|ABSENT|LATE|HALF_DAY|LEAVE|HOLIDAY|WEEKLY_OFF
  notes: string | null;
  recorded_by: string;             // admin user_id
}

export interface UpdateAttendanceInput {
  record_id: string;
  user_id: string;
  organization_id?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  status?: string;
  notes?: string | null;
  updated_by: string;
}

export interface AttendanceMonthlySummary {
  year: number;
  month: number;
  total_records: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  total_worked_minutes: number;
  total_late_minutes: number;
  total_overtime_minutes: number;
}

export interface DailyRegisterEmployeeRow {
  user_id: string;
  username: string;
  full_name: string;
  employee_code: string;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  attendance_date: string;
  record_id: string | null;
  status: ValidAttendanceStatus | 'NOT_MARKED';
  check_in_at: string | null;
  check_out_at: string | null;
  worked_minutes: number | null;
  late_minutes: number;
  shift_duration_minutes: number;
  late_threshold_minutes: number;
  source: string | null;
  notes: string | null;
  recorded_by: string | null;
  updated_at: string | null;
}

export interface DailyRegisterSummary {
  total_employees: number;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  half_day: number;
  holiday_or_off: number;
  not_marked: number;
  checked_in_open: number;
  checked_out_complete: number;
}

export interface DailyRegisterResponse {
  date: string;
  branch_id: string | null;
  summary: DailyRegisterSummary;
  rows: DailyRegisterEmployeeRow[];
}

export interface BulkAttendanceItemInput {
  user_id: string;
  status: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  notes?: string | null;
}

export interface BulkAttendanceResult {
  date: string;
  updated_count: number;
  skipped_count: number;
  updated_user_ids: string[];
  skipped: Array<{ user_id: string; reason: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function computeWorkedMinutes(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): number | null {
  if (!checkIn || !checkOut) return null;
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  if (isNaN(inMs) || isNaN(outMs) || outMs <= inMs) return null;
  return Math.floor((outMs - inMs) / 60_000);
}

/**
 * DEF-HR-03 fix: Normalize an attendance row returned from PostgreSQL so that
 * a midnight UTC placeholder (`${attendance_date}T00:00:00Z`) on a non-working
 * status (`ABSENT`, `LEAVE`, `HOLIDAY`, `WEEKLY_OFF`, `OFF`) never surfaces as
 * a fake 05:00 AM Karachi check-in time, while genuine midnight check-ins on
 * working statuses (`PRESENT`, `LATE`, `HALF_DAY`) are preserved intact.
 */
export function normalizeAttendanceRow<T extends Record<string, unknown>>(
  row: T
): T & {
  check_in_at: string | null;
  check_out_at: string | null;
  shift_duration_minutes: unknown;
  late_threshold_minutes: unknown;
} {
  const status = String(row['status'] ?? '');
  const attDate = String(row['attendance_date'] ?? '').slice(0, 10);
  const rawFirstLogin = (row['check_in_at'] ?? row['first_login_at'] ?? null) as string | null;
  const rawCheckOut = (row['check_out_at'] ?? row['checked_out_at'] ?? null) as string | null;
  const workedMins = row['worked_minutes'] as number | null | undefined;

  const isMidnightPlaceholder =
    rawFirstLogin !== null &&
    attDate.length === 10 &&
    (rawFirstLogin === `${attDate}T00:00:00Z` ||
      rawFirstLogin === `${attDate}T00:00:00.000Z`) &&
    NON_WORKING_STATUSES.has(status) &&
    rawCheckOut === null &&
    (workedMins === null || workedMins === undefined || workedMins === 0);

  const normalizedCheckIn = isMidnightPlaceholder ? null : rawFirstLogin;

  return {
    ...row,
    check_in_at: normalizedCheckIn,
    check_out_at: rawCheckOut,
    shift_duration_minutes:
      row['shift_duration_minutes'] ?? row['shift_duration_minutes_snap'] ?? 660,
    late_threshold_minutes:
      row['late_threshold_minutes'] ?? row['late_threshold_minutes_snap'] ?? 20,
  };
}

function buildEmployeeCode(userId: string, index: number): string {
  // Deterministic readable code derived from roster order or UUID prefix
  return `NMM-${String(index + 1).padStart(3, '0')}`;
}

export function computeDailyRegisterSummary(
  rows: DailyRegisterEmployeeRow[]
): DailyRegisterSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let on_leave = 0;
  let half_day = 0;
  let holiday_or_off = 0;
  let not_marked = 0;
  let checked_in_open = 0;
  let checked_out_complete = 0;

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

// ─── Core Single-Row Upsert Helper (Used by single POST and transactional Bulk) ─

async function upsertAttendanceRowWithClient(
  client: Pool | PoolClient,
  input: ManualAttendanceInput,
  verifiedBranchId: string | null
): Promise<Record<string, unknown>> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const isNonWorking = NON_WORKING_STATUSES.has(input.status);

  const effectiveCheckIn = isNonWorking ? null : input.check_in_at;
  const effectiveCheckOut = isNonWorking ? null : input.check_out_at;

  if (effectiveCheckIn && effectiveCheckOut) {
    const inMs = new Date(effectiveCheckIn).getTime();
    const outMs = new Date(effectiveCheckOut).getTime();
    if (isNaN(inMs) || isNaN(outMs) || outMs <= inMs) {
      throw new Error('check_out_at must be strictly later than check_in_at');
    }
  }
  if (!isNonWorking && effectiveCheckOut && !effectiveCheckIn) {
    throw new Error('Cannot record check_out_at without a valid check_in_at');
  }

  const workedMinutes = computeWorkedMinutes(effectiveCheckIn, effectiveCheckOut);

  // DEF-HR-05 fix: Resolve effective HR policy for (organization_id, branch_id, attendance_date)
  const policy = await resolveEffectivePolicyForCalculation(
    client,
    input.organization_id,
    verifiedBranchId,
    input.attendance_date
  );

  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO staff_attendance (
       id, user_id, organization_id, branch_id,
       attendance_date, first_login_at, checked_out_at,
       status, late_minutes, worked_minutes,
       shift_duration_minutes_snap, late_threshold_minutes_snap,
       break_duration_minutes_snap,
       source, recorded_by, notes,
       created_at, updated_at
     ) VALUES (
       $1,  $2,  $3,  $4,
       $5,  COALESCE($6, ($5 || 'T00:00:00Z')),  $7,
       $8,  0,   $9,
       $13, $14,
       0,
       'MANUAL', $10, $11,
       $12, $12
     )
     ON CONFLICT (user_id, attendance_date) DO UPDATE SET
       status         = EXCLUDED.status,
       branch_id      = COALESCE(EXCLUDED.branch_id, staff_attendance.branch_id),
       shift_duration_minutes_snap = EXCLUDED.shift_duration_minutes_snap,
       late_threshold_minutes_snap = EXCLUDED.late_threshold_minutes_snap,
       checked_out_at = CASE
                          WHEN EXCLUDED.status IN ('ABSENT','LEAVE','HOLIDAY','WEEKLY_OFF','OFF') THEN NULL
                          ELSE COALESCE(EXCLUDED.checked_out_at, staff_attendance.checked_out_at)
                        END,
       first_login_at = CASE
                          WHEN EXCLUDED.status IN ('ABSENT','LEAVE','HOLIDAY','WEEKLY_OFF','OFF') THEN ($5 || 'T00:00:00Z')
                          WHEN $6 IS NOT NULL THEN $6
                          ELSE staff_attendance.first_login_at
                        END,
       worked_minutes = CASE
                          WHEN EXCLUDED.status IN ('ABSENT','LEAVE','HOLIDAY','WEEKLY_OFF','OFF') THEN NULL
                          WHEN EXCLUDED.checked_out_at IS NOT NULL
                          THEN EXTRACT(EPOCH FROM (
                                 EXCLUDED.checked_out_at::timestamptz -
                                 CASE
                                   WHEN $6 IS NOT NULL THEN $6::timestamptz
                                   ELSE staff_attendance.first_login_at::timestamptz
                                 END
                               ))::INT / 60
                          ELSE COALESCE(EXCLUDED.worked_minutes, staff_attendance.worked_minutes)
                        END,
       notes          = COALESCE(EXCLUDED.notes, staff_attendance.notes),
       recorded_by    = EXCLUDED.recorded_by,
       source         = CASE
                          WHEN staff_attendance.source = 'LOGIN' THEN 'MANUAL'
                          ELSE EXCLUDED.source
                        END,
       updated_at     = EXCLUDED.updated_at
     RETURNING *`,
    [
      id,
      input.user_id,
      input.organization_id,
      verifiedBranchId,
      input.attendance_date,
      effectiveCheckIn,                      // $6
      effectiveCheckOut,                     // $7
      input.status,                          // $8
      workedMinutes,                         // $9
      input.recorded_by,                     // $10
      input.notes,                           // $11
      now,                                   // $12
      policy.standard_shift_minutes,         // $13
      policy.late_threshold_minutes,         // $14
    ]
  );

  return normalizeAttendanceRow(result.rows[0] ?? {});
}

// ─── Manual Attendance Recording ─────────────────────────────────────────────

export async function recordManualAttendance(
  pool: Pool,
  input: ManualAttendanceInput
): Promise<Record<string, unknown>> {
  // Determine branch_id from users table authoritatively scoped to input.organization_id
  const userRes = await pool.query<{ branch_id: string | null; role: string }>(
    `SELECT u.branch_id, u.role
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1 AND (b.organization_id = $2 OR (u.branch_id IS NULL AND u.role = 'ADMIN'))
     LIMIT 1`,
    [input.user_id, input.organization_id]
  );
  if (userRes.rows.length === 0) {
    throw new Error('Target user has no verified branch in the authorized organization');
  }
  const branchId = userRes.rows[0]?.branch_id ?? null;

  return upsertAttendanceRowWithClient(pool, input, branchId);
}

// ─── Update Existing Attendance Record ───────────────────────────────────────

export async function updateManualAttendance(
  pool: Pool,
  input: UpdateAttendanceInput
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  if (input.check_in_at && input.check_out_at) {
    const inMs = new Date(input.check_in_at).getTime();
    const outMs = new Date(input.check_out_at).getTime();
    if (isNaN(inMs) || isNaN(outMs) || outMs <= inMs) {
      throw new Error('check_out_at must be strictly later than check_in_at');
    }
  }

  const isNonWorking = input.status !== undefined && NON_WORKING_STATUSES.has(input.status);

  const setClauses: string[] = ['updated_at = $1', 'recorded_by = $2'];
  const values: unknown[] = [now, input.updated_by];
  let paramIdx = 3;

  if (input.status !== undefined) {
    setClauses.push(`status = $${paramIdx}`);
    values.push(input.status);
    paramIdx++;
  }

  if (isNonWorking) {
    // Reset check-in to midnight placeholder and clear check-out and worked_minutes
    setClauses.push(`first_login_at = (attendance_date || 'T00:00:00Z')`);
    setClauses.push(`checked_out_at = NULL`);
    setClauses.push(`worked_minutes = NULL`);
  } else {
    if (input.check_in_at !== undefined && input.check_in_at !== null) {
      setClauses.push(`first_login_at = $${paramIdx}`);
      values.push(input.check_in_at);
      paramIdx++;
    }
    if (input.check_out_at !== undefined) {
      setClauses.push(`checked_out_at = $${paramIdx}`);
      values.push(input.check_out_at);
      const outParamIdx = paramIdx;
      paramIdx++;

      setClauses.push(
        `worked_minutes = CASE
          WHEN $${outParamIdx}::text IS NOT NULL AND first_login_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 $${outParamIdx}::timestamptz - first_login_at::timestamptz
               ))::INT / 60)
          WHEN $${outParamIdx}::text IS NULL THEN NULL
          ELSE worked_minutes
         END`
      );
    }
  }

  if (input.notes !== undefined) {
    setClauses.push(`notes = $${paramIdx}`);
    values.push(input.notes);
    paramIdx++;
  }

  values.push(input.record_id, input.user_id);
  const whereParamA = paramIdx;
  const whereParamB = paramIdx + 1;
  let whereOrgClause = '';

  if (input.organization_id) {
    paramIdx += 2;
    whereOrgClause = ` AND organization_id = $${paramIdx}`;
    values.push(input.organization_id);
  }

  const sql = `
    UPDATE staff_attendance
    SET ${setClauses.join(', ')}
    WHERE id = $${whereParamA} AND user_id = $${whereParamB}${whereOrgClause}
    RETURNING *`;

  const result = await pool.query<Record<string, unknown>>(sql, values);
  if (!result.rows[0]) throw new Error('Attendance record not found or access denied');
  return normalizeAttendanceRow(result.rows[0]);
}

// ─── Daily Attendance Register (Single-Query Roster + Attendance Join) ───────

export async function getDailyAttendanceRegister(
  pool: Pool,
  params: {
    organization_id: string;
    date: string;           // YYYY-MM-DD
    branch_id?: string | null;
  }
): Promise<DailyRegisterResponse> {
  const queryParams: unknown[] = [params.organization_id, params.date];
  let branchFilterSql = '';
  if (params.branch_id) {
    queryParams.push(params.branch_id);
    branchFilterSql = ` AND u.branch_id = $${queryParams.length}`;
  }

  const sql = `
    SELECT
      u.id                                        AS user_id,
      u.username                                  AS username,
      u.name                                      AS full_name,
      u.role                                      AS role,
      u.branch_id                                 AS branch_id,
      b.name                                      AS branch_name,
      sa.id                                       AS record_id,
      sa.status                                   AS raw_status,
      sa.first_login_at                           AS first_login_at,
      sa.checked_out_at                           AS checked_out_at,
      sa.worked_minutes                           AS worked_minutes,
      sa.late_minutes                             AS late_minutes,
      sa.shift_duration_minutes_snap              AS shift_duration_minutes_snap,
      sa.late_threshold_minutes_snap              AS late_threshold_minutes_snap,
      sa.source                                   AS source,
      sa.notes                                    AS notes,
      sa.recorded_by                              AS recorded_by,
      sa.updated_at                               AS updated_at
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
    LEFT JOIN staff_attendance sa
      ON sa.user_id = u.id
      AND sa.attendance_date = $2
      AND sa.organization_id = $1
    WHERE (b.organization_id = $1 OR (u.branch_id IS NULL AND u.role = 'ADMIN'))
      AND u.is_active = 1
      AND u.status NOT IN ('DISABLED','PENDING','REJECTED')
      AND u.role NOT IN (
        'SUPER_ADMIN','OWNER','MULTI_ADMIN','SHOPADMIN','BRANCH_ADMIN','PUBLIC_USER'
      )${branchFilterSql}
    ORDER BY u.name ASC
  `;

  const res = await pool.query(sql, queryParams);

  const rows: DailyRegisterEmployeeRow[] = res.rows.map((r, idx) => {
    const hasRecord = Boolean(r.record_id);
    const rawStatus = hasRecord ? String(r.raw_status) : 'NOT_MARKED';
    const normalized = hasRecord
      ? normalizeAttendanceRow({
          status: rawStatus,
          attendance_date: params.date,
          first_login_at: r.first_login_at,
          checked_out_at: r.checked_out_at,
          worked_minutes: r.worked_minutes,
          shift_duration_minutes_snap: r.shift_duration_minutes_snap,
          late_threshold_minutes_snap: r.late_threshold_minutes_snap,
        })
      : null;

    return {
      user_id: r.user_id,
      username: r.username,
      full_name: r.full_name || r.username,
      employee_code: buildEmployeeCode(r.user_id, idx),
      role: r.role,
      branch_id: r.branch_id ?? null,
      branch_name: r.branch_name ?? null,
      attendance_date: params.date,
      record_id: r.record_id ?? null,
      status: (rawStatus === 'OFF' ? 'WEEKLY_OFF' : rawStatus) as DailyRegisterEmployeeRow['status'],
      check_in_at: normalized ? (normalized['check_in_at'] as string | null) : null,
      check_out_at: normalized ? (normalized['check_out_at'] as string | null) : null,
      worked_minutes:
        r.worked_minutes !== null && r.worked_minutes !== undefined
          ? Number(r.worked_minutes)
          : null,
      late_minutes: r.late_minutes ? Number(r.late_minutes) : 0,
      shift_duration_minutes: Number(r.shift_duration_minutes_snap ?? 660),
      late_threshold_minutes: Number(r.late_threshold_minutes_snap ?? 20),
      source: r.source ?? null,
      notes: r.notes ?? null,
      recorded_by: r.recorded_by ?? null,
      updated_at: r.updated_at ?? null,
    };
  });

  return {
    date: params.date,
    branch_id: params.branch_id ?? null,
    summary: computeDailyRegisterSummary(rows),
    rows,
  };
}

// ─── Attendance Range Query (Weekly / Monthly / Historical Multi-Date View) ──

export interface AttendanceRangeResponse {
  start_date: string;
  end_date: string;
  branch_id: string | null;
  employees: Array<{
    user_id: string;
    username: string;
    full_name: string;
    employee_code: string;
    role: string;
    branch_id: string | null;
    branch_name: string | null;
  }>;
  records: Array<{
    id: string;
    user_id: string;
    branch_id: string | null;
    attendance_date: string;
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
    worked_minutes: number | null;
    late_minutes: number;
    notes: string | null;
    source: string;
  }>;
}

export async function getAttendanceRegisterRange(
  pool: Pool,
  params: {
    organization_id: string;
    start_date: string;
    end_date: string;
    branch_id?: string | null;
  }
): Promise<AttendanceRangeResponse> {
  const empParams: unknown[] = [params.organization_id];
  let empBranchClause = '';
  if (params.branch_id) {
    empParams.push(params.branch_id);
    empBranchClause = ` AND u.branch_id = $${empParams.length}`;
  }

  const empRes = await pool.query(
    `SELECT
       u.id          AS user_id,
       u.username    AS username,
       u.name        AS full_name,
       u.role        AS role,
       u.branch_id   AS branch_id,
       b.name        AS branch_name
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE (b.organization_id = $1 OR (u.branch_id IS NULL AND u.role = 'ADMIN'))
       AND u.is_active = 1
       AND u.status NOT IN ('DISABLED','PENDING','REJECTED')
       AND u.role NOT IN (
         'SUPER_ADMIN','OWNER','MULTI_ADMIN','SHOPADMIN','BRANCH_ADMIN','PUBLIC_USER'
       )${empBranchClause}
     ORDER BY u.name ASC`,
    empParams
  );

  const employees = empRes.rows.map((r, idx) => ({
    user_id: r.user_id,
    username: r.username,
    full_name: r.full_name || r.username,
    employee_code: buildEmployeeCode(r.user_id, idx),
    role: r.role,
    branch_id: r.branch_id ?? null,
    branch_name: r.branch_name ?? null,
  }));

  const recParams: unknown[] = [
    params.organization_id,
    params.start_date,
    params.end_date,
  ];
  let recBranchClause = '';
  if (params.branch_id) {
    recParams.push(params.branch_id);
    recBranchClause = ` AND u.branch_id = $${recParams.length}`;
  }

  const recRes = await pool.query(
    `SELECT
       sa.id,
       sa.user_id,
       COALESCE(sa.branch_id, u.branch_id) AS branch_id,
       sa.attendance_date,
       sa.status,
       sa.first_login_at,
       sa.checked_out_at,
       sa.worked_minutes,
       sa.late_minutes,
       sa.notes,
       sa.source
     FROM staff_attendance sa
     INNER JOIN users u ON u.id = sa.user_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE sa.organization_id = $1
       AND sa.attendance_date >= $2
       AND sa.attendance_date <= $3
       AND (b.organization_id = $1 OR (u.branch_id IS NULL AND u.role = 'ADMIN'))${recBranchClause}
     ORDER BY sa.attendance_date ASC`,
    recParams
  );

  const records = recRes.rows.map((r) => {
    const norm = normalizeAttendanceRow({
      status: r.status,
      attendance_date: r.attendance_date,
      first_login_at: r.first_login_at,
      checked_out_at: r.checked_out_at,
      worked_minutes: r.worked_minutes,
    });
    return {
      id: r.id,
      user_id: r.user_id,
      branch_id: r.branch_id ?? null,
      attendance_date: String(r.attendance_date).slice(0, 10),
      status: r.status === 'OFF' ? 'WEEKLY_OFF' : String(r.status),
      check_in_at: norm['check_in_at'] as string | null,
      check_out_at: norm['check_out_at'] as string | null,
      worked_minutes:
        r.worked_minutes !== null && r.worked_minutes !== undefined
          ? Number(r.worked_minutes)
          : null,
      late_minutes: r.late_minutes ? Number(r.late_minutes) : 0,
      notes: r.notes ?? null,
      source: r.source,
    };
  });

  return {
    start_date: params.start_date,
    end_date: params.end_date,
    branch_id: params.branch_id ?? null,
    employees,
    records,
  };
}

// ─── Transactional Bulk Attendance Recording ─────────────────────────────────

export async function bulkRecordManualAttendance(
  pool: Pool,
  params: {
    organization_id: string;
    date: string;
    items: BulkAttendanceItemInput[];
    overwrite_existing: boolean;
    recorded_by: string;
    /** Map of verified userId -> branchId pre-authorized by route handler */
    verifiedUserBranches: Map<string, string | null>;
  }
): Promise<BulkAttendanceResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deduplicate items by user_id (last occurrence wins if duplicate in payload)
    const dedupedMap = new Map<string, BulkAttendanceItemInput>();
    for (const item of params.items) {
      dedupedMap.set(item.user_id, item);
    }

    const updated_user_ids: string[] = [];
    const skipped: Array<{ user_id: string; reason: string }> = [];

    for (const [userId, item] of dedupedMap.entries()) {
      // Check existing row for (user_id, date) with row lock
      const existingRes = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM staff_attendance
         WHERE user_id = $1 AND attendance_date = $2 AND organization_id = $3
         FOR UPDATE`,
        [userId, params.date, params.organization_id]
      );

      if (existingRes.rows.length > 0 && !params.overwrite_existing) {
        skipped.push({
          user_id: userId,
          reason: `Existing record (${existingRes.rows[0].status}) protected because overwrite_existing is false`,
        });
        continue;
      }

      const branchId = params.verifiedUserBranches.get(userId) ?? null;

      await upsertAttendanceRowWithClient(
        client,
        {
          user_id: userId,
          organization_id: params.organization_id,
          attendance_date: params.date,
          status: item.status,
          check_in_at: item.check_in_at ?? null,
          check_out_at: item.check_out_at ?? null,
          notes: item.notes ?? null,
          recorded_by: params.recorded_by,
        },
        branchId
      );

      updated_user_ids.push(userId);
    }

    await client.query('COMMIT');

    return {
      date: params.date,
      updated_count: updated_user_ids.length,
      skipped_count: skipped.length,
      updated_user_ids,
      skipped,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Annual Summary ───────────────────────────────────────────────────────────

export async function getAnnualAttendanceSummary(
  pool: Pool,
  userId: string,
  year: number,
  organizationId?: string
): Promise<AttendanceMonthlySummary[]> {
  let rows: AttendanceMonthlySummary[] = [];

  try {
    const whereOrg = organizationId ? ' AND organization_id = $3' : '';
    const params: unknown[] = [userId, year];
    if (organizationId) params.push(organizationId);

    const result = await pool.query<AttendanceMonthlySummary>(
      `SELECT
         year::int,
         month::int,
         total_records::int,
         present_days::int,
         absent_days::int,
         late_days::int,
         leave_days::int,
         total_worked_minutes::int,
         total_late_minutes::int,
         total_overtime_minutes::int
       FROM v_attendance_monthly_summary
       WHERE user_id = $1 AND year = $2${whereOrg}
       ORDER BY month`,
      params
    );
    rows = result.rows;
  } catch {
    const whereOrg = organizationId ? ' AND organization_id = $3' : '';
    const params: unknown[] = [userId, year];
    if (organizationId) params.push(organizationId);

    const result = await pool.query<AttendanceMonthlySummary>(
      `SELECT
         EXTRACT(YEAR  FROM attendance_date::date)::INT AS year,
         EXTRACT(MONTH FROM attendance_date::date)::INT AS month,
         COUNT(*)::INT AS total_records,
         COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE'))::INT AS present_days,
         COUNT(*) FILTER (WHERE status = 'ABSENT')::INT             AS absent_days,
         COUNT(*) FILTER (WHERE status = 'LATE')::INT               AS late_days,
         COUNT(*) FILTER (WHERE status IN ('LEAVE','HALF_DAY'))::INT AS leave_days,
         COALESCE(SUM(worked_minutes)  FILTER (WHERE worked_minutes  IS NOT NULL), 0)::INT AS total_worked_minutes,
         COALESCE(SUM(late_minutes)    FILTER (WHERE late_minutes    > 0),         0)::INT AS total_late_minutes,
         COALESCE(SUM(approved_overtime_minutes) FILTER (WHERE approved_overtime_minutes IS NOT NULL), 0)::INT AS total_overtime_minutes
       FROM staff_attendance
       WHERE user_id = $1
         AND EXTRACT(YEAR FROM attendance_date::date) = $2${whereOrg}
       GROUP BY
         EXTRACT(YEAR  FROM attendance_date::date),
         EXTRACT(MONTH FROM attendance_date::date)
       ORDER BY month`,
      params
    );
    rows = result.rows;
  }

  const byMonth = new Map<number, AttendanceMonthlySummary>();
  for (const row of rows) byMonth.set(row.month, row);

  const full: AttendanceMonthlySummary[] = [];
  for (let m = 1; m <= 12; m++) {
    full.push(
      byMonth.get(m) ?? {
        year,
        month: m,
        total_records: 0,
        present_days: 0,
        absent_days: 0,
        late_days: 0,
        leave_days: 0,
        total_worked_minutes: 0,
        total_late_minutes: 0,
        total_overtime_minutes: 0,
      }
    );
  }
  return full;
}
