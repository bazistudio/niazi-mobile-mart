/**
 * Sync Engine HTTP Route Handlers (Phase 5D migration)
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
import {
  enqueueSyncItem,
  getSyncEngineStatus,
  processSyncQueue,
  SyncRepoError,
} from '../repositories/sync.repo';

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
  console.error('[sync.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof SyncRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createSyncRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/sync/status ─────────────────────────────────────────────────
  router.get('/status', async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getSyncEngineStatus(pool);
      res.status(200).json(status);
    } catch (err) {
      sendError(_req, res, err);
    }
  });

  // ── POST /api/sync/enqueue ───────────────────────────────────────────────
  router.post('/enqueue', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    try {
      const body = req.body as {
        terminal_id: string;
        entity_type: string;
        entity_id: string;
        operation: 'CREATE' | 'UPDATE' | 'DELETE';
        payload: Record<string, unknown>;
      };

      const terminalId = body.terminal_id || identity.branch_id || '00000000-0000-0000-0000-000000000001';
      const item = await enqueueSyncItem(
        pool,
        terminalId,
        body.entity_type,
        body.entity_id,
        body.operation,
        body.payload
      );
      res.status(201).json(item);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/sync/process ───────────────────────────────────────────────
  router.post('/process', async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await processSyncQueue(pool);
      res.status(200).json(result);
    } catch (err) {
      sendError(_req, res, err);
    }
  });

  return router;
}
