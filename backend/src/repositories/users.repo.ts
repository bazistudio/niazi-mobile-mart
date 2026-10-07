/**
 * Users Repository — PostgreSQL CRUD for user/admin management.
 *
 * Provides all user administration operations that currently live in Rust
 * admin_service.rs and are accessed via the Rust HTTP API.
 *
 * This module is the exclusive SQL layer for user management.
 * Business rules (role checks, lockout thresholds) live in the route handlers
 * and auth service — not here.
 *
 * Mirrors:
 *   - Rust admin_service.rs (create_user, update_user, delete_user, approve_staff,
 *     reject_staff, reset_credentials)
 *   - Rust UserRepository (postgres implementation)
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessProfile {
  allowed_pages: string[];
  allowed_actions: string[];
}

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  is_active: boolean;
  must_change_password: boolean;
  access_profile: AccessProfile;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  name: string;
  username: string;
  login_key_hash: string;         // pre-hashed by caller
  pin_hash?: string | null;       // pre-hashed by caller
  role: string;
  status?: string;                // default 'ACTIVE'
  branch_id?: string | null;
  access_profile?: AccessProfile;
  must_change_password?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  username?: string;
  role?: string;
  status?: string;
  branch_id?: string | null;
  access_profile?: AccessProfile;
  must_change_password?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELECT_SAFE_COLS = `
  id,
  name,
  username,
  role,
  status,
  is_active,
  must_change_password,
  access_profile,
  branch_id,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

function mapSafeRow(row: Record<string, unknown>): UserRow {
  let access_profile: AccessProfile = { allowed_pages: [], allowed_actions: [] };
  try {
    const ap = row['access_profile'];
    if (typeof ap === 'string') {
      access_profile = JSON.parse(ap) as AccessProfile;
    } else if (ap && typeof ap === 'object') {
      access_profile = ap as AccessProfile;
    }
  } catch {
    // leave default
  }

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    username: row['username'] as string,
    role: row['role'] as string,
    status: row['status'] as string,
    is_active: Boolean(row['is_active']),
    must_change_password: Boolean(row['must_change_password']),
    access_profile,
    branch_id: (row['branch_id'] as string | null) ?? null,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Users Repository
// ---------------------------------------------------------------------------

export class UsersRepo {
  constructor(private readonly pool: Pool) {}

  /** List all users (sanitized — no credential fields). */
  async listAll(): Promise<UserRow[]> {
    const result = await this.pool.query(
      `SELECT ${SELECT_SAFE_COLS} FROM users ORDER BY created_at ASC`
    );
    return (result.rows as Record<string, unknown>[]).map(mapSafeRow);
  }

  /** Get one user by ID (sanitized). */
  async findById(id: string): Promise<UserRow | null> {
    const result = await this.pool.query(
      `SELECT ${SELECT_SAFE_COLS} FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /** Get one user by username (sanitized). */
  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await this.pool.query(
      `SELECT ${SELECT_SAFE_COLS} FROM users WHERE lower(username) = lower($1) LIMIT 1`,
      [username]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Create a new user.
   * Caller must hash credentials before calling this method.
   * Mirrors Rust admin_service::create_user_direct().
   */
  async createUser(input: CreateUserInput, client?: PoolClient): Promise<UserRow> {
    const executor = client ?? this.pool;
    const id = uuidv4();
    const defaultProfile: AccessProfile = input.access_profile ?? { allowed_pages: [], allowed_actions: [] };
    const status = input.status ?? 'ACTIVE';
    const is_active = status === 'ACTIVE';

    const result = await executor.query(
      `INSERT INTO users (
         id, name, username,
         login_key_hash, pin_hash,
         role, status, is_active,
         must_change_password, access_profile,
         failed_login_attempts, failed_pin_attempts,
         branch_id, created_at, updated_at
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, $7, $8,
         $9, $10::jsonb,
         0, 0,
         $11, NOW(), NOW()
       )
       RETURNING ${SELECT_SAFE_COLS}`,
      [
        id,
        input.name,
        input.username,
        input.login_key_hash,
        input.pin_hash ?? null,
        input.role,
        status,
        is_active ? 1 : 0,
        (input.must_change_password ?? false) ? 1 : 0,
        JSON.stringify(defaultProfile),
        input.branch_id ?? null,
      ]
    );

    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Update user fields (name, role, branch, access_profile, status, must_change_password).
   * Returns null if user not found.
   */
  async updateUser(id: string, input: UpdateUserInput, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;

    // Build dynamic SET clause
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIdx = 2;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(input.name);
    }
    if (input.username !== undefined) {
      setClauses.push(`username = $${paramIdx++}`);
      params.push(input.username);
    }
    if (input.role !== undefined) {
      setClauses.push(`role = $${paramIdx++}`);
      params.push(input.role);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      params.push(input.status);
      // Keep is_active in sync
      setClauses.push(`is_active = $${paramIdx++}`);
      params.push(input.status === 'ACTIVE');
    }
    if (input.branch_id !== undefined) {
      setClauses.push(`branch_id = $${paramIdx++}`);
      params.push(input.branch_id ?? null);
    }
    if (input.access_profile !== undefined) {
      setClauses.push(`access_profile = $${paramIdx++}::jsonb`);
      params.push(JSON.stringify(input.access_profile));
    }
    if (input.must_change_password !== undefined) {
      setClauses.push(`must_change_password = $${paramIdx++}`);
      params.push(input.must_change_password ? 1 : 0);
    }

    if (setClauses.length === 1) {
      // No fields to update (only updated_at) — still return current record
      return this.findById(id);
    }

    const result = await executor.query(
      `UPDATE users
         SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING ${SELECT_SAFE_COLS}`,
      params
    );

    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Soft-delete a user by setting status = 'DISABLED' and is_active = false.
   * Matches Rust admin_service::delete_user() behavior which disables rather
   * than hard-deletes.
   */
  async deactivateUser(id: string, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET status = 'DISABLED',
             is_active = false,
             updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Hard-delete a user row. Use with caution — prefer deactivateUser.
   * Only valid for PENDING/REJECTED users that haven't transacted.
   */
  async hardDeleteUser(id: string, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `DELETE FROM users WHERE id = $1 AND status IN ('PENDING', 'REJECTED')`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Approve a staff registration (PENDING → ACTIVE).
   * Mirrors Rust admin_service::approve_staff().
   */
  async approveStaff(id: string, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET status = 'ACTIVE',
             is_active = true,
             updated_at = NOW()
       WHERE id = $1
         AND status = 'PENDING'
       RETURNING ${SELECT_SAFE_COLS}`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Reject a staff registration (PENDING → REJECTED).
   * Mirrors Rust admin_service::reject_staff().
   */
  async rejectStaff(id: string, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET status = 'REJECTED',
             is_active = false,
             updated_at = NOW()
       WHERE id = $1
         AND status = 'PENDING'
       RETURNING ${SELECT_SAFE_COLS}`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Reset a user's login credential (password/login_key_hash).
   * Caller must hash the new credential before calling.
   * Mirrors Rust admin_service::reset_staff_password().
   */
  async resetLoginKey(
    id: string,
    newLoginKeyHash: string,
    mustChangePassword: boolean,
    client?: PoolClient
  ): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET login_key_hash = $2,
             must_change_password = $3,
             failed_login_attempts = 0,
             login_locked_until_ms = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [id, newLoginKeyHash, mustChangePassword]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Reset a user's PIN.
   * Caller must hash the new PIN before calling.
   * Pass null to remove the PIN.
   */
  async resetPin(id: string, newPinHash: string | null, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET pin_hash = $2,
             failed_pin_attempts = 0,
             pin_locked_until_ms = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [id, newPinHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Set a one-time recovery key hash.
   * Used by admin_recover_access flow.
   */
  async setRecoveryKey(id: string, recoveryKeyHash: string, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET recovery_key_hash = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [id, recoveryKeyHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Phase 4 additions: suspend, changePIN, listByBranch, hardDeleteUserAdmin,
  // updatePermissions
  // ---------------------------------------------------------------------------

  /**
   * Suspend a user account (ACTIVE → DISABLED).
   * Suspended users cannot authenticate (auth layer checks status='ACTIVE').
   * Preserves user record and all historical relationships.
   * Phase 4 requirement: activate the existing Suspend action.
   */
  async suspendUser(id: string, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET status = 'DISABLED',
             is_active = false,
             updated_at = NOW()
       WHERE id = $1
         AND status = 'ACTIVE'
       RETURNING ${SELECT_SAFE_COLS}`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Reactivate a suspended user (DISABLED → ACTIVE).
   * Phase 4: ADMIN can re-enable a suspended user.
   */
  async reactivateUser(id: string, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET status = 'ACTIVE',
             is_active = true,
             updated_at = NOW()
       WHERE id = $1
         AND status = 'DISABLED'
       RETURNING ${SELECT_SAFE_COLS}`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Change a user's PIN.
   * Caller must hash the new PIN via argon2 sidecar before calling.
   * Phase 4: Admin can change user PIN (fix for broken PIN change in edit/actions).
   * Clears any PIN lockout state when changing PIN.
   */
  async changePIN(id: string, newPinHash: string, client?: PoolClient): Promise<boolean> {
    // Reuses resetPin logic — identical SQL behavior
    return this.resetPin(id, newPinHash, client);
  }

  /**
   * Clear a user's PIN (set to null).
   * Phase 4: Admin can remove PIN from user.
   */
  async clearPIN(id: string, client?: PoolClient): Promise<boolean> {
    return this.resetPin(id, null, client);
  }

  /**
   * List users filtered by branch_id.
   * Phase 4: Branch isolation — branch users see only their branch's users.
   */
  async listByBranch(branchId: string): Promise<UserRow[]> {
    const result = await this.pool.query(
      `SELECT ${SELECT_SAFE_COLS} FROM users WHERE branch_id = $1 ORDER BY created_at ASC`,
      [branchId]
    );
    return (result.rows as Record<string, unknown>[]).map(mapSafeRow);
  }

  /**
   * Hard-delete any non-ADMIN user (ADMIN privilege only).
   * Phase 4: Admin can permanently delete user accounts.
   *
   * Safety: All FK constraints on users table use ON DELETE SET NULL for
   * performed_by/opened_by/closed_by/published_by columns. Only
   * user_access_profiles uses ON DELETE CASCADE (safe — profile is not
   * meaningful without the user).
   *
   * Historical business records (sales, expenses, cash sessions, etc.)
   * are preserved — the performed_by column is nulled out by PostgreSQL
   * FK cascade semantics.
   *
   * ENFORCED SAFETY RULES:
   *   - Cannot delete ADMIN users (prevents last-admin lockout)
   *   - Cannot delete self (caller must pass their own user_id separately)
   *
   * Returns true if deleted, false if user not found or is ADMIN.
   */
  async hardDeleteUserAdmin(id: string, callerUserId: string, client?: PoolClient): Promise<{ deleted: boolean; reason?: string }> {
    const executor = client ?? this.pool;

    // Check: cannot delete an ADMIN
    const checkResult = await executor.query(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (checkResult.rows.length === 0) {
      return { deleted: false, reason: 'User not found' };
    }
    const userRole = ((checkResult.rows[0] as Record<string, unknown>)['role'] as string ?? '').toUpperCase();
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'OWNER') {
      return { deleted: false, reason: 'Cannot delete an ADMIN user. Suspend the user instead.' };
    }

    // Check: cannot delete self
    if (id === callerUserId) {
      return { deleted: false, reason: 'Cannot delete your own account' };
    }

    const result = await executor.query(
      `DELETE FROM users WHERE id = $1`,
      [id]
    );
    return { deleted: (result.rowCount ?? 0) > 0 };
  }

  /**
   * Update a user's access profile (extra permissions).
   * Phase 4: ADMIN can assign additional permissions beyond base role.
   * The user's role remains intact; access_profile adds granular overrides.
   */
  async updatePermissions(id: string, accessProfile: AccessProfile, client?: PoolClient): Promise<UserRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE users
         SET access_profile = $2::jsonb,
             updated_at = NOW()
       WHERE id = $1
       RETURNING ${SELECT_SAFE_COLS}`,
      [id, JSON.stringify(accessProfile)]
    );
    if (result.rows.length === 0) return null;
    return mapSafeRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Get total count of active admins.
   * Used to prevent deleting the last admin.
   */
  async countAdmins(): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE (role = 'ADMIN' OR role = 'SHOP_ADMIN') AND (is_active = 1 OR status = 'ACTIVE')`
    );
    return Number((result.rows[0] as Record<string, unknown>)?.['cnt'] ?? 0);
  }

  /**
   * Check if any admin users exist (for bootstrap check).
   */
  async hasAnyUser(): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM users WHERE (role = 'ADMIN' OR role = 'SHOP_ADMIN') AND (is_active = 1 OR status = 'ACTIVE') LIMIT 1`
    );
    return result.rows.length > 0;
  }
}
