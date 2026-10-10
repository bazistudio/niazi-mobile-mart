/**
 * Branch Routes — TypeScript Express router (Phase 4 migration)
 *
 * TypeScript is now the ONLINE AUTHORITY for Branch operations.
 * These routes replace the following Rust Axum handlers:
 *
 *   GET  /api/v1/branches → list_branches_handler   (authorize_permission("org", null))
 *   POST /api/v1/branches → create_branch_handler   (authorize_permission("org", null))
 *
 * Additional routes:
 *   GET  /:id → get branch by ID
 *   PUT  /:id → update branch (name, is_active)
 *
 * Registered at /api/branches, /api/v1/branches, AND /api/shops for compatibility.
 * (The inline handler in server.ts served all three paths — preserved here.)
 *
 * Authorization:
 *   List branches: public to any authenticated user (all roles need to see branches)
 *   Create/update branch: ADMIN only (authorize_permission("org", null) → ADMIN role)
 *
 * Branch access isolation:
 *   ADMIN → all branches
 *   Branch users → see all branches for UI (but operations are restricted by their JWT branch_id)
 *   This route does NOT restrict listing; restriction happens at the domain level
 *   (users, customers, products etc. enforce their own branch isolation).
 *
 * IMPORTANT: DO NOT implement Party here.
 * IMPORTANT: DO NOT add Purchases, Catalog, Reports, Profit, Cash, Sync routes here.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../auth';
import { BranchService, BranchServiceError } from '../services/branch.service';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the branch router bound to the given PostgreSQL pool.
 * Mount at /api/branches, /api/v1/branches, /api/shops.
 */
export function buildBranchRouter(pool: Pool): Router {
  const router = Router();
  const service = new BranchService(pool);

  // All branch routes require authentication
  router.use(authMiddleware);

  // -------------------------------------------------------------------------
  // GET / — List all branches
  // All authenticated users can list branches (needed for branch selector UI).
  // Mirrors list_branches_handler with authorize_permission("org", null) relaxed
  // to allow branch users to enumerate branches for UI display — but their
  // actual data operations are locked to their own branch_id.
  // -------------------------------------------------------------------------
  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      const branches = await service.listBranches();
      res.status(200).json(branches);
    } catch (err: unknown) {
      handleError(res, err, 'list_branches');
    }
  });

  // -------------------------------------------------------------------------
  // POST / — Create branch (ADMIN only)
  // Mirrors create_branch_handler with authorize_permission("org", null).
  // -------------------------------------------------------------------------
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const body = req.body as Record<string, unknown>;

    if (typeof body['name'] !== 'string' || !String(body['name']).trim()) {
      res.status(400).json({ error: 'Branch name is required' });
      return;
    }

    try {
      const branch = await service.createBranch({
        name: body['name'] as string,
        organization_id: (body['organization_id'] as string | null | undefined) ?? null,
        is_active: body['is_active'] !== undefined
          ? body['is_active'] === true || body['is_active'] === 1 ? 1 : 0
          : 1,
      });
      res.status(201).json(branch);
    } catch (err: unknown) {
      handleError(res, err, 'create_branch');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get branch by ID
  // -------------------------------------------------------------------------
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const branch = await service.getBranchById(id);
      res.status(200).json(branch);
    } catch (err: unknown) {
      handleError(res, err, 'get_branch_by_id');
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update branch (ADMIN only)
  // -------------------------------------------------------------------------
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    try {
      const branch = await service.updateBranch(id, {
        name: body['name'] !== undefined ? (body['name'] as string) : undefined,
        is_active: body['is_active'] !== undefined
          ? body['is_active'] === true || body['is_active'] === 1 ? 1 : 0
          : undefined,
      });
      res.status(200).json(branch);
    } catch (err: unknown) {
      handleError(res, err, 'update_branch');
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the authenticated user is an ADMIN.
 * Mirrors authorize_permission("org", null) from Rust — org-level operations
 * are ADMIN-only.
 */
function requireAdmin(req: Request, res: Response): boolean {
  const identity = req.identity;
  if (!identity) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  const role = identity.role?.toUpperCase() ?? '';
  const isAdmin =
    role === 'ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'OWNER' ||
    role === 'MULTI_ADMIN';
  if (!isAdmin) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Only organization administrators can manage branches',
    });
    return false;
  }
  return true;
}

function handleError(res: Response, err: unknown, operation: string): void {
  if (err instanceof BranchServiceError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.code) body['code'] = err.code;
    res.status(err.statusCode).json(body);
    return;
  }
  console.error(`[branch/${operation}] Unexpected error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}
