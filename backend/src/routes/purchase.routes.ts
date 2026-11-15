/**
 * Purchase Routes — TypeScript Express router
 *
 * Implements the full purchase invoice and demand order REST API.
 *
 * Mounted at BOTH /api/purchases and /api/v1/purchases for compatibility.
 *
 * Routes:
 *   POST   /                        → completePurchase (create purchase invoice)
 *   GET    /                        → listPurchases
 *   GET    /:id                     → getPurchase (with lines)
 *   GET    /:id/lines               → getPurchaseLines
 *   POST   /demands                 → saveDemand (create demand order)
 *   GET    /demands                 → listDemands
 *   GET    /demands/:id             → getDemand (with items)
 *   PATCH  /demands/:id/status      → updateDemandStatus (ORDERED or CANCELLED)
 *
 * Authorization:
 *   All routes require valid JWT (authMiddleware).
 *   All routes require 'inventory' permission (mirrors existing inventory routes).
 *   Supplier purchase creation additionally enforces branch access.
 *   Org admins may target any branch; non-admins are locked to identity.branch_id.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { buildAuthMiddleware, authorizePermission, isOrgAdmin, canAccessBranch } from '../auth';
import {
  completePurchase,
  listPurchases,
  getPurchase,
  getPurchaseLines,
  saveDemand,
  listDemands,
  getDemand,
  updateDemandStatus,
  PurchaseRepoError,
  type CompletePurchaseDto,
  type SaveDemandDto,
  type PurchaseListFilters,
  type DemandListFilters,
} from '../repositories/purchase.repo';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildPurchaseRouter(pool: Pool): Router {
  const router = Router();

  // All purchase routes require authentication
  router.use(buildAuthMiddleware(pool));

  // Authorization helper — requires 'inventory' permission
  function requireInventoryPermission(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'inventory', null);
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  // Resolve the effective branch_id from request body or identity
  // Org admins may supply any branch they have access to;
  // non-admins are locked to their own branch.
  function resolveEffectiveBranch(req: Request, res: Response): string | null {
    const identity = req.identity!;
    const requestedBranchId: string | null =
      (req.body?.branch_id as string | null) ?? (req.query?.branch_id as string | null) ?? null;

    if (requestedBranchId) {
      if (!canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to the requested branch.',
        });
        return null;
      }
      return requestedBranchId;
    }

    // Fall back to identity branch
    if (!identity.branch_id) {
      res.status(400).json({
        error: 'BRANCH_REQUIRED',
        message: 'branch_id is required.',
      });
      return null;
    }
    return identity.branch_id;
  }

  // ─── Error handler ──────────────────────────────────────────────────────────
  function handleError(err: unknown, res: Response): void {
    if (err instanceof PurchaseRepoError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[PurchaseRoutes] Unhandled error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Internal server error: ${msg}` });
  }

  // ─── NOTE: /demands routes MUST be registered before /:id ──────────────────
  // Express matches routes in registration order. /demands would otherwise
  // be caught by /:id with id = "demands".

  // ── POST /demands — Create demand order ──────────────────────────────────────
  router.post('/demands', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    const identity = req.identity!;

    const branchId = resolveEffectiveBranch(req, res);
    if (!branchId) return;

    try {
      const dto: SaveDemandDto = {
        supplier_id:  req.body.supplier_id ?? null,
        customer_id:  req.body.customer_id ?? null,
        branch_id:    branchId,
        items:        req.body.items ?? [],
        notes:        req.body.notes ?? null,
        status:       req.body.status ?? 'DRAFT',
      };
      const demand = await saveDemand(pool, dto, identity.user_id ?? null);
      res.status(201).json(demand);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /demands — List demand orders ─────────────────────────────────────────
  router.get('/demands', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    const identity = req.identity!;

    // Non-org-admins can only see demands for their own branch
    let branchFilter: string | null = (req.query.branch_id as string) ?? null;
    if (!isOrgAdmin(identity)) {
      branchFilter = identity.branch_id ?? null;
    } else if (branchFilter && !canAccessBranch(identity, branchFilter)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Branch access denied.' });
      return;
    }

    try {
      const filters: DemandListFilters = {
        supplier_id: (req.query.supplier_id as string) ?? null,
        branch_id:   branchFilter,
        status:      (req.query.status as string) ?? null,
        limit:       req.query.limit ? Number(req.query.limit) : 50,
        offset:      req.query.offset ? Number(req.query.offset) : 0,
      };
      const demands = await listDemands(pool, filters);
      res.json(demands);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /demands/:demandId — Get single demand with items ────────────────────
  router.get('/demands/:demandId', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    try {
      const demandId = typeof req.params.demandId === 'string' ? req.params.demandId : String(req.params.demandId ?? '');
      const demand = await getDemand(pool, demandId);
      res.json(demand);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── PATCH /demands/:demandId/status — Update demand status ──────────────────
  router.patch('/demands/:demandId/status', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    const identity = req.identity!;

    const status = req.body.status as 'ORDERED' | 'CANCELLED';
    if (!status || !['ORDERED', 'CANCELLED'].includes(status)) {
      res.status(400).json({ error: 'status must be ORDERED or CANCELLED' });
      return;
    }

    try {
      const updated = await updateDemandStatus(
        pool,
        typeof req.params.demandId === 'string' ? req.params.demandId : String(req.params.demandId ?? ''),
        status,
        identity.user_id ?? null
      );
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── POST / — Create purchase invoice (atomic) ─────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    const identity = req.identity!;

    const branchId = resolveEffectiveBranch(req, res);
    if (!branchId) return;

    if (!req.body.supplier_id) {
      res.status(400).json({ error: 'supplier_id is required' });
      return;
    }
    // Accept both 'lines' (internal) and 'items' (frontend tauriClient convention)
    const rawLines = req.body.lines ?? req.body.items ?? [];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      res.status(400).json({ error: 'At least one purchase line is required (use lines or items field)' });
      return;
    }

    try {
      const dto: CompletePurchaseDto = {
        supplier_id:          req.body.supplier_id,
        branch_id:            branchId,
        lines:                rawLines,
        paid_amount:          req.body.paid_amount ?? 0,
        payment_method:       req.body.payment_method ?? null,
        payment_reference:    req.body.payment_reference ?? null,
        notes:                req.body.notes ?? null,
        demand_id:            req.body.demand_id ?? null,
        supplier_invoice_ref: req.body.supplier_invoice_ref ?? null,
        idempotency_key:      req.body.idempotency_key ?? null,
      };
      const result = await completePurchase(pool, dto, identity.user_id ?? null);
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET / — List purchases ────────────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    const identity = req.identity!;

    // Non-org-admins can only see purchases for their own branch
    let branchFilter: string | null = (req.query.branch_id as string) ?? null;
    if (!isOrgAdmin(identity)) {
      branchFilter = identity.branch_id ?? null;
    } else if (branchFilter && !canAccessBranch(identity, branchFilter)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Branch access denied.' });
      return;
    }

    try {
      const filters: PurchaseListFilters = {
        supplier_id:     (req.query.supplier_id as string) ?? null,
        branch_id:       branchFilter,
        payment_status:  (req.query.payment_status as string) ?? null,
        limit:           req.query.limit ? Number(req.query.limit) : 50,
        offset:          req.query.offset ? Number(req.query.offset) : 0,
      };
      const purchases = await listPurchases(pool, filters);
      res.json(purchases);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /:id — Get single purchase with lines ─────────────────────────────────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    try {
      const purchaseId1 = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');
      const purchase = await getPurchase(pool, purchaseId1);
      res.json(purchase);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ── GET /:id/lines — Get purchase lines only ──────────────────────────────────
  router.get('/:id/lines', async (req: Request, res: Response): Promise<void> => {
    if (!requireInventoryPermission(req, res)) return;
    try {
      const purchaseId2 = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');
      const lines = await getPurchaseLines(pool, purchaseId2);
      res.json(lines);
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
