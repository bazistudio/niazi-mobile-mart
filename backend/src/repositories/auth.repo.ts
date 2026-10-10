/**
 * Auth Repository — PostgreSQL access for authentication operations.
 *
 * Provides:
 *   - findByUsername(username) → User row with credential fields
 *   - findById(id) → User row
 *   - recordFailedLogin(userId) → increment failed_login_attempts
 *   - lockUser(userId, lockedUntilMs) → set login_locked_until_ms
 *   - resetLoginLockout(userId) → clear failed_login_attempts and lockout
 *   - recordFailedPin(userId) → increment failed_pin_attempts
 *   - lockPin(userId, lockedUntilMs) → set pin_locked_until_ms
 *   - resetPinLockout(userId) → clear failed_pin_attempts and pin lockout
 *   - updateLastSeen(userId) → placeholder (no last_seen column)
 *
 * This module is the exclusive SQL layer for auth — no raw SQL in route handlers.
 *
 * Mirrors Rust auth_service.rs + user repository postgres implementation.
 */

import { Pool, PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  name: string;
  username: string;
  login_key_hash: string;
  pin_hash: string | null;
  role: string;
  status: string;
  is_active: boolean;
  recovery_key_hash: string | null;
  must_change_password: boolean;
  access_profile: AccessProfile;
  failed_pin_attempts: number;
  pin_locked_until_ms: string | null;   // stored as BIGINT → string in pg
  failed_login_attempts: number;
  login_locked_until_ms: string | null; // stored as BIGINT → string in pg
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Operational limits — must exactly mirror Rust StaffOperationalLimits in access_control.rs.
 * Required in the JWT access_profile claim so Rust desktop serde can deserialize it.
 */
export interface StaffOperationalLimits {
  max_discount_percent: number;
  can_price_override: boolean;
  can_refund: boolean;
  can_void_sale: boolean;
  can_view_profit: boolean;
}

/**
 * Full access profile — must exactly mirror Rust StaffAccessProfile in access_control.rs.
 * The `limits` field MUST be present in JWTs issued by TypeScript; without it the Rust
 * desktop token_service.rs serde deserialization fails with "Invalid or corrupted
 * authentication token".
 */
export interface AccessProfile {
  allowed_pages: string[];
  allowed_actions: string[];
  limits: StaffOperationalLimits;
}

/** Role-based default limits — mirrors Rust StaffAccessProfile::*_default() constructors. */
export function defaultLimitsForRole(role: string): StaffOperationalLimits {
  const r = role.toUpperCase();
  if (r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER') {
    return { max_discount_percent: 100.0, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true };
  }
  if (r === 'SHOP_ADMIN' || r === 'SHOPADMIN') {
    return { max_discount_percent: 25.0, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true };
  }
  // All other roles: conservative defaults (mirrors cashier/salesman/manager/staff)
  return { max_discount_percent: 0.0, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELECT_USER_COLS = `
  id,
  name,
  username,
  login_key_hash,
  pin_hash,
  role,
  status,
  is_active,
  recovery_key_hash,
  must_change_password,
  access_profile,
  failed_pin_attempts,
  pin_locked_until_ms::text AS pin_locked_until_ms,
  failed_login_attempts,
  login_locked_until_ms::text AS login_locked_until_ms,
  branch_id,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

function mapRow(row: Record<string, unknown>): UserRow {
  const role = (row['role'] as string) ?? '';
  let access_profile: AccessProfile = {
    allowed_pages: [],
    allowed_actions: [],
    limits: defaultLimitsForRole(role),
  };
  try {
    const ap = row['access_profile'];
    let parsed: Partial<AccessProfile> | null = null;
    if (typeof ap === 'string') {
      parsed = JSON.parse(ap) as Partial<AccessProfile>;
    } else if (ap && typeof ap === 'object') {
      parsed = ap as Partial<AccessProfile>;
    }
    if (parsed) {
      access_profile = {
        allowed_pages: Array.isArray(parsed.allowed_pages) ? parsed.allowed_pages : [],
        allowed_actions: Array.isArray(parsed.allowed_actions) ? parsed.allowed_actions : [],
        // Preserve stored limits if present; otherwise fall back to role-based defaults.
        // This guarantees `limits` is ALWAYS populated so Rust serde never fails.
        limits: (parsed.limits && typeof parsed.limits === 'object')
          ? parsed.limits as StaffOperationalLimits
          : defaultLimitsForRole(role),
      };
    }
  } catch {
    // leave default (already has limits from defaultLimitsForRole)
  }

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    username: row['username'] as string,
    login_key_hash: row['login_key_hash'] as string,
    pin_hash: (row['pin_hash'] as string | null) ?? null,
    role: row['role'] as string,
    status: row['status'] as string,
    is_active: Boolean(row['is_active']),
    recovery_key_hash: (row['recovery_key_hash'] as string | null) ?? null,
    must_change_password: Boolean(row['must_change_password']),
    access_profile,
    failed_pin_attempts: Number(row['failed_pin_attempts'] ?? 0),
    pin_locked_until_ms: (row['pin_locked_until_ms'] as string | null) ?? null,
    failed_login_attempts: Number(row['failed_login_attempts'] ?? 0),
    login_locked_until_ms: (row['login_locked_until_ms'] as string | null) ?? null,
    branch_id: (row['branch_id'] as string | null) ?? null,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Auth Repository
// ---------------------------------------------------------------------------

export class AuthRepo {
  constructor(private readonly pool: Pool) {}

  /**
   * Find a user by username (case-insensitive, matching Rust lower() comparison).
   * Returns the full row including credential hashes.
   */
  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await this.pool.query(
      `SELECT ${SELECT_USER_COLS} FROM users WHERE lower(username) = lower($1) LIMIT 1`,
      [username]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Find a user by ID.
   */
  async findById(id: string): Promise<UserRow | null> {
    const result = await this.pool.query(
      `SELECT ${SELECT_USER_COLS} FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Increment failed_login_attempts and return the new count.
   * Matches Rust auth_service.rs lockout logic.
   */
  async recordFailedLogin(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );
    return Number((result.rows[0] as Record<string, unknown>)?.['failed_login_attempts'] ?? 0);
  }

  /**
   * Set login lockout timestamp (epoch ms).
   * Mirrors: `login_locked_until_ms = Some(now + 15 * 60 * 1_000)`
   */
  async lockLoginUntil(userId: string, lockedUntilMs: bigint): Promise<void> {
    await this.pool.query(
      `UPDATE users
         SET login_locked_until_ms = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [userId, lockedUntilMs.toString()]
    );
  }

  /**
   * Clear login failed attempts and lockout after a successful login.
   */
  async resetLoginLockout(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
         SET failed_login_attempts = 0,
             login_locked_until_ms = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Increment failed_pin_attempts.
   */
  async recordFailedPin(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE users
         SET failed_pin_attempts = failed_pin_attempts + 1,
             updated_at = NOW()
       WHERE id = $1
       RETURNING failed_pin_attempts`,
      [userId]
    );
    return Number((result.rows[0] as Record<string, unknown>)?.['failed_pin_attempts'] ?? 0);
  }

  /**
   * Set PIN lockout timestamp.
   */
  async lockPinUntil(userId: string, lockedUntilMs: bigint): Promise<void> {
    await this.pool.query(
      `UPDATE users
         SET pin_locked_until_ms = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [userId, lockedUntilMs.toString()]
    );
  }

  /**
   * Clear PIN failed attempts and lockout after a successful PIN login.
   */
  async resetPinLockout(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
         SET failed_pin_attempts = 0,
             pin_locked_until_ms = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * List all users (for credential snapshot endpoint — Admin only).
   * Returns full rows including credential hashes.
   */
  async listAll(client?: PoolClient): Promise<UserRow[]> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `SELECT ${SELECT_USER_COLS} FROM users ORDER BY created_at ASC`
    );
    return (result.rows as Record<string, unknown>[]).map(mapRow);
  }
}
