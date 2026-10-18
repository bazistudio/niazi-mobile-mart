/**
 * Niazi Mobile Mart — Customer Ledger Branch Isolation Test Suite (GAP-05)
 *
 * Verifies that GET /api/v1/customers/:id/ledger correctly enforces branch isolation:
 *   A. Org Admin with explicit branch_id only sees that branch's entries.
 *   B. Org Admin without branch_id sees all branches (org-wide view).
 *   C. Branch Admin requesting a foreign branch_id receives 403 Forbidden.
 *   D. Branch Admin without branch_id is automatically restricted to their branch.
 *   E. GAP-01 fix: RETURN entries are attributed to the return's branch, not the user's branch.
 *
 * SAFETY: Aborts if DATABASE_URL is not localhost/127.0.0.1.
 * ISOLATION: All seeded data is tagged with a unique RUN_PREFIX and deleted in `after()`.
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

import { createCustomerV1Router } from '../routes/customer.routes.js';
import { issueToken } from '../services/jwt.service.js';
import { NIAZI_ORGANIZATION_ID } from '../auth.js';

// ── JWT key bootstrap (mirrors canonical-auth-matrix.test.ts) ────────────────
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

// ── Disposable Test Database Safety Guard ────────────────────────────────────
// Explicitly require TEST_DATABASE_URL or isolated test DB marker. Never fallback to production.
const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? '';

if (!TEST_DB_URL || !TEST_DB_URL.trim()) {
  console.error('[BLOCKED] TEST_DATABASE_URL is not set. Refusing to run tests against unspecified or shared database.');
  process.exit(1);
}

try {
  const parsedUrl = new URL(TEST_DB_URL);
  const hostname = parsedUrl.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (!isLocalhost) {
    console.error(`[BLOCKED] TEST_DATABASE_URL host "${hostname}" is not localhost/127.0.0.1. Refusing to run tests.`);
    process.exit(1);
  }

  // Reject Cloud SQL, production, staging, and shared naming patterns even on local tunnels
  const DANGEROUS_PATTERNS = ['cloud', 'cloudsql', 'prod', 'production', 'prd', 'staging', 'live'];
  const fullUrlLower = TEST_DB_URL.toLowerCase();
  for (const pat of DANGEROUS_PATTERNS) {
    if (fullUrlLower.includes(pat)) {
      console.error(`[BLOCKED] TEST_DATABASE_URL contains dangerous pattern "${pat}". Refusing to run tests.`);
      process.exit(1);
    }
  }

  // Database name must explicitly be marked for testing
  const dbName = parsedUrl.pathname.replace(/^\//, '').toLowerCase();
  const isMarkedTestDb = dbName.includes('test') || dbName.includes('disposable') || dbName.endsWith('_test');
  if (!isMarkedTestDb) {
    console.error(`[BLOCKED] Database name "${dbName}" is not explicitly marked as test/disposable. Refusing to run tests.`);
    process.exit(1);
  }
} catch (urlErr) {
  console.error('[BLOCKED] Invalid TEST_DATABASE_URL format:', (urlErr as Error).message);
  process.exit(1);
}

// ── Full-access profile helper ─────────────────────────────────────────────────
const fullAccessProfile = {
  allowed_pages: ['*'],
  allowed_actions: ['*'],
  limits: { max_discount_percent: 100, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true },
};

describe('GAP-05 — Customer Ledger Branch Isolation Suite', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;

  const RUN_PREFIX = uuidv4().slice(0, 8);

  // Fixed branch UUIDs — must match seeded branches in the test database
  const BRANCH_A = '00000000-0000-0000-0000-aaaaaaaaaaaa';
  const BRANCH_B = '00000000-0000-0000-0000-bbbbbbbbbbbb';

  // User IDs
  const ORG_ADMIN_ID = uuidv4();
  const SHOP_ADMIN_A_ID = uuidv4();
  const SHOP_ADMIN_B_ID = uuidv4();

  // Customer IDs
  const CUSTOMER_ID = uuidv4();

  // Tokens
  let tokenOrgAdmin: string;
  let tokenShopAdminA: string;
  let tokenShopAdminB: string;

  // Ledger entry IDs — for cleanup
  const ledgerEntryIdA = uuidv4();
  const ledgerEntryIdB = uuidv4();
  const saleIdA = uuidv4();
  const saleIdB = uuidv4();
  const returnIdA = uuidv4();

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const now = new Date().toISOString();

    // ── Seed branches ──────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
       VALUES
         ($1, $3, 'Test Branch A', 'CLBT-A-' || $4, 1, $5, $5),
         ($2, $3, 'Test Branch B', 'CLBT-B-' || $4, 1, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_A, BRANCH_B, NIAZI_ORGANIZATION_ID, RUN_PREFIX, now]
    );

    // ── Seed users ─────────────────────────────────────────────────────────────
    const testUsers: [string, string | null, string, string][] = [
      [ORG_ADMIN_ID, null, 'ADMIN', `clbt_orgadmin_${RUN_PREFIX}`],
      [SHOP_ADMIN_A_ID, BRANCH_A, 'SHOP_ADMIN', `clbt_sha_${RUN_PREFIX}`],
      [SHOP_ADMIN_B_ID, BRANCH_B, 'SHOP_ADMIN', `clbt_shb_${RUN_PREFIX}`],
    ];
    for (const [uid, bId, role, username] of testUsers) {
      await pool.query(
        `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, status, created_at, updated_at)
         VALUES ($1, $2, $4, $4, 'hash', $3, 1, 'ACTIVE', $5, $5)
         ON CONFLICT (id) DO UPDATE SET is_active = 1, status = 'ACTIVE', branch_id = EXCLUDED.branch_id`,
        [uid, bId, role, username, now]
      );
    }

    // ── Seed customer ──────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO customers (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Ledger Test Customer', '0300-0000000', null, null, null, null, 0, 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [CUSTOMER_ID, `CLBT-${RUN_PREFIX}`, now]
    );

    // ── Seed sales (for JOIN verification) ────────────────────────────────────
    // sale A belongs to BRANCH_A
    await pool.query(
      `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Ledger Test Customer', 1000, 0, 0, 1000, 0, 0, 'UNPAID', 'COMPLETED', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [saleIdA, `INV-CLBT-A-${RUN_PREFIX}`, BRANCH_A, CUSTOMER_ID, SHOP_ADMIN_A_ID, now]
    );
    // sale B belongs to BRANCH_B
    await pool.query(
      `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Ledger Test Customer', 500, 0, 0, 500, 0, 0, 'UNPAID', 'COMPLETED', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [saleIdB, `INV-CLBT-B-${RUN_PREFIX}`, BRANCH_B, CUSTOMER_ID, SHOP_ADMIN_B_ID, now]
    );

    // ── Seed customer_ledger_entries ───────────────────────────────────────────
    // Entry A: SALE referencing saleIdA (BRANCH_A via JOIN)
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', 1000, 0, 1000, 'Credit sale Branch A', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [ledgerEntryIdA, CUSTOMER_ID, saleIdA, `INV-CLBT-A-${RUN_PREFIX}`, SHOP_ADMIN_A_ID, now]
    );
    // Entry B: SALE referencing saleIdB (BRANCH_B via JOIN)
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', 500, 0, 1500, 'Credit sale Branch B', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [ledgerEntryIdB, CUSTOMER_ID, saleIdB, `INV-CLBT-B-${RUN_PREFIX}`, SHOP_ADMIN_B_ID, now]
    );

    // ── Seed sales_return for GAP-01 return-attribution test ──────────────────
    // Return belongs to BRANCH_A — reference_id in ledger_entry = returnIdA
    await pool.query(
      `INSERT INTO sales_returns
         (id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot,
          total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Ledger Test Customer', 200, 'CREDIT', 'COMPLETED', null, null, $6, $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [returnIdA, `RET-CLBT-${RUN_PREFIX}`, saleIdA, BRANCH_A, CUSTOMER_ID, SHOP_ADMIN_A_ID, now]
    );
    // Ledger entry for RETURN referencing returnIdA — key: reference_id = returnIdA (not saleIdA)
    const returnLedgerEntryId = uuidv4();
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'RETURN', 0, 200, 1300, 'Return credit Branch A', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [returnLedgerEntryId, CUSTOMER_ID, returnIdA, `RET-CLBT-${RUN_PREFIX}`, SHOP_ADMIN_A_ID, now]
    );

    // Store extra IDs for cleanup
    (global as Record<string, unknown>)['clbt_returnLedgerEntryId'] = returnLedgerEntryId;

    // ── Issue tokens ───────────────────────────────────────────────────────────
    tokenOrgAdmin = issueToken({
      userId: ORG_ADMIN_ID,
      username: `clbt_orgadmin_${RUN_PREFIX}`,
      role: 'ADMIN',
      accessProfile: fullAccessProfile,
      branchId: null,
    });
    tokenShopAdminA = issueToken({
      userId: SHOP_ADMIN_A_ID,
      username: `clbt_sha_${RUN_PREFIX}`,
      role: 'SHOP_ADMIN',
      accessProfile: fullAccessProfile,
      branchId: BRANCH_A,
    });
    tokenShopAdminB = issueToken({
      userId: SHOP_ADMIN_B_ID,
      username: `clbt_shb_${RUN_PREFIX}`,
      role: 'SHOP_ADMIN',
      accessProfile: fullAccessProfile,
      branchId: BRANCH_B,
    });

    // ── Start Express test app ─────────────────────────────────────────────────
    const app = express();
    app.use(express.json());
    app.use('/api/v1/customers', createCustomerV1Router(pool));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    // Close server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Clean up seeded test data in dependency order
    const returnLedgerEntryId = (global as Record<string, unknown>)['clbt_returnLedgerEntryId'] as string | undefined;

    await pool.query(
      `DELETE FROM customer_ledger_entries WHERE customer_id = $1`,
      [CUSTOMER_ID]
    );
    await pool.query(
      `DELETE FROM sales_returns WHERE id = $1`,
      [returnIdA]
    );
    await pool.query(
      `DELETE FROM sales WHERE id IN ($1, $2)`,
      [saleIdA, saleIdB]
    );
    await pool.query(
      `DELETE FROM customers WHERE id = $1`,
      [CUSTOMER_ID]
    );
    await pool.query(
      `DELETE FROM users WHERE username LIKE $1`,
      [`clbt_%_${RUN_PREFIX}`]
    );
    await pool.query(
      `DELETE FROM branches WHERE code LIKE $1`,
      [`CLBT-%-${RUN_PREFIX}`]
    );

    await pool.end();
  });

  // ── Helper: fetch ─────────────────────────────────────────────────────────────
  async function getLedger(
    customerId: string,
    token: string,
    branchIdQuery?: string
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const url = branchIdQuery
      ? `${baseUrl}/api/v1/customers/${customerId}/ledger?branch_id=${branchIdQuery}`
      : `${baseUrl}/api/v1/customers/${customerId}/ledger`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  // ── Test A: Org Admin, explicit branch_id — sees only that branch ─────────────
  test('Test A — Org Admin with ?branch_id=BRANCH_A sees only Branch A entries', async () => {
    const { status, body } = await getLedger(CUSTOMER_ID, tokenOrgAdmin, BRANCH_A);

    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(body)}`);
    const entries = body['entries'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(entries), 'entries must be an array');
    assert.ok(entries.length > 0, 'Should have at least one Branch A entry');

    for (const e of entries) {
      assert.equal(
        e['branch_id'],
        BRANCH_A,
        `Entry ${String(e['id'])} has branch_id=${String(e['branch_id'])}, expected BRANCH_A`
      );
    }

    // Branch B entries must not appear
    const hasBranchB = entries.some((e) => e['branch_id'] === BRANCH_B);
    assert.equal(hasBranchB, false, 'Branch B entry must not appear when filtered to BRANCH_A');
  });

  // ── Test B: Org Admin, no branch_id — sees all branches ──────────────────────
  test('Test B — Org Admin without branch_id sees entries from all branches', async () => {
    const { status, body } = await getLedger(CUSTOMER_ID, tokenOrgAdmin);

    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(body)}`);
    const entries = body['entries'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(entries), 'entries must be an array');

    const branchIds = new Set(entries.map((e) => e['branch_id'] as string));
    assert.ok(branchIds.has(BRANCH_A), 'Org-wide view must include BRANCH_A entries');
    assert.ok(branchIds.has(BRANCH_B), 'Org-wide view must include BRANCH_B entries');
  });

  // ── Test C: Branch Admin, foreign branch_id — 403 Forbidden ─────────────────
  test('Test C — Branch A Admin requesting ?branch_id=BRANCH_B gets 403', async () => {
    const { status, body } = await getLedger(CUSTOMER_ID, tokenShopAdminA, BRANCH_B);

    assert.equal(status, 403, `Expected 403 but got ${status}: ${JSON.stringify(body)}`);
    // Must not expose any statement data
    assert.ok(!('entries' in body), 'Response must not include entries on 403');
  });

  // ── Test D: Branch Admin, no branch_id — restricted to own branch ─────────────
  test('Test D — Branch A Admin without branch_id sees only Branch A entries', async () => {
    const { status, body } = await getLedger(CUSTOMER_ID, tokenShopAdminA);

    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(body)}`);
    const entries = body['entries'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(entries), 'entries must be an array');

    for (const e of entries) {
      assert.equal(
        e['branch_id'],
        BRANCH_A,
        `Entry ${String(e['id'])} has branch_id=${String(e['branch_id'])}, expected BRANCH_A`
      );
    }

    const hasBranchB = entries.some((e) => e['branch_id'] === BRANCH_B);
    assert.equal(hasBranchB, false, 'Branch B entries must not appear for a Branch A admin');
  });

  // ── Test E: GAP-01 — RETURN entry resolves to its own branch via sales_returns JOIN ─
  test('Test E — RETURN ledger entry resolves to sr.branch_id (GAP-01)', async () => {
    const { status, body } = await getLedger(CUSTOMER_ID, tokenOrgAdmin);

    assert.equal(status, 200, `Expected 200 but got ${status}`);
    const entries = body['entries'] as Array<Record<string, unknown>>;

    const returnEntry = entries.find((e) => e['entry_type'] === 'RETURN');
    assert.ok(returnEntry, 'Should find at least one RETURN entry');
    assert.equal(
      returnEntry['branch_id'],
      BRANCH_A,
      `RETURN entry branch_id must resolve to BRANCH_A (via sr.branch_id), got ${String(returnEntry['branch_id'])}`
    );
  });

  // ── Test F: Unauthenticated request — 401 ────────────────────────────────────
  test('Test F — Request without Authorization header is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${CUSTOMER_ID}/ledger`);
    // Auth middleware returns 401 or 403
    assert.ok(res.status === 401 || res.status === 403, `Expected 401/403 but got ${res.status}`);
  });

  // ── Test G: Empty statement handled correctly ────────────────────────────────
  test('Test G — Non-existent customer returns 404', async () => {
    const fakeId = uuidv4();
    const { status } = await getLedger(fakeId, tokenOrgAdmin);
    assert.equal(status, 404, `Expected 404 for unknown customer, got ${status}`);
  });
});
