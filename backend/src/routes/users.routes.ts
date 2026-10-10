/**
 * Users Routes — TypeScript Express router for user/admin management.
 *
 * This router is the NEW ONLINE USER MANAGEMENT AUTHORITY for Phase 1+4 migration.
 * It handles all HTTP-originated user admin flows, replacing Rust /api/users/* handlers.
 *
 * Routes (registered at BOTH /api/users and /api/v1/users):
 *   GET    /                      — List users (ADMIN: all; branch users: own branch only)
 *   POST   /                      — Create user (ADMIN only)
 *   GET    /credential-snapshots  — Auth snapshot dump (ADMIN only, security-sensitive)
 *   GET    /:id                   — Get user by ID (authenticated)
 *   PUT    /:id                   — Update user fields (ADMIN only)
 *   DELETE /:id                   — Hard-delete user (ADMIN only; safety-checked)
 *   POST   /:id/approve           — Approve PENDING staff (ADMIN only)
 *   POST   /:id/reject            — Reject PENDING staff (ADMIN only)
 *   POST   /:id/reset-credentials — Reset password/PIN (ADMIN only)
 *   POST   /:id/suspend           — Suspend ACTIVE user (ADMIN only) [Phase 4]
 *   POST   /:id/reactivate        — Reactivate DISABLED user (ADMIN only) [Phase 4]
 *   POST   /:id/change-pin        — Change user PIN (ADMIN only) [Phase 4]
 *   PUT    /:id/permissions       — Update user access_profile (ADMIN only) [Phase 4]
 *
 * Security:
 *   - Credential hashes (login_key_hash, pin_hash) are never returned in normal responses
 *   - /credential-snapshots is ADMIN-only and returns hashes only for offline auth snapshot
 *   - Role-based access enforced server-side, not only via UI
 *   - Branch isolation: non-ADMIN users can only list users within their own branch
 *
 * Mirrors: src-tauri/src/bin/server.rs admin_user_* handlers
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { UsersRepo } from '../repositories/users.repo';
import { AuthRepo } from '../repositories/auth.repo';
import { hashArgon2 } from '../services/argon2.service';
import { authMiddleware, isAdmin } from '../auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the identity has an administrative role (ADMIN or SHOP_ADMIN). */
function requireAdmin(req: Request, res: Response): boolean {
  const identity = req.identity;
  if (!identity || !isAdmin(identity)) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return false;
  }
  return true;
}

/** Returns true if the identity has ADMIN role (strict, not SHOP_ADMIN). */
function requireStrictAdmin(req: Request, res: Response): boolean {
  const identity = req.identity;
  if (!identity) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  const r = String(identity.role || '').toUpperCase();
  if (r !== 'ADMIN' && r !== 'SUPER_ADMIN' && r !== 'OWNER' && r !== 'MULTI_ADMIN') {
    res.status(403).json({ error: 'Forbidden: ADMIN role required' });
    return false;
  }
  return true;
}

