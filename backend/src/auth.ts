import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';

// --- Types ---

/**
 * All supported user roles — must match Rust UserRole enum in domain/user.rs.
 * Phase 1 fix: expanded from 4 to 9 roles to match Rust definition exactly.
 * Supports both PascalCase (legacy frontend) and SCREAMING_SNAKE_CASE (Rust/DB) variants.
 */
export type UserRole =
  // Canonical SCREAMING_SNAKE_CASE values (stored in PostgreSQL, issued in JWT)
  | 'ADMIN'
  | 'SHOP_ADMIN'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'SALESMAN'
  | 'CASHIER'
  | 'REPAIR_MECHANIC'
  | 'STAFF'
  | 'PUBLIC_USER'
  // Legacy PascalCase aliases (may appear in old tokens or frontend code)
  | 'Admin'
  | 'ShopAdmin'
  | 'Cashier'
  | 'Salesman';

export interface StaffOperationalLimits {
  max_discount_percent: number;
  can_price_override: boolean;
  can_refund: boolean;
  can_void_sale: boolean;
  can_view_profit: boolean;
}

export interface StaffAccessProfile {
  allowed_pages: string[];
  allowed_actions: string[];
  limits: StaffOperationalLimits;
}

/**
 * Canonical request identity resolved from a verified JWT.
 * Mirrors Rust RequestIdentity in src-tauri/src/domain/identity.rs.
 */
export interface RequestIdentity {
  user_id: string;
  username: string;
  role: UserRole;
  organization_id: string;
  branch_id: string | null;
  access_profile: StaffAccessProfile;
  authenticated_at_ms: number;
}

/**
 * JWT Claims payload -- mirrors Rust Claims in src-tauri/src/services/token_service.rs.
 * Algorithm: RS256. Fields: sub, username, role, access_profile, branch_id, iat, exp.
 */
interface Claims {
  sub: string;
  username: string;
  role: UserRole;
  access_profile: StaffAccessProfile;
  branch_id?: string | null;
  iat: number;
  exp: number;
}

// --- Constants ---

// Canonical single-organization UUID seeded by migration 001_initial_schema.sql.
// This is the ONLY place this constant should be defined. All other files must import it.
export const NIAZI_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// Canonical Central Warehouse system branch UUID — seeded by migration 030_central_warehouse_location.sql.
// The warehouse is a first-class system branch in the branches table with is_warehouse=1.
// Only org-admins may receive into or transfer out of the warehouse.
// POS checkout is always bound to the user's JWT branch_id which is never the warehouse.
export const CENTRAL_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000003';

// --- Legacy Admin Role Blocking & Canonical Roles ---

/**
 * Canonical SCREAMING_SNAKE_CASE user roles matching Rust UserRole enum (domain/user.rs).
 */
export const CANONICAL_USER_ROLES = new Set<string>([
  'ADMIN',
  'SHOP_ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'SALESMAN',
  'CASHIER',
  'REPAIR_MECHANIC',
  'STAFF',
  'PUBLIC_USER',
]);

/**
 * Explicit prototype-safe map from accepted database/token role variants and legacy aliases
 * to their exact canonical SCREAMING_SNAKE_CASE UserRole equivalent.
 * Uses Object.create(null) to guarantee zero prototype inheritance (immune to toString, constructor, etc.).
 * Unknown or deprecated legacy admin roles are NOT in this map and are rejected fail-closed.
 */
export const ROLE_CANONICAL_MAP: Readonly<Record<string, UserRole>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, UserRole>, {
    // Canonical forms
    'ADMIN': 'ADMIN',
    'SHOP_ADMIN': 'SHOP_ADMIN',
    'MANAGER': 'MANAGER',
    'ACCOUNTANT': 'ACCOUNTANT',
    'SALESMAN': 'SALESMAN',
    'CASHIER': 'CASHIER',
    'REPAIR_MECHANIC': 'REPAIR_MECHANIC',
    'STAFF': 'STAFF',
    'PUBLIC_USER': 'PUBLIC_USER',

    // PascalCase aliases (supported by Rust serde / legacy tokens)
    'Admin': 'ADMIN',
    'ShopAdmin': 'SHOP_ADMIN',
    'Manager': 'MANAGER',
    'Accountant': 'ACCOUNTANT',
    'Salesman': 'SALESMAN',
    'Cashier': 'CASHIER',
    'RepairMechanic': 'REPAIR_MECHANIC',
    'Staff': 'STAFF',
    'PublicUser': 'PUBLIC_USER',
  })
);

