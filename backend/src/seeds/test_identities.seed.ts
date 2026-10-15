/**
 * Niazi Mobile Mart — Safe Local Test Account Seed
 *
 * Requirements:
 * 1. Strictly restricted to local dedicated test environments.
 * 2. Refuses unapproved, production, or ambiguous database targets.
 * 3. Never deletes existing users, transactions, stock, sales, invoices, ledgers, or cash sessions.
 * 4. Never truncates tables or runs broad cleanup SQL.
 * 5. Uses transactions and narrowly scoped writes.
 * 6. Safe to re-run (idempotent; does not duplicate accounts or overwrite credentials by default).
 * 7. Dry-run preview mode supported.
 * 8. Zero hardcoded fallback credentials: all passwords must be supplied via environment variables.
 * 9. Requires explicit opt-in: ALLOW_TEST_SEED=true (NODE_ENV=test alone is NOT sufficient).
 * 10. Uses application's canonical default role permission profiles.
 */

import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { defaultLimitsForRole, AccessProfile } from '../repositories/auth.repo';
import { hashArgon2 } from '../services/argon2.service';
import { NIAZI_ORGANIZATION_ID } from '../auth';

// ---------------------------------------------------------------------------
// Safety Guards & Configuration
// ---------------------------------------------------------------------------

export const APPROVED_TEST_DATABASES = new Set(['niazi_staging_test', 'niazi_test', 'niazi_local_test']);

export interface DbSafetyInfo {
  database: string;
  host: string | null;
  port: number | null;
  isSafe: boolean;
  rejectionReason?: string;
}

/**
 * Validates environment guardrails and database target identity.
 * Fails closed if ALLOW_TEST_SEED !== 'true' or if target is production/remote.
 */
export async function verifyDatabaseTarget(pool: Pool, requireExplicitOptIn = true): Promise<DbSafetyInfo> {
  // Check 1: Mandatory explicit opt-in. NODE_ENV=test alone is strictly rejected.
  if (requireExplicitOptIn) {
    const isExplicitOptIn = process.env['ALLOW_TEST_SEED'] === 'true';
    if (!isExplicitOptIn) {
      return {
        database: 'UNKNOWN',
        host: null,
        port: null,
        isSafe: false,
        rejectionReason: 'Explicit test seed authorization missing. Set ALLOW_TEST_SEED=true to authorize execution.',
      };
    }
  }

  // Check 2: Query PostgreSQL for current database name and server connection endpoint
  const res = await pool.query<{
    current_database: string;
    inet_server_addr: string | null;
    inet_server_port: number | null;
  }>('SELECT current_database(), inet_server_addr(), inet_server_port();');

  const row = res.rows[0];
  if (!row) {
    return {
      database: 'UNKNOWN',
      host: null,
      port: null,
      isSafe: false,
      rejectionReason: 'Failed to retrieve database connection identity from server.',
    };
  }

  const dbName = row.current_database.toLowerCase();
  const host = row.inet_server_addr;
  const port = row.inet_server_port;

  // Check 3: Strictly reject primary dev/production database 'niazi_mobile_mart'
  if (dbName === 'niazi_mobile_mart' || dbName === 'production' || dbName.includes('prod')) {
    return {
      database: dbName,
      host,
      port,
      isSafe: false,
      rejectionReason: `Target database '${dbName}' is a production or primary development database. Seeding is strictly forbidden.`,
    };
  }

  // Check 4: Must be in explicitly approved test database allowlist
  if (!APPROVED_TEST_DATABASES.has(dbName)) {
    return {
      database: dbName,
      host,
      port,
      isSafe: false,
      rejectionReason: `Target database '${dbName}' is not in the approved test database allowlist (${Array.from(APPROVED_TEST_DATABASES).join(', ')}).`,
    };
  }

  // Check 5: Server IP address sanity check (must be localhost / local loopback / unix domain socket)
  if (host && host !== '127.0.0.1' && host !== '::1') {
    return {
      database: dbName,
      host,
      port,
      isSafe: false,
      rejectionReason: `Target host '${host}' is remote or non-loopback. Seed execution is restricted to local test instances.`,
    };
  }

  return {
    database: dbName,
    host,
    port,
    isSafe: true,
  };
}

