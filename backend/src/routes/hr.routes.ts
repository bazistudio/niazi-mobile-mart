import { backfillMissingAbsences, processAbsencesForDate } from '../services/absence.service';
import {
  recordManualAttendance,
  updateManualAttendance,
  getAnnualAttendanceSummary,
  getDailyAttendanceRegister,
  getAttendanceRegisterRange,
  bulkRecordManualAttendance,
  VALID_ATTENDANCE_STATUSES,
  BulkAttendanceItemInput,
} from '../services/hr.attendance.service';
import {
  createPolicyVersion,
  retirePolicy,
  getEffectivePolicy,
  listOrgPolicies,
  listPolicyAuditHistory,
} from '../services/hr.policy.service';
/**
 * HR & Payroll Route Handlers
 *
 * All endpoints require authentication. Admin/OrgAdmin required for
 * financial operations (payroll approval, salary payment, advance approval).
 * Managers can view reports.
 *
 * Base paths: /api/hr and /api/v1/hr (registered in server.ts)
 *
 * Routes:
 *   GET    /staff                          — list org active users
 *   GET    /staff/:userId/salary-config    — get active salary config
 *   GET    /staff/:userId/salary-config/history — config history
 *   POST   /staff/:userId/salary-config    — set salary config (admin)
 *   GET    /staff/:userId/attendance       — get monthly attendance
 *   POST   /staff/:userId/advances        — request advance
 *   GET    /staff/:userId/advances        — list advances for user
 *   POST   /advances/:advanceId/approve   — approve advance (admin)
 *   POST   /advances/:advanceId/disburse  — disburse advance (admin)
 *   GET    /shift-templates               — list shift templates
 *   POST   /shift-templates               — create shift template (admin)
 *   GET    /payroll-periods               — list payroll periods
 *   POST   /payroll-periods               — create payroll period (admin)
 *   POST   /payroll-periods/:periodId/generate  — generate salary records (admin)
 *   GET    /payroll-periods/:periodId/records   — get salary records for period
 *   POST   /payroll-periods/:periodId/approve   — approve payroll period (admin)
 *   POST   /salary-records/:recordId/pay        — process salary payment (admin)
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  buildAuthMiddleware,
  isOrgAdmin,
  isBranchAdmin,
  canAccessBranch,
  RequestIdentity,
  NIAZI_ORGANIZATION_ID,
} from '../auth';
import {
  getStaffSalaryConfig,
  getStaffSalaryConfigHistory,
  setStaffSalaryConfig,
  listOrgShiftTemplates,
  createOrgShiftTemplate,
  createOrgPayrollPeriod,
  listOrgPayrollPeriods,
  approveOrgPayrollPeriod,
  generatePayroll,
  getPayrollRecordsForPeriod,
  processSalaryPayment,
  requestAdvance,
  approveStaffAdvance,
  disburseStaffAdvance,
  getStaffAdvances,
  listOrgAdvances,
  listStaffForOrg,
  getStaffAttendanceForMonth,
  getKarachiDate,
} from '../services/hr.service';

function getParamStr(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || String();
  return param || String();
}

/**
 * Validates authenticated organization and verifies whether caller identity
 * has permission to view/modify the target staff member's attendance.
 *
 * SEC-01 & SEC-02 Enforcement:
 * 1. Checks that identity exists and identity.organization_id === NIAZI_ORGANIZATION_ID.
 * 2. Administrative privileges required (isBranchAdmin).
 * 3. Authoritatively verifies target employee organization membership:
 *    INNER JOIN branches b ON b.id = u.branch_id WHERE u.id = $1 AND b.organization_id = $2.
 *    If user does not exist -> 404.
 *    If user has branch_id IS NULL or belongs to another organization -> 403 Access denied.
 * 4. Branch isolation:
 *    - Org Admin: allowed across any branch within the validated organization.
 *    - Branch Admin (SHOP_ADMIN, etc.): restricted to their own branch via canAccessBranch().
 */
