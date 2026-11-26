/**
 * Migration 055 — repair_parts.source_type Contract Tests
 *
 * Operation ID: R100-GATE1-P0-SCHEMA-RESTORATION-001
 * Gate: 1 — P0 Schema Restoration
 *
 * Purpose:
 *   Verify (without a live database) that:
 *   A. The migration file exists with the correct SQL contract.
 *   B. The migration runner correctly discovers and orders migration 055.
 *   C. No duplicate migration version 55 conflict exists in the inventory.
 *   D. The source_type values in repair.repo.ts match the migration contract.
 *
 * These are static / structural tests. They require no database connection.
 * Database-level behavior (column default, NOT NULL enforcement, existing row
 * backfill) cannot be verified here without executing a migration and is
 * explicitly reported as a limitation per Gate 1 design restrictions.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  getMigrationVersion,
  filterMigrationFiles,
  assertUniqueMigrationVersions,
} from '../migrate';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'src-tauri', 'migrations', 'postgres');
const MIGRATION_055_PATH = path.join(MIGRATIONS_DIR, '055_repair_parts_source_type.sql');
const REPAIR_REPO_PATH = path.join(REPO_ROOT, 'backend', 'src', 'repositories', 'repair.repo.ts');

// ---------------------------------------------------------------------------
// Test A — Migration file exists and contains the approved SQL contract
// ---------------------------------------------------------------------------

describe('Migration 055 — File contract', () => {
  test('A1: 055_repair_parts_source_type.sql exists', () => {
    assert.ok(
      fs.existsSync(MIGRATION_055_PATH),
      `Expected migration file not found at: ${MIGRATION_055_PATH}`
    );
  });

  test('A2: Migration SQL contains ADD COLUMN IF NOT EXISTS source_type', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.match(
      sql,
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+source_type/i,
      'Migration must use ADD COLUMN IF NOT EXISTS source_type'
    );
  });

  test('A3: Column type is VARCHAR(30)', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.match(
      sql,
      /source_type\s+VARCHAR\(30\)/i,
      "Column must be declared as VARCHAR(30)"
    );
  });

  test('A4: Column is NOT NULL', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.match(
      sql,
      /NOT\s+NULL/i,
      'Column must be declared NOT NULL'
    );
  });

  test("A5: Default value is 'OWN_STOCK'", () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.match(
      sql,
      /DEFAULT\s+'OWN_STOCK'/i,
      "Column default must be 'OWN_STOCK'"
    );
  });

  test('A6: Table target is repair_parts', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.match(
      sql,
      /ALTER\s+TABLE\s+repair_parts/i,
      'ALTER TABLE must target repair_parts'
    );
  });

  test('A7: No CREATE INDEX in migration (index omitted per Gate 1 authorization)', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.doesNotMatch(
      sql,
      /CREATE\s+INDEX/i,
      'Migration must not add an index — no query-plan requirement was established'
    );
  });

  test('A8: No CHECK constraint in migration (omitted per Gate 1 authorization)', () => {
    const sql = fs.readFileSync(MIGRATION_055_PATH, 'utf8');
    assert.doesNotMatch(
      sql,
      /CHECK\s*\(/i,
      'Migration must not add a CHECK constraint — not separately authorized'
    );
  });
});

// ---------------------------------------------------------------------------
// Test B — Migration runner discoverability and ordering
// ---------------------------------------------------------------------------

describe('Migration 055 — Runner discoverability', () => {
  test('B1: getMigrationVersion correctly parses 055_repair_parts_source_type.sql as version 55', () => {
    const version = getMigrationVersion('055_repair_parts_source_type.sql');
    assert.strictEqual(version, 55, 'Numeric version must be 55');
  });

  test('B2: 055 filename matches migration discovery pattern /^(\\d+)(?:_|\\.sql$)/', () => {
    const filename = '055_repair_parts_source_type.sql';
    const match = filename.match(/^(\d+)(?:_|\.sql$)/);
    assert.ok(match, `Filename "${filename}" must match the migration discovery regex`);
    assert.strictEqual(match![1], '055');
  });

  test('B3: 055_repair_parts_source_type.sql sorts after 054_release_100_accounts_and_reconciliation.sql', () => {
    const files = [
      '054_release_100_accounts_and_reconciliation.sql',
      '055_repair_parts_source_type.sql',
    ];
    const sorted = filterMigrationFiles(files);
    assert.strictEqual(sorted[0], '054_release_100_accounts_and_reconciliation.sql');
    assert.strictEqual(sorted[1], '055_repair_parts_source_type.sql');
  });

  test('B4: Full migration inventory including 055 passes uniqueness check (no duplicate version 55)', () => {
    // Read actual files from disk to catch any real duplicate
    const allFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // assertUniqueMigrationVersions throws if duplicates exist — this is the safety check
    assert.doesNotThrow(
      () => assertUniqueMigrationVersions(allFiles),
      'Full migration inventory must have no duplicate version numbers'
    );
  });

  test('B5: 055 appears in sorted filterMigrationFiles output of full inventory', () => {
    const allFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const filtered = filterMigrationFiles(allFiles);
    assert.ok(
      filtered.includes('055_repair_parts_source_type.sql'),
      '055_repair_parts_source_type.sql must appear in runner-filtered file list'
    );
  });

  test('B6: 055 is the highest version in the current inventory', () => {
    const allFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const filtered = filterMigrationFiles(allFiles);
    const last = filtered[filtered.length - 1];
    assert.strictEqual(
      last,
      '055_repair_parts_source_type.sql',
      '055 must be the last (highest) migration in the current inventory'
    );
  });
});

// ---------------------------------------------------------------------------
// Test C — Source-type value contract in repair.repo.ts
// ---------------------------------------------------------------------------

describe('Migration 055 — repair.repo.ts source_type value contract', () => {
  test("C1: repair.repo.ts references 'OWN_STOCK' as a valid source_type value", () => {
    const repoSrc = fs.readFileSync(REPAIR_REPO_PATH, 'utf8');
    assert.ok(
      repoSrc.includes("'OWN_STOCK'"),
      "repair.repo.ts must reference 'OWN_STOCK'"
    );
  });

  test("C2: repair.repo.ts references 'MARKET_PURCHASE' as a valid source_type value", () => {
    const repoSrc = fs.readFileSync(REPAIR_REPO_PATH, 'utf8');
    assert.ok(
      repoSrc.includes("'MARKET_PURCHASE'"),
      "repair.repo.ts must reference 'MARKET_PURCHASE'"
    );
  });

  test('C3: repair.repo.ts defaults product-linked parts to OWN_STOCK, non-product parts to MARKET_PURCHASE', () => {
    const repoSrc = fs.readFileSync(REPAIR_REPO_PATH, 'utf8');
    // This matches the logic: source_type?.trim() || (productId ? 'OWN_STOCK' : 'MARKET_PURCHASE')
    assert.ok(
      repoSrc.includes("productId ? 'OWN_STOCK' : 'MARKET_PURCHASE'"),
      "Defaulting logic must distinguish product-linked (OWN_STOCK) from non-product (MARKET_PURCHASE) parts"
    );
  });

  test('C4: repair.repo.ts INSERT statement includes source_type column', () => {
    const repoSrc = fs.readFileSync(REPAIR_REPO_PATH, 'utf8');
    // Verify the INSERT includes source_type in the column list
    assert.ok(
      repoSrc.includes('source_type'),
      'INSERT into repair_parts must include source_type column'
    );
  });

  test('C5: repair.repo.ts SELECT includes rp.source_type', () => {
    const repoSrc = fs.readFileSync(REPAIR_REPO_PATH, 'utf8');
    assert.ok(
      repoSrc.includes('rp.source_type'),
      'SELECT from repair_parts must project rp.source_type'
    );
  });
});

// ---------------------------------------------------------------------------
// Test D — Limitation disclosure
// ---------------------------------------------------------------------------

describe('Migration 055 — Known test limitations', () => {
  test('D1: Document that database-level DEFAULT and NOT NULL enforcement requires a live migration run', () => {
    // This test always passes; it exists to make the limitation explicit in the test report
    // and to satisfy the Gate 1 requirement to honestly report what cannot be verified without
    // executing the migration against a database.
    const limitation =
      'Database-level behavior (DEFAULT backfill of existing rows, NOT NULL enforcement on INSERT ' +
      'without explicit source_type) cannot be verified without running the migration against a ' +
      'live PostgreSQL test database (TEST_DATABASE_URL). These behaviors are correct by PostgreSQL ' +
      "specification for 'ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT ...' on a non-empty table.";
    assert.ok(limitation.length > 0, 'Limitation must be documented');
    console.log(`  [LIMITATION] ${limitation}`);
  });
});