/**
 * Prototype-safe role canonicalization lookup.
 * Returns genuine canonical UserRole or undefined.
 */
export function getCanonicalUserRole(role: unknown): UserRole | undefined {
  if (typeof role !== 'string') return undefined;
  const trimmed = role.trim();
  if (!trimmed) return undefined;
  if (Object.prototype.hasOwnProperty.call(ROLE_CANONICAL_MAP, trimmed)) {
    return ROLE_CANONICAL_MAP[trimmed];
  }
  const upper = trimmed.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ROLE_CANONICAL_MAP, upper)) {
    return ROLE_CANONICAL_MAP[upper];
  }
  return undefined;
}

/**
 * Valid recognized user roles (canonical + supported aliases).
 */
export const VALID_USER_ROLES = new Set<string>(Object.keys(ROLE_CANONICAL_MAP));

/**
 * Legacy admin aliases slated for temporary runtime blocking.
 * Canonical targets: ADMIN (Org Admin) and SHOP_ADMIN (Branch Admin).
 * Fail-closed: All legacy admin aliases are rejected at the authentication/authorization boundary.
 */
export const BLOCKED_LEGACY_ADMIN_ROLES = new Set<string>([
  'SUPER_ADMIN',
  'OWNER',
  'MULTI_ADMIN',
  'SHOPADMIN',
  'BRANCH_ADMIN',
]);

// --- Key Loading ---

function requirePublicKey(): string {
  const key = process.env['JWT_PUBLIC_KEY'];
  if (!key || !key.trim()) {
    throw new Error('FATAL: JWT_PUBLIC_KEY environment variable is required but missing or empty.');
  }
  return key.trim().replace(/\\n/g, '\n');
}

function getAlternativePublicKeys(): string[] {
  const keys: string[] = [];
  const candidatePaths = [
    path.join(process.cwd(), 'jwt_pub.pem'),
    path.join(process.cwd(), '..', 'jwt_pub.pem'),
    path.join(process.cwd(), 'src-tauri', 'src', 'services', 'jwt_public_key.pem'),
    path.join(process.cwd(), '..', 'src-tauri', 'src', 'services', 'jwt_public_key.pem'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').trim().replace(/\\n/g, '\n');
        if (content && !keys.includes(content)) {
          keys.push(content);
        }
      }
    } catch {}
  }
  return keys;
}

// --- Error Class ---

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// --- Token Resolution ---

/**
 * Resolves a Bearer token to RequestIdentity via stateless RS256 JWT verification.
 * Mirrors TokenManager::resolve_identity() in token_service.rs.
 */
export function resolveIdentity(token: string): RequestIdentity {
  const clean = token.trim().startsWith('Bearer ')
    ? token.trim().slice(7).trim()
    : token.trim();

  if (!clean) {
    throw new AuthError('Missing or empty authorization token', 401);
  }

  const primaryKey = requirePublicKey();
  const allKeys = [primaryKey, ...getAlternativePublicKeys()].filter((k, idx, arr) => arr.indexOf(k) === idx);

  let claims: Claims | null = null;
  let lastErr: unknown = null;

  for (const key of allKeys) {
    try {
      claims = jwt.verify(clean, key, { algorithms: ['RS256'] }) as Claims;
      break;
    } catch (err: unknown) {
      lastErr = err;
    }
  }

  if (!claims) {
    if (lastErr instanceof jwt.TokenExpiredError) {
      throw new AuthError('Authentication token expired. Please log in again.', 401);
    }
    throw new AuthError('Invalid or corrupted authentication token', 401);
  }

  const rawRole = String(claims.role || '').trim();
  const roleUpper = rawRole.toUpperCase();
  if (BLOCKED_LEGACY_ADMIN_ROLES.has(roleUpper)) {
    throw new AuthError('Account role is deprecated or blocked. Please log in with a canonical role.', 401);
  }

  const canonicalRole = getCanonicalUserRole(rawRole);
  if (!canonicalRole) {
    throw new AuthError('Account role is invalid or unsupported. Please log in with a valid role.', 401);
  }

  return {
    user_id: claims.sub,
    username: claims.username,
    role: canonicalRole,
    organization_id: NIAZI_ORGANIZATION_ID,
    branch_id: claims.branch_id ?? null,
    access_profile: claims.access_profile,
    authenticated_at_ms: claims.iat * 1000,
  };
}