async function authorizeStaffTargetAccess(
  pool: Pool,
  identity: RequestIdentity | undefined,
  targetUserId: string,
  res: Response
): Promise<{ allowed: boolean; userBranchId: string | null }> {
  if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
    res.status(403).json({ error: 'Invalid organization' });
    return { allowed: false, userBranchId: null };
  }

  if (!isBranchAdmin(identity)) {
    res.status(403).json({ error: 'Access denied: Administrative privileges required' });
    return { allowed: false, userBranchId: null };
  }

  // Authoritatively prove target user exists AND belongs to the caller's organization
  const userRes = await pool.query<{ id: string; branch_id: string | null; role: string; organization_id: string | null }>(
    `SELECT u.id, u.branch_id, u.role, b.organization_id
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1
       AND (b.organization_id = $2 OR (u.branch_id IS NULL AND u.role = 'ADMIN'))
     LIMIT 1`,
    [targetUserId, identity.organization_id]
  );

  if (userRes.rows.length === 0) {
    // Check if user exists at all to distinguish 404 from 403
    const existsCheck = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 LIMIT 1',
      [targetUserId]
    );
    if (existsCheck.rows.length === 0) {
      res.status(404).json({ error: 'Target staff user not found' });
      return { allowed: false, userBranchId: null };
    }
    // Target user exists but either has no branch assigned (non-admin with branch_id IS NULL)
    // or belongs to a branch of another organization
    res.status(403).json({ error: 'Access denied: Target user is not part of authorized organization' });
    return { allowed: false, userBranchId: null };
  }

  const targetBranch = userRes.rows[0].branch_id;

  if (!isOrgAdmin(identity)) {
    if (!targetBranch || !canAccessBranch(identity, targetBranch)) {
      res.status(403).json({ error: 'Access denied: Cannot access staff from another branch' });
      return { allowed: false, userBranchId: targetBranch };
    }
  }

  return { allowed: true, userBranchId: targetBranch };
}

function sendError(res: Response, err: unknown): void {
  console.error('[hr.routes] Error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (message.includes('not found')) {
    res.status(404).json({ error: message });
    return;
  }
  if (message.includes('Access denied') || message.includes('permission')) {
    res.status(403).json({ error: message });
    return;
  }
  if (
    message.includes('exceeds') ||
    message.includes('Cannot') ||
    message.includes('already')
  ) {
    res.status(400).json({ error: message });
    return;
  }
  res.status(500).json({ error: message });
}

