/**
 * Sales Returns HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isAdmin, RequestIdentity } from '../auth';
import {
  createSalesReturn,
  getSaleReturnableInfo,
  listSalesReturns,
  CreateSalesReturnDto,
  ReturnsRepoError,
} from '../repositories/returns.repo';
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
  console.error('[returns.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      console.warn('[returns.routes] DB connection unavailable on read; proxying...');
      proxyToCentralServer(req, res);
      return;
    }
    res.status(502).json({ error: 'Database connection error' });
    return;
  }
  if (err instanceof ReturnsRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createReturnsRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── GET /api/returns/sale/:saleId/returnable ──────────────────────────────
  router.get('/sale/:saleId/returnable', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const saleId = req.params['saleId'] as string;
      const info = await getSaleReturnableInfo(pool, saleId);
      res.status(200).json(info);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/returns ─────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    // Returns require management permissions (Admin or ShopAdmin)
    if (!isAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Sales returns require Admin or ShopAdmin permissions' });
      return;
    }

    try {
      const dto = req.body as CreateSalesReturnDto;
      const result = await createSalesReturn(pool, dto, identity.user_id);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/returns ──────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const returns = await listSalesReturns(pool, {
        branch_id: (req.query['branch_id'] as string) || identity.branch_id || undefined,
        customer_id: (req.query['customer_id'] as string) || undefined,
        sale_id: (req.query['sale_id'] as string) || undefined,
      });
      res.status(200).json(returns);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
