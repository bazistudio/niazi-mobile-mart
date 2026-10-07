/**
 * Admin HTTP Route Handlers (Phase 5C migration)
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isAdmin, RequestIdentity } from '../auth';
import {
  getSystemHealthStats,
  reindexSearchTokens,
  AdminRepoError,
} from '../repositories/admin.repo';

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
  console.error('[admin.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof AdminRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createAdminRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/admin/stats ─────────────────────────────────────────────────
  router.get('/stats', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    try {
      const stats = await getSystemHealthStats(pool);
      res.status(200).json(stats);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/admin/reindex ──────────────────────────────────────────────
  router.post('/reindex', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    try {
      const result = await reindexSearchTokens(pool);
      res.status(200).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
