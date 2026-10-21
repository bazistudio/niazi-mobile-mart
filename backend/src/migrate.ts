/**
 * TypeScript PostgreSQL Migration Runner
 *
 * Discovers and applies PostgreSQL migrations from `src-tauri/migrations/postgres/`
 * in strict numeric/alphabetical order.
 *
 * Features:
 * - Uses `schema_migrations` table to track applied migrations.
 * - Employs PostgreSQL advisory locks (`pg_advisory_xact_lock`) to ensure safety
 *   when multiple backend instances start concurrently.
 * - Runs each pending migration inside an atomic transaction block.
 * - Idempotent and safe against fresh, partially migrated, or fully migrated databases.
 */

import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';

/** Unique integer key for PostgreSQL advisory transaction lock during migrations */
const MIGRATION_ADVISORY_LOCK_ID = 74291837;

/**
 * Locate the PostgreSQL migrations directory relative to working dir or source file.
 */
function resolveMigrationsDir(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'src-tauri', 'migrations', 'postgres'),
    path.join(process.cwd(), '..', 'src-tauri', 'migrations', 'postgres'),
    path.join(__dirname, '..', '..', 'src-tauri', 'migrations', 'postgres'),
    path.join(__dirname, '..', 'migrations', 'postgres'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }

  throw new Error(
    `FATAL: Could not locate migrations directory 'src-tauri/migrations/postgres'. Searched: ${possiblePaths.join(', ')}`
  );
}

/**
 * Ensure `schema_migrations` tracking table exists.
 */
async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

/**
 * Get set of already applied migration filenames or versions.
 */
async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const res = await client.query<{ name: string; version: number }>('SELECT version, name FROM schema_migrations;');
  const set = new Set<string>();
  for (const row of res.rows) {
    if (row.name) set.add(row.name);
    if (row.version !== undefined) set.add(String(row.version));
  }
  return set;
}

/**
 * Extract integer prefix from migration filename (e.g. "001_initial_schema.sql" -> 1).
 */
function getMigrationVersion(filename: string): number {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Configuration options for runMigrations.
 */
export interface MigrationOptions {
  /** Maximum migration version to apply (inclusive). Migrations with version > targetVersion are skipped. */
  targetVersion?: number;
}

export interface MigrationCliArgs {
  targetVersion?: number;
  databaseUrl?: ValidatedTestDatabaseTarget;
}

/**
 * Strict CLI argument parser for --target-version and --database-url.
 *
 * Rules:
 * - If no --target-version argument is passed, targetVersion is undefined (unrestricted).
 * - Supported target-version forms: `--target-version=<int>` or `--target-version <int>`.
 * - Supported database-url forms: `--database-url=<URI>` or `--database-url <URI>`.
 * - Rejects malformed values (non-integers, negative numbers, floats, empty values).
 * - Rejects duplicate arguments.
 * - Rejects unknown options starting with `--`.
 * - Validates --database-url strictly before returning:
 *   - Protocol must be postgresql: or postgres:
 *   - Host must be exactly 127.0.0.1 or localhost
 *   - Port must be 5432 (explicit or default)
 *   - Database name must be exactly niazi_local_test
 *   - Explicitly rejects niazi_mobile_mart_local or any other database
 *   - Rejects any query parameter other than an unambiguous valid sslmode
 */
export function parseMigrationCliArgs(argv: string[]): MigrationCliArgs {
  let targetVersion: number | undefined = undefined;
  let databaseUrl: ValidatedTestDatabaseTarget | undefined = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--target-version=')) {
      if (targetVersion !== undefined) {
        throw new Error('[migrate] Duplicate --target-version argument detected.');
      }
      const rawVal = arg.slice('--target-version='.length).trim();
      targetVersion = parseVersionNumber(rawVal);
    } else if (arg === '--target-version') {
      if (targetVersion !== undefined) {
        throw new Error('[migrate] Duplicate --target-version argument detected.');
      }
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error('[migrate] Missing value for --target-version.');
      }
      const rawVal = argv[++i].trim();
      targetVersion = parseVersionNumber(rawVal);
    } else if (arg.startsWith('--database-url=')) {
      if (databaseUrl !== undefined) {
        throw new Error('[migrate] Duplicate --database-url argument detected.');
      }
      const rawUrl = arg.slice('--database-url='.length).trim();
      if (!rawUrl) {
        throw new Error('[migrate] Empty value for --database-url.');
      }
      databaseUrl = validateExplicitDatabaseUrl(rawUrl);
    } else if (arg === '--database-url') {
      if (databaseUrl !== undefined) {
        throw new Error('[migrate] Duplicate --database-url argument detected.');
      }
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error('[migrate] Missing value for --database-url.');
      }
      const rawUrl = argv[++i].trim();
      databaseUrl = validateExplicitDatabaseUrl(rawUrl);
    } else if (arg.startsWith('--')) {
      throw new Error(`[migrate] Unsupported argument: "${arg}". Only --target-version=<N> and --database-url=<URI> are supported.`);
    }
  }

  return { targetVersion, databaseUrl };
}

