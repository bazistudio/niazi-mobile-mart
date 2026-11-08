import { backfillMissingAbsences, processAbsencesForDate } from '../services/absence.service';
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
  RequestIdentity,
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
  listStaffForOrg,
  getStaffAttendanceForMonth,
} from '../services/hr.service';

const NIAZI_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function getParamStr(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || String();
  return param || String();
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

  // ── GET /staff — list active org users ────────────────────────────────────
  router.get('/staff', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: HR access requires Admin or Manager role' });
      return;
    }
    try {
      const staff = await listStaffForOrg(pool, NIAZI_ORGANIZATION_ID);
      res.status(200).json(staff);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/salary-config ─────────────────────────────────────
  router.get('/staff/:userId/salary-config', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const config = await getStaffSalaryConfig(pool, getParamStr(req.params['userId']));
      if (!config) {
        res.status(404).json({ error: 'No active salary config for this user' });
        return;
      }
      res.status(200).json(config);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/salary-config/history ──────────────────────────────
  router.get('/staff/:userId/salary-config/history', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const history = await getStaffSalaryConfigHistory(pool, getParamStr(req.params['userId']));
      res.status(200).json(history);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /staff/:userId/salary-config — set salary config ─────────────────
  router.post('/staff/:userId/salary-config', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Only org admins can set salary configs' });
      return;
    }
    try {
      const {
        salary_type,
        monthly_salary,
        daily_rate,
        hourly_rate,
        overtime_multiplier,
        effective_from,
      } = req.body as {
        salary_type: 'MONTHLY' | 'DAILY' | 'HOURLY';
        monthly_salary?: number;
        daily_rate?: number;
        hourly_rate?: number;
        overtime_multiplier?: number;
        effective_from: string;
      };

      if (!salary_type || !['MONTHLY', 'DAILY', 'HOURLY'].includes(salary_type)) {
        res.status(400).json({ error: 'salary_type must be MONTHLY, DAILY, or HOURLY' });
        return;
      }
      if (!effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(effective_from)) {
        res.status(400).json({ error: 'effective_from must be YYYY-MM-DD' });
        return;
      }

      const config = await setStaffSalaryConfig(pool, {
        user_id: getParamStr(req.params['userId']),
        organization_id: NIAZI_ORGANIZATION_ID,
        salary_type,
        monthly_salary,
        daily_rate,
        hourly_rate,
        overtime_multiplier,
        effective_from,
        configured_by: identity.user_id,
      });
      res.status(201).json(config);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/attendance?year=&month= ───────────────────────────
  router.get('/staff/:userId/attendance', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const year = parseInt(req.query['year'] as string || String(new Date().getFullYear()), 10);
      const month = parseInt(req.query['month'] as string || String(new Date().getMonth() + 1), 10);
      const records = await getStaffAttendanceForMonth(pool, getParamStr(req.params['userId']), year, month);
      res.status(200).json(records);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /staff/:userId/advances — request advance ────────────────────────
  router.post('/staff/:userId/advances', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const { requested_amount, reason } = req.body as {
        requested_amount: number;
        reason: string;
      };
      if (!requested_amount || requested_amount <= 0) {
        res.status(400).json({ error: 'requested_amount must be a positive number' });
        return;
      }
      if (!reason || reason.trim().length === 0) {
        res.status(400).json({ error: 'reason is required' });
        return;
      }
      const advance = await requestAdvance(pool, {
        user_id: getParamStr(req.params['userId']),
        organization_id: NIAZI_ORGANIZATION_ID,
        requested_amount,
        reason: reason.trim(),
        requested_by: identity.user_id,
      });
      res.status(201).json(advance);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /staff/:userId/advances — list advances ───────────────────────────
  router.get('/staff/:userId/advances', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const advances = await getStaffAdvances(pool, getParamStr(req.params['userId']), NIAZI_ORGANIZATION_ID);
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
      const { disbursed_amount, cash_movement_id } = req.body as {
        disbursed_amount: number;
        cash_movement_id?: string;
      };
      if (!disbursed_amount || disbursed_amount <= 0) {
        res.status(400).json({ error: 'disbursed_amount must be positive' });
        return;
      }
      const advance = await disburseStaffAdvance(pool, {
        advance_id: getParamStr(req.params['advanceId']),
        disbursed_amount,
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
      const { label, period_start, period_end, late_reset_policy } = req.body as {
        label: string;
        period_start: string;
        period_end: string;
        late_reset_policy?: string;
      };
      if (!label || !period_start || !period_end) {
        res.status(400).json({ error: 'label, period_start, and period_end are required' });
        return;
      }
      const period = await createOrgPayrollPeriod(pool, {
        organization_id: NIAZI_ORGANIZATION_ID,
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

  // ── GET /payroll-periods/:periodId/records — salary records ───────────────
  router.get('/payroll-periods/:periodId/records', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    try {
      const records = await getPayrollRecordsForPeriod(pool, getParamStr(req.params['periodId']));
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
      const {
        payment_amount, payment_method, payment_date,
        reference_number, notes,
      } = req.body as {
        payment_amount: number;
        payment_method: string;
        payment_date: string;
        reference_number?: string;
        notes?: string;
      };
      if (!payment_amount || payment_amount <= 0) {
        res.status(400).json({ error: 'payment_amount must be positive' });
        return;
      }
      if (!payment_method) {
        res.status(400).json({ error: 'payment_method is required' });
        return;
      }
      if (!payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
        res.status(400).json({ error: 'payment_date must be YYYY-MM-DD' });
        return;
      }
      const record = await processSalaryPayment(pool, {
        salary_record_id: getParamStr(req.params['recordId']),
        payment_amount,
        payment_method,
        payment_date,
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

    // POST /absence-process — Trigger automated absence backfill/processing (Admin only)
  router.post('/absence-process', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Organization Admin required' });
      return;
    }
    try {
      const targetDate = typeof req.body?.date === 'string' ? req.body.date.trim() : null;
      if (targetDate) {
        const result = await processAbsencesForDate(pool, targetDate);
        res.status(200).json({ success: true, result });
      } else {
        const results = await backfillMissingAbsences(pool, 7);
        res.status(200).json({ success: true, results });
      }
    } catch (err) {
      sendError(res, err);
    }
  });
  return router;
}