// --- Authorization ---

/**
 * Checks if identity has Organization-wide Administrative authority.
 * In Niazi Mobile Mart, canonical ADMIN is always the Organization Admin.
 * Its organization-wide authority does NOT depend on whether branch_id is NULL
 * or assigned to a home/default branch.
 * Legacy aliases (SUPER_ADMIN, OWNER, MULTI_ADMIN) are temporarily blocked at runtime (fail-closed).
 */
export function isOrgAdmin(identity: RequestIdentity): boolean {
  if (!identity) return false;
  const r = String(identity.role || '').toUpperCase();
  return r === 'ADMIN';
}

/**
 * Checks if identity has Branch-level Administrative authority.
 * In Niazi Mobile Mart, canonical Branch Admin is SHOP_ADMIN (restricted to identity.branch_id).
 * Organization Admins may also perform branch administrative operations.
 * Legacy aliases (SHOPADMIN, BRANCH_ADMIN) are temporarily blocked at runtime (fail-closed).
 * NOTE: MANAGER is strictly an operational role and is NOT an administrator.
 */
export function isBranchAdmin(identity: RequestIdentity): boolean {
  if (!identity) return false;
  if (isOrgAdmin(identity)) return true;
  const r = String(identity.role || '').toUpperCase();
  return r === 'SHOP_ADMIN';
}

/**
 * General admin check. Returns true if the caller is an Organization Admin or Branch Admin.
 */
export function isAdmin(identity: RequestIdentity): boolean {
  return isBranchAdmin(identity);
}

/**
 * Checks if identity is authorized to access a specific target branch.
 *
 * Security note (F-05): This is a single-tenant deployment. The organization is
 * always NIAZI_ORGANIZATION_ID (seeded by migration 001_initial_schema.sql).
 * There is no branch→organization lookup table in the current schema, so we
 * cannot verify the target branch belongs to a given org by querying the DB here.
 * As a structural guard we verify that the caller's own organization_id matches
 * the known single-tenant constant. This prevents tokens issued for a different
 * organization (if any) from passing the org-admin fast-path.
 *
 * If this deployment ever adds multi-tenant branch ownership, replace the
 * organization_id string check below with a DB lookup:
 *   SELECT organization_id FROM branches WHERE id = targetBranchId
 * and compare against identity.organization_id.
 */
export function canAccessBranch(identity: RequestIdentity, targetBranchId: string | null | undefined): boolean {
  if (!identity) return false;

  // Structural single-tenant guard: org must be the known seeded organization.
  // An ADMIN token from a foreign organization cannot pass via the org-admin path.
  if (identity.organization_id !== NIAZI_ORGANIZATION_ID) return false;

  if (isOrgAdmin(identity)) return true;
  if (!targetBranchId || !targetBranchId.trim()) return false;
  if (!identity.branch_id) return false;
  return identity.branch_id === targetBranchId.trim();
}

/**
 * Organization-level administrative pages that require canonical ADMIN (Org Admin) authority.
 * Non-org-admins (including SHOP_ADMIN and staff) CANNOT access these pages via access_profile.
 */
export const ORG_ADMIN_ONLY_PAGES = new Set<string>([
  'audit',
  'branches',
]);

/**
 * Administrative and sensitive pages that require administrative authority (ADMIN or SHOP_ADMIN).
 * Non-administrative roles (CASHIER, SALESMAN, STAFF, MANAGER, ACCOUNTANT, REPAIR_MECHANIC)
 * CANNOT access these pages via access_profile or fallback.
 */
export const RESTRICTED_ADMIN_PAGES = new Set<string>([
  'settings',
  'roles',
  'users',
  'audit',
  'branches',
  'admin',
]);

/**
 * Organization-level administrative actions that require canonical ADMIN (Org Admin) authority.
 * Non-org-admins (including SHOP_ADMIN and staff) CANNOT invoke these actions via access_profile.
 */
