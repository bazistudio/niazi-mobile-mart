/**
 * Reports HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isAdmin, RequestIdentity } from '../auth';
import { getProfitSummary, getDashboardProfitSummary, ProfitRepoError } from '../repositories/profit.repo';

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
  console.error('[reports.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof ProfitRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createReportsRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/reports/profit ───────────────────────────────────────────────
  router.get(['/profit', '/profit/dashboard'], async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Profit reporting requires Admin or ShopAdmin permissions' });
      return;
    }

    try {
      const startDate = (req.query['start_date'] as string) || undefined;
      const endDate = (req.query['end_date'] as string) || undefined;
      const branchId = (req.query['branch_id'] as string) || identity.branch_id || undefined;

      if (startDate || endDate) {
        const summary = await getProfitSummary(pool, {
          branch_id: branchId,
          start_date: startDate,
          end_date: endDate,
        });
        res.status(200).json(summary);
      } else {
        const dashboardSummary = await getDashboardProfitSummary(pool, branchId);
        res.status(200).json(dashboardSummary);
      }
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/reports/profit/summary ───────────────────────────────────────
  router.get('/profit/summary', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Profit reporting requires Admin or ShopAdmin permissions' });
      return;
    }

    try {
      const summary = await getProfitSummary(pool, {
        branch_id: (req.query['branch_id'] as string) || identity.branch_id || undefined,
        start_date: (req.query['start_date'] as string) || undefined,
        end_date: (req.query['end_date'] as string) || undefined,
      });
      res.status(200).json(summary);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
