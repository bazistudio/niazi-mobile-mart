/**
 * Search Express Router
 * Routes:
 *   GET /api/v1/search → Unified multi-domain global search (Products, Customers, Suppliers, Invoices)
 *   GET /api/search    → Alias for /api/v1/search
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { globalSearch } from '../repositories/search.repo';
import { sendError, authorizePermission } from './product.routes';
import { isAdmin } from '../auth';

export function createSearchRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = (req as any).identity;

    // Optional Branch Scope based on Role (Cashier/ShopAdmin scoped to active branch)
    let branchId: string | null = null;
    if (identity && !isAdmin(identity)) {
      branchId = identity.branch_id || null;
    }

    try {
      const q = (req.query['q'] as string) || (req.query['query'] as string) || (req.query['search'] as string) || '';
      const category = (req.query['category'] as string) || (req.query['type'] as string) || 'quick';

      const results = await globalSearch(pool, q, branchId, category);
      res.json(results);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