/** Returns true if the identity has org-level ADMIN role (for Phase 4 operations). */
function isOrgAdmin(req: Request): boolean {
  const r = String(req.identity?.role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER' || r === 'MULTI_ADMIN';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the users router bound to the given PostgreSQL pool.
 * Mount at BOTH /api/users and /api/v1/users.
 */
export function buildUsersRouter(pool: Pool): Router {
  const router = Router();
  const usersRepo = new UsersRepo(pool);
  const authRepo = new AuthRepo(pool);

  // All routes require authentication
  router.use(authMiddleware);

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  // Phase 4: Branch isolation.
  // ADMIN (org-level) → all users.
  // SHOP_ADMIN / branch users → only users in their own branch_id.
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    try {
      let users;
      if (isOrgAdmin(req)) {
        users = await usersRepo.listAll();
      } else {
        // Branch-scoped users can only see their own branch
        const branchId = identity.branch_id;
        if (!branchId) {
          res.status(403).json({ error: 'Forbidden: no branch assigned to your account' });
          return;
        }
        users = await usersRepo.listByBranch(branchId);
      }
      res.status(200).json(users);
    } catch (err) {
      console.error('[users/list] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { name, username, password, pin, role, status, branch_id, access_profile, must_change_password } =
      req.body as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'password must be at least 6 characters' });
      return;
    }
    if (typeof role !== 'string' || !role.trim()) {
      res.status(400).json({ error: 'role is required' });
      return;
    }

    try {
      const existing = await usersRepo.findByUsername(username.trim());
      if (existing) {
        res.status(409).json({ error: 'Username is already taken' });
        return;
      }

      const loginKeyHash = await hashArgon2(password);
      let pinHash: string | null = null;
      if (typeof pin === 'string' && pin.length > 0) {
        pinHash = await hashArgon2(pin);
      }

      const user = await usersRepo.createUser({
        name: name.trim(),
        username: username.trim(),
        login_key_hash: loginKeyHash,
        pin_hash: pinHash,
        role: role.trim(),
        status: typeof status === 'string' ? status.trim() : 'ACTIVE',
        branch_id: typeof branch_id === 'string' ? branch_id : null,
        access_profile: access_profile && typeof access_profile === 'object'
          ? (access_profile as unknown as import('../repositories/users.repo').AccessProfile)
          : undefined,
        must_change_password: typeof must_change_password === 'boolean' ? must_change_password : false,
      });

      res.status(201).json(user);
    } catch (err) {
      console.error('[users/create] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /credential-snapshots
  // MUST be registered BEFORE /:id to avoid matching "credential-snapshots" as an id.
  // Returns full auth rows including credential hashes — for offline auth snapshot only.
  // ADMIN-only, security-sensitive endpoint.
  // -------------------------------------------------------------------------

  router.get('/credential-snapshots', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    try {
      const rows = await authRepo.listAll();
      // Return the full rows (with hashes) for offline snapshot generation.
      // The client constructs: `${login_key_hash}|${pin_hash ?? ''}` per user.
      res.status(200).json(rows);
    } catch (err) {
      console.error('[users/credential-snapshots] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    try {
      const user = await usersRepo.findById(id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(200).json(user);
    } catch (err) {
      console.error('[users/get] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:id
  // -------------------------------------------------------------------------

  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const { name, username, role, status, branch_id, access_profile, must_change_password } =
      req.body as Record<string, unknown>;

    try {
      const updated = await usersRepo.updateUser(id, {
        name: typeof name === 'string' ? name.trim() : undefined,
        username: typeof username === 'string' ? username.trim() : undefined,
        role: typeof role === 'string' ? role.trim() : undefined,
        status: typeof status === 'string' ? status.trim() : undefined,
        branch_id: typeof branch_id === 'string' ? branch_id
          : branch_id === null ? null
          : undefined,
        access_profile: access_profile && typeof access_profile === 'object'
          ? (access_profile as unknown as import('../repositories/users.repo').AccessProfile)
          : undefined,
        must_change_password: typeof must_change_password === 'boolean' ? must_change_password : undefined,
      });

      if (!updated) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(200).json(updated);
    } catch (err) {
      console.error('[users/update] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // Phase 4: Hard-delete user (ADMIN only). Safety-checked via hardDeleteUserAdmin:
  //   - Cannot delete ADMIN/SUPER_ADMIN/OWNER roles
  //   - Cannot self-delete
  //   - All FK constraints are ON DELETE SET NULL; historical records preserved
  // -------------------------------------------------------------------------

  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const identity = req.identity!;

    // Prevent self-deletion (belt-and-suspenders: hardDeleteUserAdmin also checks)
    if (id === identity.user_id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    try {
      const result = await usersRepo.hardDeleteUserAdmin(id, identity.user_id);

      if (!result.deleted) {
        if (result.reason === 'not_found') {
          res.status(404).json({ error: 'User not found' });
        } else if (result.reason === 'self_delete') {
          res.status(400).json({ error: 'Cannot delete your own account' });
        } else if (result.reason === 'is_admin') {
          res.status(409).json({ error: 'Cannot delete an administrator account' });
        } else {
          res.status(409).json({ error: result.reason ?? 'Delete not allowed' });
        }
        return;
      }

      res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
      console.error('[users/delete] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/approve
  // -------------------------------------------------------------------------

  router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      const user = await usersRepo.approveStaff(id);
      if (!user) {
        res.status(404).json({ error: 'User not found or not in PENDING status' });
        return;
      }
      res.status(200).json({ message: 'Staff approved successfully', user });
    } catch (err) {
      console.error('[users/approve] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/reject
  // -------------------------------------------------------------------------

  router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      const user = await usersRepo.rejectStaff(id);
      if (!user) {
        res.status(404).json({ error: 'User not found or not in PENDING status' });
        return;
      }
      res.status(200).json({ message: 'Staff rejected', user });
    } catch (err) {
      console.error('[users/reject] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/reset-credentials
  // Resets password and/or PIN. Caller provides plaintext; we hash before storing.
  // -------------------------------------------------------------------------

  router.post('/:id/reset-credentials', async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const { password, pin, must_change_password } = req.body as Record<string, unknown>;

    if (!password && !pin) {
      res.status(400).json({ error: 'At least one of password or pin is required' });
      return;
    }

    try {
      const target = await usersRepo.findById(id);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (typeof password === 'string' && password.length > 0) {
        const loginKeyHash = await hashArgon2(password);
        const forceChange = typeof must_change_password === 'boolean' ? must_change_password : true;
        await usersRepo.resetLoginKey(id, loginKeyHash, forceChange);
      }

      if (typeof pin === 'string') {
        const pinHash = pin.length > 0 ? await hashArgon2(pin) : null;
        await usersRepo.resetPin(id, pinHash);
      }

      res.status(200).json({ message: 'Credentials reset successfully' });
    } catch (err) {
      console.error('[users/reset-credentials] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/suspend  [Phase 4]
  // Suspends an ACTIVE user (sets status=DISABLED, is_active=false).
  // ADMIN only. Cannot suspend another ADMIN/SUPER_ADMIN.
  // -------------------------------------------------------------------------

  router.post('/:id/suspend', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const identity = req.identity!;

    if (id === identity.user_id) {
      res.status(400).json({ error: 'Cannot suspend your own account' });
      return;
    }

    try {
      const target = await usersRepo.findById(id);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const targetRole = String(target.role || '').toUpperCase();
      if (targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN' || targetRole === 'OWNER') {
        res.status(409).json({ error: 'Cannot suspend an administrator account' });
        return;
      }

      const suspended = await usersRepo.suspendUser(id);
      if (!suspended) {
        res.status(409).json({ error: 'User is not in ACTIVE status and cannot be suspended' });
        return;
      }
      res.status(200).json({ message: 'User suspended successfully', user: suspended });
    } catch (err) {
      console.error('[users/suspend] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/reactivate  [Phase 4]
  // Reactivates a DISABLED user (sets status=ACTIVE, is_active=true).
  // ADMIN only.
  // -------------------------------------------------------------------------

  router.post('/:id/reactivate', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      const reactivated = await usersRepo.reactivateUser(id);
      if (!reactivated) {
        res.status(409).json({ error: 'User not found or not in DISABLED status' });
        return;
      }
      res.status(200).json({ message: 'User reactivated successfully', user: reactivated });
    } catch (err) {
      console.error('[users/reactivate] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/change-pin  [Phase 4]
  // Admin sets a new PIN for any user. Plaintext PIN is hashed via argon2 sidecar.
  // ADMIN only. Sends { pin: string } in body.
  // To clear the PIN send { pin: "" } or { pin: null }.
  // -------------------------------------------------------------------------

  router.post('/:id/change-pin', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const pin = body['pin'];

    // pin must be present in body (can be empty string to clear)
    if (!('pin' in body)) {
      res.status(400).json({ error: 'pin field is required (use empty string to clear PIN)' });
      return;
    }

    try {
      const target = await usersRepo.findById(id);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (typeof pin === 'string' && pin.length > 0) {
        const pinHash = await hashArgon2(pin);
        await usersRepo.changePIN(id, pinHash);
      } else {
        // Clear the PIN (null)
        await usersRepo.clearPIN(id);
      }

      res.status(200).json({ message: 'PIN updated successfully' });
    } catch (err) {
      console.error('[users/change-pin] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:id/permissions  [Phase 4]
  // Updates the access_profile JSONB for a user.
  // ADMIN only. Body: { allowed_pages: string[], allowed_actions: string[] }
  // -------------------------------------------------------------------------

  router.put('/:id/permissions', async (req: Request, res: Response): Promise<void> => {
    if (!requireStrictAdmin(req, res)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowedPages = body['allowed_pages'];
    const allowedActions = body['allowed_actions'];

    if (!Array.isArray(allowedPages) || !Array.isArray(allowedActions)) {
      res.status(400).json({
        error: 'allowed_pages and allowed_actions must be arrays',
      });
      return;
    }

    try {
      const updated = await usersRepo.updatePermissions(id, {
        allowed_pages: allowedPages as string[],
        allowed_actions: allowedActions as string[],
      });

      if (!updated) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(200).json({ message: 'Permissions updated successfully', user: updated });
    } catch (err) {
      console.error('[users/permissions] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
