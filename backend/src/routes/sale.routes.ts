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

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
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

import { proxyToCentralServer } from '../server';

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
    msg.includes('Connection terminated') ||
    msg.includes('read')
  );
}

function sendError(req: Request, res: Response, err: unknown): void {
  console.error('[sale.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    // Only proxy read-only requests. Write requests (POST/PUT/DELETE/PATCH) must NOT be
    // automatically retried through Rust: if the TS transaction already committed server-side
    // before the connection dropped, a proxy retry would create a duplicate record (duplicate
    // sale, double stock deduction, double payment).
    if (req.method === 'GET' || req.method === 'HEAD') {
      console.warn('[sale.routes] DB connection unavailable on read; proxying to Central Server...');
      proxyToCentralServer(req, res);
      return;
    }
    console.error('[sale.routes] DB connection error on write route — returning 502, NOT proxying to prevent duplicate data');
    res.status(502).json({
      error: 'Database connection error',
      message: 'Write outcome is unknown. The operation was not automatically retried to prevent duplicate data.',
    });
    return;
  }
  if (err instanceof SaleRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

// ─── Branch Access Helper ─────────────────────────────────────────────────────

/**
 * Checks if identity has access to a given branch.
 * Mirrors AuthService::require_branch_access in src-tauri/src/services/auth_service.rs.
 */
function canAccessBranch(identity: RequestIdentity, branchId: string): boolean {
  if (identity.role === 'Admin' || identity.role === 'ShopAdmin') return true;
  if (identity.access_profile.allowed_pages.some((p) => p === '*')) return true;
  if (!identity.branch_id) return true;
  return identity.branch_id === branchId;
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

      // Enforce branch: if dto has no branch_id, use identity's branch (mirrors require_branch_access)
      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }

      const result = await completeSale(pool, dto, identity.user_id);
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
      const isOrgAdmin =
        identity.role === 'Admin' ||
        identity.role === 'ShopAdmin' ||
        identity.access_profile.allowed_pages.some((p) => p === '*');

      const filter: SaleFilterDto = {
        customer_id: (req.query['customer_id'] as string) || null,
        branch_id: (req.query['branch_id'] as string) || null,
        payment_status: (req.query['payment_status'] as string) || null,
        sale_status: (req.query['sale_status'] as string) || null,
        start_date: (req.query['start_date'] as string) || null,
        end_date: (req.query['end_date'] as string) || null,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : null,
      };

      // Non-org-admin users are restricted to their own branch
      if (!isOrgAdmin && !filter.branch_id) {
        filter.branch_id = identity.branch_id;
      }

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
