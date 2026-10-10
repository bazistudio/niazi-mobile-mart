/**
 * Sales HTTP route handlers.
 * Mirrors Axum sales handlers in src-tauri/src/bin/server.rs and
 * RBAC from src-tauri/src/commands/sales.rs.
 *
 * Registered routes:
 *   POST   /api/sales                  → completeSale       (auth: pos page + pos:sale action)
 *   GET    /api/sales                  → listSales          (auth: pos page)
 *   GET    /api/sales/invoice/:number  → getSaleByInvoice   (auth: pos page)
 *   GET    /api/sales/:id              → getSaleById        (auth: pos page)
 *   GET    /api/sales/:id/lines        → getSaleLines       (auth: pos page)
 *   GET    /api/sales/:id/payments     → getSalePayments    (auth: pos page)
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isOrgAdmin, isBranchAdmin, canAccessBranch, RequestIdentity } from '../auth';
import {
  completeSale,
  getSaleById,
  getSaleByInvoice,
  getSaleLines,
  getSalePayments,
  listSales,
  SaleRepoError,
  CompleteSaleDto,
  SaleFilterDto,
} from '../repositories/sale.repo';

// ─── Error Response Helper ────────────────────────────────────────────────────

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
  console.error('[sale.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof SaleRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createSaleRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // ── POST /api/sales ──────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', 'pos:sale');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CompleteSaleDto;
      const callerIsOrgAdmin = isOrgAdmin(identity);

      // P1 security fix: branch is resolved from server-side JWT identity, NOT from client DTO.
      // Non-org-admins always sell from their assigned branch regardless of what the client sends.
      // Org admins may select a branch explicitly via dto.branch_id; if omitted, identity branch is used.
      const result = await completeSale(pool, dto, identity.user_id, identity.branch_id, callerIsOrgAdmin);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/sales ───────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const callerIsOrgAdmin = isOrgAdmin(identity);
      const requestedBranch = (req.query['branch_id'] as string) || null;
      let effectiveBranchId: string | null = null;

      if (callerIsOrgAdmin) {
        effectiveBranchId = requestedBranch;
      } else {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: User has no assigned branch' });
          return;
        }
        effectiveBranchId = identity.branch_id;
      }

      const filter: SaleFilterDto = {
        customer_id: (req.query['customer_id'] as string) || null,
        branch_id: effectiveBranchId,
        payment_status: (req.query['payment_status'] as string) || null,
        sale_status: (req.query['sale_status'] as string) || null,
        start_date: (req.query['start_date'] as string) || null,
        end_date: (req.query['end_date'] as string) || null,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : null,
      };

      const sales = await listSales(pool, filter);
      res.status(200).json(sales);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/sales/invoice/:number ──────────────────────────────────────
  // Must be before /:id to avoid route conflict
  router.get('/invoice/:number', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const invoiceNumber = req.params['number'] as string;
      const sale = await getSaleByInvoice(pool, invoiceNumber);
      if (!sale) {
        res.status(404).json({ error: 'Sale not found' });
        return;
      }
      if (!canAccessBranch(identity, sale.branch_id)) {
        res.status(403).json({ error: 'Access denied: sale belongs to a different branch' });
        return;
      }
      res.status(200).json(sale);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/sales/:id ───────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const sale = await getSaleById(pool, id);
      if (!sale) {
        res.status(404).json({ error: 'Sale not found' });
        return;
      }
      if (!canAccessBranch(identity, sale.branch_id)) {
        res.status(403).json({ error: 'Access denied: sale belongs to a different branch' });
        return;
      }
      res.status(200).json(sale);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/sales/:id/lines ─────────────────────────────────────────────
  router.get('/:id/lines', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const sale = await getSaleById(pool, id);
      if (sale && !canAccessBranch(identity, sale.branch_id)) {
        res.status(403).json({ error: 'Access denied: sale belongs to a different branch' });
        return;
      }
      const lines = await getSaleLines(pool, id);
      res.status(200).json(lines);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/sales/:id/payments ──────────────────────────────────────────
  router.get('/:id/payments', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const sale = await getSaleById(pool, id);
      if (sale && !canAccessBranch(identity, sale.branch_id)) {
        res.status(403).json({ error: 'Access denied: sale belongs to a different branch' });
        return;
      }
      const payments = await getSalePayments(pool, id);
      res.status(200).json(payments);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