export const ORG_ADMIN_ONLY_ACTIONS = new Set<string>([
  'products:delete',
  'products:edit',
  'product:create',
  'roles:edit',
  'roles:delete',
  'roles:create',
  'branches:manage',
  'audit:view',
]);

/**
 * Administrative and sensitive actions that require administrative authority (ADMIN or SHOP_ADMIN).
 * Non-administrative roles (CASHIER, SALESMAN, STAFF, MANAGER, ACCOUNTANT, REPAIR_MECHANIC)
 * CANNOT invoke these actions via access_profile or fallback.
 */
export const RESTRICTED_ADMIN_ACTIONS = new Set<string>([
  'users:delete',
  'users:create',
  'users:edit',
  'roles:edit',
  'roles:delete',
  'roles:create',
  'branches:manage',
  'settings:edit',
  'audit:view',
  'products:delete',
  'products:edit',
  'product:create',
]);

/**
 * Normalizes a page route or permission key for comparison.
 * Strips leading slashes, trailing slashes, whitespace, and lowercases.
 */
function normalizePermissionTarget(target: string): string {
  return (target || '').trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Evaluates page + action permissions.
 * Mirrors RequestIdentity::authorize_permission() in identity.rs.
 * Returns null on success, error message string on failure (403).
 */
export function authorizePermission(
  identity: RequestIdentity,
  page: string | null,
  action: string | null
): string | null {
  const isOrg = isOrgAdmin(identity);
  const isBranchAdm = isBranchAdmin(identity);

  // G4-AUTH-03-C: SHOP_ADMIN is restricted to branch-level administrative authority.
  // Org-admin-only pages and actions require canonical ADMIN authority.
  if (page !== null) {
    const cleanP = normalizePermissionTarget(page);
    if (ORG_ADMIN_ONLY_PAGES.has(cleanP) && !isOrg) {
      return `Access denied: Organization administrator authority required for '${page}'`;
    }
  }

  if (action !== null) {
    const cleanA = normalizePermissionTarget(action);
    if (ORG_ADMIN_ONLY_ACTIONS.has(cleanA) && !isOrg) {
      return `Access denied: Organization administrator authority required for '${action}'`;
    }
  }

  // Full Org Admins bypass all remaining page/action checks.
  if (isOrg) {
    return null;
  }

  // Branch Admins bypass standard operational page/action checks (except org-only ones handled above).
  if (isBranchAdm) {
    return null;
  }

  // Non-administrative roles: evaluate against access profile with strict restricted-item enforcement.
  if (page !== null) {
    if (!hasPageAccess(identity.access_profile, page, identity.role)) {
      return `Access denied: You do not have permission to access page '${page}'`;
    }
  }

  if (action !== null) {
    if (!hasActionAccess(identity.access_profile, action, identity.role)) {
      return `Access denied: You do not have permission to execute action '${action}'`;
    }
  }

  return null;
}

/**
 * Mirrors StaffAccessProfile::has_page_access() in access_control.rs.
 * G4-AUTH-03-A: Restricted-page policy is enforced BEFORE explicit access-profile grants
 * and before operational fallback. Non-administrative roles CANNOT access RESTRICTED_ADMIN_PAGES.
 */
function hasPageAccess(profile: StaffAccessProfile, page: string, role?: UserRole): boolean {
  const cleanPage = normalizePermissionTarget(page);
  const r = String(role || '').toUpperCase();
  const isAdminRole = r === 'ADMIN' || r === 'SHOP_ADMIN';

  // Strict check order: If the page is restricted to administrators and user is not admin, DENY unconditionally.
  if (RESTRICTED_ADMIN_PAGES.has(cleanPage) && !isAdminRole) {
    return false;
  }

  // Next: check explicit profile grants
  if (profile && Array.isArray(profile.allowed_pages) && profile.allowed_pages.length > 0) {
    return profile.allowed_pages.some((p) => {
      const cleanP = normalizePermissionTarget(p);
      return cleanP === '*' || cleanP === cleanPage;
    });
  }

  // Operational fallback for unconfigured staff on standard operational pages:
  if (
    r === 'SALESMAN' ||
    r === 'CASHIER' ||
    r === 'STAFF' ||
    r === 'MANAGER' ||
    r === 'ACCOUNTANT' ||
    r === 'REPAIR_MECHANIC'
  ) {
    return true;
  }
  return false;
}

/**
 * Mirrors StaffAccessProfile::has_action_access() in access_control.rs.
 * G4-AUTH-03-B: Restricted-action policy is enforced BEFORE explicit access-profile grants
 * and before operational fallback. Non-administrative roles CANNOT execute RESTRICTED_ADMIN_ACTIONS.
 */
function hasActionAccess(profile: StaffAccessProfile, action: string, role?: UserRole): boolean {
  const cleanAction = normalizePermissionTarget(action);
  const r = String(role || '').toUpperCase();
  const isAdminRole = r === 'ADMIN' || r === 'SHOP_ADMIN';

  // Strict check order: If action is restricted to administrators and user is not admin, DENY unconditionally.
  if (RESTRICTED_ADMIN_ACTIONS.has(cleanAction) && !isAdminRole) {
    return false;
  }

  // Next: check explicit profile grants
  if (profile && Array.isArray(profile.allowed_actions) && profile.allowed_actions.length > 0) {
    return profile.allowed_actions.some((a) => {
      const cleanA = normalizePermissionTarget(a);
      return cleanA === '*' || cleanA === cleanAction;
    });
  }

  // Operational fallback for unconfigured staff on standard operational actions:
  if (
    r === 'SALESMAN' ||
    r === 'CASHIER' ||
    r === 'STAFF' ||
    r === 'MANAGER' ||
    r === 'ACCOUNTANT' ||
    r === 'REPAIR_MECHANIC'
  ) {
    return true;
  }
  return false;
}

/**
 * Strict action access check for product mutations (F-06 fix).
 * Unlike hasActionAccess(), this does NOT fall back to broad staff-role permission
 * when allowed_actions is empty. An empty allowed_actions is treated as default-deny
 * for product mutation actions, requiring explicit grant.
 *
 * Actions covered: 'products:edit', 'products:delete', 'product:create'
 */
function hasProductActionAccess(profile: StaffAccessProfile, action: string): boolean {
  if (!profile || !Array.isArray(profile.allowed_actions) || profile.allowed_actions.length === 0) {
    return false; // default-deny: no explicit actions granted
  }
  return profile.allowed_actions.some((a) => a === '*' || a === action);
}

/**
 * Strict version of authorizePermission for product mutations.
 * Admins (isBranchAdmin) pass through. All others must have explicit action grants.
 * Page access is still checked via the standard hasPageAccess path.
 * Returns null on success, error string on 403.
 */
export function authorizeProductMutation(
  identity: RequestIdentity,
  page: string,
  action: string
): string | null {
  // Shared Organization Catalog Rule: Only Organization administrators may create, edit, or delete catalog products.
  // Branch users and branch-level administrators must not mutate the shared catalog.
  if (!isOrgAdmin(identity)) {
    return 'Access denied: Only organization administrators may manage shared catalog products';
  }

  return null;
}

// --- Express Middleware ---

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: RequestIdentity;
    }
  }
}

