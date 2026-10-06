/**
 * History HTTP route handlers.
 * Exposes GET /api/history and GET /api/history/stats.
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
import {
  getHistoryStats,
  listHistoryItems,
  HistoryFilterParams,
  HistoryRepoError,
} from '../repositories/history.repo';
import { proxyToCentralServer } from '../server';

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

function sendError(req: Request, res: Response, err: unknown): void {
  console.error('[history.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      console.warn('[history.routes] DB connection unavailable on read; proxying...');
      proxyToCentralServer(req, res);
      return;
    }
    res.status(502).json({ error: 'Database connection error' });
    return;
  }
  if (err instanceof HistoryRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createHistoryRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/history ──────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const isOrgAdmin =
        identity.role === 'Admin' ||
        identity.role === 'ShopAdmin' ||
        identity.access_profile.allowed_pages.some((p) => p === '*');

      const filter: HistoryFilterParams = {
        page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
        type: (req.query['type'] as string) || undefined,
        startDate: (req.query['startDate'] as string) || undefined,
        endDate: (req.query['endDate'] as string) || undefined,
        status: (req.query['status'] as string) || undefined,
        search: (req.query['search'] as string) || undefined,
        branch_id: !isOrgAdmin && identity.branch_id ? identity.branch_id : (req.query['branch_id'] as string) || null,
      };

      const result = await listHistoryItems(pool, filter);
      res.status(200).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/history/stats ────────────────────────────────────────────────
  router.get('/stats', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const isOrgAdmin =
        identity.role === 'Admin' ||
        identity.role === 'ShopAdmin' ||
        identity.access_profile.allowed_pages.some((p) => p === '*');

      const branchId = !isOrgAdmin && identity.branch_id ? identity.branch_id : (req.query['branch_id'] as string) || null;
      const stats = await getHistoryStats(pool, branchId);
      res.status(200).json(stats);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
