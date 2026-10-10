/**
 * Auth Service — TypeScript implementation of online authentication logic.
 *
 * This is the NEW ONLINE AUTHENTICATION AUTHORITY for Phase 1 migration.
 * It replaces the Rust auth_service.rs for all HTTP-originated auth flows.
 *
 * Responsibilities:
 *   - Login credential verification (password or PIN)
 *   - Lockout enforcement (5 failed attempts)
 *   - JWT issuance via jwt.service.ts
 *   - User status enforcement (active/disabled/pending)
 *
 * What remains in Rust (intentionally NOT migrated):
 *   - auth_login_snapshot IPC command (offline Tauri auth — native capability)
 *   - Local credential hash verification in the desktop binary
 *
 * Lockout thresholds (mirrors Rust auth_service.rs exactly):
 *   - Login: 5 failed attempts → 15 min lockout (900_000 ms)
 *   - PIN:   5 failed attempts →  5 min lockout (300_000 ms)
 *
 * Mirrors: src-tauri/src/services/auth_service.rs
 */

import { AuthRepo, UserRow } from '../repositories/auth.repo';
import { verifyArgon2 } from './argon2.service';
import { issueToken } from './jwt.service';

// ---------------------------------------------------------------------------
// Constants — must match Rust
// ---------------------------------------------------------------------------

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1_000;  // 15 minutes

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1_000;     // 5 minutes

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_CREDENTIALS' | 'LOCKED_OUT' | 'DISABLED' | 'PENDING' | 'SERVER_ERROR',
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface LoginResult {
  token: string;
  user: SafeUser;
}

export interface SafeUser {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  is_active: boolean;
  must_change_password: boolean;
  access_profile: { allowed_pages: string[]; allowed_actions: string[] };
  branch_id: string | null;
  has_pin: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeUser(u: UserRow): SafeUser {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    status: u.status,
    is_active: u.is_active,
    must_change_password: u.must_change_password,
    access_profile: u.access_profile,
    branch_id: u.branch_id,
    has_pin: u.pin_hash !== null && u.pin_hash !== '',
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

/**
 * Check if a lockout timestamp (epoch ms stored as string/bigint) has passed.
 * Returns remaining lockout milliseconds if still locked (>0), or 0 if unlocked.
 */
function remainingLockout(lockedUntilMs: string | null): number {
  if (!lockedUntilMs) return 0;
  const lockedUntil = parseInt(lockedUntilMs, 10);
  if (isNaN(lockedUntil)) return 0;
  const now = Date.now();
  const remaining = lockedUntil - now;
  return remaining > 0 ? remaining : 0;
}

// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------

export class AuthService {
  constructor(private readonly repo: AuthRepo) {}

  /**
   * Authenticate a user with username + password (or PIN).
   *
   * The `password` field is tried first as a login_key (password).
   * If that fails and the user has a pin_hash, it is also tried as a PIN.
   * This mirrors Rust auth_service.rs::login() behavior exactly.
   *
   * @throws AuthServiceError on invalid credentials, lockout, or account issues
   */
  async login(username: string, password: string): Promise<LoginResult> {
    // 1. Find user
    const user = await this.repo.findByUsername(username);
    if (!user) {
      // Constant-time-safe: still perform a dummy hash check to prevent
      // timing-based username enumeration
      await verifyArgon2(password, '$argon2id$v=19$m=19456,t=2,p=1$invalid$invalid');
      throw new AuthServiceError(
        'Invalid username or password',
        'INVALID_CREDENTIALS',
        401
      );
    }

    // 2. Check account status
    if (user.status === 'PENDING') {
      throw new AuthServiceError(
        'Account is pending approval. Contact your administrator.',
        'PENDING',
        403
      );
    }
    if (user.status === 'REJECTED') {
      throw new AuthServiceError(
        'Account has been rejected. Contact your administrator.',
        'DISABLED',
        403
      );
    }
    if (!user.is_active || user.status === 'DISABLED') {
      throw new AuthServiceError(
        'Account is disabled. Contact your administrator.',
        'DISABLED',
        403
      );
    }

    // 3. Check login lockout
    const loginLockRemaining = remainingLockout(user.login_locked_until_ms);
    if (loginLockRemaining > 0) {
      throw new AuthServiceError(
        `Account is temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(loginLockRemaining / 60_000)} minute(s).`,
        'LOCKED_OUT',
        429,
        loginLockRemaining
      );
    }

    // 4. Try login_key_hash (password)
    const passwordMatch = await verifyArgon2(password, user.login_key_hash);

    if (passwordMatch) {
      // 5a. Successful password login — reset lockout
      await this.repo.resetLoginLockout(user.id);

      const token = issueToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        accessProfile: user.access_profile,
        branchId: user.branch_id,
      });

      return { token, user: sanitizeUser(user) };
    }

    // 5b. Try PIN (if user has one)
    if (user.pin_hash && user.pin_hash !== '') {
      // Check PIN lockout
      const pinLockRemaining = remainingLockout(user.pin_locked_until_ms);
      if (pinLockRemaining > 0) {
        throw new AuthServiceError(
          `PIN is temporarily locked. Try again in ${Math.ceil(pinLockRemaining / 60_000)} minute(s).`,
          'LOCKED_OUT',
          429,
          pinLockRemaining
        );
      }

      const pinMatch = await verifyArgon2(password, user.pin_hash);

      if (pinMatch) {
        // Successful PIN login — reset PIN lockout
        await this.repo.resetPinLockout(user.id);

        const token = issueToken({
          userId: user.id,
          username: user.username,
          role: user.role,
          accessProfile: user.access_profile,
          branchId: user.branch_id,
        });

        return { token, user: sanitizeUser(user) };
      }

      // PIN also failed — record PIN failure
      const newPinAttempts = await this.repo.recordFailedPin(user.id);
      if (newPinAttempts >= MAX_PIN_ATTEMPTS) {
        const lockedUntil = BigInt(Date.now() + PIN_LOCKOUT_MS);
        await this.repo.lockPinUntil(user.id, lockedUntil);
      }
    }

    // 6. Both password and PIN failed — record login failure
    const newLoginAttempts = await this.repo.recordFailedLogin(user.id);
    if (newLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = BigInt(Date.now() + LOGIN_LOCKOUT_MS);
      await this.repo.lockLoginUntil(user.id, lockedUntil);
      throw new AuthServiceError(
        `Too many failed login attempts. Account locked for 15 minutes.`,
        'LOCKED_OUT',
        429,
        LOGIN_LOCKOUT_MS
      );
    }

    const attemptsRemaining = MAX_LOGIN_ATTEMPTS - newLoginAttempts;
    throw new AuthServiceError(
      `Invalid username or password. ${attemptsRemaining} attempt(s) remaining before lockout.`,
      'INVALID_CREDENTIALS',
      401
    );
  }

  /**
   * Look up the current authenticated user's full record (for /api/auth/me).
   * The identity is already verified via the auth middleware.
   */
  async getCurrentUser(userId: string): Promise<SafeUser | null> {
    const user = await this.repo.findById(userId);
    if (!user) return null;
    return sanitizeUser(user);
  }
}
