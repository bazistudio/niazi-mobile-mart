/**
 * Auth Routes — TypeScript Express router for online authentication.
 *
 * This router is the NEW ONLINE AUTHENTICATION AUTHORITY for Phase 1 migration.
 * It handles all HTTP-originated auth flows, replacing Rust /api/auth/* handlers.
 *
 * Routes (registered at BOTH /api/auth and /api/v1/auth for backward compatibility):
 *   POST   /login                — Credential verification + JWT issuance
 *   POST   /logout               — Stateless logout acknowledgement
 *   GET    /me                   — Current authenticated user (requires Bearer JWT)
 *   GET    /bootstrap-status     — Check if any admin users exist
 *   POST   /bootstrap-first-admin — Create first ADMIN (only when no users exist)
 *   POST   /register-staff       — Public self-registration (creates PENDING user)
 *   POST   /admin-recovery       — Emergency account recovery (ADMIN_RECOVERY_KEY required)
 *
 * What remains in Rust (intentionally NOT migrated):
 *   - auth_login_snapshot IPC command (offline Tauri auth — native capability)
 *
 * Security:
 *   - Passwords/PINs/hashes are never logged
 *   - Credential hashes are never returned to callers
 *   - Constant-time comparison via Argon2id (Rust sidecar)
 *   - IP-based rate limiting on /login (30 req / 15 min / IP)
 *   - Strict rate limiting on /admin-recovery (5 req / 15 min / IP)
 *
 * Mirrors: src-tauri/src/bin/server.rs auth handlers
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'crypto';
import { AuthRepo, defaultLimitsForRole } from '../repositories/auth.repo';
import { UsersRepo } from '../repositories/users.repo';
import { AuthService, AuthServiceError } from '../services/auth.service';
import { hashArgon2, verifyArgon2 } from '../services/argon2.service';
import { buildAuthMiddleware, isOrgAdmin } from '../auth';

// ---------------------------------------------------------------------------
// Rate Limiters
// ---------------------------------------------------------------------------

/**
 * IP-based login rate limiter.
 * 30 requests per 15 minutes per IP address.
 * Applies to POST /login only — not to /logout, /me, or other endpoints.
 * Cloud Run sets X-Forwarded-For; app.set('trust proxy', 1) in server.ts
 * ensures express-rate-limit reads the real client IP.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,  // 15 minutes
  limit: 30,                   // max 30 login attempts per IP per window
  standardHeaders: 'draft-7',  // Return RateLimit-* headers (RFC draft-7 format)
  legacyHeaders: false,         // Disable X-RateLimit-* legacy headers
  skipSuccessfulRequests: false, // Count all attempts (not just failures)
  message: {
    error: 'Too many login attempts from this IP address. Please try again in 15 minutes.',
    code: 'RATE_LIMITED',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many login attempts from this IP address. Please try again in 15 minutes.',
      code: 'RATE_LIMITED',
    });
  },
});

/**
 * Strict rate limiter for the admin-recovery endpoint.
 * 5 requests per 15 minutes per IP address.
 * This endpoint accepts a high-value secret key — keep the window tight.
 */
const recoveryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,  // 15 minutes
  limit: 5,                    // max 5 recovery attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many recovery attempts from this IP address. Please try again later.',
    code: 'RATE_LIMITED',
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many recovery attempts from this IP address. Please try again later.',
      code: 'RATE_LIMITED',
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing attacks on the recovery key.
 * Returns true only if both strings are identical and non-empty.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      // Lengths differ — still consume time to avoid length-timing oracle.
      // Compare against itself to maintain consistent timing.
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the auth router bound to the given PostgreSQL pool.
 * Mount at BOTH /api/auth and /api/v1/auth.
 */
