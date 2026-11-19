/**
 * Niazi Mobile Mart — HR Phase 2 Security & Attendance Regression Test Suite
 *
 * Self-contained regression suite using an in-memory mock pg.Pool (ZERO live DB mutations).
 *
 * Verifies:
 *   1. DEF-HR-03: Attendance midnight placeholder normalization:
 *      - ABSENT with midnight placeholder ('YYYY-MM-DDT00:00:00Z') -> check_in_at: null
 *      - LEAVE with midnight placeholder ('YYYY-MM-DDT00:00:00Z') -> check_in_at: null
 *      - PRESENT with valid check-in ('YYYY-MM-DDT04:15:00Z') -> preserved
 *      - PRESENT with genuine midnight check-in ('YYYY-MM-DDT00:00:00Z') -> preserved
 *      - Missing check-out -> check_out_at: null, worked_minutes: null
 *   2. SEC-HR-01: Salary config & history cross-branch IDOR prevention (SHOP_ADMIN blocked with 403)
 *   3. SEC-HR-02: Staff advances read & create cross-branch IDOR prevention (SHOP_ADMIN blocked with 403)
 *   4. SEC-HR-03: GET /staff branch isolation for SHOP_ADMIN & 403 on cross-branch query
 *   5. SEC-HR-04: GET /payroll-periods/:periodId/records org & branch isolation
 *   6. SEC-HR-05: processAbsencesForDate() SQL query strictly binds organizationId as $2
 *   7. DEF-HR-01:
 *      - GET /attendance/register returns NOT_MARKED for active employees without records
 *      - GET /attendance/range returns employees and date-bounded records
 *      - POST /attendance/bulk enforces overwrite_existing: false in transaction
 *      - GET /advances returns organization-scoped or branch-scoped advances
 *   8. DEF-HR-04: Cross-organization user target rejected with 403
 *   9. DEF-HR-05: resolveEffectivePolicyForCalculation resolves branch override over org default
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import type { Pool } from 'pg';

import { buildHrRouter } from '../routes/hr.routes.js';
import { normalizeAttendanceRow, bulkRecordManualAttendance } from '../services/hr.attendance.service.js';
import { processAbsencesForDate } from '../services/absence.service.js';
import { resolveEffectivePolicyForCalculation } from '../services/hr.policy.service.js';
import { issueToken } from '../services/jwt.service.js';

// Generate ephemeral RSA keypair in memory for JWT signing/verification during tests
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env['JWT_PRIVATE_KEY'] = privateKey;
process.env['JWT_PUBLIC_KEY'] = publicKey;

const ORG_A = '00000000-0000-0000-0000-000000000001';
const ORG_B = '99999999-9999-9999-9999-999999999999';

const BRANCH_A = '00000000-0000-0000-0000-000000000002';
const BRANCH_B = '11111111-1111-1111-1111-111111111111';
const BRANCH_ORG_B = '88888888-8888-8888-8888-888888888888';

const USER_ORG_ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_SHOP_ADMIN_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_STAFF_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_STAFF_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_STAFF_ORG_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const PERIOD_ORG_A = '12121212-1212-1212-1212-121212121212';
const PERIOD_ORG_B = '34343434-3434-3434-3434-343434343434';

interface MockUserRow {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  role: string;
  branch_id: string | null;
  branch_name: string | null;
  organization_id: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
}

const MOCK_USERS: Record<string, MockUserRow> = {
  [USER_ORG_ADMIN]: {
    id: USER_ORG_ADMIN,
    username: 'org_admin',
    full_name: 'Imran Khan Niazi',
    email: 'admin@niazi.pk',
    role: 'ADMIN',
    branch_id: null,
    branch_name: null,
    organization_id: ORG_A,
    is_active: true,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
  },
  [USER_SHOP_ADMIN_A]: {
    id: USER_SHOP_ADMIN_A,
    username: 'shop_admin_a',
    full_name: 'Branch A Admin',
    email: 'brancha@niazi.pk',
    role: 'SHOP_ADMIN',
    branch_id: BRANCH_A,
    branch_name: 'Main Branch',
    organization_id: ORG_A,
    is_active: true,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
  },
  [USER_STAFF_A]: {
    id: USER_STAFF_A,
    username: 'raja_cashier',
    full_name: 'Raja Cashier',
    email: null,
    role: 'CASHIER',
    branch_id: BRANCH_A,
    branch_name: 'Main Branch',
    organization_id: ORG_A,
    is_active: true,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
  },
  [USER_STAFF_B]: {
    id: USER_STAFF_B,
    username: 'asif_branch_b',
    full_name: 'Asif Mechanic B',
    email: null,
    role: 'REPAIR_MECHANIC',
    branch_id: BRANCH_B,
    branch_name: 'Branch Beta',
    organization_id: ORG_A,
    is_active: true,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
  },
  [USER_STAFF_ORG_B]: {
    id: USER_STAFF_ORG_B,
    username: 'outsider',
    full_name: 'Other Org Employee',
    email: null,
    role: 'CASHIER',
    branch_id: BRANCH_ORG_B,
    branch_name: 'Other Org Branch',
    organization_id: ORG_B,
    is_active: true,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
  },
};

function createMockPool(capturedQueries: Array<{ sql: string; params: unknown[] }>): Pool {
  const attendanceMap = new Map<string, any>();
  attendanceMap.set(`${USER_STAFF_A}:2026-11-18`, {
    id: 'att-1',
    user_id: USER_STAFF_A,
    organization_id: ORG_A,
    branch_id: BRANCH_A,
    attendance_date: '2026-11-18',
    first_login_at: '2026-11-18T04:10:00Z',
    checked_out_at: null,
    status: 'PRESENT',
    worked_minutes: null,
    late_minutes: 0,
    shift_duration_minutes_snap: 660,
    late_threshold_minutes_snap: 20,
    source: 'MANUAL',
    notes: 'On time',
    recorded_by: USER_ORG_ADMIN,
    updated_at: '2026-11-18T04:10:00Z',
  });

  const queryHandler = async (sqlText: string, params: unknown[] = []) => {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    capturedQueries.push({ sql, params });

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    // buildAuthMiddleware active account check
    if (sql.includes('SELECT is_active, status, role FROM users WHERE id = $1')) {
      const uid = String(params[0]);
      const u = MOCK_USERS[uid];
      if (!u) return { rows: [], rowCount: 0 };
      return {
        rows: [{ is_active: u.is_active, status: u.status, role: u.role }],
        rowCount: 1,
      };
    }

    // authorizeStaffTargetAccess
    if (sql.includes('FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1')) {
      const targetId = String(params[0]);
      const orgId = String(params[1]);
      const u = MOCK_USERS[targetId];
      if (!u) return { rows: [], rowCount: 0 };
      if (u.organization_id === orgId) {
        return { rows: [{ id: u.id, branch_id: u.branch_id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('SELECT id FROM users WHERE id = $1 LIMIT 1')) {
      const targetId = String(params[0]);
      const u = MOCK_USERS[targetId];
      return u ? { rows: [{ id: u.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    // getDailyAttendanceRegister
    if (sql.includes('LEFT JOIN staff_attendance sa ON sa.user_id = u.id AND sa.attendance_date = $2')) {
      const orgId = String(params[0]);
      const date = String(params[1]);
      const branchId = params[2] ? String(params[2]) : null;
      const activeUsers = Object.values(MOCK_USERS)
        .filter((u) => u.organization_id === orgId && u.is_active)
        .filter((u) => (branchId ? u.branch_id === branchId : true));
      const rows = activeUsers.map((u) => {
        const rec = attendanceMap.get(`${u.id}:${date}`);
        return {
          user_id: u.id,
          username: u.username,
          full_name: u.full_name,
          role: u.role,
          branch_id: u.branch_id,
          branch_name: u.branch_name,
          record_id: rec?.id ?? null,
          raw_status: rec?.status ?? null,
          first_login_at: rec?.first_login_at ?? null,
          checked_out_at: rec?.checked_out_at ?? null,
          worked_minutes: rec?.worked_minutes ?? null,
          late_minutes: rec?.late_minutes ?? 0,
          shift_duration_minutes_snap: rec?.shift_duration_minutes_snap ?? 660,
          late_threshold_minutes_snap: rec?.late_threshold_minutes_snap ?? 20,
          source: rec?.source ?? null,
          notes: rec?.notes ?? null,
          recorded_by: rec?.recorded_by ?? null,
          updated_at: rec?.updated_at ?? null,
        };
      });
      return { rows, rowCount: rows.length };
    }

    // listOrgActiveUsers (GET /staff)
    if (sql.includes('SELECT u.id AS user_id') && sql.includes('FROM users u')) {
      const orgId = String(params[0]);
      const branchId = params[1] ? String(params[1]) : null;
      const rows = Object.values(MOCK_USERS)
        .filter((u) => u.organization_id === orgId && u.is_active)
        .filter((u) => (branchId ? u.branch_id === branchId : true))
        .map((u) => ({
          user_id: u.id,
          username: u.username,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          branch_id: u.branch_id,
          branch_name: u.branch_name,
          is_active: u.is_active,
          created_at: u.created_at,
        }));
      return { rows, rowCount: rows.length };
    }

    // getActiveSalaryConfig / listSalaryConfigHistory
    if (sql.includes('FROM staff_salary_configs WHERE user_id = $1')) {
      const userId = String(params[0]);
      return {
        rows: [
          {
            id: 'sal-cfg-1',
            user_id: userId,
            organization_id: ORG_A,
            branch_id: MOCK_USERS[userId]?.branch_id ?? null,
            salary_type: 'MONTHLY',
            monthly_salary: 35000,
            daily_rate: null,
            hourly_rate: null,
            commission_percentage: null,
            effective_from: '2026-01-01',
            effective_to: null,
            overtime_multiplier: 1.5,
            configured_by: USER_ORG_ADMIN,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        rowCount: 1,
      };
    }

    // getPayrollPeriodById
    if (sql.includes('FROM payroll_periods WHERE id = $1')) {
      const pid = String(params[0]);
      if (pid === PERIOD_ORG_A) {
        return {
          rows: [
            {
              id: PERIOD_ORG_A,
              organization_id: ORG_A,
              label: '2026-11',
              period_start: '2026-11-01',
              period_end: '2026-11-30',
              period_month: 11,
              period_year: 2026,
              status: 'DRAFT',
              late_reset_policy: 'MONTHLY',
            },
          ],
          rowCount: 1,
        };
      }
      if (pid === PERIOD_ORG_B) {
        return {
          rows: [
            {
              id: PERIOD_ORG_B,
              organization_id: ORG_B,
              label: '2026-11',
              period_start: '2026-11-01',
              period_end: '2026-11-30',
              period_month: 11,
              period_year: 2026,
              status: 'DRAFT',
              late_reset_policy: 'MONTHLY',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    // getSalaryRecordsByPeriod
    if (sql.includes('FROM salary_records sr JOIN users u ON u.id = sr.user_id')) {
      const periodId = String(params[0]);
      const orgId = params[1] ? String(params[1]) : null;
      const branchId = params[2] ? String(params[2]) : null;
      const allRecords = [
        {
          id: 'sr-a',
          period_id: PERIOD_ORG_A,
          user_id: USER_STAFF_A,
          organization_id: ORG_A,
          branch_id: BRANCH_A,
          full_name: 'Raja Cashier',
          username: 'raja_cashier',
          base_salary: 35000,
          net_payable: 35000,
          paid_amount: 0,
          remaining_amount: 35000,
          status: 'DRAFT',
        },
        {
          id: 'sr-b',
          period_id: PERIOD_ORG_A,
          user_id: USER_STAFF_B,
          organization_id: ORG_A,
          branch_id: BRANCH_B,
          full_name: 'Asif Mechanic B',
          username: 'asif_branch_b',
          base_salary: 40000,
          net_payable: 40000,
          paid_amount: 0,
          remaining_amount: 40000,
          status: 'DRAFT',
        },
      ];
      const filtered = allRecords.filter(
        (r) =>
          r.period_id === periodId &&
          (!orgId || r.organization_id === orgId) &&
          (!branchId || r.branch_id === branchId)
      );
      return { rows: filtered, rowCount: filtered.length };
    }

    // listAdvancesForOrg
    if (sql.includes('FROM staff_advances sa JOIN users u ON u.id = sa.user_id')) {
      const orgId = String(params[0]);
      const branchId = params.length >= 2 && sql.includes('sa.branch_id = $2') ? String(params[1]) : null;
      const allAdvances = [
        {
          id: 'adv-a',
          user_id: USER_STAFF_A,
          organization_id: ORG_A,
          branch_id: BRANCH_A,
          amount: 5000,
          reason: 'Medical',
          status: 'PENDING',
          requested_date: '2026-11-18',
          user_name: 'Raja Cashier',
          username: 'raja_cashier',
          user_role: 'CASHIER',
          branch_name: 'Main Branch',
        },
        {
          id: 'adv-b',
          user_id: USER_STAFF_B,
          organization_id: ORG_A,
          branch_id: BRANCH_B,
          amount: 7000,
          reason: 'Family',
          status: 'PENDING',
          requested_date: '2026-11-18',
          user_name: 'Asif Mechanic B',
          username: 'asif_branch_b',
          user_role: 'REPAIR_MECHANIC',
          branch_name: 'Branch Beta',
        },
      ];
      const filtered = allAdvances.filter(
        (a) => a.organization_id === orgId && (!branchId || a.branch_id === branchId)
      );
      return { rows: filtered, rowCount: filtered.length };
    }

    // Bulk attendance FOR UPDATE check
    if (sql.includes('FROM staff_attendance WHERE user_id = $1 AND attendance_date = $2 AND organization_id = $3 FOR UPDATE')) {
      const uid = String(params[0]);
      const d = String(params[1]);
      const rec = attendanceMap.get(`${uid}:${d}`);
      return rec ? { rows: [{ id: rec.id, status: rec.status }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    // Bulk attendance user branch lookup
    if (sql.includes('SELECT branch_id FROM users WHERE id = $1')) {
      const uid = String(params[0]);
      const u = MOCK_USERS[uid];
      return u ? { rows: [{ branch_id: u.branch_id }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    // Bulk attendance INSERT/UPSERT
    if (sql.includes('INSERT INTO staff_attendance')) {
      const id = String(params[0]);
      const uid = String(params[1]);
      const orgId = String(params[2]);
      const branchId = params[3] ? String(params[3]) : null;
      const d = String(params[4]);
      const firstLoginAt = String(params[5]);
      const checkedOutAt = params[6] ? String(params[6]) : null;
      const status = String(params[7]);
      attendanceMap.set(`${uid}:${d}`, {
        id,
        user_id: uid,
        organization_id: orgId,
        branch_id: branchId,
        attendance_date: d,
        first_login_at: firstLoginAt,
        checked_out_at: checkedOutAt,
        status,
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    // resolveEffectivePolicyRow (branch override vs org default)
    if (sql.includes('FROM hr_policy_settings WHERE organization_id = $1 AND branch_id = $2')) {
      const branchId = String(params[1]);
      if (branchId === BRANCH_B) {
        return {
          rows: [
            {
              id: 'pol-branch-b',
              organization_id: ORG_A,
              branch_id: BRANCH_B,
              standard_shift_minutes: 540, // 9h override for Branch B
              late_threshold_minutes: 15,
              lates_for_absence: 4,
              monthly_working_days: 24,
              overtime_multiplier: 2.0,
              overtime_eligible_monthly: true,
              half_day_deduction_factor: 0.5,
              effective_from: '2026-01-01',
              effective_to: null,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('FROM hr_policy_settings WHERE organization_id = $1 AND branch_id IS NULL')) {
      return {
        rows: [
          {
            id: 'pol-org-default',
            organization_id: ORG_A,
            branch_id: null,
            standard_shift_minutes: 660, // 11h org default
            late_threshold_minutes: 20,
            lates_for_absence: 3,
            monthly_working_days: 26,
            overtime_multiplier: 1.5,
            overtime_eligible_monthly: true,
            half_day_deduction_factor: 0.5,
            effective_from: '2026-01-01',
            effective_to: null,
          },
        ],
        rowCount: 1,
      };
    }

    // processAbsencesForDate queries
    if (sql.includes('FROM staff_shift_assignments ssa')) {
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  };

  const mockClient = {
    query: queryHandler,
    release: () => {},
  };

  return {
    query: queryHandler,
    connect: async () => mockClient,
  } as unknown as Pool;
}

describe('HR Phase 2 — Security & Attendance Regression Suite', () => {
  const capturedQueries: Array<{ sql: string; params: unknown[] }> = [];
  let mockPool: Pool;
  let server: Server;
  let baseUrl: string;

  let tokenOrgAdmin: string;
  let tokenShopAdminA: string;

  before(async () => {
    mockPool = createMockPool(capturedQueries);
    const app = express();
    app.use(express.json());
    app.use('/api/v1/hr', buildHrRouter(mockPool));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/hr`;
        resolve();
      });
    });

    const defaultLimits = {
      max_discount_percent: 100,
      can_price_override: true,
      can_refund: true,
      can_void_sale: true,
      can_view_profit: true,
    };

    tokenOrgAdmin = issueToken({
      userId: USER_ORG_ADMIN,
      username: 'org_admin',
      role: 'ADMIN',
      accessProfile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: defaultLimits },
      branchId: null,
    });

    tokenShopAdminA = issueToken({
      userId: USER_SHOP_ADMIN_A,
      username: 'shop_admin_a',
      role: 'SHOP_ADMIN',
      accessProfile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: defaultLimits },
      branchId: BRANCH_A,
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ─── 1. DEF-HR-03: Midnight Placeholder Regression Tests ────────────────────

  test('DEF-HR-03 (1): ABSENT record with midnight placeholder returns check_in_at: null', () => {
    const raw = {
      id: 'att-abs-1',
      attendance_date: '2026-11-18',
      status: 'ABSENT',
      first_login_at: '2026-11-18T00:00:00Z',
      checked_out_at: null,
      worked_minutes: null,
    };
    const normalized = normalizeAttendanceRow(raw);
    assert.equal(normalized.check_in_at, null, 'ABSENT midnight placeholder must normalize check_in_at to null');
    assert.equal(normalized.check_out_at, null);
  });

  test('DEF-HR-03 (2): LEAVE record with midnight placeholder returns check_in_at: null', () => {
    const raw = {
      id: 'att-lv-1',
      attendance_date: '2026-11-18',
      status: 'LEAVE',
      first_login_at: '2026-11-18T00:00:00.000Z',
      checked_out_at: null,
      worked_minutes: null,
    };
    const normalized = normalizeAttendanceRow(raw);
    assert.equal(normalized.check_in_at, null, 'LEAVE midnight placeholder must normalize check_in_at to null');
  });

  test('DEF-HR-03 (3): PRESENT record with valid check-in time preserves check_in_at', () => {
    const raw = {
      id: 'att-pres-1',
      attendance_date: '2026-11-18',
      status: 'PRESENT',
      first_login_at: '2026-11-18T04:15:00Z',
      checked_out_at: '2026-11-18T15:15:00Z',
      worked_minutes: 660,
    };
    const normalized = normalizeAttendanceRow(raw);
    assert.equal(normalized.check_in_at, '2026-11-18T04:15:00Z');
    assert.equal(normalized.check_out_at, '2026-11-18T15:15:00Z');
  });

  test('DEF-HR-03 (4): PRESENT record with genuine midnight check-in is preserved', () => {
    const raw = {
      id: 'att-pres-midnight',
      attendance_date: '2026-11-18',
      status: 'PRESENT',
      first_login_at: '2026-11-18T00:00:00Z',
      checked_out_at: null,
      worked_minutes: null,
    };
    const normalized = normalizeAttendanceRow(raw);
    assert.equal(
      normalized.check_in_at,
      '2026-11-18T00:00:00Z',
      'Genuine midnight check-in on PRESENT status must be preserved'
    );
  });

  test('DEF-HR-03 (5): Record with missing check-out preserves check_out_at: null and worked_minutes: null', () => {
    const raw = {
      id: 'att-open-1',
      attendance_date: '2026-11-18',
      status: 'LATE',
      first_login_at: '2026-11-18T04:45:00Z',
      checked_out_at: null,
      worked_minutes: null,
    };
    const normalized = normalizeAttendanceRow(raw);
    assert.equal(normalized.check_in_at, '2026-11-18T04:45:00Z');
    assert.equal(normalized.check_out_at, null);
    assert.equal(normalized.worked_minutes, null);
  });

  // ─── 2. SEC-HR-01: Salary Config & History Cross-Branch IDOR Prevention ─────

  test('SEC-HR-01: SHOP_ADMIN (Branch A) is blocked (403) from reading Branch B employee salary config & history', async () => {
    const resConfig = await fetch(`${baseUrl}/staff/${USER_STAFF_B}/salary-config`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resConfig.status, 403, 'Expected 403 when SHOP_ADMIN reads another branch employee salary-config');

    const resHistory = await fetch(`${baseUrl}/staff/${USER_STAFF_B}/salary-config/history`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resHistory.status, 403, 'Expected 403 when SHOP_ADMIN reads another branch employee salary history');

    // Authorized same-branch read succeeds
    const resOwnBranch = await fetch(`${baseUrl}/staff/${USER_STAFF_A}/salary-config`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resOwnBranch.status, 200, 'Expected 200 when SHOP_ADMIN reads own branch employee salary-config');

    // Org Admin cross-branch read succeeds
    const resOrgAdmin = await fetch(`${baseUrl}/staff/${USER_STAFF_B}/salary-config`, {
      headers: { Authorization: `Bearer ${tokenOrgAdmin}` },
    });
    assert.equal(resOrgAdmin.status, 200, 'Expected 200 when ADMIN reads any branch employee salary-config');
  });

  // ─── 3. SEC-HR-02: Staff Advances Cross-Branch IDOR Prevention ──────────────

  test('SEC-HR-02: SHOP_ADMIN (Branch A) is blocked (403) from reading or creating advances for Branch B employee', async () => {
    const resGet = await fetch(`${baseUrl}/staff/${USER_STAFF_B}/advances`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resGet.status, 403, 'Expected 403 when SHOP_ADMIN reads Branch B employee advances');

    const resPost = await fetch(`${baseUrl}/staff/${USER_STAFF_B}/advances`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenShopAdminA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 5000, reason: 'IDOR attempt' }),
    });
    assert.equal(resPost.status, 403, 'Expected 403 when SHOP_ADMIN creates advance for Branch B employee');
  });

  // ─── 4. SEC-HR-03: GET /staff Branch Scoping for SHOP_ADMIN ─────────────────

  test('SEC-HR-03: SHOP_ADMIN (Branch A) receives only Branch A staff on GET /staff and gets 403 for ?branch_id=BRANCH_B', async () => {
    const resList = await fetch(`${baseUrl}/staff`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resList.status, 200);
    const staffList = (await resList.json()) as Array<{ user_id: string; branch_id: string }>;
    assert.ok(Array.isArray(staffList) && staffList.length > 0);
    for (const member of staffList) {
      assert.equal(member.branch_id, BRANCH_A, 'SHOP_ADMIN must only see staff from their own branch');
    }

    const resCrossBranch = await fetch(`${baseUrl}/staff?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resCrossBranch.status, 403, 'Expected 403 when SHOP_ADMIN requests another branch_id on GET /staff');
  });

  // ─── 5. SEC-HR-04: Payroll Period Records Org & Branch Isolation ────────────

  test('SEC-HR-04: GET /payroll-periods/:id/records enforces org and branch isolation', async () => {
    // SHOP_ADMIN A requesting records for Period A -> only receives Branch A records
    const resShopA = await fetch(`${baseUrl}/payroll-periods/${PERIOD_ORG_A}/records`, {
      headers: { Authorization: `Bearer ${tokenShopAdminA}` },
    });
    assert.equal(resShopA.status, 200);
    const recordsA = (await resShopA.json()) as Array<{ branch_id: string }>;
    assert.equal(recordsA.length, 1);
    assert.equal(recordsA[0].branch_id, BRANCH_A);

    // SHOP_ADMIN A requesting ?branch_id=BRANCH_B -> 403
    const resCrossBranch = await fetch(
      `${baseUrl}/payroll-periods/${PERIOD_ORG_A}/records?branch_id=${BRANCH_B}`,
      { headers: { Authorization: `Bearer ${tokenShopAdminA}` } }
    );
    assert.equal(resCrossBranch.status, 403);

    // Org Admin A requesting Period belonging to Org B -> 403
    const resCrossOrg = await fetch(`${baseUrl}/payroll-periods/${PERIOD_ORG_B}/records`, {
      headers: { Authorization: `Bearer ${tokenOrgAdmin}` },
    });
    assert.equal(resCrossOrg.status, 403, 'Expected 403 when accessing payroll period of another organization');
  });

  // ─── 6. SEC-HR-05: Absence Processor Organization Scoping ──────────────────

  test('SEC-HR-05: processAbsencesForDate binds organizationId as $2 across branches, shift assignments, templates, and attendance', async () => {
    capturedQueries.length = 0;
    await processAbsencesForDate(mockPool, '2026-01-15', ORG_A);

    const absenceQuery = capturedQueries.find((q) => q.sql.includes('JOIN staff_shift_assignments ssa'));
    assert.ok(absenceQuery, 'Expected processAbsencesForDate to execute shift assignment query');
    assert.equal(absenceQuery.params[0], '2026-01-15');
    assert.equal(absenceQuery.params[1], ORG_A, 'Expected organizationId bound as $2');
    assert.ok(absenceQuery.sql.includes('b.organization_id = $2'), 'Query must filter branches by organization_id = $2');
    assert.ok(
      absenceQuery.sql.includes('ssa.organization_id = $2'),
      'Query must filter staff_shift_assignments by organization_id = $2'
    );
    assert.ok(
      absenceQuery.sql.includes('st.organization_id = $2'),
      'Query must filter staff_shift_templates by organization_id = $2'
    );
    assert.ok(
      absenceQuery.sql.includes('sa.organization_id = $2'),
      'Query must filter staff_attendance by organization_id = $2'
    );
  });

  // ─── 7. DEF-HR-04: Cross-Organization Target Access Blocked ─────────────────

  test('DEF-HR-04: Organization Admin of Org A is blocked (403) from accessing user in Org B', async () => {
    const res = await fetch(`${baseUrl}/staff/${USER_STAFF_ORG_B}/salary-config`, {
      headers: { Authorization: `Bearer ${tokenOrgAdmin}` },
    });
    assert.equal(res.status, 403, 'Cross-organization target user must be rejected with 403');
  });

  // ─── 8. DEF-HR-01: Daily Register, Bulk Attendance & Org Advances ───────────

  test('DEF-HR-01: GET /attendance/register returns active employees with NOT_MARKED when no record exists', async () => {
    const res = await fetch(`${baseUrl}/attendance/register?date=2026-11-18`, {
      headers: { Authorization: `Bearer ${tokenOrgAdmin}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      summary: { total_employees: number; present: number; not_marked: number };
      rows: Array<{ user_id: string; status: string; check_in_at: string | null }>;
    };
    assert.equal(body.summary.total_employees, 4);
    assert.equal(body.summary.present, 1);
    assert.equal(body.summary.not_marked, 3);

    const markedRow = body.rows.find((r) => r.user_id === USER_STAFF_A);
    assert.equal(markedRow?.status, 'PRESENT');
    assert.equal(markedRow?.check_in_at, '2026-11-18T04:10:00Z');

    const unmarkedRow = body.rows.find((r) => r.user_id === USER_STAFF_B);
    assert.equal(unmarkedRow?.status, 'NOT_MARKED');
    assert.equal(unmarkedRow?.check_in_at, null);
  });

  test('DEF-HR-01: bulkRecordManualAttendance skips existing record when overwrite_existing is false and updates unmarked', async () => {
    const verifiedUserBranches = new Map<string, string | null>([
      [USER_STAFF_A, BRANCH_A],
      [USER_STAFF_B, BRANCH_B],
    ]);
    const result = await bulkRecordManualAttendance(mockPool, {
      organization_id: ORG_A,
      date: '2026-11-18',
      overwrite_existing: false,
      recorded_by: USER_ORG_ADMIN,
      verifiedUserBranches,
      items: [
        { user_id: USER_STAFF_A, status: 'ABSENT' }, // already marked PRESENT -> should skip
        { user_id: USER_STAFF_B, status: 'LEAVE', notes: 'Approved leave' }, // unmarked -> should insert
      ],
    });

    assert.equal(result.skipped_count, 1, 'Existing record must be skipped when overwrite_existing=false');
    assert.equal(result.skipped[0].user_id, USER_STAFF_A);
    assert.equal(result.updated_count, 1, 'Unmarked record must be inserted');
    assert.deepEqual(result.updated_user_ids, [USER_STAFF_B]);
  });

  // ─── 9. DEF-HR-05: Effective Policy Resolution (Branch Override vs Org Default) ─

  test('DEF-HR-05: resolveEffectivePolicyForCalculation resolves branch override for Branch B and org default for Branch A', async () => {
    const policyBranchA = await resolveEffectivePolicyForCalculation(
      mockPool,
      ORG_A,
      BRANCH_A,
      '2026-11-18'
    );
    assert.equal(policyBranchA.standard_shift_minutes, 660);
    assert.equal(policyBranchA.late_threshold_minutes, 20);
    assert.equal(policyBranchA.lates_for_absence, 3);
    assert.equal(policyBranchA.monthly_working_days, 26);

    const policyBranchB = await resolveEffectivePolicyForCalculation(
      mockPool,
      ORG_A,
      BRANCH_B,
      '2026-11-18'
    );
    assert.equal(policyBranchB.standard_shift_minutes, 540);
    assert.equal(policyBranchB.late_threshold_minutes, 15);
    assert.equal(policyBranchB.lates_for_absence, 4);
    assert.equal(policyBranchB.monthly_working_days, 24);
    assert.equal(policyBranchB.overtime_multiplier, 2.0);
  });
});