/** Backward-compatible export for cutoff parser */
export function parseMigrationCutoff(argv: string[]): number | undefined {
  return parseMigrationCliArgs(argv).targetVersion;
}

function parseVersionNumber(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`[migrate] Invalid target-version "${raw}". Must be a non-negative integer.`);
  }
  const val = parseInt(raw, 10);
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new Error(`[migrate] Invalid target-version "${raw}". Out of valid integer range.`);
  }
  return val;
}

export interface ValidatedTestDatabaseTarget {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
}

/**
 * Strict validator for explicit database connection URI.
 * Accepts only loopback host (127.0.0.1 or localhost), port 5432, and database 'niazi_local_test'.
 * Strictly rejects 'niazi_mobile_mart_local', any remote host, or other databases.
 * Rejects any query parameter other than an unambiguous, valid 'sslmode'.
 */
export function validateExplicitDatabaseUrl(rawUrl: string): ValidatedTestDatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('[migrate] Malformed --database-url URI.');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`[migrate] Unsupported protocol "${protocol}". Must be postgres: or postgresql:`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`[migrate] Rejected non-loopback host "${hostname}". Only 127.0.0.1 or localhost is permitted.`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (port !== 5432) {
    throw new Error(`[migrate] Rejected port "${port}". Only port 5432 is permitted for local test target.`);
  }

  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (dbName === 'niazi_mobile_mart_local') {
    throw new Error('[migrate] SECURITY REJECTION: Explicit connection cannot target production/shared database "niazi_mobile_mart_local".');
  }

  if (dbName !== 'niazi_local_test') {
    throw new Error(`[migrate] SECURITY REJECTION: Database "${dbName}" is not the authorized test target "niazi_local_test".`);
  }

  // Inspect all query parameters strictly after decoding
  let sslmode: string | undefined = undefined;
  for (const [rawKey, rawVal] of parsed.searchParams.entries()) {
    const key = decodeURIComponent(rawKey).trim().toLowerCase();
    if (key !== 'sslmode') {
      throw new Error(`[migrate] SECURITY REJECTION: Unauthorized query parameter "${rawKey}". Only 'sslmode' is permitted.`);
    }
    if (sslmode !== undefined) {
      throw new Error('[migrate] SECURITY REJECTION: Duplicate "sslmode" query parameter detected.');
    }
    sslmode = decodeURIComponent(rawVal).trim().toLowerCase();
  }

  let ssl: false | { rejectUnauthorized: false } = { rejectUnauthorized: false };
  if (sslmode !== undefined) {
    if (sslmode === 'disable') {
      ssl = false;
    } else if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
      ssl = { rejectUnauthorized: false };
    } else {
      throw new Error(`[migrate] SECURITY REJECTION: Unsupported sslmode "${sslmode}".`);
    }
  }

  return { connectionString: rawUrl, ssl };
}

