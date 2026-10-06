/**
 * Cash HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
import {
  closeCashSession,
  getCurrentCashSession,
  listCashMovements,
  openCashSession,
  recordCashMovement,
  CashRepoError,
  CloseCashSessionDto,
  OpenCashSessionDto,
  RecordCashMovementDto,
} from '../repositories/cash.repo';
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
  console.error('[cash.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      console.warn('[cash.routes] DB connection unavailable on read; proxying...');
      proxyToCentralServer(req, res);
      return;
    }
    res.status(502).json({ error: 'Database connection error' });
    return;
  }
  if (err instanceof CashRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createCashRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/cash/sessions/current ────────────────────────────────────────
  router.get('/sessions/current', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const branchId = (req.query['branch_id'] as string) || identity.branch_id || '00000000-0000-0000-0000-000000000001';
      const session = await getCurrentCashSession(pool, branchId);
      res.status(200).json({ session });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/sessions/open ─────────────────────────────────────────
  router.post('/sessions/open', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as OpenCashSessionDto;
      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
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
      const branchId = (req.query['branch_id'] as string) || identity.branch_id || null;
      const movements = await listCashMovements(pool, branchId);
      res.status(200).json(movements);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