/**
 * Factory: returns an async Express middleware that:
 *   1. Verifies the Bearer JWT (RS256 stateless check — no DB).
 *   2. Resolves RequestIdentity and attaches it to req.identity.
 *   3. Immediately queries PostgreSQL to confirm the account is still ACTIVE.
 *
 * This ordering guarantees the active-account check always runs AFTER identity
 * is established, for every route that uses this middleware, regardless of which
 * router mounts it. There is no separate global active-user middleware needed.
 *
 * Failure modes (all fail-CLOSED — never calls next() on failure):
 *   • Missing/invalid/expired JWT        → 401
 *   • User row not found in DB           → 401
 *   • Account status ≠ 'ACTIVE'          → 401
 *   • PostgreSQL error during status check → 503 Service Unavailable
 *
 * Public endpoints (login, health) must NOT use this middleware — they have
 * no Bearer token and must not hit the DB for every unauthenticated probe.
 *
 * The pool parameter is closed over so the returned middleware is a plain
 * RequestHandler compatible with router.use() and app.use().
 */
export function buildAuthMiddleware(pool: Pool): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'] ?? '';

    if (!authHeader) {
      console.warn(`[auth] 401 Unauthorized: Missing Authorization header on ${req.method} ${req.originalUrl || req.path}`);
      res.status(401).json({ error: 'Missing or empty authorization token' });
      return;
    }

    let identity: RequestIdentity;
    try {
      identity = resolveIdentity(authHeader);
    } catch (err) {
      if (err instanceof AuthError) {
        console.warn(`[auth] 401 Unauthorized: ${err.message} on ${req.method} ${req.originalUrl || req.path}`);
        res.status(err.statusCode).json({ error: err.message });
      } else {
        console.warn(`[auth] 401 Unauthorized: Invalid token on ${req.method} ${req.originalUrl || req.path}`, err);
        res.status(401).json({ error: 'Invalid or corrupted authentication token' });
      }
      return;
    }

    // JWT verified — now confirm the account is still active in the database.
    // Also verify that the persisted role is not a blocked legacy admin alias.
    // Fail-CLOSED: any DB error returns 503 and never calls next().
    pool.query(
      'SELECT is_active, status, role FROM users WHERE id = $1 LIMIT 1',
      [identity.user_id]
    ).then((result) => {
      if (result.rows.length === 0) {
        console.warn(`[auth] 401 User ${identity.user_id} not found in DB — token issued for a deleted account`);
        res.status(401).json({ error: 'Account not found. Please log in again.' });
        return;
      }
      const row = result.rows[0] as Record<string, unknown>;
      const isActive = Boolean(row['is_active']);
      const status = String(row['status'] ?? '');
      const rawDbRole = String(row['role'] ?? '').trim();
      const dbRoleUpper = rawDbRole.toUpperCase();

      if (BLOCKED_LEGACY_ADMIN_ROLES.has(dbRoleUpper)) {
        console.warn(`[auth] 401 User ${identity.user_id} possesses blocked legacy admin role '${rawDbRole}' on ${req.method} ${req.originalUrl || req.path}`);
        res.status(401).json({ error: 'Account role is deprecated or blocked. Contact your administrator.' });
        return;
      }

      // Role must be a recognized canonical or supported role.
      // Lookup canonical SCREAMING_SNAKE_CASE role via prototype-safe canonical mapping.
      const canonicalRole = getCanonicalUserRole(rawDbRole);
      if (!canonicalRole) {
        console.warn(`[auth] 401 User ${identity.user_id} has unrecognized database role '${rawDbRole}' on ${req.method} ${req.originalUrl || req.path}`);
        res.status(401).json({ error: 'Account role is invalid or unsupported. Contact your administrator.' });
        return;
      }

      if (!isActive || status !== 'ACTIVE') {
        console.warn(`[auth] 401 Disabled user ${identity.user_id} (status=${status}) attempted access on ${req.method} ${req.originalUrl || req.path}`);
        res.status(401).json({ error: 'Account is disabled. Contact your administrator.' });
        return;
      }

      // G4-AUTH-03: Stale Access-Profile Protection.
      // 1. If database role is non-administrative (staff/cashier), strip ALL restricted admin pages,
      //    restricted admin actions, wildcard privileges ('*'), and administrative operational limits.
      // 2. If database role is SHOP_ADMIN (branch admin), strip organization-wide ADMIN privileges
      //    (ORG_ADMIN_ONLY_PAGES, ORG_ADMIN_ONLY_ACTIONS, wildcards), capping limits to branch admin maximum.
      let effectiveAccessProfile = identity.access_profile;
      const isOrgAdminRole = canonicalRole === 'ADMIN';
      const isShopAdminRole = canonicalRole === 'SHOP_ADMIN';

      if (!isOrgAdminRole && effectiveAccessProfile) {
        if (!isShopAdminRole) {
          // Staff / Cashier: remove wildcards AND any restricted admin pages/actions
          const sanitizedPages = Array.isArray(effectiveAccessProfile.allowed_pages)
            ? effectiveAccessProfile.allowed_pages.filter((p) => {
                const clean = normalizePermissionTarget(p);
                return clean !== '*' && !RESTRICTED_ADMIN_PAGES.has(clean);
              })
            : [];
          const sanitizedActions = Array.isArray(effectiveAccessProfile.allowed_actions)
            ? effectiveAccessProfile.allowed_actions.filter((a) => {
                const clean = normalizePermissionTarget(a);
                return clean !== '*' && !RESTRICTED_ADMIN_ACTIONS.has(clean);
              })
            : [];
          effectiveAccessProfile = {
            allowed_pages: sanitizedPages,
            allowed_actions: sanitizedActions,
            limits: {
              max_discount_percent: Math.min(effectiveAccessProfile.limits?.max_discount_percent ?? 0, 15),
              can_price_override: false,
              can_refund: effectiveAccessProfile.limits?.can_refund ?? false,
              can_void_sale: false,
              can_view_profit: false,
            },
          };
        } else {
          // SHOP_ADMIN: strip organization-wide pages, actions, and wildcards
          const sanitizedPages = Array.isArray(effectiveAccessProfile.allowed_pages)
            ? effectiveAccessProfile.allowed_pages.filter((p) => {
                const clean = normalizePermissionTarget(p);
                return clean !== '*' && !ORG_ADMIN_ONLY_PAGES.has(clean);
              })
            : [];
          const sanitizedActions = Array.isArray(effectiveAccessProfile.allowed_actions)
            ? effectiveAccessProfile.allowed_actions.filter((a) => {
                const clean = normalizePermissionTarget(a);
                return clean !== '*' && !ORG_ADMIN_ONLY_ACTIONS.has(clean);
              })
            : [];
          effectiveAccessProfile = {
            allowed_pages: sanitizedPages,
            allowed_actions: sanitizedActions,
            limits: {
              max_discount_percent: Math.min(effectiveAccessProfile.limits?.max_discount_percent ?? 0, 25),
              can_price_override: effectiveAccessProfile.limits?.can_price_override ?? true,
              can_refund: effectiveAccessProfile.limits?.can_refund ?? true,
              can_void_sale: effectiveAccessProfile.limits?.can_void_sale ?? true,
              can_view_profit: effectiveAccessProfile.limits?.can_view_profit ?? true,
            },
          };
        }
      }

      // Account confirmed active and role valid.
      // Authoritative database role overrides any stale role claims from the JWT (G4-AUTH-01 / G4-AUTH-03).
      req.identity = {
        ...identity,
        role: canonicalRole,
        access_profile: effectiveAccessProfile,
      };
      next();
    }).catch((err: unknown) => {
      // PostgreSQL error: fail-CLOSED. Do NOT call next().
      // Return 503 with a safe generic message; never leak DB details.
      console.error(`[auth] 503 DB status check failed for user ${identity.user_id} on ${req.method} ${req.originalUrl || req.path}:`, (err as Error).message);
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    });
  };
}

