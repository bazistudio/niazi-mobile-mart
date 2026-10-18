/**
 * Niazi Mobile Mart — Phase 2 Safe Local Test Account Seed Verification Tests
 *
 * Verifies:
 * 1. The seed strictly refuses an unapproved database (e.g. unknown DB or production names).
 * 2. The seed strictly refuses primary development database 'niazi_mobile_mart'.
 * 3. The seed strictly requires explicit test environment flags (ALLOW_TEST_SEED=true).
 * 4. Dry-run mode evaluates the seed plan without persisting changes or mutating the database.
 * 5. Re-running the seed is idempotent and does not create duplicate usernames.
 * 6. Organization test account is assigned canonical role ADMIN and has full organization access profile.
 * 7. Branch Admin accounts are assigned canonical role SHOP_ADMIN and bound to their respective branches.
 * 8. Operational accounts (CASHIER, SALESMAN, MANAGER, ACCOUNTANT, REPAIR_MECHANIC) are assigned least-privilege profiles.
 * 9. Hardcoded secrets are never logged or stored in plain text.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import {
  verifyDatabaseTarget,
  runTestIdentitiesSeed,
  getProfileForRole,
  CANONICAL_TEST_SPECS,
  APPROVED_TEST_DATABASES,
} from '../seeds/test_identities.seed.js';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';

// Ensure safety: never execute tests against non-local host
if (!TEST_DB_URL.includes('localhost') && !TEST_DB_URL.includes('127.0.0.1')) {
  console.error('[BLOCKED] DATABASE_URL is not local. Refusing to run tests.');
  process.exit(1);
}

describe('Test Account Seed Safety & Verification Suite', () => {
  let pool: Pool;

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  after(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test('1. Database safety: Rejects unapproved database targets', async () => {
    // Mock pool query returning an unapproved database
    const fakePool = {
      query: async () => ({
        rows: [{ current_database: 'random_customer_db', inet_server_addr: '127.0.0.1', inet_server_port: 5432 }],
      }),
    } as unknown as Pool;

    process.env['ALLOW_TEST_SEED'] = 'true';
    const safety = await verifyDatabaseTarget(fakePool, true);
    assert.strictEqual(safety.isSafe, false);
    assert.match(safety.rejectionReason ?? '', /not in the approved test database allowlist/);
  });

  test('2. Database safety: Rejects primary dev/production database niazi_mobile_mart', async () => {
    const fakePool = {
      query: async () => ({
        rows: [{ current_database: 'niazi_mobile_mart', inet_server_addr: '127.0.0.1', inet_server_port: 5432 }],
      }),
    } as unknown as Pool;

    process.env['ALLOW_TEST_SEED'] = 'true';
    const safety = await verifyDatabaseTarget(fakePool, true);
    assert.strictEqual(safety.isSafe, false);
    assert.match(safety.rejectionReason ?? '', /production or primary development database/);
  });

  test('3. Database safety: Rejects remote host even if database name matches', async () => {
    const fakePool = {
      query: async () => ({
        rows: [{ current_database: 'niazi_staging_test', inet_server_addr: '35.192.10.5', inet_server_port: 5432 }],
      }),
    } as unknown as Pool;

    process.env['ALLOW_TEST_SEED'] = 'true';
    const safety = await verifyDatabaseTarget(fakePool, true);
    assert.strictEqual(safety.isSafe, false);
    assert.match(safety.rejectionReason ?? '', /Target host.*is remote/);
  });

  test('4. Database safety: Rejects when explicit test mode variable is missing', async () => {
    const oldEnv = process.env['ALLOW_TEST_SEED'];
    delete process.env['ALLOW_TEST_SEED'];
    const oldNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'test'; // Even if NODE_ENV=test, it must fail without ALLOW_TEST_SEED=true

    const fakePool = {
      query: async () => ({
        rows: [{ current_database: 'niazi_staging_test', inet_server_addr: '127.0.0.1', inet_server_port: 5432 }],
      }),
    } as unknown as Pool;

    const safety = await verifyDatabaseTarget(fakePool, true);
    assert.strictEqual(safety.isSafe, false);
    assert.match(safety.rejectionReason ?? '', /Explicit test seed authorization missing/);

    // Restore
    if (oldEnv) process.env['ALLOW_TEST_SEED'] = oldEnv;
    if (oldNodeEnv) process.env['NODE_ENV'] = oldNodeEnv;
  });

  test('5. Credential safety: Refuses execution before any database transaction if credentials are missing', async () => {
    process.env['ALLOW_TEST_SEED'] = 'true';

    // Clear any test credentials
    for (const spec of CANONICAL_TEST_SPECS) {
      delete process.env[spec.envPasswordKey];
    }

    const fakePool = {
      query: async () => ({
        rows: [{ current_database: 'niazi_staging_test', inet_server_addr: '127.0.0.1', inet_server_port: 5432 }],
      }),
      connect: async () => {
        throw new Error('Database connection must NOT be initiated when credentials are missing');
      },
    } as unknown as Pool;

    await assert.rejects(
      async () => {
        await runTestIdentitiesSeed(fakePool, { dryRun: true });
      },
      (err: Error) => {
        assert.match(err.message, /Missing required test credentials/);
        return true;
      }
    );
  });

  test('6. Zero hardcoded passwords: CANONICAL_TEST_SPECS contains no plain passwords', () => {
    for (const spec of CANONICAL_TEST_SPECS) {
      const untyped = spec as unknown as Record<string, unknown>;
      assert.strictEqual(
        untyped['password'],
        undefined,
        `Account ${spec.username} must not define a static password property`
      );
      assert.strictEqual(
        untyped['defaultPasswordFallback'],
        undefined,
        `Account ${spec.username} must not define a fallback password`
      );
      assert.ok(spec.envPasswordKey.startsWith('TEST_PASSWORD_'), 'Must specify an env password key');
    }
  });

  test('7. Roles & Least Privilege: Org Admin receives full access profile', () => {
    const profile = getProfileForRole('ADMIN');
    assert.deepStrictEqual(profile.allowed_pages, ['*']);
    assert.deepStrictEqual(profile.allowed_actions, ['*']);
    assert.strictEqual(profile.limits.max_discount_percent, 100);
    assert.strictEqual(profile.limits.can_refund, true);
  });

  test('8. Roles & Least Privilege: Shop Admin receives branch administrative capabilities', () => {
    const profile = getProfileForRole('SHOP_ADMIN');
    assert.ok(profile.allowed_pages.includes('pos'));
    assert.ok(profile.allowed_pages.includes('inventory'));
    assert.ok(profile.allowed_pages.includes('cash'));
    assert.ok(profile.allowed_actions.includes('cash:manage'));
    assert.ok(profile.allowed_actions.includes('cash:open'));
    assert.strictEqual(profile.limits.max_discount_percent, 25);
  });

  test('9. Roles & Least Privilege: Operational roles receive strictly bounded permissions', () => {
    const cashierProf = getProfileForRole('CASHIER');
    assert.ok(cashierProf.allowed_pages.includes('pos'));
    assert.ok(!cashierProf.allowed_pages.includes('reports'));
    assert.ok(cashierProf.allowed_actions.includes('cash:open'));
    assert.ok(!cashierProf.allowed_actions.includes('stock:adjust'));

    const salesmanProf = getProfileForRole('SALESMAN');
    assert.ok(salesmanProf.allowed_pages.includes('pos'));
    assert.ok(!salesmanProf.allowed_actions.includes('cash:open'));
    assert.ok(!salesmanProf.allowed_actions.includes('stock:adjust'));

    const acctProf = getProfileForRole('ACCOUNTANT');
    assert.ok(!acctProf.allowed_pages.includes('pos'));
    assert.ok(acctProf.allowed_pages.includes('reports'));
    assert.ok(acctProf.allowed_pages.includes('expenses'));

    const mechProf = getProfileForRole('REPAIR_MECHANIC');
    assert.ok(mechProf.allowed_pages.includes('repairs'));
    assert.ok(!mechProf.allowed_pages.includes('pos'));
  });

  test('10. Canonical Specs Coverage: All 10 requested roles & usernames are specified', () => {
    const usernames = CANONICAL_TEST_SPECS.map((s) => s.username);
    assert.ok(usernames.includes('test_org_admin'));
    assert.ok(usernames.includes('test_admin_alpha'));
    assert.ok(usernames.includes('test_admin_beta'));
    assert.ok(usernames.includes('test_cashier_main'));
    assert.ok(usernames.includes('test_sales_main'));
    assert.ok(usernames.includes('test_manager_main'));
    assert.ok(usernames.includes('test_accountant_main'));
    assert.ok(usernames.includes('test_sales_alpha'));
    assert.ok(usernames.includes('test_sales_beta'));
    assert.ok(usernames.includes('test_mechanic_main'));

    // Verify distinct environment variable keys for credential injection
    const envKeys = new Set(CANONICAL_TEST_SPECS.map((s) => s.envPasswordKey));
    assert.strictEqual(envKeys.size, CANONICAL_TEST_SPECS.length, 'Every test account must have a unique envPasswordKey');
  });

  test('11. Dry-run execution on staging test DB runs atomically without persisting', async () => {
    process.env['ALLOW_TEST_SEED'] = 'true';

    // Supply mock credentials in memory only for this test run
    for (const spec of CANONICAL_TEST_SPECS) {
      process.env[spec.envPasswordKey] = 'MockTestSecret#2026';
    }

    // Seed the two auxiliary branches required by the seed spec (BRA, BRB).
    // Migration 001 already creates MAIN; these are test-only and removed in finally.
    const ORG_ID = '00000000-0000-0000-0000-000000000001';
    const BRANCH_BRA_ID = '00000000-0000-0000-0000-000000000010';
    const BRANCH_BRB_ID = '00000000-0000-0000-0000-000000000011';
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Branch Alpha', 'BRA', 1, $3, $3),
              ($4, $2, 'Branch Beta',  'BRB', 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_BRA_ID, ORG_ID, now, BRANCH_BRB_ID]
    );

    try {
      const initialCountRes = await pool.query<{ count: string }>('SELECT count(*) FROM users;');
      const initialCount = parseInt(initialCountRes.rows[0]?.count ?? '0', 10);

      const dryRunResult = await runTestIdentitiesSeed(pool, {
        dryRun: true,
        requireExplicitOptIn: true,
      });

      assert.strictEqual(dryRunResult.dryRun, true);
      assert.strictEqual(dryRunResult.accountsCreated.length, CANONICAL_TEST_SPECS.length);

      // Verify atomic rollback: user table count must NOT have changed
      const afterCountRes = await pool.query<{ count: string }>('SELECT count(*) FROM users;');
      const afterCount = parseInt(afterCountRes.rows[0]?.count ?? '0', 10);
      assert.strictEqual(afterCount, initialCount, 'Dry-run must not persist any new users to the database');
    } finally {
      // Remove the auxiliary test branches seeded above
      await pool.query(
        `DELETE FROM branches WHERE id = ANY($1::text[])`,
        [[BRANCH_BRA_ID, BRANCH_BRB_ID]]
      );
      // Clean up test secrets from environment
      for (const spec of CANONICAL_TEST_SPECS) {
        delete process.env[spec.envPasswordKey];
      }
    }
  });

  test('12. Idempotency: When accounts already exist, they are skipped by default', async () => {
    process.env['ALLOW_TEST_SEED'] = 'true';
    for (const spec of CANONICAL_TEST_SPECS) {
      process.env[spec.envPasswordKey] = 'MockTestSecret#2026';
    }

    // Mock client where all usernames exist
    const mockClient = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.startsWith('BEGIN') || sql.startsWith('ROLLBACK')) return { rows: [] };
        if (sql.includes('SELECT id, role, branch_id FROM users WHERE username =')) {
          return { rows: [{ id: 'mock-user-id', role: 'CASHIER', branch_id: 'mock-branch-id' }] };
        }
        if (sql.includes('INSERT INTO users')) {
          throw new Error('INSERT should not be called when account exists and resetCredentials=false');
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      query: async (sql: string) => {
        if (sql.includes('SELECT current_database()')) {
          return { rows: [{ current_database: 'niazi_staging_test', inet_server_addr: '127.0.0.1', inet_server_port: 5432 }] };
        }
        if (sql.includes('SELECT id, name, code FROM branches')) {
          return {
            rows: [
              { id: 'b1', name: 'Main Branch', code: 'MAIN' },
              { id: 'b2', name: 'Branch Alpha', code: 'BRA' },
              { id: 'b3', name: 'Branch Beta', code: 'BRB' },
            ],
          };
        }
        return { rows: [] };
      },
      connect: async () => mockClient,
    } as unknown as Pool;

    const res = await runTestIdentitiesSeed(mockPool, { dryRun: true, resetCredentialsIfExists: false });
    assert.strictEqual(res.accountsSkipped.length, CANONICAL_TEST_SPECS.length);
    assert.strictEqual(res.accountsCreated.length, 0);
    assert.strictEqual(res.accountsUpdated.length, 0);

    for (const spec of CANONICAL_TEST_SPECS) {
      delete process.env[spec.envPasswordKey];
    }
  });
});
