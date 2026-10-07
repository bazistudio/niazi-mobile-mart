/**
 * Purchase Returns HTTP Route Handlers (Phase 5B migration)
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
import {
  createPurchaseReturn,
  listPurchaseReturns,
  CreatePurchaseReturnDto,
  PurchaseReturnRepoError,
} from '../repositories/purchase_return.repo';

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
  console.error('[purchase_return.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof PurchaseReturnRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createPurchaseReturnRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── POST /api/purchase-returns ───────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CreatePurchaseReturnDto;
      const result = await createPurchaseReturn(pool, dto, identity.user_id);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/purchase-returns ────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const purchase_id = (req.query['purchase_id'] as string) || null;
      const returns = await listPurchaseReturns(pool, purchase_id);
      res.status(200).json(returns);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