export function buildHrRouter(pool: Pool): Router {
  const router = express.Router();

  // All HR routes require authentication
  router.use(buildAuthMiddleware(pool));

  // ── GET /staff — list active org users (SEC-HR-03 fix: branch-scoped for SHOP_ADMIN) ──
  router.get('/staff', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: HR access requires Admin or Shop Admin role' });
      return;
    }
    try {
      const requestedBranch = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'].trim() : '';
      let effectiveBranchId: string | null = null;

      if (isOrgAdmin(identity)) {
        effectiveBranchId = requestedBranch || null;
      } else {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: No assigned branch for branch administrator' });
          return;
        }
        if (requestedBranch && !canAccessBranch(identity, requestedBranch)) {
          res.status(403).json({ error: 'Access denied: Cannot list staff for another branch' });
          return;
        }
        effectiveBranchId = identity.branch_id;
      }

      const staff = await listStaffForOrg(pool, identity.organization_id, effectiveBranchId);
      res.status(200).json(staff);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/salary-config (SEC-HR-01 fix: enforce target authorization) ──
  router.get('/staff/:userId/salary-config', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const config = await getStaffSalaryConfig(pool, targetUserId);
      res.status(200).json(config ?? null);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/salary-config/history (SEC-HR-01 fix: enforce target authorization) ──
  router.get('/staff/:userId/salary-config/history', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const history = await getStaffSalaryConfigHistory(pool, targetUserId);
      res.status(200).json(history);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /staff/:userId/salary-config — set salary config (ORG_ADMIN + target org check) ─
  router.post('/staff/:userId/salary-config', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can set salary configs' });
      return;
    }
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const {
        salary_type,
        monthly_salary,
        daily_rate,
        hourly_rate,
        overtime_multiplier,
        commission_percentage,
        effective_from,
      } = req.body as {
        salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY' | 'COMMISSION_PERCENTAGE';
        monthly_salary?: number;
        daily_rate?: number;
        hourly_rate?: number;
        overtime_multiplier?: number;
        commission_percentage?: number;
        effective_from: string;
      };

      const VALID_SALARY_TYPES = ['MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION_PERCENTAGE'];
      if (!salary_type || !VALID_SALARY_TYPES.includes(salary_type)) {
        res.status(400).json({ error: `salary_type must be one of: ${VALID_SALARY_TYPES.join(', ')}` });
        return;
      }
      if (!effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(effective_from)) {
        res.status(400).json({ error: 'effective_from must be YYYY-MM-DD' });
        return;
      }

      // Commission-specific validation
      if (salary_type === 'COMMISSION_PERCENTAGE') {
        if (commission_percentage === undefined || commission_percentage === null) {
          res.status(400).json({ error: 'commission_percentage is required for COMMISSION_PERCENTAGE salary type' });
          return;
        }
        const pct = Number(commission_percentage);
        if (isNaN(pct)) {
          res.status(400).json({ error: 'commission_percentage must be a valid number' });
          return;
        }
        if (pct < 0) {
          res.status(400).json({ error: 'commission_percentage must not be negative' });
          return;
        }
        if (pct > 100) {
          res.status(400).json({ error: 'commission_percentage must not exceed 100' });
          return;
        }
      }

      const config = await setStaffSalaryConfig(pool, {
        user_id: getParamStr(req.params['userId']),
        organization_id: NIAZI_ORGANIZATION_ID,
        salary_type,
        monthly_salary,
        daily_rate,
        hourly_rate,
        overtime_multiplier,
        commission_percentage,
        effective_from,
        configured_by: identity.user_id,
      });
      res.status(201).json(config);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/attendance/annual-summary?year= ─────────────────
  // MUST be before /:userId/attendance so Express does not treat
  // "annual-summary" as a month query param against the GET route below.
  router.get('/staff/:userId/attendance/annual-summary', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const year = parseInt(req.query['year'] as string || String(new Date().getFullYear()), 10);
      const summary = await getAnnualAttendanceSummary(pool, targetUserId, year, identity.organization_id);
      res.status(200).json(summary);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/attendance?year=&month= ───────────────────────────
  router.get('/staff/:userId/attendance', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const year = parseInt(req.query['year'] as string || String(new Date().getFullYear()), 10);
      const month = parseInt(req.query['month'] as string || String(new Date().getMonth() + 1), 10);
      const records = await getStaffAttendanceForMonth(pool, targetUserId, year, month, identity.organization_id);
      res.status(200).json(records);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /staff/:userId/attendance — manual attendance entry ───────────────
  router.post('/staff/:userId/attendance', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const {
        attendance_date, check_in_at, check_out_at,
        status, notes,
      } = req.body as {
        attendance_date: string;
        check_in_at?: string | null;
        check_out_at?: string | null;
        status: string;
        notes?: string | null;
      };
      if (!attendance_date || !/^\d{4}-\d{2}-\d{2}$/.test(attendance_date)) {
        res.status(400).json({ error: 'attendance_date must be YYYY-MM-DD' });
        return;
      }
      const VALID_STATUSES = ['PRESENT','ABSENT','LATE','HALF_DAY','LEAVE','HOLIDAY','WEEKLY_OFF'];
      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        return;
      }
      const record = await recordManualAttendance(pool, {
        user_id: targetUserId,
        organization_id: identity.organization_id,
        attendance_date,
        check_in_at: check_in_at ?? null,
        check_out_at: check_out_at ?? null,
        status,
        notes: notes ?? null,
        recorded_by: identity.user_id,
      });
      res.status(201).json(record);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── PATCH /staff/:userId/attendance/:recordId — update attendance ─────────
  router.patch('/staff/:userId/attendance/:recordId', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const recordId = getParamStr(req.params['recordId']);

    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    // Verify record exists and belongs to target user AND caller's organization
    const recCheck = await pool.query<{ id: string; user_id: string; organization_id: string }>(
      'SELECT id, user_id, organization_id FROM staff_attendance WHERE id = $1 AND user_id = $2 AND organization_id = $3 LIMIT 1',
      [recordId, targetUserId, identity.organization_id]
    );
    if (recCheck.rows.length === 0) {
      res.status(404).json({ error: 'Attendance record not found for this user' });
      return;
    }

    try {
      const { check_in_at, check_out_at, status, notes } = req.body as {
        check_in_at?: string | null;
        check_out_at?: string | null;
        status?: string;
        notes?: string | null;
      };
      if (status) {
        const VALID_STATUSES = ['PRESENT','ABSENT','LATE','HALF_DAY','LEAVE','HOLIDAY','WEEKLY_OFF'];
        if (!VALID_STATUSES.includes(status)) {
          res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
          return;
        }
      }
      const record = await updateManualAttendance(pool, {
        record_id: recordId,
        user_id: targetUserId,
        organization_id: identity.organization_id,
        check_in_at,
        check_out_at,
        status,
        notes,
        updated_by: identity.user_id,
      });
      res.status(200).json(record);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /attendance/register?date=YYYY-MM-DD&branch_id= (DEF-HR-01) ───────
  router.get('/attendance/register', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const dateParam = typeof req.query['date'] === 'string' ? req.query['date'].trim() : '';
    const date = dateParam || getKarachiDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      return;
    }

    const requestedBranch = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'].trim() : '';
    let effectiveBranchId: string | null = null;

    if (isOrgAdmin(identity)) {
      effectiveBranchId = requestedBranch || null;
    } else {
      if (!identity.branch_id) {
        res.status(403).json({ error: 'Access denied: No assigned branch for branch administrator' });
        return;
      }
      if (requestedBranch && !canAccessBranch(identity, requestedBranch)) {
        res.status(403).json({ error: 'Access denied: Cannot access attendance register for another branch' });
        return;
      }
      effectiveBranchId = identity.branch_id;
    }

    try {
      const register = await getDailyAttendanceRegister(pool, {
        organization_id: identity.organization_id,
        date,
        branch_id: effectiveBranchId,
      });
      res.status(200).json(register);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /attendance/range?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&branch_id= (DEF-HR-01) ─
  router.get('/attendance/range', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const startDate = typeof req.query['start_date'] === 'string' ? req.query['start_date'].trim() : '';
    const endDate = typeof req.query['end_date'] === 'string' ? req.query['end_date'].trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ error: 'start_date and end_date must be in YYYY-MM-DD format' });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ error: 'end_date cannot be earlier than start_date' });
      return;
    }

    const requestedBranch = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'].trim() : '';
    let effectiveBranchId: string | null = null;

    if (isOrgAdmin(identity)) {
      effectiveBranchId = requestedBranch || null;
    } else {
      if (!identity.branch_id) {
        res.status(403).json({ error: 'Access denied: No assigned branch for branch administrator' });
        return;
      }
      if (requestedBranch && !canAccessBranch(identity, requestedBranch)) {
        res.status(403).json({ error: 'Access denied: Cannot access attendance range for another branch' });
        return;
      }
      effectiveBranchId = identity.branch_id;
    }

    try {
      const rangeData = await getAttendanceRegisterRange(pool, {
        organization_id: identity.organization_id,
        start_date: startDate,
        end_date: endDate,
        branch_id: effectiveBranchId,
      });
      res.status(200).json(rangeData);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /attendance/bulk — Transactional bulk attendance (DEF-HR-01) ─────
  router.post('/attendance/bulk', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const { date, items, overwrite_existing } = req.body as {
      date?: string;
      items?: BulkAttendanceItemInput[];
      overwrite_existing?: boolean;
    };

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items must be a non-empty array of attendance entries' });
      return;
    }
    if (items.length > 500) {
      res.status(400).json({ error: 'Bulk attendance payload cannot exceed 500 items per request' });
      return;
    }

    // 1. Validate every item's payload and authorize every target employee BEFORE starting DB writes
    const verifiedUserBranches = new Map<string, string | null>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item.user_id !== 'string' || !item.user_id.trim()) {
        res.status(400).json({ error: `Item at index ${i} is missing a valid user_id` });
        return;
      }
      if (!item.status || !(VALID_ATTENDANCE_STATUSES as readonly string[]).includes(item.status)) {
        res.status(400).json({
          error: `Item for user ${item.user_id} has invalid status. Must be one of: ${VALID_ATTENDANCE_STATUSES.join(', ')}`,
        });
        return;
      }
      if (item.check_in_at && item.check_out_at) {
        const inMs = new Date(item.check_in_at).getTime();
        const outMs = new Date(item.check_out_at).getTime();
        if (isNaN(inMs) || isNaN(outMs) || outMs <= inMs) {
          res.status(400).json({
            error: `Item for user ${item.user_id} has invalid time order: check_out_at must be later than check_in_at`,
          });
          return;
        }
      }

      if (!verifiedUserBranches.has(item.user_id)) {
        const auth = await authorizeStaffTargetAccess(pool, identity, item.user_id, res);
        if (!auth.allowed) {
          // authorizeStaffTargetAccess has already sent 403/404 response
          return;
        }
        verifiedUserBranches.set(item.user_id, auth.userBranchId);
      }
    }

    try {
      const result = await bulkRecordManualAttendance(pool, {
        organization_id: identity.organization_id,
        date,
        items,
        overwrite_existing: Boolean(overwrite_existing),
        recorded_by: identity.user_id,
        verifiedUserBranches,
      });
      res.status(200).json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /advances — Organization / Branch advances listing (DEF-HR-01) ────
  router.get('/advances', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const requestedBranch = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'].trim() : '';
    const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'].trim() : '';
    let effectiveBranchId: string | null = null;

    if (isOrgAdmin(identity)) {
      effectiveBranchId = requestedBranch || null;
    } else {
      if (!identity.branch_id) {
        res.status(403).json({ error: 'Access denied: No assigned branch for branch administrator' });
        return;
      }
      if (requestedBranch && !canAccessBranch(identity, requestedBranch)) {
        res.status(403).json({ error: 'Access denied: Cannot access advances for another branch' });
        return;
      }
      effectiveBranchId = identity.branch_id;
    }

    try {
      const advances = await listOrgAdvances(pool, {
        organization_id: identity.organization_id,
        branch_id: effectiveBranchId,
        status: statusFilter || null,
      });
      res.status(200).json(advances);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /staff/:userId/advances — request advance (SEC-HR-02 fix) ────────
  router.post('/staff/:userId/advances', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      // Accept `amount` (new frontend contract) or `requested_amount` (legacy)
      const { amount, requested_amount, reason, requested_date } = req.body as {
        amount?: number;
        requested_amount?: number;
        reason: string;
        requested_date?: string;
      };
      const resolvedAmount = amount ?? requested_amount ?? 0;
      if (!resolvedAmount || resolvedAmount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }
      if (!reason || reason.trim().length === 0) {
        res.status(400).json({ error: 'reason is required' });
        return;
      }
      const advance = await requestAdvance(pool, {
        user_id: targetUserId,
        organization_id: identity.organization_id,
        amount: resolvedAmount,
        reason: reason.trim(),
        requested_date: requested_date ?? null,
        requested_by: identity.user_id,
      });
      res.status(201).json(advance);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/advances — list advances (SEC-HR-02 fix) ───────────
  router.get('/staff/:userId/advances', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const targetUserId = getParamStr(req.params['userId']);
    const auth = await authorizeStaffTargetAccess(pool, identity, targetUserId, res);
    if (!auth.allowed) return;

    try {
      const advances = await getStaffAdvances(pool, targetUserId, identity.organization_id);
      res.status(200).json(advances);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /advances/:advanceId/approve — approve advance ───────────────────
  router.post('/advances/:advanceId/approve', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can approve advances' });
      return;
    }
    try {
      const advance = await approveStaffAdvance(
        pool, getParamStr(req.params['advanceId']), identity.user_id, NIAZI_ORGANIZATION_ID
      );
      if (!advance) {
        res.status(404).json({ error: 'Advance not found or already processed' });
        return;
      }
      res.status(200).json(advance);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /advances/:advanceId/disburse — disburse advance ─────────────────
  router.post('/advances/:advanceId/disburse', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can disburse advances' });
      return;
    }
    try {
      // Accept new frontend shape (payment_method + disbursement_date + reference_number)
      // as well as legacy shape (disbursed_amount + cash_movement_id).
      const {
        disbursed_amount,
        payment_method,
        disbursement_date,
        reference_number,
        cash_movement_id,
      } = req.body as {
        disbursed_amount?: number;
        payment_method?: string;
        disbursement_date?: string;
        reference_number?: string;
        cash_movement_id?: string;
      };
      const advance = await disburseStaffAdvance(pool, {
        advance_id: getParamStr(req.params['advanceId']),
        disbursed_amount,
        payment_method,
        disbursement_date: disbursement_date ?? null,
        reference_number: reference_number ?? null,
        disbursed_by: identity.user_id,
        organization_id: NIAZI_ORGANIZATION_ID,
        cash_movement_id,
      });
      res.status(200).json(advance);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /shift-templates — list shift templates ───────────────────────────
  router.get('/shift-templates', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const templates = await listOrgShiftTemplates(pool, NIAZI_ORGANIZATION_ID);
      res.status(200).json(templates);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /shift-templates — create shift template ─────────────────────────
  router.post('/shift-templates', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can create shift templates' });
      return;
    }
    try {
      const {
        name, shift_start_time, shift_end_time,
        shift_duration_minutes, break_duration_minutes,
        late_threshold_minutes, working_days_json,
      } = req.body as {
        name: string;
        shift_start_time: string;
        shift_end_time: string;
        shift_duration_minutes?: number;
        break_duration_minutes?: number;
        late_threshold_minutes?: number;
        working_days_json?: string;
      };
      if (!name || !shift_start_time || !shift_end_time) {
        res.status(400).json({ error: 'name, shift_start_time, and shift_end_time are required' });
        return;
      }
      const template = await createOrgShiftTemplate(pool, {
        organization_id: NIAZI_ORGANIZATION_ID,
        name, shift_start_time, shift_end_time,
        shift_duration_minutes, break_duration_minutes,
        late_threshold_minutes, working_days_json,
        created_by: identity.user_id,
      });
      res.status(201).json(template);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /payroll-periods — list payroll periods ───────────────────────────
  router.get('/payroll-periods', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const periods = await listOrgPayrollPeriods(pool, NIAZI_ORGANIZATION_ID);
      res.status(200).json(periods);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /payroll-periods — create payroll period ─────────────────────────
  router.post('/payroll-periods', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can create payroll periods' });
      return;
    }
    try {
      // Accept new frontend shape (period_month, period_year, start_date, end_date)
      // as well as legacy shape (label, period_start, period_end).
      const {
        period_month, period_year, start_date, end_date,
        label, period_start, period_end, late_reset_policy,
      } = req.body as {
        period_month?: number;
        period_year?: number;
        start_date?: string;
        end_date?: string;
        label?: string;
        period_start?: string;
        period_end?: string;
        late_reset_policy?: string;
      };
      // Require either new-shape dates OR legacy dates
      const hasNewShape = (start_date || end_date);
      const hasLegacyShape = (period_start || period_end);
      if (!hasNewShape && !hasLegacyShape) {
        res.status(400).json({ error: 'start_date and end_date (or period_start and period_end) are required' });
        return;
      }
      const period = await createOrgPayrollPeriod(pool, {
        organization_id: NIAZI_ORGANIZATION_ID,
        period_month, period_year, start_date, end_date,
        label, period_start, period_end, late_reset_policy,
        created_by: identity.user_id,
      });
      res.status(201).json(period);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /payroll-periods/:periodId/generate — generate payroll ───────────
  router.post('/payroll-periods/:periodId/generate', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can generate payroll' });
      return;
    }
    try {
      const records = await generatePayroll(
        pool, getParamStr(req.params['periodId']), NIAZI_ORGANIZATION_ID, identity.user_id
      );
      res.status(200).json({ generated: records.length, records });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /payroll-periods/:periodId/records — salary records (SEC-HR-04 fix) ─
  router.get('/payroll-periods/:periodId/records', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const requestedBranch = typeof req.query['branch_id'] === 'string' ? req.query['branch_id'].trim() : '';
      let effectiveBranchId: string | null = null;

      if (isOrgAdmin(identity)) {
        effectiveBranchId = requestedBranch || null;
      } else {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: No assigned branch for branch administrator' });
          return;
        }
        if (requestedBranch && !canAccessBranch(identity, requestedBranch)) {
          res.status(403).json({ error: 'Access denied: Cannot access payroll records for another branch' });
          return;
        }
        effectiveBranchId = identity.branch_id;
      }

      const records = await getPayrollRecordsForPeriod(
        pool,
        getParamStr(req.params['periodId']),
        identity.organization_id,
        effectiveBranchId
      );
      res.status(200).json(records);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /payroll-periods/:periodId/approve — approve payroll ─────────────
  router.post('/payroll-periods/:periodId/approve', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can approve payroll' });
      return;
    }
    try {
      const period = await approveOrgPayrollPeriod(
        pool, getParamStr(req.params['periodId']), identity.user_id, NIAZI_ORGANIZATION_ID
      );
      if (!period) {
        res.status(404).json({ error: 'Period not found or not in DRAFT status' });
        return;
      }
      res.status(200).json(period);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /salary-records/:recordId/pay — process salary payment ───────────
  router.post('/salary-records/:recordId/pay', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can process salary payments' });
      return;
    }
    try {
      // Accept `amount` (new frontend contract) or `payment_amount` (legacy).
      // payment_date is optional — service defaults to now_utc date when absent.
      const {
        amount: payAmt,
        payment_amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
      } = req.body as {
        amount?: number;
        payment_amount?: number;
        payment_method: string;
        payment_date?: string;
        reference_number?: string;
        notes?: string;
      };
      const resolvedPayAmount = payAmt ?? payment_amount ?? 0;
      if (!resolvedPayAmount || resolvedPayAmount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }
      if (!payment_method) {
        res.status(400).json({ error: 'payment_method is required' });
        return;
      }
      // payment_date is accepted but not required (defaults to today in service)
      if (payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
        res.status(400).json({ error: 'payment_date must be YYYY-MM-DD when provided' });
        return;
      }
      const record = await processSalaryPayment(pool, {
        salary_record_id: getParamStr(req.params['recordId']),
        payment_amount: resolvedPayAmount,
        payment_method,
        payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
        reference_number,
        notes,
        processed_by: identity.user_id,
        organization_id: NIAZI_ORGANIZATION_ID,
      });
      res.status(200).json(record);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /absence-process — Trigger automated absence backfill/processing (Admin only, SEC-HR-05 fix)
  router.post('/absence-process', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Organization Admin required' });
      return;
    }
    try {
      const targetDate = typeof req.body?.date === 'string' ? req.body.date.trim() : null;
      if (targetDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
          return;
        }
        const result = await processAbsencesForDate(pool, targetDate, identity.organization_id);
        res.status(200).json({ success: true, result });
      } else {
        const results = await backfillMissingAbsences(pool, 7, identity.organization_id);
        res.status(200).json({ success: true, results });
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  // ─── HR Policy Settings Routes (Stage 2.1) ──────────────────────────────────

  // GET /policies — List all organization policies (Org Admin: all, Shop Admin: own branch + org defaults)
  router.get('/policies', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    try {
      const allPolicies = await listOrgPolicies(pool, identity.organization_id);
      if (isOrgAdmin(identity)) {
        res.status(200).json(allPolicies);
        return;
      }

      // SHOP_ADMIN: Filter to org default (branch_id IS NULL) and their own branch
      const filtered = allPolicies.filter(
        (p) => p.branch_id === null || p.branch_id === identity.branch_id
      );
      res.status(200).json(filtered);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /policies/effective — Authoritative policy resolution for a branch & date
  router.get('/policies/effective', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const branchId = (req.query['branch_id'] as string) || identity.branch_id;
    const targetDate = (req.query['date'] as string) || new Date().toISOString().slice(0, 10);

    // Decision A: If caller or query supplies no branch, fail safely
    if (!branchId || !branchId.trim()) {
      res.status(400).json({ error: 'branch_id is required to resolve effective policy (unbranched employees excluded)' });
      return;
    }

    // Branch isolation for non-org-admins
    if (!isOrgAdmin(identity)) {
      if (!canAccessBranch(identity, branchId.trim())) {
        res.status(403).json({ error: 'Access denied: Cannot access policies for another branch' });
        return;
      }
    }

    try {
      const result = await getEffectivePolicy(pool, identity.organization_id, branchId.trim(), targetDate);
      res.status(200).json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /policies — Create a new policy version (Decision C: ORG_ADMIN only)
  router.post('/policies', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    // Decision C: Strictly only ORG_ADMIN can create policies or branch overrides
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only organization administrators can configure HR policies' });
      return;
    }

    try {
      const policy = await createPolicyVersion(
        pool,
        identity.organization_id,
        req.body,
        identity.user_id
      );
      res.status(201).json(policy);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /policies/:policyId/retire — Close an existing policy period (ORG_ADMIN only)
  router.post('/policies/:policyId/retire', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only organization administrators can retire HR policies' });
      return;
    }

    try {
      const effectiveTo = req.body?.effective_to as string;
      const policy = await retirePolicy(
        pool,
        identity.organization_id,
        getParamStr(req.params['policyId']),
        effectiveTo,
        identity.user_id
      );
      res.status(200).json(policy);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /policies/audit — Read policy audit history (immutable audit trail)
  router.get('/policies/audit', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!identity || identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Invalid organization' });
      return;
    }
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Administrative privileges required' });
      return;
    }

    const policyId = req.query['policy_id'] as string | undefined;
    const branchId = isOrgAdmin(identity)
      ? (req.query['branch_id'] as string | undefined)
      : identity.branch_id ?? undefined;

    try {
      const logs = await listPolicyAuditHistory(
        pool,
        identity.organization_id,
        policyId,
        branchId
      );
      res.status(200).json(logs);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
