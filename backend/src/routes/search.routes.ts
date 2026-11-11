/**
 * Search Express Router
 * Routes:
 *   GET /api/v1/search → Unified multi-domain global search (Products, Customers, Suppliers, Invoices)
 *   GET /api/search    → Alias for /api/v1/search
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { globalSearch } from '../repositories/search.repo';
import { sendError, canViewProductCost } from './product.routes';
import { buildAuthMiddleware, isOrgAdmin, RequestIdentity } from '../auth';

export function createSearchRouter(pool: Pool): Router {
  const router = Router();
  router.use(buildAuthMiddleware(pool));

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const callerIsOrgAdmin = isOrgAdmin(identity);
    let branchId: string | null = null;

    // Global Search Bar (Phase 1):
    // All authenticated users across all branches can search the organization-wide product catalog
    // (including Central Warehouse stock). We pass the user's active/assigned branchId as context
    // so the repository can return both local branch stock AND warehouse/total stock in one step.
    if (!callerIsOrgAdmin) {
      branchId = identity.branch_id || null;
    } else {
      branchId = (req.query['branch_id'] as string) || (req.query['branchId'] as string) || identity.branch_id || null;
    }

    try {
      const q = (req.query['q'] as string) || (req.query['query'] as string) || (req.query['search'] as string) || '';
      const typeId = (req.query['type_id'] as string) || (req.query['typeId'] as string) || (req.query['category_id'] as string) || null;

      const results = await globalSearch(pool, q, branchId, typeId);
      const callerCanViewCost = canViewProductCost(identity);
      if (!callerCanViewCost && results.products.length > 0) {
        results.products = results.products.map((p) => ({
          ...p,
          purchasePrice: 0,
          costPrice: 0,
        }));
      }
      res.json(results);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
