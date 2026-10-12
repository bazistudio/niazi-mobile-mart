/**
 * Search Express Router
 * Routes:
 *   GET /api/v1/search → Unified multi-domain global search (Products, Customers, Suppliers, Invoices)
 *   GET /api/search    → Alias for /api/v1/search
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { globalSearch } from '../repositories/search.repo';
import { sendError } from './product.routes';
import { buildAuthMiddleware, isOrgAdmin, RequestIdentity } from '../auth';

export function createSearchRouter(pool: Pool): Router {
  const router = Router();
  router.use(buildAuthMiddleware(pool));

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const callerIsOrgAdmin = isOrgAdmin(identity);
    let branchId: string | null = null;

    // Branch boundary enforcement:
    // Non-org-admins are strictly scoped to their assigned branch. Query parameter branch_id cannot override.
    // Org Admins may view branch-scoped search by supplying branch_id, or view global catalog if omitted.
    if (!callerIsOrgAdmin) {
      if (!identity.branch_id) {
        res.status(403).json({ error: 'Access denied: User has no assigned branch' });
        return;
      }
      branchId = identity.branch_id;
    } else {
      branchId = (req.query['branch_id'] as string) || (req.query['branchId'] as string) || null;
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
