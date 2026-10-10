import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
 * Checks if identity has an administrative role.
 * Case-insensitive comparison supporting ADMIN, ShopAdmin, SUPER_ADMIN, OWNER.
 * Mirrors RequestIdentity::is_admin() in identity.rs.
 */
export function isAdmin(identity: RequestIdentity): boolean {
  const r = String(identity.role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SHOPADMIN' || r === 'SHOP_ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER';
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
 * Express middleware: extracts and verifies the Bearer JWT from the Authorization header.
 * Attaches resolved RequestIdentity to req.identity.
 * Returns 401 on missing or invalid token.
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

