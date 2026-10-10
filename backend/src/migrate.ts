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
 * Execute pending migrations sequentially inside a transaction lock.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  console.log(`[migrate] Discovering PostgreSQL migrations from: ${migrationsDir}`);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (files.length === 0) {
    console.warn('[migrate] No .sql migration files found in directory.');
    return;
  }

  console.log(`[migrate] Discovered ${files.length} migration file(s) (001 through ${files[files.length - 1]}).`);

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
  loadEnv();
  const { getPool } = require('./db');
  const pool = getPool();
  runMigrations(pool)
    .then(() => {
      console.log('[migrate] CLI migration runner completed successfully.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[migrate] CLI migration runner fatal error:', err);
      process.exit(1);
    });
}
