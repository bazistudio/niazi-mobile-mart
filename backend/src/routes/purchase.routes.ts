/**
 * Purchases HTTP Route Handlers (Phase 5A migration)
 * Direct TypeScript Express router for Purchases domain.
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
import {
  completePurchase,
  getPurchaseById,
  getPurchaseByInvoice,
  getPurchaseLines,
  listPurchases,
  PurchaseRepoError,
  CompletePurchaseDto,
} from '../repositories/purchase.repo';

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
  console.error('[purchase.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof PurchaseRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createPurchaseRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── POST /api/purchases ──────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CompletePurchaseDto;
      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }
      const result = await completePurchase(pool, dto, identity.user_id);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/purchases ───────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const supplier_id = (req.query['supplier_id'] as string) || null;
      const branch_id = (req.query['branch_id'] as string) || null;
      const status = (req.query['status'] as string) || null;
      const start_date = (req.query['start_date'] as string) || null;
      const end_date = (req.query['end_date'] as string) || null;

      const purchases = await listPurchases(pool, {
        supplier_id,
        branch_id,
        status,
        start_date,
        end_date,
      });
      res.status(200).json(purchases);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/purchases/invoice/:number ──────────────────────────────────
  router.get('/invoice/:number', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const number = req.params['number'] as string;
      const purchase = await getPurchaseByInvoice(pool, number);
      if (!purchase) {
        res.status(404).json({ error: `Purchase invoice '${number}' not found` });
        return;
      }
      res.status(200).json(purchase);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/purchases/:id ───────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const purchase = await getPurchaseById(pool, id);
      if (!purchase) {
        res.status(404).json({ error: `Purchase '${id}' not found` });
        return;
      }
      res.status(200).json(purchase);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/purchases/:id/items ─────────────────────────────────────────
  router.get('/:id/items', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const lines = await getPurchaseLines(pool, id);
      res.status(200).json(lines);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
