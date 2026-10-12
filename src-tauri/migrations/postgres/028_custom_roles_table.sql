-- Migration 028: Custom roles table
-- DEF-08: Persists organization-defined custom roles in the database so they are
-- shared across users and devices. Built-in system roles (ADMIN, SHOP_ADMIN, etc.)
-- are not stored here — they are defined in the application RBAC constants and
-- emitted as read-only entries by the roles API.
--
-- custom_roles stores organization-level role definitions with a JSONB permissions
-- map. The permissions column stores a flat Record<permissionKey, boolean>.
--
-- Rollback:
--   DROP TABLE IF EXISTS custom_role_permission_grants;
--   DROP TABLE IF EXISTS custom_roles;
--   The rollback is safe at any time before DEF-08 data is in production.
--   After custom roles have been created and assigned, the table must not be
--   dropped without first migrating assignments back to built-in roles.

CREATE TABLE IF NOT EXISTS custom_roles (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT    NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Flat JSON permission map: {"inventory.view": true, "sales.void": false, ...}
  permissions JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT  custom_roles_org_name_unique UNIQUE (organization_id, name)
);

-- Index for fast per-organization lookup
CREATE INDEX IF NOT EXISTS idx_custom_roles_org
  ON custom_roles (organization_id);

-- Stores per-role permission grant overrides for built-in (canonical) roles.
-- Each row is a single permission key and whether it is granted/denied for a role.
-- This replaces the localStorage-based nmm_role_permission_grants_v1 storage.
CREATE TABLE IF NOT EXISTS role_permission_grants (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT    NOT NULL,
  role_key    TEXT        NOT NULL,   -- normalized role key, e.g. 'manager', 'cashier'
  permission_key TEXT     NOT NULL,
  granted     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT  role_permission_grants_unique UNIQUE (organization_id, role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_perm_grants_org_role
  ON role_permission_grants (organization_id, role_key);

-- DOWN (rollback):
-- DROP TABLE IF EXISTS role_permission_grants;
-- DROP TABLE IF EXISTS custom_roles;