/**
 * Filter and sort migration files based on optional targetVersion cutoff.
 */
export function filterMigrationFiles(files: string[], targetVersion?: number): string[] {
  const sorted = [...files]
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (targetVersion === undefined) {
    return sorted;
  }

  return sorted.filter((f) => {
    const v = getMigrationVersion(f);
    return v <= targetVersion;
  });
}

/**
 * Execute pending migrations sequentially inside a transaction lock.
 */
export async function runMigrations(pool: Pool, options?: MigrationOptions): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  console.log(`[migrate] Discovering PostgreSQL migrations from: ${migrationsDir}`);

  const rawFiles = fs.readdirSync(migrationsDir);
  const files = filterMigrationFiles(rawFiles, options?.targetVersion);

  if (files.length === 0) {
    console.warn('[migrate] No eligible .sql migration files found.');
    return;
  }

  if (options?.targetVersion !== undefined) {
    console.log(
      `[migrate] Discovered ${files.length} eligible migration file(s) capped at target-version ${options.targetVersion} (001 through ${files[files.length - 1]}).`
    );
  } else {
    console.log(`[migrate] Discovered ${files.length} migration file(s) (001 through ${files[files.length - 1]}).`);
  }

  const client = await pool.connect();
  try {
    // 1. Begin transaction & acquire PostgreSQL advisory lock to prevent concurrent runs
    await client.query('BEGIN;');
    await client.query('SELECT pg_advisory_xact_lock($1);', [MIGRATION_ADVISORY_LOCK_ID]);

    // 2. Ensure migration tracking table exists
    await ensureMigrationTable(client);

    // 3. Fetch already applied migrations
    const applied = await getAppliedMigrations(client);

    // 4. Apply pending migrations sequentially
    let appliedCount = 0;
    for (const filename of files) {
      const versionNum = getMigrationVersion(filename);
      if (applied.has(filename) || applied.has(String(versionNum))) {
        continue;
      }

      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[migrate] Applying migration ${versionNum}: ${filename}...`);
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING;',
        [versionNum, filename, new Date().toISOString()]
      );
      appliedCount++;
    }

    await client.query('COMMIT;');
    if (appliedCount > 0) {
      console.log(`[migrate] Successfully applied ${appliedCount} pending migration(s).`);
    } else {
      console.log('[migrate] Database schema is up to date (0 pending migrations).');
    }
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('[migrate] Migration failed, transaction rolled back:', (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

function loadEnv(): void {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'env'),
    path.join(process.cwd(), 'backend', 'env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', 'env'),
    path.join(process.cwd(), '..', 'backend', 'env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const p of envPaths) {
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
    }
  }
}

// Allow direct CLI execution via `node dist/migrate.js` or `ts-node src/migrate.ts`
if (require.main === module) {
  try {
    const { targetVersion, databaseUrl } = parseMigrationCliArgs(process.argv.slice(2));
    
    let pool: Pool;
    if (databaseUrl) {
      console.log('[migrate] Connecting explicitly to verified loopback target database: niazi_local_test');
      pool = new Pool({ connectionString: databaseUrl.connectionString, ssl: databaseUrl.ssl });
      pool.on('error', (err) => {
        console.error('[migrate] Test pool error:', err.message);
      });
    } else {
      loadEnv();
      const { getPool } = require('./db');
      pool = getPool();
    }

    runMigrations(pool, { targetVersion })
      .then(async () => {
        console.log('[migrate] CLI migration runner completed successfully.');
        if (databaseUrl) {
          await pool.end();
        }
        process.exit(0);
      })
      .catch(async (err: unknown) => {
        console.error('[migrate] CLI migration runner fatal error:', err);
        if (databaseUrl) {
          await pool.end().catch(() => {});
        }
        process.exit(1);
      });
  } catch (err: unknown) {
    console.error('[migrate] CLI argument validation error:', (err as Error).message);
    process.exit(1);
  }
}