export function buildAuthRouter(pool: Pool): Router {
  const router = Router();
  const authRepo = new AuthRepo(pool);
  const usersRepo = new UsersRepo(pool);
  const authService = new AuthService(authRepo, pool);

  // -------------------------------------------------------------------------
  // POST /login
  // -------------------------------------------------------------------------

  router.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as Record<string, unknown>;

    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    try {
      const result = await authService.login(username.trim(), password);
      res.status(200).json(result);
    } catch (err: unknown) {
      if (err instanceof AuthServiceError) {
        const body: Record<string, unknown> = { error: err.message, code: err.code };
        if (err.retryAfterMs !== undefined) {
          body['retry_after_ms'] = err.retryAfterMs;
          res.setHeader('Retry-After', Math.ceil(err.retryAfterMs / 1000).toString());
        }
        res.status(err.statusCode).json(body);
      } else {
        console.error('[auth/login] Unexpected error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // -------------------------------------------------------------------------
  // POST /logout
  // -------------------------------------------------------------------------

  router.post('/logout', (_req: Request, res: Response): void => {
    // JWTs are stateless; logout is acknowledged but client must discard token.
    // For future token revocation (Phase 2), a blacklist/refresh-token table would go here.
    res.status(200).json({ message: 'Logged out successfully' });
  });

  // -------------------------------------------------------------------------
  // POST /unlock
  // Dedicated Terminal PIN Unlock (DEF-BROWSER-01)
  // Requires authenticated session Bearer token.
  // -------------------------------------------------------------------------

  router.post('/unlock', buildAuthMiddleware(pool), async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { pin } = req.body as Record<string, unknown>;
    if (typeof pin !== 'string' || !pin.trim()) {
      res.status(400).json({ error: 'PIN is required', code: 'INVALID_PIN' });
      return;
    }

    try {
      const result = await authService.unlock(identity.user_id, pin.trim());
      res.status(200).json(result);
    } catch (err: unknown) {
      if (err instanceof AuthServiceError) {
        const body: Record<string, unknown> = { error: err.message, code: err.code };
        if (err.retryAfterMs !== undefined) {
          body['retry_after_ms'] = err.retryAfterMs;
          res.setHeader('Retry-After', Math.ceil(err.retryAfterMs / 1000).toString());
        }
        res.status(err.statusCode).json(body);
      } else {
        console.error('[auth/unlock] Unexpected error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // -------------------------------------------------------------------------
  // GET /me
  // -------------------------------------------------------------------------

  router.get('/me', buildAuthMiddleware(pool), async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    try {
      const user = await authService.getCurrentUser(identity.user_id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(200).json(user);
    } catch (err) {
      console.error('[auth/me] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /verify-admin-password
  // -------------------------------------------------------------------------

  router.post('/verify-admin-password', buildAuthMiddleware(pool), async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!isOrgAdmin(identity)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Only Organization Administrators can verify admin credentials' });
      return;
    }

    const { password } = req.body as Record<string, unknown>;
    if (typeof password !== 'string' || !password.trim()) {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    try {
      const adminUser = await authRepo.findById(identity.user_id);
      if (!adminUser || !adminUser.login_key_hash) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Administrator record or credentials not found' });
        return;
      }

      const match = await verifyArgon2(password.trim(), adminUser.login_key_hash);
      if (!match) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect administrator password' });
        return;
      }

      res.status(200).json({ success: true, message: 'Administrator password verified successfully' });
    } catch (err) {
      console.error('[auth/verify-admin-password] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /bootstrap-status
  // -------------------------------------------------------------------------

  router.get('/bootstrap-status', async (_req: Request, res: Response): Promise<void> => {
    try {
      const hasAdmin = await usersRepo.hasAnyUser();
      res.status(200).json({ initialized: hasAdmin });
    } catch (err) {
      console.error('[auth/bootstrap-status] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /bootstrap-first-admin
  // Allowed only when no admin users exist. Creates the first ADMIN user.
  // -------------------------------------------------------------------------

  router.post('/bootstrap-first-admin', async (req: Request, res: Response): Promise<void> => {
    const { name, username, password } = req.body as Record<string, unknown>;

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

    try {
      const already = await usersRepo.hasAnyUser();
      if (already) {
        res.status(409).json({ error: 'System is already initialized. Bootstrap is not allowed.' });
        return;
      }

      const loginKeyHash = await hashArgon2(password);

      const user = await usersRepo.createUser({
        name: name.trim(),
        username: username.trim(),
        login_key_hash: loginKeyHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        must_change_password: false,
        access_profile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: defaultLimitsForRole('ADMIN') },
      });

      res.status(201).json({ message: 'Admin account created successfully', user });
    } catch (err) {
      console.error('[auth/bootstrap-first-admin] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /register-staff
  // Public self-registration endpoint. Creates a PENDING account.
  // Mirrors Rust /api/auth/register-staff handler.
  // -------------------------------------------------------------------------

  router.post('/register-staff', async (req: Request, res: Response): Promise<void> => {
    const { name, username, password, branch_id } = req.body as Record<string, unknown>;

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

    try {
      // Check username uniqueness
      const existing = await usersRepo.findByUsername(username.trim());
      if (existing) {
        res.status(409).json({ error: 'Username is already taken' });
        return;
      }

      const loginKeyHash = await hashArgon2(password);

      const user = await usersRepo.createUser({
        name: name.trim(),
        username: username.trim(),
        login_key_hash: loginKeyHash,
        role: 'STAFF',
        status: 'PENDING',
        branch_id: typeof branch_id === 'string' ? branch_id : null,
        access_profile: { allowed_pages: [], allowed_actions: [], limits: defaultLimitsForRole('STAFF') },
        must_change_password: false,
      });

      res.status(201).json({ message: 'Registration submitted. Awaiting admin approval.', user });
    } catch (err) {
      console.error('[auth/register-staff] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /admin-recovery
  //
  // Emergency account recovery endpoint.
  // Resets a target user's password and clears all login lockout state.
  //
  // SECURITY:
  //   - Requires ADMIN_RECOVERY_KEY env var — compared in constant time.
  //   - The recovery key is NEVER logged, never returned, never echoed.
  //   - Responses are generic on failure to prevent information leakage.
  //   - Strict IP rate limiting: 5 requests / 15 min (see recoveryRateLimiter above).
  //   - The recovery key must be provisioned via GCP Secret Manager and injected
  //     as the ADMIN_RECOVERY_KEY environment variable at Cloud Run startup.
  //   - Setting must_change_password = true forces a password change on next login.
  //
  // Request body:
  //   { recovery_key: string, target_username: string, new_password: string }
  //
  // Responses:
  //   200 — recovery succeeded (generic message; does not confirm username found)
  //   400 — missing/invalid fields
  //   401 — invalid recovery key (generic; always same response regardless of reason)
  //   429 — rate limited
  //   500 — internal server error
  // -------------------------------------------------------------------------

  router.post('/admin-recovery', recoveryRateLimiter, async (req: Request, res: Response): Promise<void> => {
    const { recovery_key, target_username, new_password } = req.body as Record<string, unknown>;

    // Validate required fields
    if (typeof recovery_key !== 'string' || !recovery_key) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (typeof target_username !== 'string' || !target_username.trim()) {
      res.status(400).json({ error: 'target_username is required' });
      return;
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      res.status(400).json({ error: 'new_password must be at least 8 characters' });
      return;
    }

    // Fetch the configured recovery key from environment.
    // This value must be provisioned via GCP Secret Manager and injected
    // as ADMIN_RECOVERY_KEY at Cloud Run startup. Never hardcode it.
    const configuredKey = process.env['ADMIN_RECOVERY_KEY'] ?? '';
    if (!configuredKey) {
      // Recovery endpoint not configured — fail closed, log server-side only.
      console.error('[auth/admin-recovery] ADMIN_RECOVERY_KEY env var is not set. Recovery endpoint is disabled.');
      res.status(500).json({ error: 'Recovery endpoint is not configured on this server.' });
      return;
    }

    // Constant-time comparison — prevents timing oracle on recovery key.
    if (!constantTimeEqual(recovery_key, configuredKey)) {
      // Generic 401 — do not confirm whether the username exists or what failed.
      // Log the attempt server-side with the source IP for audit purposes.
      const sourceIp = req.ip ?? 'unknown';
      console.warn(`[auth/admin-recovery] FAILED attempt from IP ${sourceIp} for username "${target_username.trim()}"`);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Key matches — proceed with recovery.
    try {
      // Find the target user (case-insensitive, same as login)
      const user = await authRepo.findByUsername(target_username.trim());
      if (!user) {
        // Return 200 even for unknown usernames to prevent username enumeration.
        // The key was valid — this is not a security failure, so 200 is appropriate.
        const sourceIp = req.ip ?? 'unknown';
        console.warn(`[auth/admin-recovery] Key valid but username not found: "${target_username.trim()}" from IP ${sourceIp}`);
        res.status(200).json({ message: 'Recovery processed.' });
        return;
      }

      // Hash the new password
      const newHash = await hashArgon2(new_password);

      // Atomic reset: new password hash + clear lockout + set must_change_password
      await authRepo.atomicPasswordReset(user.id, newHash, true);

      const sourceIp = req.ip ?? 'unknown';
      console.warn(
        `[auth/admin-recovery] SUCCESS: password reset for user "${user.username}" (id=${user.id}) ` +
        `from IP ${sourceIp}. User must change password on next login.`
      );

      res.status(200).json({
        message: 'Account recovery successful. The account password has been reset and the account lockout has been cleared.',
        must_change_password: true,
      });
    } catch (err) {
      console.error('[auth/admin-recovery] Unexpected error during recovery:', err);
      // Generic error — do not reveal internal details
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
