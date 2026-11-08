/**
 * Reports HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { buildAuthMiddleware, authorizePermission, isBranchAdmin, isOrgAdmin, canAccessBranch, RequestIdentity } from '../auth';
import { getProfitSummary, getDashboardProfitSummary, ProfitRepoError } from '../repositories/profit.repo';

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
  console.error('[reports.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof ProfitRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createReportsRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── GET /api/reports/profit ───────────────────────────────────────────────
  router.get(['/profit', '/profit/dashboard'], async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const callerIsOrgAdmin = isOrgAdmin(identity);

    // Branch admins (SHOP_ADMIN, MANAGER) may view their own branch reports.
    // Org admins may view any branch or unscoped org-wide reports.
    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Profit reporting requires Admin or ShopAdmin role' });
      return;
    }

    try {
      const startDate = (req.query['start_date'] as string) || undefined;
      const endDate = (req.query['end_date'] as string) || undefined;
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;
      // Normalise the 'all' sentinel to undefined (org-wide unscoped) for org admins.
      // 'all' is not a real branch UUID; leaving it through would produce a literal
      // SQL WHERE branch_id = 'all' that matches nothing.
      const normalizedBranchId = requestedBranchId === 'all' ? undefined : requestedBranchId;

      let branchId: string | undefined;

      if (callerIsOrgAdmin) {
        // Org admin: validate the requested branch belongs to this org, then allow.
        // If no branch requested (or 'all' normalised to undefined), org-wide is permitted.
        if (normalizedBranchId && !canAccessBranch(identity, normalizedBranchId)) {
          res.status(403).json({ error: 'Access denied: You do not have permission to view reports for this branch' });
          return;
        }
        branchId = normalizedBranchId;
      } else {
        // Branch-scoped admin: must have a branch assignment; cannot override via query param.
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
          return;
        }
        branchId = identity.branch_id;
      }

      if (startDate || endDate) {
        const summary = await getProfitSummary(pool, {
          branch_id: branchId,
          start_date: startDate,
          end_date: endDate,
        });
        res.status(200).json(summary);
      } else {
        const dashboardSummary = await getDashboardProfitSummary(pool, branchId);
        res.status(200).json(dashboardSummary);
      }
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/reports/profit/summary ───────────────────────────────────────
  router.get('/profit/summary', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const callerIsOrgAdmin = isOrgAdmin(identity);

    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Profit reporting requires Admin or ShopAdmin role' });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;
      // Normalise the 'all' sentinel to undefined (org-wide unscoped) for org admins.
      const normalizedBranchId = requestedBranchId === 'all' ? undefined : requestedBranchId;

      let branchId: string | undefined;

      if (callerIsOrgAdmin) {
        if (normalizedBranchId && !canAccessBranch(identity, normalizedBranchId)) {
          res.status(403).json({ error: 'Access denied: You do not have permission to view reports for this branch' });
          return;
        }
        branchId = normalizedBranchId;
      } else {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
          return;
        }
        branchId = identity.branch_id;
      }

      const summary = await getProfitSummary(pool, {
        branch_id: branchId,
        start_date: (req.query['start_date'] as string) || undefined,
        end_date: (req.query['end_date'] as string) || undefined,
      });
      res.status(200).json(summary);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/reports/progress ─────────────────────────────────────────────
  // Employee activity progress report.
  // Query params: user_id (required), start_date, end_date, branch_id
  // Access: org admin or branch admin. Org admin may pass any user_id.
  // Branch admin may only view users in their own branch.
  router.get('/progress', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    if (!isBranchAdmin(identity)) {
      res.status(403).json({ error: 'Access denied: Progress reporting requires Admin or ShopAdmin role' });
      return;
    }

    const userId = (req.query['user_id'] as string) || undefined;
    const startDate = (req.query['start_date'] as string) || undefined;
    const endDate = (req.query['end_date'] as string) || undefined;
    const requestedBranchId = (req.query['branch_id'] as string) || undefined;

    if (!userId || userId.trim().length < 32) {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    // Branch-scoped admin can only view their own branch
    const callerIsOrgAdmin = isOrgAdmin(identity);
    let effectiveBranchId: string | undefined;
    if (callerIsOrgAdmin) {
      const normalizedBranchId = requestedBranchId === 'all' ? undefined : requestedBranchId;
      if (normalizedBranchId && !canAccessBranch(identity, normalizedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to view reports for this branch' });
        return;
      }
      effectiveBranchId = normalizedBranchId;
    } else {
      if (!identity.branch_id) {
        res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
        return;
      }
      effectiveBranchId = identity.branch_id;
    }

    try {
      // Build positional query params and param index helpers.
      // Param layout: $1 = user_id, $2 = branch_id (if any), $N = start_date (if any), $N+1 = end_date (if any)
      const cleanParams: unknown[] = [userId.trim()];
      if (effectiveBranchId) cleanParams.push(effectiveBranchId);
      const startIdx = cleanParams.length + 1;
      if (startDate) cleanParams.push(startDate);
      const endIdx = cleanParams.length + 1;
      if (endDate) cleanParams.push(endDate);

      // Independent CTEs — each aggregates independently to prevent row multiplication.
      // startIdx / endIdx are computed from cleanParams.length so they always reflect
      // the actual $N positions regardless of which optional params are present.
      const sql = `
        WITH
        -- Product POS sales by this user
        sales_agg AS (
          SELECT
            COUNT(DISTINCT s.id)                  AS sale_count,
            COALESCE(SUM(s.total_amount),    0)   AS gross_sales,
            COALESCE(SUM(s.discount_amount), 0)   AS total_discounts,
            COALESCE(SUM(s.paid_amount),     0)   AS total_collected
          FROM sales s
          WHERE s.created_by = $1
            ${effectiveBranchId ? `AND s.branch_id = $2` : ''}
            ${startDate  ? `AND s.created_at >= ${startIdx}` : ''}
            ${endDate    ? `AND s.created_at <= ${endIdx}`   : ''}
        ),
        -- Handset sales attributed via mobile_sale_items (sold_by)
        mobile_agg AS (
          SELECT
            COUNT(*)                              AS mobile_count,
            COALESCE(SUM(msi.sale_price), 0)      AS mobile_gross_sales
          FROM mobile_sale_items msi
          WHERE msi.sold_by = $1
            AND msi.is_return = FALSE
            ${effectiveBranchId ? `AND msi.branch_id = $2` : ''}
            ${startDate  ? `AND msi.created_at >= ${startIdx}` : ''}
            ${endDate    ? `AND msi.created_at <= ${endIdx}`   : ''}
        ),
        -- Sales returns attributed to this user (as return processor)
        returns_agg AS (
          SELECT
            COUNT(*)                              AS return_count,
            COALESCE(SUM(sr.refund_amount), 0)    AS total_refunds
          FROM sales_returns sr
          WHERE sr.processed_by = $1
            ${effectiveBranchId ? `AND sr.branch_id = $2` : ''}
            ${startDate  ? `AND sr.created_at >= $${startIdx}` : ''}
            ${endDate    ? `AND sr.created_at <= $${endIdx}`   : ''}
        ),
        -- Cash movements attributed to this user
        cash_agg AS (
          SELECT
            COALESCE(SUM(CASE WHEN cm.movement_type = 'SALE_PAYMENT' THEN cm.amount ELSE 0 END), 0) AS cash_collected,
            COALESCE(SUM(CASE WHEN cm.movement_type = 'REFUND'       THEN cm.amount ELSE 0 END), 0) AS cash_refunded
          FROM cash_movements cm
          WHERE cm.created_by = $1
            ${effectiveBranchId ? `AND cm.branch_id = $2` : ''}
            ${startDate  ? `AND cm.created_at >= $${startIdx}` : ''}
            ${endDate    ? `AND cm.created_at <= $${endIdx}`   : ''}
        ),
        -- Repair jobs attributed to this user (as technician / assigned_to)
        repair_agg AS (
          SELECT
            COUNT(*)                              AS repair_count,
            COUNT(*) FILTER (WHERE rj.status IN ('COMPLETED','DELIVERED')) AS repair_completed,
            COALESCE(SUM(rj.quoted_price), 0)     AS repair_quoted_total
          FROM repair_jobs rj
          WHERE rj.assigned_to = $1
            ${effectiveBranchId ? `AND rj.branch_id = $2` : ''}
            ${startDate  ? `AND rj.created_at >= $${startIdx}` : ''}
            ${endDate    ? `AND rj.created_at <= $${endIdx}`   : ''}
        )
        SELECT
          sa.sale_count,
          sa.gross_sales,
          sa.total_discounts,
          sa.gross_sales - sa.total_discounts AS net_sales,
          sa.total_collected,
          ra.return_count,
          ra.total_refunds,
          ca.cash_collected,
          ca.cash_refunded,
          rpa.repair_count,
          rpa.repair_completed,
          rpa.repair_quoted_total,
          ma.mobile_count,
          ma.mobile_gross_sales
        FROM sales_agg sa
        CROSS JOIN returns_agg ra
        CROSS JOIN cash_agg ca
        CROSS JOIN repair_agg rpa
        CROSS JOIN mobile_agg ma
      `;

      const result = await pool.query(sql, cleanParams);
      const row = result.rows[0] || {};

      res.status(200).json({
        user_id: userId.trim(),
        branch_id: effectiveBranchId || null,
        period: { start_date: startDate || null, end_date: endDate || null },
        sales: {
          count: parseInt(row.sale_count || '0', 10),
          gross: parseFloat(row.gross_sales || '0'),
          discounts: parseFloat(row.total_discounts || '0'),
          net: parseFloat(row.net_sales || '0'),
          collected: parseFloat(row.total_collected || '0'),
        },
        returns: {
          count: parseInt(row.return_count || '0', 10),
          refunds: parseFloat(row.total_refunds || '0'),
        },
        cash: {
          collected: parseFloat(row.cash_collected || '0'),
          refunded: parseFloat(row.cash_refunded || '0'),
        },
        mobiles: {
          count: parseInt(row.mobile_count || '0', 10),
          gross: parseFloat(row.mobile_gross_sales || '0'),
        },
        repairs: {
          count: parseInt(row.repair_count || '0', 10),
          completed: parseInt(row.repair_completed || '0', 10),
          quoted_total: parseFloat(row.repair_quoted_total || '0'),
        },
      });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
