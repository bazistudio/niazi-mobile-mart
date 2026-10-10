/**
 * Sales Returns HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, isOrgAdmin, isBranchAdmin, canAccessBranch, RequestIdentity } from '../auth';
import {
  createSalesReturn,
  getSaleReturnableInfo,
  listSalesReturns,
  CreateSalesReturnDto,
  ReturnsRepoError,
} from '../repositories/returns.repo';

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
  console.error('[returns.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
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

      // F-11 Security Fix: Check branch access on original sale before returning returnable info
      if (!canAccessBranch(identity, info.branch_id)) {
        res.status(403).json({ error: 'Access denied: sale belongs to a different branch' });
        return;
      }

      res.status(200).json(info);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/returns ─────────────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    // Returns require management permissions (Admin or ShopAdmin)
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Sales returns require Admin or ShopAdmin permissions' });
      return;
    }

    try {
      const dto = req.body as CreateSalesReturnDto;
      const result = await createSalesReturn(pool, dto, identity.user_id, identity.branch_id, isOrgAdmin(identity));
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
      const callerIsOrgAdmin = isOrgAdmin(identity);
      const requestedBranch = (req.query['branch_id'] as string) || null;
      let effectiveBranchId: string | undefined = undefined;

      if (callerIsOrgAdmin) {
        effectiveBranchId = requestedBranch || undefined;
      } else {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: User has no assigned branch' });
          return;
        }
        effectiveBranchId = identity.branch_id;
      }

      const returns = await listSalesReturns(pool, {
        branch_id: effectiveBranchId,
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