/**
 * Synchronous JWT-only middleware (no DB check).
 * Retained for use on endpoints that are called before a pool is available,
 * or for the rare public-ish endpoint that needs identity but not active-check.
 *
 * For all normal protected routes, prefer buildAuthMiddleware(pool) which
 * performs both JWT verification and active-account enforcement in one step.
 *
 * @deprecated Prefer buildAuthMiddleware(pool) for protected routes.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] ?? '';

  if (!authHeader) {
    console.warn(`[auth] 401 Unauthorized: Missing Authorization header on ${req.method} ${req.originalUrl || req.path}`);
    res.status(401).json({ error: 'Missing or empty authorization token' });
    return;
  }

  try {
    req.identity = resolveIdentity(authHeader);
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      console.warn(`[auth] 401 Unauthorized: ${err.message} on ${req.method} ${req.originalUrl || req.path}`);
      res.status(err.statusCode).json({ error: err.message });
    } else {
      console.warn(`[auth] 401 Unauthorized: Invalid token on ${req.method} ${req.originalUrl || req.path}`, err);
      res.status(401).json({ error: 'Invalid or corrupted authentication token' });
    }
  }
}

/**
 * @deprecated Replaced by buildAuthMiddleware(pool) which integrates the
 * active-account check directly into authentication. This function is kept
 * only to avoid breaking any call site that has not yet been migrated, but
 * it is INEFFECTIVE when placed before authMiddleware in the middleware chain
 * (req.identity will be undefined at that point).
 *
 * DO NOT register this middleware globally before routers.
 * DO NOT use this as a replacement for buildAuthMiddleware(pool).
 */
export function buildActiveUserMiddleware(pool: Pool): (req: Request, res: Response, next: NextFunction) => void {
  console.warn('[auth] buildActiveUserMiddleware is deprecated. Use buildAuthMiddleware(pool) instead.');
  // Return a no-op: the real enforcement is now inside buildAuthMiddleware.
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}

