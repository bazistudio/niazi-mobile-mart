/**
 * Cash HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { buildAuthMiddleware, authorizePermission, canAccessBranch, isOrgAdmin, RequestIdentity, NIAZI_ORGANIZATION_ID } from '../auth';
import {
  closeCashSession,
  getCurrentCashSession,
  getCashSessionById,
  getDailySummary,
  listCashMovements,
  listCashSessions,
  openCashSession,
  recordCashMovement,
  CashRepoError,
  CloseCashSessionDto,
  OpenCashSessionDto,
  RecordCashMovementDto,
} from '../repositories/cash.repo';

function isDbConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string }).message || String(err);
  const code = (err as { code?: string }).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated')
  );
}

function sendError(_req: Request, res: Response, err: unknown): void {
  console.error('[cash.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof CashRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const status = (err as { statusCode?: number })?.statusCode;
  if (status && typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({ error: (err as Error).message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createCashRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── GET /api/cash/sessions/current ────────────────────────────────────────
  router.get('/sessions/current', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;

      // Validate branch access when a specific branch is requested
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this branch' });
        return;
      }

      // F-07: Do not fall back to org UUID if no valid branch can be resolved.
      const branchId = requestedBranchId || identity.branch_id;
      if (!branchId) {
        res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
        return;
      }
      const session = await getCurrentCashSession(pool, branchId);
      res.status(200).json({ session });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/sessions ───────────────────────────────────────────────
  router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this branch' });
        return;
      }

      const branchId = requestedBranchId || identity.branch_id || null;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;
      const sessions = await listCashSessions(pool, branchId, limit, offset);
      res.status(200).json(sessions);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/sessions/:id ───────────────────────────────────────────
  router.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const session = await getCashSessionById(pool, sessionId as string);
      if (!session) {
        res.status(404).json({ error: 'Cash session not found' });
        return;
      }
      if (!canAccessBranch(identity, session.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this branch' });
        return;
      }
      res.status(200).json(session);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/summary ────────────────────────────────────────────────
  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this branch' });
        return;
      }

      const branchId = requestedBranchId || identity.branch_id;
      if (!branchId) {
        res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
        return;
      }

      const date = (req.query['date'] as string) || (req.query['business_date'] as string) || null;
      const summary = await getDailySummary(pool, branchId, date);
      res.status(200).json(summary);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/sessions/open ─────────────────────────────────────────
  router.post('/sessions/open', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', 'cash:open');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as OpenCashSessionDto;

      // Validate branch access when branch_id is supplied in body
      if (dto.branch_id && !canAccessBranch(identity, dto.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to open a session for this branch' });
        return;
      }

      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }

      if (!dto.branch_id) {
        res.status(400).json({ error: 'branch_id is required to open a cash session' });
        return;
      }

      const session = await openCashSession(pool, dto, identity.user_id);
      res.status(201).json(session);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/sessions/close ────────────────────────────────────────
  router.post('/sessions/close', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CloseCashSessionDto;

      // F-03: Verify the session belongs to a branch the caller can access.
      // Load the session record to obtain its actual stored branch_id.
      const sessionCheck = await pool.query<{ branch_id: string }>(
        'SELECT branch_id FROM cash_sessions WHERE id = $1',
        [dto.session_id]
      );
      if (sessionCheck.rows.length === 0) {
        res.status(404).json({ error: 'Cash session not found' });
        return;
      }
      const sessionBranchId = sessionCheck.rows[0]!.branch_id;
      if (!canAccessBranch(identity, sessionBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to close this cash session' });
        return;
      }

      const session = await closeCashSession(pool, dto, identity.user_id);
      res.status(200).json(session);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/movements ──────────────────────────────────────────────
  router.post('/movements', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as RecordCashMovementDto;

      // Validate branch access when branch_id is supplied in body
      if (dto.branch_id && !canAccessBranch(identity, dto.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to record movements for this branch' });
        return;
      }

      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }
      const mv = await recordCashMovement(pool, dto, identity.user_id);
      res.status(201).json(mv);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/movements ───────────────────────────────────────────────
  router.get('/movements', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;

      // Validate branch access when a specific branch is requested
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to view movements for this branch' });
        return;
      }

      const branchId = requestedBranchId || identity.branch_id || null;
      const movements = await listCashMovements(pool, branchId);
      res.status(200).json(movements);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/organization-summary ──────────────────────────────────
  // CMA-2: Organization Admin only — returns per-branch cash session status
  // and daily totals for all active non-warehouse branches, plus org-wide totals.
  router.get('/organization-summary', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    // Hard gate: Org Admin only. Branch users receive 403 immediately.
    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Organization administrator access required' });
      return;
    }

    // Single-tenant guard: token must belong to the known organization.
    if (identity.organization_id !== NIAZI_ORGANIZATION_ID) {
      res.status(403).json({ error: 'Access denied: Invalid organization context' });
      return;
    }

    try {
      // 1. Load all active, non-warehouse retail branches for this organization.
      //    Exclude the Central Warehouse (is_warehouse = 1) — it has no cash sessions.
      const branchesResult = await pool.query<{
        id: string;
        name: string;
        code: string;
        is_active: number;
      }>(
        `SELECT id, name, code, is_active
           FROM branches
          WHERE organization_id = $1
            AND is_warehouse = 0
          ORDER BY name ASC`,
        [NIAZI_ORGANIZATION_ID]
      );

      const branches = branchesResult.rows;

      if (branches.length === 0) {
        res.status(200).json({
          generated_at: new Date().toISOString(),
          organization_id: NIAZI_ORGANIZATION_ID,
          branches: [],
          org_totals: {
            total_opening_cash: 0,
            total_cash_in: 0,
            total_cash_out: 0,
            total_expected_cash: 0,
            total_cash_sales: 0,
            total_customer_payments: 0,
            total_supplier_payments: 0,
            total_expenses: 0,
            open_session_count: 0,
            closed_session_count: 0,
            no_session_count: 0,
          },
        });
        return;
      }

      // 2. Fetch the daily summary for each branch.
      //    getDailySummary uses the current OPEN session when available,
      //    falling back to the most recent session for the current calendar date.
      //    We call it without a targetDate so it follows the same semantics as
      //    the existing /api/cash/summary endpoint.
      const branchSummaries = await Promise.all(
        branches.map(async (branch) => {
          try {
            const summary = await getDailySummary(pool, branch.id);
            return {
              branch_id: branch.id,
              branch_name: branch.name,
              branch_code: branch.code,
              is_active: branch.is_active === 1,
              session_id: summary.session_id,
              session_status: summary.session_status, // 'OPEN' | 'CLOSED' | 'NONE'
              business_date: summary.business_date,
              opening_cash: summary.opening_cash,
              cash_sales: summary.cash_sales,
              customer_payments: summary.customer_payments,
              supplier_payments: summary.supplier_payments,
              cash_expenses: summary.cash_expenses,
              cash_in_adjustments: summary.cash_in_adjustments,
              cash_out_adjustments: summary.cash_out_adjustments,
              total_cash_in: summary.total_cash_in,
              total_cash_out: summary.total_cash_out,
              expected_closing_cash: summary.expected_closing_cash,
              actual_closing_cash: summary.actual_closing_cash,
              cash_variance: summary.cash_variance,
              error: null as string | null,
            };
          } catch (branchErr) {
            // Surface per-branch errors without aborting the whole response.
            console.error(
              `[cash.routes] organization-summary: getDailySummary failed for branch ${branch.id} (${branch.name}):`,
              (branchErr as Error).message
            );
            return {
              branch_id: branch.id,
              branch_name: branch.name,
              branch_code: branch.code,
              is_active: branch.is_active === 1,
              session_id: null as string | null,
              session_status: 'NONE' as const,
              business_date: null as string | null,
              opening_cash: 0,
              cash_sales: 0,
              customer_payments: 0,
              supplier_payments: 0,
              cash_expenses: 0,
              cash_in_adjustments: 0,
              cash_out_adjustments: 0,
              total_cash_in: 0,
              total_cash_out: 0,
              expected_closing_cash: 0,
              actual_closing_cash: null as number | null,
              cash_variance: null as number | null,
              error: (branchErr as Error).message,
            };
          }
        })
      );

      // 3. Compute organization-wide totals by summing branch rows.
      //    Only include branches with session_status !== 'NONE' (i.e., actual data)
      //    in the numeric totals to avoid zeroes from error branches inflating counts.
      //    Count stats cover all branches regardless.
      let totalOpeningCash = 0;
      let totalCashIn = 0;
      let totalCashOut = 0;
      let totalExpectedCash = 0;
      let totalCashSales = 0;
      let totalCustomerPayments = 0;
      let totalSupplierPayments = 0;
      let totalExpenses = 0;
      let openCount = 0;
      let closedCount = 0;
      let noneCount = 0;

      for (const b of branchSummaries) {
        if (b.session_status === 'OPEN') openCount++;
        else if (b.session_status === 'CLOSED') closedCount++;
        else noneCount++;

        // Only add to monetary totals when there is an actual session (not a NONE/error row).
        if (b.session_status !== 'NONE' && b.error === null) {
          totalOpeningCash += b.opening_cash;
          totalCashIn += b.total_cash_in;
          totalCashOut += b.total_cash_out;
          totalExpectedCash += b.expected_closing_cash;
          totalCashSales += b.cash_sales;
          totalCustomerPayments += b.customer_payments;
          totalSupplierPayments += b.supplier_payments;
          totalExpenses += b.cash_expenses;
        }
      }

      res.status(200).json({
        generated_at: new Date().toISOString(),
        organization_id: NIAZI_ORGANIZATION_ID,
        branches: branchSummaries,
        org_totals: {
          total_opening_cash: totalOpeningCash,
          total_cash_in: totalCashIn,
          total_cash_out: totalCashOut,
          total_expected_cash: totalExpectedCash,
          total_cash_sales: totalCashSales,
          total_customer_payments: totalCustomerPayments,
          total_supplier_payments: totalSupplierPayments,
          total_expenses: totalExpenses,
          open_session_count: openCount,
          closed_session_count: closedCount,
          no_session_count: noneCount,
        },
      });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
