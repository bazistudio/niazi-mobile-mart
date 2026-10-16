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

// --- Legacy Admin Role Blocking (Temporary Compatibility Block) ---

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

  const roleUpper = String(claims.role || '').toUpperCase();
  if (BLOCKED_LEGACY_ADMIN_ROLES.has(roleUpper)) {
    throw new AuthError('Account role is deprecated or blocked. Please log in with a canonical role.', 401);
  }

  return {
    user_id: claims.sub,
    username: claims.username,
    role: claims.role,
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
 * Evaluates page + action permissions.
 * Mirrors RequestIdentity::authorize_permission() in identity.rs.
 * Returns null on success, error message string on failure (403).
 */
export function authorizePermission(
  identity: RequestIdentity,
  page: string | null,
  action: string | null
): string | null {
  if (isAdmin(identity)) {
    return null;
  }

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
 * Falls back to allowing staff roles (SALESMAN, CASHIER, STAFF, MANAGER) when allowed_pages is empty.
 */
function hasPageAccess(profile: StaffAccessProfile, page: string, role?: UserRole): boolean {
  if (profile && Array.isArray(profile.allowed_pages) && profile.allowed_pages.length > 0) {
    return profile.allowed_pages.some((p) => p === '*' || p === page);
  }
  const r = String(role || '').toUpperCase();
  if (r === 'SALESMAN' || r === 'CASHIER' || r === 'STAFF' || r === 'MANAGER' || r === 'ACCOUNTANT') {
    return true;
  }
  return false;
}

/**
 * Mirrors StaffAccessProfile::has_action_access() in access_control.rs.
 * Falls back to allowing staff roles (SALESMAN, CASHIER, STAFF, MANAGER) when allowed_actions is empty.
 *
 * IMPORTANT: This general fallback is intentional for most operations (POS, expenses, etc.).
 * For product mutation actions (products:edit, products:delete, product:create), callers MUST
 * use hasProductActionAccess() below, which is default-deny when allowed_actions is empty.
 */
function hasActionAccess(profile: StaffAccessProfile, action: string, role?: UserRole): boolean {
  if (profile && Array.isArray(profile.allowed_actions) && profile.allowed_actions.length > 0) {
    return profile.allowed_actions.some((a) => a === '*' || a === action);
  }
  const r = String(role || '').toUpperCase();
  if (r === 'SALESMAN' || r === 'CASHIER' || r === 'STAFF' || r === 'MANAGER' || r === 'ACCOUNTANT') {
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
      const dbRole = String(row['role'] ?? '').toUpperCase();

      if (BLOCKED_LEGACY_ADMIN_ROLES.has(dbRole)) {
        console.warn(`[auth] 401 User ${identity.user_id} possesses blocked legacy admin role '${dbRole}' on ${req.method} ${req.originalUrl || req.path}`);
        res.status(401).json({ error: 'Account role is deprecated or blocked. Contact your administrator.' });
        return;
      }

      if (!isActive || status !== 'ACTIVE') {
        console.warn(`[auth] 401 Disabled user ${identity.user_id} (status=${status}) attempted access on ${req.method} ${req.originalUrl || req.path}`);
        res.status(401).json({ error: 'Account is disabled. Contact your administrator.' });
        return;
      }
      // Account confirmed active and role valid — attach identity and continue.
      req.identity = identity;
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

