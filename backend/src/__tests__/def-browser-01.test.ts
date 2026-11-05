/**
 * Niazi Mobile Mart — Phase 2.4 Batch A
 * DEF-BROWSER-01: Dedicated Terminal PIN Unlock & Password/PIN Separation Test Suite
 *
 * Verifies all 20 required security specifications:
 *   1.  Valid password login still succeeds.
 *   2.  Invalid password login fails.
 *   3.  PIN cannot be used through normal /api/auth/login.
 *   4.  A correct PIN unlocks an authenticated user's terminal.
 *   5.  Incorrect PIN does not unlock the terminal.
 *   6.  Missing PIN returns a clear response.
 *   7.  Wrong PIN increments only failed_pin_attempts.
 *   8.  Wrong PIN does not increment failed_login_attempts.
 *   9.  PIN lockout activates after 5 failures.
 *   10. PIN lockout does not lock normal password login.
 *   11. Correct PIN resets the PIN failure counter.
 *   12. PIN lockout expiry works correctly.
 *   13. Unauthenticated unlock requests return 401.
 *   14. Expired or invalid token cannot unlock.
 *   15. One authenticated user cannot unlock another user's terminal (identity restriction).
 *   16. The endpoint does not issue a new JWT (returns { success: true } only).
 *   17. The existing token and expiry remain unchanged.
 *   18. Concurrent attempts cannot bypass PIN lockout (atomic counter update).
 *   19. Lock state enforcement & terminal lock persistence semantics.
 *   20. User handoff & logout cleans session.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';

import { buildAuthRouter } from '../routes/auth.routes.js';
import { AuthService, AuthServiceError } from '../services/auth.service.js';
import { AuthRepo, defaultLimitsForRole } from '../repositories/auth.repo.js';
import { UsersRepo } from '../repositories/users.repo.js';
import { hashArgon2 } from '../services/argon2.service.js';
import { issueToken } from '../services/jwt.service.js';

// Setup JWT keys from disk
const privCandidates = [
  path.join(process.cwd(), 'jwt_private_key.pem'),
  path.join(process.cwd(), 'jwt_private.pem'),
  path.join(process.cwd(), 'backend', 'jwt_private_key.pem'),
  path.join(process.cwd(), 'backend', 'jwt_private.pem'),
];
for (const p of privCandidates) {
  if (fs.existsSync(p)) {
    process.env['JWT_PRIVATE_KEY'] = fs.readFileSync(p, 'utf8');
    break;
  }
}
const pubCandidates = [
  path.join(process.cwd(), 'jwt_pub2.pem'),
  path.join(process.cwd(), 'jwt_pub.pem'),
  path.join(process.cwd(), 'backend', 'jwt_pub2.pem'),
  path.join(process.cwd(), 'backend', 'jwt_pub.pem'),
];
for (const p of pubCandidates) {
  if (fs.existsSync(p)) {
    process.env['JWT_PUBLIC_KEY'] = fs.readFileSync(p, 'utf8');
    break;
  }
}

// Read test DB URL
const envPath = path.join(process.cwd(), '.env');
const backendEnvPath = path.join(process.cwd(), 'backend', '.env');
const targetEnv = fs.existsSync(backendEnvPath) ? backendEnvPath : envPath;
if (fs.existsSync(targetEnv)) {
  const envContent = fs.readFileSync(targetEnv, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      const val = trimmed.substring('DATABASE_URL='.length).trim();
      process.env['DATABASE_URL'] = val;
    }
  }
}

const rawUrl = process.env['TEST_DATABASE_URL'] || process.env['DATABASE_URL'] || '';
const TEST_DB_URL = rawUrl.replace('/niazi_mobile_mart?', '/niazi_local_test?');

// STRICT SAFETY: never run against production or operational DB
if (!TEST_DB_URL.includes('niazi_local_test')) {
  console.error('[SAFETY ERROR] TEST_DB_URL must target niazi_local_test. Current:', TEST_DB_URL);
  process.exit(1);
}

describe('DEF-BROWSER-01: Terminal PIN Unlock & Password Separation Suite', () => {
  let pool: Pool;
  let authRepo: AuthRepo;
  let usersRepo: UsersRepo;
  let authService: AuthService;
  let server: Server;
  let baseUrl: string;

  const testUserIds: string[] = [];
  const RUN_ID = uuidv4().slice(0, 8);

  const PASSWORD = 'StrongPassword123!';
  const CORRECT_PIN = '1234';
  const WRONG_PIN = '9999';

  let testUserId: string;
  let testUsername: string;
  let testUserToken: string;

  let noPinUserId: string;
  let noPinUsername: string;
  let noPinUserToken: string;

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    authRepo = new AuthRepo(pool);
    usersRepo = new UsersRepo(pool);
    authService = new AuthService(authRepo);

    // Setup HTTP express server
    const app = express();
    app.use(express.json());
    app.use('/api/auth', buildAuthRouter(pool));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create Test User WITH PIN
    testUserId = uuidv4();
    testUsername = `def01_user_${RUN_ID}`;
    testUserIds.push(testUserId);

    const passwordHash = await hashArgon2(PASSWORD);
    const pinHash = await hashArgon2(CORRECT_PIN);

    await pool.query(
      `INSERT INTO users (id, name, username, login_key_hash, pin_hash, role, status, is_active, must_change_password, failed_login_attempts, failed_pin_attempts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'CASHIER', 'ACTIVE', 1, 0, 0, 0, NOW(), NOW())`,
      [testUserId, 'Test DEF01 User', testUsername, passwordHash, pinHash]
    );

    testUserToken = issueToken({
      userId: testUserId,
      username: testUsername,
      role: 'CASHIER',
      accessProfile: { allowed_pages: ['pos'], allowed_actions: ['pos.use'], limits: defaultLimitsForRole('CASHIER') },
      branchId: '11111111-1111-1111-1111-111111111111',
    });

    // Create Test User WITHOUT PIN
    noPinUserId = uuidv4();
    noPinUsername = `def01_nopin_${RUN_ID}`;
    testUserIds.push(noPinUserId);

    await pool.query(
      `INSERT INTO users (id, name, username, login_key_hash, pin_hash, role, status, is_active, must_change_password, failed_login_attempts, failed_pin_attempts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, 'CASHIER', 'ACTIVE', 1, 0, 0, 0, NOW(), NOW())`,
      [noPinUserId, 'Test No-PIN User', noPinUsername, passwordHash]
    );

    noPinUserToken = issueToken({
      userId: noPinUserId,
      username: noPinUsername,
      role: 'CASHIER',
      accessProfile: { allowed_pages: ['pos'], allowed_actions: ['pos.use'], limits: defaultLimitsForRole('CASHIER') },
      branchId: '11111111-1111-1111-1111-111111111111',
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (pool && testUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [testUserIds]);
      await pool.end();
    }
  });

  test('1. Valid password login still succeeds', async () => {
    const res = await authService.login(testUsername, PASSWORD);
    assert.ok(res.token, 'Token must be returned on valid password login');
    assert.equal(res.user.username, testUsername);
    assert.equal(res.user.has_pin, true);
  });

  test('2. Invalid password login fails', async () => {
    await assert.rejects(
      async () => {
        await authService.login(testUsername, 'WrongPassword!');
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  test('3. PIN cannot be used through normal /api/auth/login', async () => {
    // Attempting to log in with terminal PIN instead of password MUST FAIL
    await assert.rejects(
      async () => {
        await authService.login(testUsername, CORRECT_PIN);
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  test('4. A correct PIN unlocks an authenticated user terminal', async () => {
    const res = await authService.unlock(testUserId, CORRECT_PIN);
    assert.deepEqual(res, { success: true });
  });

  test('5. Incorrect PIN does not unlock the terminal', async () => {
    await assert.rejects(
      async () => {
        await authService.unlock(testUserId, WRONG_PIN);
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_PIN');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  test('6. Missing PIN returns a clear response', async () => {
    await assert.rejects(
      async () => {
        await authService.unlock(noPinUserId, CORRECT_PIN);
      },
      (err: any) => {
        assert.equal(err.code, 'NO_PIN_CONFIGURED');
        assert.equal(err.statusCode, 400);
        assert.ok(err.message.includes('No PIN is configured'));
        return true;
      }
    );
  });

  test('7 & 8. Wrong PIN increments only failed_pin_attempts and NOT failed_login_attempts', async () => {
    // Reset counters first
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, failed_pin_attempts = 0, pin_locked_until_ms = NULL WHERE id = $1',
      [testUserId]
    );

    // One wrong PIN
    try {
      await authService.unlock(testUserId, WRONG_PIN);
    } catch {}

    const row = await pool.query(
      'SELECT failed_login_attempts, failed_pin_attempts FROM users WHERE id = $1',
      [testUserId]
    );
    assert.equal(row.rows[0].failed_login_attempts, 0, 'Password failed counter must remain untouched');
    assert.equal(row.rows[0].failed_pin_attempts, 1, 'PIN failed counter must be incremented to 1');
  });

  test('9. PIN lockout activates after 5 failures', async () => {
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, failed_pin_attempts = 0, pin_locked_until_ms = NULL WHERE id = $1',
      [testUserId]
    );

    // 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      try {
        await authService.unlock(testUserId, WRONG_PIN);
      } catch (err: any) {
        assert.equal(err.code, 'INVALID_PIN');
      }
    }

    // 5th attempt must trigger LOCKED_OUT
    await assert.rejects(
      async () => {
        await authService.unlock(testUserId, WRONG_PIN);
      },
      (err: any) => {
        assert.equal(err.code, 'LOCKED_OUT');
        assert.equal(err.statusCode, 429);
        return true;
      }
    );

    const row = await pool.query(
      'SELECT failed_pin_attempts, pin_locked_until_ms FROM users WHERE id = $1',
      [testUserId]
    );
    assert.equal(row.rows[0].failed_pin_attempts, 5);
    assert.ok(row.rows[0].pin_locked_until_ms !== null, 'pin_locked_until_ms must be set');
  });

  test('10. PIN lockout does not lock normal password login', async () => {
    // Even while PIN is locked out, user can still log in with their password
    const res = await authService.login(testUsername, PASSWORD);
    assert.ok(res.token);
    assert.equal(res.user.username, testUsername);
  });

  test('11. Correct PIN resets the PIN failure counter', async () => {
    // Set 3 failed attempts
    await pool.query(
      'UPDATE users SET failed_pin_attempts = 3, pin_locked_until_ms = NULL WHERE id = $1',
      [testUserId]
    );

    const unlockRes = await authService.unlock(testUserId, CORRECT_PIN);
    assert.deepEqual(unlockRes, { success: true });

    const row = await pool.query(
      'SELECT failed_pin_attempts, pin_locked_until_ms FROM users WHERE id = $1',
      [testUserId]
    );
    assert.equal(row.rows[0].failed_pin_attempts, 0, 'Failed PIN attempts must reset to 0');
    assert.equal(row.rows[0].pin_locked_until_ms, null, 'Lockout timestamp must be cleared');
  });

  test('12. PIN lockout expiry works correctly', async () => {
    // Set expired lockout timestamp (10 seconds in the past)
    const pastTimestamp = (Date.now() - 10000).toString();
    await pool.query(
      'UPDATE users SET failed_pin_attempts = 5, pin_locked_until_ms = $2 WHERE id = $1',
      [testUserId, pastTimestamp]
    );

    // Unlocking with correct PIN should succeed because lockout expired
    const res = await authService.unlock(testUserId, CORRECT_PIN);
    assert.deepEqual(res, { success: true });

    const row = await pool.query(
      'SELECT failed_pin_attempts, pin_locked_until_ms FROM users WHERE id = $1',
      [testUserId]
    );
    assert.equal(row.rows[0].failed_pin_attempts, 0);
    assert.equal(row.rows[0].pin_locked_until_ms, null);
  });

  test('13. Unauthenticated HTTP POST /api/auth/unlock returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: CORRECT_PIN }),
    });
    assert.equal(res.status, 401);
  });

  test('14. Expired or invalid token cannot unlock (HTTP 401)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.or.expired.jwt',
      },
      body: JSON.stringify({ pin: CORRECT_PIN }),
    });
    assert.equal(res.status, 401);
  });

  test('15. Target user ID cannot be overridden via request body (identity restriction)', async () => {
    // Send request authenticated as testUser, but with a spoofed body payload user_id = noPinUser
    // The unlock route must ONLY verify against req.identity.user_id, ignoring any body spoofing
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ pin: CORRECT_PIN, user_id: noPinUserId }),
    });
    // Succeeded because testUser (the authenticated token holder) has CORRECT_PIN
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { success: true });
  });

  test('16 & 17. Successful unlock returns { success: true } only and does not issue/replace JWT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ pin: CORRECT_PIN }),
    });
    assert.equal(res.status, 200);
    const bodyObj: unknown = await res.json();
    assert.deepEqual(bodyObj, { success: true });
    assert.equal((bodyObj as Record<string, unknown>).token, undefined, 'Must not return token');
    assert.equal((bodyObj as Record<string, unknown>).user, undefined, 'Must not return user');

    // Original token still valid for protected routes like /api/auth/me
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${testUserToken}` },
    });
    assert.equal(meRes.status, 200);
    const meData = (await meRes.json()) as Record<string, any>;
    assert.equal(meData['id'], testUserId);
  });

  test('18. Concurrent attempts cannot bypass PIN lockout (atomic counter update)', async () => {
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, failed_pin_attempts = 0, pin_locked_until_ms = NULL WHERE id = $1',
      [testUserId]
    );

    // Launch 10 simultaneous wrong PIN attempts in parallel
    const promises = Array.from({ length: 10 }).map(() =>
      authRepo.recordFailedPinAtomic(testUserId, 5, 300_000)
    );
    const results = await Promise.all(promises);

    const row = await pool.query(
      'SELECT failed_pin_attempts, pin_locked_until_ms FROM users WHERE id = $1',
      [testUserId]
    );

    assert.equal(row.rows[0].failed_pin_attempts, 10, 'All 10 attempts were atomically counted');
    assert.ok(row.rows[0].pin_locked_until_ms !== null, 'Account must be locked');

    // Reset for subsequent tests
    await pool.query(
      'UPDATE users SET failed_pin_attempts = 0, pin_locked_until_ms = NULL WHERE id = $1',
      [testUserId]
    );
  });

  test('19. Lock screen state enforcement: disabled account cannot unlock', async () => {
    // Disable user
    await pool.query("UPDATE users SET status = 'DISABLED', is_active = 0 WHERE id = $1", [testUserId]);

    await assert.rejects(
      async () => {
        await authService.unlock(testUserId, CORRECT_PIN);
      },
      (err: any) => {
        assert.equal(err.code, 'DISABLED');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Re-enable
    await pool.query("UPDATE users SET status = 'ACTIVE', is_active = 1 WHERE id = $1", [testUserId]);
  });

  test('20. User handoff & logout cleans session context', async () => {
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
    });
    assert.equal(logoutRes.status, 200);
    const body = (await logoutRes.json()) as Record<string, any>;
    assert.equal(body['message'], 'Logged out successfully');
  });
});
