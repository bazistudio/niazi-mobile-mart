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
 *
 * What remains in Rust (intentionally NOT migrated):
 *   - auth_login_snapshot IPC command (offline Tauri auth — native capability)
 *
 * Security:
 *   - Passwords/PINs/hashes are never logged
 *   - Credential hashes are never returned to callers
 *   - Constant-time comparison via Argon2id (Rust sidecar)
 *
 * Mirrors: src-tauri/src/bin/server.rs auth handlers
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthRepo } from '../repositories/auth.repo';
import { UsersRepo } from '../repositories/users.repo';
import { AuthService, AuthServiceError } from '../services/auth.service';
import { hashArgon2 } from '../services/argon2.service';
import { authMiddleware } from '../auth';

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
  const authService = new AuthService(authRepo);

  // -------------------------------------------------------------------------
  // POST /login
  // -------------------------------------------------------------------------

  router.post('/login', async (req: Request, res: Response): Promise<void> => {
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
  // GET /me
  // -------------------------------------------------------------------------

  router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        access_profile: { allowed_pages: ['*'], allowed_actions: ['*'] },
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
        access_profile: { allowed_pages: [], allowed_actions: [] },
        must_change_password: false,
      });

      res.status(201).json({ message: 'Registration submitted. Awaiting admin approval.', user });
    } catch (err) {
      console.error('[auth/register-staff] Unexpected error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