// ---------------------------------------------------------------------------
// Canonical Access Profiles for Operational Roles
// Directly maps the application's actual default constructors (access_control.rs)
// ---------------------------------------------------------------------------

export function getProfileForRole(role: string): AccessProfile {
  const r = role.toUpperCase();
  const limits = defaultLimitsForRole(r);

  switch (r) {
    case 'ADMIN':
      return {
        allowed_pages: ['*'],
        allowed_actions: ['*'],
        limits,
      };
    case 'SHOP_ADMIN':
      return {
        allowed_pages: [
          'dashboard',
          'pos',
          'products',
          'inventory',
          'sales',
          'purchases',
          'customers',
          'suppliers',
          'parties',
          'repairs',
          'expenses',
          'cash',
          'reports',
          'settings',
        ],
        allowed_actions: [
          'pos:sale',
          'pos:hold',
          'pos:discount',
          'pos:override',
          'pos:refund',
          'pos:void',
          'stock:adjust',
          'reports:export',
          'expense:create',
          'cash:manage',
          'cash:open',
          'cash:close',
        ],
        limits,
      };
    case 'CASHIER':
      return {
        allowed_pages: ['dashboard', 'pos', 'products', 'sales', 'customers', 'parties'],
        allowed_actions: ['pos:sale', 'pos:hold', 'order:create', 'order:read', 'cash:open', 'cash:close'],
        limits,
      };
    case 'SALESMAN':
      return {
        allowed_pages: ['dashboard', 'pos', 'products', 'sales', 'customers', 'parties'],
        allowed_actions: ['pos:sale', 'pos:hold', 'order:create', 'order:read'],
        limits,
      };
    case 'MANAGER':
      return {
        allowed_pages: [
          'dashboard',
          'products',
          'inventory',
          'sales',
          'purchases',
          'customers',
          'suppliers',
          'parties',
          'repairs',
          'reports',
        ],
        allowed_actions: ['pos:sale', 'pos:hold', 'order:create', 'order:read'],
        limits,
      };
    case 'ACCOUNTANT':
      return {
        allowed_pages: [
          'dashboard',
          'products',
          'inventory',
          'sales',
          'purchases',
          'customers',
          'suppliers',
          'parties',
          'expenses',
          'reports',
        ],
        allowed_actions: ['reports:export'],
        limits,
      };
    case 'REPAIR_MECHANIC':
      return {
        allowed_pages: ['dashboard', 'repairs', 'customers', 'products'],
        allowed_actions: ['repair:create', 'repair:update', 'repair:diagnose', 'repair:parts'],
        limits,
      };
    default:
      return {
        allowed_pages: ['dashboard'],
        allowed_actions: [],
        limits,
      };
  }
}

// ---------------------------------------------------------------------------
// Test Identities Specification
// Notice: Zero hardcoded fallback passwords. All credentials must be supplied via env.
// ---------------------------------------------------------------------------

export interface TestAccountSpec {
  username: string;
  name: string;
  role: string;
  branchCodeOrName: string; // 'MAIN', 'BRA', 'BRB', etc.
  envPasswordKey: string;   // Environment variable name for credential injection
}

