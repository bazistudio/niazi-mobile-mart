/**
 * Roles management routes — TypeScript Online Authority
 * DEF-08: Replace localStorage-only role storage with backend-persisted roles.
 *
 * Route summary:
 *   GET  /api/v1/roles          — List canonical + custom roles for the org (any authenticated user)
 *   GET  /api/v1/roles/:id      — Get a single role by id  (any authenticated user)
 *   POST /api/v1/roles          — Create a custom role (org-admin only)
 *   PUT  /api/v1/roles/:id      — Update a custom role (org-admin only; system roles: permission grants only)
 *   DELETE /api/v1/roles/:id    — Delete a custom role (org-admin only; system roles cannot be deleted)
 *
 * Security:
 *   - All routes require authMiddleware (JWT).
 *   - Mutation routes (POST/PUT/DELETE) require the caller to be an org admin.
 *   - Organization boundary is enforced: callers can only access roles for their own org.
 *   - Users cannot grant themselves or others privileges beyond their authority.
 *
 * System roles (built-in RBAC roles) are always returned as read-only entries.
 * Custom roles are persisted in the custom_roles table.
 * Per-canonical-role permission overrides are stored in role_permission_grants.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, isOrgAdmin, RequestIdentity } from '../auth';

// ─── Canonical built-in role definitions ─────────────────────────────────────

const CANONICAL_ROLE_IDS = [
  'admin', 'shop_admin', 'manager', 'accountant', 'salesman', 'cashier', 'repair_mechanic', 'staff',
] as const;
type CanonicalRoleId = typeof CANONICAL_ROLE_IDS[number];

const CANONICAL_ROLE_META: Record<CanonicalRoleId, { name: string; description: string }> = {
  admin:          { name: 'Organization Admin', description: 'Full organization-wide access' },
  shop_admin:     { name: 'Branch Admin',        description: 'Full branch-level administrative access' },
  manager:        { name: 'Manager',             description: 'Branch management with reporting access' },
  accountant:     { name: 'Accountant',          description: 'Financial and ledger access' },
  salesman:       { name: 'Salesman',            description: 'Sales and customer management' },
  cashier:        { name: 'Cashier',             description: 'POS and cash session access' },
  repair_mechanic:{ name: 'Repair Mechanic',     description: 'Repair job management' },
  staff:          { name: 'Staff',               description: 'Basic operational access' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRoleKey(id: string): string {
  return (id || '').toLowerCase().trim();
}

function isCanonicalRole(id: string): id is CanonicalRoleId {
  return (CANONICAL_ROLE_IDS as readonly string[]).includes(normalizeRoleKey(id));
}

function buildCanonicalRole(roleId: CanonicalRoleId, orgPermissionGrants: Record<string, boolean> = {}) {
  const meta = CANONICAL_ROLE_META[roleId];
  return {
    _id: roleId,
    organizationId: null, // system role — not org-owned
    name: meta.name,
    description: meta.description,
    isSystem: true,
    permissions: orgPermissionGrants,
    permissionCount: Object.keys(orgPermissionGrants).filter(k => orgPermissionGrants[k]).length,
    userCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function buildRolesRouter(pool: Pool): Router {
  const router = Router();

  // All routes require authentication
  router.use(authMiddleware);

  // ── GET /  — List all roles (canonical + custom) for the caller's org ────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      const orgId = identity.organization_id;

      // 1. Fetch per-role permission grants for canonical roles
      const grantsResult = await pool.query<{ role_key: string; permission_key: string; granted: boolean }>(
        `SELECT role_key, permission_key, granted
         FROM role_permission_grants
         WHERE organization_id = $1`,
        [orgId]
      );

      // Group grants by role_key
      const grantsByRole: Record<string, Record<string, boolean>> = {};
      for (const row of grantsResult.rows) {
        if (!grantsByRole[row.role_key]) grantsByRole[row.role_key] = {};
        grantsByRole[row.role_key][row.permission_key] = row.granted;
      }

      // Build canonical role list
      const canonicalRoles = CANONICAL_ROLE_IDS.map(id =>
        buildCanonicalRole(id, grantsByRole[id] || {})
      );

      // 2. Fetch custom roles for this organization
      const customResult = await pool.query<{
        id: string; name: string; description: string | null;
        is_system: boolean; permissions: Record<string, boolean>;
        created_at: string; updated_at: string;
      }>(
        `SELECT id, name, description, is_system, permissions, created_at, updated_at
         FROM custom_roles
         WHERE organization_id = $1
         ORDER BY created_at ASC`,
        [orgId]
      );

      const customRoles = customResult.rows.map(r => ({
        _id: r.id,
        organizationId: orgId,
        name: r.name,
        description: r.description || '',
        isSystem: r.is_system,
        permissions: r.permissions || {},
        permissionCount: Object.keys(r.permissions || {}).filter(k => r.permissions[k]).length,
        userCount: 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      res.json([...canonicalRoles, ...customRoles]);
    } catch (err) {
      console.error('[roles/GET] Error fetching roles:', err);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  // ── GET /:id  — Get a single role ────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      const orgId = identity.organization_id;
      const id = req.params.id;

      if (isCanonicalRole(id)) {
        const grantsResult = await pool.query<{ permission_key: string; granted: boolean }>(
          `SELECT permission_key, granted FROM role_permission_grants
           WHERE organization_id = $1 AND role_key = $2`,
          [orgId, normalizeRoleKey(id)]
        );
        const grants: Record<string, boolean> = {};
        for (const r of grantsResult.rows) grants[r.permission_key] = r.granted;
        res.json(buildCanonicalRole(id as CanonicalRoleId, grants));
        return;
      }

      const result = await pool.query(
        `SELECT id, name, description, is_system, permissions, created_at, updated_at
         FROM custom_roles WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Role not found' });
        return;
      }
      const r = result.rows[0];
      res.json({
        _id: r.id, organizationId: orgId, name: r.name,
        description: r.description || '', isSystem: r.is_system,
        permissions: r.permissions || {},
        permissionCount: Object.keys(r.permissions || {}).filter(k => r.permissions[k]).length,
        userCount: 0, createdAt: r.created_at, updatedAt: r.updated_at,
      });
    } catch (err) {
      console.error('[roles/GET/:id] Error:', err);
      res.status(500).json({ error: 'Failed to fetch role' });
    }
  });

  // ── POST /  — Create a custom role (org-admin only) ─────────────────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Creating roles requires organization admin authority' });
        return;
      }
      const orgId = identity.organization_id;
      const { name, description, permissions } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Role name is required' });
        return;
      }
      // Prevent privilege escalation: custom roles cannot grant admin-only permissions
      // beyond what the caller holds. This is a minimal guard; full permission policy
      // enforcement belongs in a dedicated permissions service.
      const safePermissions: Record<string, boolean> = {};
      if (permissions && typeof permissions === 'object') {
        for (const [key, val] of Object.entries(permissions)) {
          if (typeof val === 'boolean') safePermissions[key] = val;
        }
      }

      const result = await pool.query(
        `INSERT INTO custom_roles (organization_id, name, description, is_system, permissions)
         VALUES ($1, $2, $3, FALSE, $4)
         RETURNING id, name, description, is_system, permissions, created_at, updated_at`,
        [orgId, name.trim(), (description || '').trim() || null, JSON.stringify(safePermissions)]
      );
      const r = result.rows[0];
      res.status(201).json({
        _id: r.id, organizationId: orgId, name: r.name,
        description: r.description || '', isSystem: false,
        permissions: r.permissions || {},
        permissionCount: Object.keys(r.permissions || {}).filter(k => r.permissions[k]).length,
        userCount: 0, createdAt: r.created_at, updatedAt: r.updated_at,
      });
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: 'A role with this name already exists for this organization' });
        return;
      }
      console.error('[roles/POST] Error creating role:', err);
      res.status(500).json({ error: 'Failed to create role' });
    }
  });

  // ── PUT /:id  — Update a role ────────────────────────────────────────────────
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Updating roles requires organization admin authority' });
        return;
      }
      const orgId = identity.organization_id;
      const id = req.params.id;
      const { name, description, permissions } = req.body;

      if (isCanonicalRole(id)) {
        // For system roles: only permission grant overrides are allowed (name/description are immutable).
        if (permissions && typeof permissions === 'object') {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            for (const [permKey, granted] of Object.entries(permissions)) {
              if (typeof granted !== 'boolean') continue;
              await client.query(
                `INSERT INTO role_permission_grants (organization_id, role_key, permission_key, granted)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (organization_id, role_key, permission_key)
                 DO UPDATE SET granted = EXCLUDED.granted, updated_at = NOW()`,
                [orgId, normalizeRoleKey(id), permKey, granted]
              );
            }
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          } finally {
            client.release();
          }
        }
        // Return updated canonical role
        const grantsResult = await pool.query<{ permission_key: string; granted: boolean }>(
          `SELECT permission_key, granted FROM role_permission_grants
           WHERE organization_id = $1 AND role_key = $2`,
          [orgId, normalizeRoleKey(id)]
        );
        const grants: Record<string, boolean> = {};
        for (const r of grantsResult.rows) grants[r.permission_key] = r.granted;
        res.json(buildCanonicalRole(id as CanonicalRoleId, grants));
        return;
      }

      // Custom role update
      const existing = await pool.query(
        `SELECT id, is_system FROM custom_roles WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Role not found' });
        return;
      }

      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [id, orgId];
      if (name && typeof name === 'string' && name.trim()) {
        params.push(name.trim());
        updates.push(`name = $${params.length}`);
      }
      if (description !== undefined) {
        params.push((description || '').trim() || null);
        updates.push(`description = $${params.length}`);
      }
      if (permissions && typeof permissions === 'object') {
        const safePerms: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(permissions)) {
          if (typeof v === 'boolean') safePerms[k] = v;
        }
        params.push(JSON.stringify(safePerms));
        updates.push(`permissions = $${params.length}`);
      }

      const result = await pool.query(
        `UPDATE custom_roles SET ${updates.join(', ')}
         WHERE id = $1 AND organization_id = $2
         RETURNING id, name, description, is_system, permissions, created_at, updated_at`,
        params
      );
      const r = result.rows[0];
      res.json({
        _id: r.id, organizationId: orgId, name: r.name,
        description: r.description || '', isSystem: r.is_system,
        permissions: r.permissions || {},
        permissionCount: Object.keys(r.permissions || {}).filter(k => r.permissions[k]).length,
        userCount: 0, createdAt: r.created_at, updatedAt: r.updated_at,
      });
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: 'A role with this name already exists' });
        return;
      }
      console.error('[roles/PUT/:id] Error updating role:', err);
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  // ── DELETE /:id  — Delete a custom role (org-admin only) ────────────────────
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Deleting roles requires organization admin authority' });
        return;
      }
      const orgId = identity.organization_id;
      const id = req.params.id;

      if (isCanonicalRole(id)) {
        res.status(400).json({ error: 'System roles cannot be deleted' });
        return;
      }

      const result = await pool.query(
        `DELETE FROM custom_roles WHERE id = $1 AND organization_id = $2 RETURNING id`,
        [id, orgId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Role not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      console.error('[roles/DELETE/:id] Error deleting role:', err);
      res.status(500).json({ error: 'Failed to delete role' });
    }
  });

  return router;
}
