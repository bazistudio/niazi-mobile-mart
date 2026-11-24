/**
 * Sales Analytics Routes
 *
 * All endpoints require an authenticated session with Shop Admin or higher role.
 * Query params: branch_id, start_date, end_date (ISO strings or YYYY-MM-DD).
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { buildAuthMiddleware, RequestIdentity } from '../auth';
import {
  SalesAnalyticsServiceError,
  saGetOverview,
  saGetProducts,
  saGetRepairs,
  saGetMobiles,
  saGetReconciliation,
  saGetExceptions,
  saGetFullReport,
} from '../services/sales_analytics.service';
import { SaFilters } from '../repositories/sales_analytics.repo';

function parseFilters(req: Request): SaFilters {
  return {
    branch_id:  (req.query['branch_id']  as string | undefined) || null,
    start_date: (req.query['start_date'] as string | undefined) || null,
    end_date:   (req.query['end_date']   as string | undefined) || null,
  };
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof SalesAnalyticsServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const msg = (err as Error)?.message || 'Sales analytics query failed';
  console.error('[sales_analytics.routes]', msg, err);
  res.status(500).json({ error: msg });
}

export function createSalesAnalyticsRouter(pool: Pool): Router {
  const router = Router();
  router.use(buildAuthMiddleware(pool));

  // GET /overview
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetOverview(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /products
  router.get('/products', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetProducts(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /repairs
  router.get('/repairs', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetRepairs(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /mobiles
  router.get('/mobiles', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetMobiles(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /reconciliation
  router.get('/reconciliation', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetReconciliation(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /exceptions
  router.get('/exceptions', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetExceptions(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /full-report — combines all 6 tabs in a single request
  router.get('/full-report', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const data = await saGetFullReport(pool, identity, parseFilters(req));
      res.status(200).json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