export const CANONICAL_TEST_SPECS: TestAccountSpec[] = [
  {
    username: 'test_org_admin',
    name: 'Test Organization Admin',
    role: 'ADMIN',
    branchCodeOrName: 'MAIN', // Home branch Main Branch, with organization-wide authority
    envPasswordKey: 'TEST_PASSWORD_ORG_ADMIN',
  },
  {
    username: 'test_admin_alpha',
    name: 'Test Admin Alpha',
    role: 'SHOP_ADMIN',
    branchCodeOrName: 'BRA',
    envPasswordKey: 'TEST_PASSWORD_ADMIN_ALPHA',
  },
  {
    username: 'test_admin_beta',
    name: 'Test Admin Beta',
    role: 'SHOP_ADMIN',
    branchCodeOrName: 'BRB',
    envPasswordKey: 'TEST_PASSWORD_ADMIN_BETA',
  },
  {
    username: 'test_cashier_main',
    name: 'Test Cashier Main',
    role: 'CASHIER',
    branchCodeOrName: 'MAIN',
    envPasswordKey: 'TEST_PASSWORD_CASHIER_MAIN',
  },
  {
    username: 'test_sales_main',
    name: 'Test Salesman Main',
    role: 'SALESMAN',
    branchCodeOrName: 'MAIN',
    envPasswordKey: 'TEST_PASSWORD_SALES_MAIN',
  },
  {
    username: 'test_manager_main',
    name: 'Test Manager Main',
    role: 'MANAGER',
    branchCodeOrName: 'MAIN',
    envPasswordKey: 'TEST_PASSWORD_MANAGER_MAIN',
  },
  {
    username: 'test_accountant_main',
    name: 'Test Accountant Main',
    role: 'ACCOUNTANT',
    branchCodeOrName: 'MAIN',
    envPasswordKey: 'TEST_PASSWORD_ACCOUNTANT_MAIN',
  },
  {
    username: 'test_sales_alpha',
    name: 'Test Salesman Alpha',
    role: 'SALESMAN',
    branchCodeOrName: 'BRA',
    envPasswordKey: 'TEST_PASSWORD_SALES_ALPHA',
  },
  {
    username: 'test_sales_beta',
    name: 'Test Salesman Beta',
    role: 'SALESMAN',
    branchCodeOrName: 'BRB',
    envPasswordKey: 'TEST_PASSWORD_SALES_BETA',
  },
  {
    username: 'test_mechanic_main',
    name: 'Test Mechanic Main',
    role: 'REPAIR_MECHANIC',
    branchCodeOrName: 'MAIN',
    envPasswordKey: 'TEST_PASSWORD_MECHANIC_MAIN',
  },
];

export interface SeedResult {
  dryRun: boolean;
  database: string;
  accountsCreated: string[];
  accountsUpdated: string[];
  accountsSkipped: string[];
  missingBranches: string[];
  missingCredentials: string[];
  errors: string[];
}

/**
 * Loads credentials from optional local ignored file `.env.test.credentials` if present.
 */
