/**
 * Invoice & Printer Settings HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, isAdmin, isOrgAdmin, canAccessBranch, RequestIdentity } from '../auth';
import {
  getInvoicePrinterSettings,
  saveInvoicePrinterSettings,
  DbInvoicePrinterSettings,
} from '../repositories/settings.repo';

export function createSettingsRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(authMiddleware);

  // GET /api/settings/invoice-printer
  router.get('/invoice-printer', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      // Branch isolation: non-org-admin users can only read their own branch settings.
      // Org admins may pass ?branch_id= to read any branch.
      const requestedBranchId = (req.query['branch_id'] as string) || identity.branch_id;
      const branchId = isOrgAdmin(identity) ? requestedBranchId : identity.branch_id;
      const settings = await getInvoicePrinterSettings(pool, branchId);
      res.status(200).json(settings);
    } catch (err: any) {
      console.error('[settings.routes] Error fetching invoice printer settings:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch invoice printer settings' });
    }
  });

  // PUT /api/settings/invoice-printer
  router.put('/invoice-printer', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    // Only Admin or ShopAdmin roles can save persistent invoice settings
    if (!isAdmin(identity) && identity.role !== 'SHOP_ADMIN') {
      res.status(403).json({ error: 'Access denied: Invoice settings require Admin permissions' });
      return;
    }

    try {
      const dto = req.body as Partial<DbInvoicePrinterSettings>;

      // DEF-06: Branch isolation — non-org-admins are locked to their own branch.
      // Org admins may supply an explicit branch_id, validated via canAccessBranch.
      let branchId: string | undefined;
      if (isOrgAdmin(identity)) {
        // Org admins may write any branch they are authorized for
        const requestedBranchId = dto.branch_id || identity.branch_id;
        if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
          res.status(403).json({ error: 'Access denied: You do not have access to that branch' });
          return;
        }
        branchId = requestedBranchId ?? undefined;   // null → undefined (Error #8 fix)
      } else {
        // Non-org-admins are restricted to their authenticated branch — never trust dto.branch_id
        branchId = identity.branch_id ?? undefined;  // null → undefined (Error #9 fix)
      }

      const saved = await saveInvoicePrinterSettings(pool, branchId, dto);
      res.status(200).json(saved);
    } catch (err: any) {
      console.error('[settings.routes] Error saving invoice printer settings:', err);
      res.status(500).json({ error: err.message || 'Failed to save invoice printer settings' });
    }
  });

  return router;
}