export function loadLocalTestCredentialsFile(): void {
  const possiblePaths = [
    path.join(process.cwd(), '.env.test.credentials'),
    path.join(process.cwd(), 'backend', '.env.test.credentials'),
    path.join(__dirname, '..', '..', '.env.test.credentials'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Seed Execution Engine
// ---------------------------------------------------------------------------

export async function runTestIdentitiesSeed(
  pool: Pool,
  options: {
    dryRun?: boolean;
    requireExplicitOptIn?: boolean;
    resetCredentialsIfExists?: boolean;
  } = {}
): Promise<SeedResult> {
  const dryRun = options.dryRun ?? false;
  const resetCredentials = options.resetCredentialsIfExists ?? false;

  loadLocalTestCredentialsFile();

  // Guard 1: Database target & explicit opt-in check
  const safety = await verifyDatabaseTarget(pool, options.requireExplicitOptIn ?? true);
  if (!safety.isSafe) {
    throw new Error(`[BLOCKED] Database safety check failed: ${safety.rejectionReason}`);
  }

  const result: SeedResult = {
    dryRun,
    database: safety.database,
    accountsCreated: [],
    accountsUpdated: [],
    accountsSkipped: [],
    missingBranches: [],
    missingCredentials: [],
    errors: [],
  };

  // Guard 2: Credential completeness check before any database transaction
  const missingCreds: string[] = [];
  for (const spec of CANONICAL_TEST_SPECS) {
    const cred = process.env[spec.envPasswordKey];
    if (!cred || !cred.trim()) {
      missingCreds.push(`${spec.username} (${spec.envPasswordKey})`);
    }
  }

  if (missingCreds.length > 0) {
    throw new Error(
      `[BLOCKED] Missing required test credentials. The following environment variables must be supplied:\n  - ${missingCreds.join('\n  - ')}`
    );
  }

  // Guard 3: Resolve existing branches from the verified test database
  const branchesRes = await pool.query<{ id: string; name: string; code: string }>(
    'SELECT id, name, code FROM branches WHERE is_active = 1;'
  );
  const branchMap = new Map<string, string>(); // Key = normalized code or name, Value = UUID
  for (const b of branchesRes.rows) {
    branchMap.set(b.code.toUpperCase(), b.id);
    branchMap.set(b.name.toUpperCase(), b.id);
  }

  // Pre-validate that required branches exist
  const branchLookups: Record<string, string | null> = {
    MAIN: branchMap.get('MAIN') ?? branchMap.get('MAIN BRANCH') ?? null,
    BRA: branchMap.get('BRA') ?? branchMap.get('BRANCH ALPHA') ?? branchMap.get('BRANCH B') ?? branchMap.get('TEST BRANCH B') ?? null,
    BRB: branchMap.get('BRB') ?? branchMap.get('BRANCH BETA') ?? branchMap.get('BRANCH C') ?? branchMap.get('TEST BRANCH C') ?? null,
  };

  for (const [key, val] of Object.entries(branchLookups)) {
    if (!val) {
      result.missingBranches.push(key);
    }
  }

  if (result.missingBranches.length > 0) {
    throw new Error(
      `[PREREQUISITE MISSING] Required branches are not configured in test database '${safety.database}': ${result.missingBranches.join(', ')}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const spec of CANONICAL_TEST_SPECS) {
      // Resolve branch ID
      let resolvedBranchId: string | null = null;
      if (spec.role === 'ADMIN') {
        resolvedBranchId = branchLookups['MAIN']!;
      } else if (spec.branchCodeOrName === 'MAIN') {
        resolvedBranchId = branchLookups['MAIN']!;
      } else if (spec.branchCodeOrName === 'BRA') {
        resolvedBranchId = branchLookups['BRA']!;
      } else if (spec.branchCodeOrName === 'BRB') {
        resolvedBranchId = branchLookups['BRB']!;
      }

      // Check if user already exists
      const existing = await client.query<{ id: string; role: string; branch_id: string | null }>(
        'SELECT id, role, branch_id FROM users WHERE username = $1 LIMIT 1;',
        [spec.username]
      );

      const profile = getProfileForRole(spec.role);
      const plainPassword = process.env[spec.envPasswordKey]!;

      if (existing.rows.length === 0) {
        // Create new account
        if (!dryRun) {
          const passwordHash = await hashArgon2(plainPassword);
          const userId = uuidv4();
          await client.query(
            `INSERT INTO users (
               id, name, username, login_key_hash, role, status, is_active,
               must_change_password, access_profile, failed_login_attempts,
               failed_pin_attempts, branch_id, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, $5, 'ACTIVE', 1,
               0, $6::jsonb, 0,
               0, $7, NOW(), NOW()
             )`,
            [
              userId,
              spec.name,
              spec.username,
              passwordHash,
              spec.role,
              JSON.stringify(profile),
              resolvedBranchId,
            ]
          );
        }
        result.accountsCreated.push(spec.username);
      } else {
        // Account exists: idempotent safe skip by default
        const row = existing.rows[0]!;
        if (resetCredentials) {
          if (!dryRun) {
            const passwordHash = await hashArgon2(plainPassword);
            await client.query(
              `UPDATE users
                 SET role = $2,
                     branch_id = $3,
                     access_profile = $4::jsonb,
                     login_key_hash = $5,
                     status = 'ACTIVE',
                     is_active = 1,
                     failed_login_attempts = 0,
                     login_locked_until_ms = NULL,
                     updated_at = NOW()
               WHERE id = $1`,
              [row.id, spec.role, resolvedBranchId, JSON.stringify(profile), passwordHash]
            );
          }
          result.accountsUpdated.push(spec.username);
        } else {
          // Safe skip: never alter existing credentials or reassign roles
          result.accountsSkipped.push(spec.username);
        }
      }
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// CLI Execution Entrypoint
// ---------------------------------------------------------------------------

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  const resetCreds = process.argv.includes('--reset-credentials');
  const { getPool } = require('../db');

  const pool = getPool();
  console.log(`[seed:test] Running test identities seed (dryRun=${isDryRun}, resetCreds=${resetCreds})...`);

  runTestIdentitiesSeed(pool, { dryRun: isDryRun, resetCredentialsIfExists: resetCreds })
    .then((res) => {
      console.log('[seed:test] Execution result: SUCCESS (no secrets logged)');
      console.log(JSON.stringify({
        database: res.database,
        dryRun: res.dryRun,
        accountsCreated: res.accountsCreated,
        accountsUpdated: res.accountsUpdated,
        accountsSkipped: res.accountsSkipped,
      }, null, 2));
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[seed:test] FATAL:', (err as Error).message);
      process.exit(1);
    });
}
