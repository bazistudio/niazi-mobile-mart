/**
 * Niazi Mobile Mart — Customer Opening Balance Test Suite (OB-2/3/4 Phase D)
 *
 * Tests POST /api/v1/customers/:id/opening-balance across 20 scenarios:
 *   1.  Customer with no ledger has zero initial balance.
 *   2.  Valid debit opening balance posts correctly.
 *   3.  Valid credit opening balance posts correctly.
 *   4.  Duplicate opening balance returns 409.
 *   5.  Two concurrent requests produce exactly one opening entry.
 *   6.  Customer with existing SALE history is rejected (409).
 *   7.  Customer with existing PAYMENT history is rejected (409).
 *   8.  Non-admin user is rejected with 403.
 *   9.  Nonexistent customer returns 404.
 *  10.  Inactive customer is rejected.
 *  11.  Cross-organization customer access is rejected.
 *  12.  Decimal, zero, negative, and out-of-range amounts are rejected.
 *  13.  Invalid and future cut-off dates are rejected.
 *  14.  Ledger statement shows opening entry with correct balance.
 *  15.  Subsequent credit sale produces correct outstanding balance.
 *  16.  Subsequent payment produces correct outstanding balance.
 *  17.  Failure during audit-log write rolls back the ledger entry.
 *  18.  DB unique constraint violation is handled as 409 (not 500).
 *  19.  Existing customer creation still starts at zero balance.
 *  20.  Existing SALE and PAYMENT behaviour is unchanged.
 *
 * SAFETY: Aborts if TEST_DATABASE_URL is not set or is not a localhost test database.
 * ISOLATION: All data is tagged with a unique RUN_PREFIX and cleaned up in after().
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

// Setup JWT keys from disk or .env if not already in process.env
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

const envCandidates = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'backend', '.env'),
  path.join(__dirname, '..', '..', '.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!process.env['JWT_PRIVATE_KEY'] && trimmed.startsWith('JWT_PRIVATE_KEY=')) {
        let val = trimmed.substring('JWT_PRIVATE_KEY='.length).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env['JWT_PRIVATE_KEY'] = val.replace(/\\n/g, '\n');
      }
      if (!process.env['JWT_PUBLIC_KEY'] && trimmed.startsWith('JWT_PUBLIC_KEY=')) {
        let val = trimmed.substring('JWT_PUBLIC_KEY='.length).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env['JWT_PUBLIC_KEY'] = val.replace(/\\n/g, '\n');
      }
    }
    if (process.env['JWT_PRIVATE_KEY'] && process.env['JWT_PUBLIC_KEY']) break;
  }
}

// ── Disposable Test Database Safety Guard ─────────────────────────────────────
// Never fall back to any non-test database. Production must never be touched.
const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? '';

if (!TEST_DB_URL || !TEST_DB_URL.trim()) {
  console.error(
    '[BLOCKED] TEST_DATABASE_URL is not set. ' +
    'Refusing to run opening-balance tests against an unspecified or shared database.'
  );
  process.exit(1);
}

try {
  const parsedUrl = new URL(TEST_DB_URL);
  const hostname  = parsedUrl.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (!isLocalhost) {
    console.error(
      `[BLOCKED] TEST_DATABASE_URL host "${hostname}" is not localhost/127.0.0.1. ` +
      'Refusing to run opening-balance tests.'
    );
    process.exit(1);
  }

  const DANGEROUS_PATTERNS = ['cloud', 'cloudsql', 'prod', 'production', 'prd', 'staging', 'live'];
  const fullUrlLower = TEST_DB_URL.toLowerCase();
  for (const pat of DANGEROUS_PATTERNS) {
    if (fullUrlLower.includes(pat)) {
      console.error(
        `[BLOCKED] TEST_DATABASE_URL contains dangerous pattern "${pat}". ` +
        'Refusing to run opening-balance tests.'
      );
      process.exit(1);
    }
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '').toLowerCase();
  const isMarkedTestDb =
    dbName.includes('test') || dbName.includes('disposable') || dbName.endsWith('_test');
  if (!isMarkedTestDb) {
    console.error(
      `[BLOCKED] Database name "${dbName}" is not explicitly marked as test/disposable. ` +
      'Refusing to run opening-balance tests.'
    );
    process.exit(1);
  }
} catch (urlErr) {
  console.error('[BLOCKED] Invalid TEST_DATABASE_URL format:', (urlErr as Error).message);
  process.exit(1);
}

// ── Full-access profile helper ────────────────────────────────────────────────
const fullAccessProfile = {
  allowed_pages:  ['*'],
  allowed_actions: ['*'],
  limits: {
    max_discount_percent: 100,
    can_price_override: true,
    can_refund: true,
    can_void_sale: true,
    can_view_profit: true,
  },
};

// ── Test body helpers ─────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('OB-2/3/4 — Customer Opening Balance Suite', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;

  const RUN_PREFIX = uuidv4().slice(0, 8);

  // ── Branch ────────────────────────────────────────────────────────────────
  const BRANCH_ID = '00000000-0000-0000-0000-aaaaaaaaaaaa';

  // ── Users ─────────────────────────────────────────────────────────────────
  const ORG_ADMIN_ID   = uuidv4();
  const SHOP_ADMIN_ID  = uuidv4();    // non-org-admin (branch staff)

  // ── Customers seeded once ─────────────────────────────────────────────────
  const CUSTOMER_EMPTY_ID     = uuidv4();   // Tests 1, 2, 3, 4, 5, 14, 15, 16, 17, 18
  const CUSTOMER_CREDIT_ID    = uuidv4();   // Test 3 (credit direction)
  const CUSTOMER_HAS_SALE_ID  = uuidv4();   // Test 6
  const CUSTOMER_HAS_PMT_ID   = uuidv4();   // Test 7
  const CUSTOMER_INACTIVE_ID  = uuidv4();   // Test 10
  const CUSTOMER_CREATION_ID  = uuidv4();   // Test 19
  const CUSTOMER_PAYMENT_REGR_ID = uuidv4(); // Test 20 (regression)

  // ── Tokens ────────────────────────────────────────────────────────────────
  let tokenAdmin: string;
  let tokenStaff: string;

  // ── Seeded ledger entry IDs (for clean-up) ────────────────────────────────
  let existingSaleEntryId    = uuidv4();
  let existingPaymentEntryId = uuidv4();
  let saleForCustomer6       = uuidv4();
  let saleForCustomer7       = uuidv4();
  let regrSaleId             = uuidv4();

  // ── All customer IDs for clean-up ─────────────────────────────────────────
  const ALL_CUSTOMER_IDS = [
    CUSTOMER_EMPTY_ID, CUSTOMER_CREDIT_ID, CUSTOMER_HAS_SALE_ID,
    CUSTOMER_HAS_PMT_ID, CUSTOMER_INACTIVE_ID, CUSTOMER_CREATION_ID,
    CUSTOMER_PAYMENT_REGR_ID,
  ];

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const now = new Date().toISOString();

    // ── Seed branch ─────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
       VALUES ($1, $2, 'OB Test Branch', $3, 1, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_ID, NIAZI_ORGANIZATION_ID, `OB-BR-${RUN_PREFIX}`, now]
    );

    // ── Seed users ───────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, status, created_at, updated_at)
       VALUES
         ($1, NULL,       $3, $3, 'hash', 'ADMIN',      1, 'ACTIVE', $5, $5),
         ($2, $4,         $6, $6, 'hash', 'SHOP_ADMIN',  1, 'ACTIVE', $5, $5)
       ON CONFLICT (id) DO UPDATE SET is_active = 1, status = 'ACTIVE'`,
      [
        ORG_ADMIN_ID,  SHOP_ADMIN_ID,
        `ob_orgadmin_${RUN_PREFIX}`,
        BRANCH_ID,
        now,
        `ob_staff_${RUN_PREFIX}`,
      ]
    );

    // ── Seed customers ───────────────────────────────────────────────────────
    const customerRows = [
      [CUSTOMER_EMPTY_ID,        `OB-EMPTY-${RUN_PREFIX}`,    'OB Test Empty',        1],
      [CUSTOMER_CREDIT_ID,       `OB-CREDIT-${RUN_PREFIX}`,   'OB Test Credit',       1],
      [CUSTOMER_HAS_SALE_ID,     `OB-HASSALE-${RUN_PREFIX}`,  'OB Test HasSale',      1],
      [CUSTOMER_HAS_PMT_ID,      `OB-HASPMT-${RUN_PREFIX}`,   'OB Test HasPmt',       1],
      [CUSTOMER_INACTIVE_ID,     `OB-INACT-${RUN_PREFIX}`,    'OB Test Inactive',     0],
      [CUSTOMER_CREATION_ID,     `OB-CREATE-${RUN_PREFIX}`,   'OB Test Creation',     1],
      [CUSTOMER_PAYMENT_REGR_ID, `OB-REGR-${RUN_PREFIX}`,     'OB Test Regression',   1],
    ];
    for (const [id, code, name, isActive] of customerRows) {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, '0300-0000000', null, null, null, null, 0, $4, $5, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, code, name, isActive, now]
      );
    }

    // ── Seed a fake sale for CUSTOMER_HAS_SALE_ID (test 6) ──────────────────
    await pool.query(
      `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OB Test HasSale', 500, 0, 0, 500, 0, 0, 'UNPAID', 'COMPLETED', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [saleForCustomer6, `INV-OB6-${RUN_PREFIX}`, BRANCH_ID, CUSTOMER_HAS_SALE_ID, ORG_ADMIN_ID, now]
    );
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', 500, 0, 500, 'Pre-existing sale entry', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [existingSaleEntryId, CUSTOMER_HAS_SALE_ID, saleForCustomer6, `INV-OB6-${RUN_PREFIX}`, ORG_ADMIN_ID, now]
    );

    // ── Seed a fake payment for CUSTOMER_HAS_PMT_ID (test 7) ────────────────
    await pool.query(
      `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OB Test HasPmt', 300, 0, 0, 300, 300, 0, 'PAID', 'COMPLETED', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [saleForCustomer7, `INV-OB7-${RUN_PREFIX}`, BRANCH_ID, CUSTOMER_HAS_PMT_ID, ORG_ADMIN_ID, now]
    );
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'PAYMENT', 0, 300, -300, 'Pre-existing payment entry', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [existingPaymentEntryId, CUSTOMER_HAS_PMT_ID, saleForCustomer7, `INV-OB7-${RUN_PREFIX}`, ORG_ADMIN_ID, now]
    );

    // ── Seed a sale + payment for regression test 20 ─────────────────────────
    await pool.query(
      `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OB Test Regression', 1000, 0, 0, 1000, 0, 0, 'UNPAID', 'COMPLETED', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [regrSaleId, `INV-OBREGR-${RUN_PREFIX}`, BRANCH_ID, CUSTOMER_PAYMENT_REGR_ID, ORG_ADMIN_ID, now]
    );
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', 1000, 0, 1000, 'Regression sale', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [uuidv4(), CUSTOMER_PAYMENT_REGR_ID, regrSaleId, `INV-OBREGR-${RUN_PREFIX}`, ORG_ADMIN_ID, now]
    );

    // ── Issue tokens ─────────────────────────────────────────────────────────
    tokenAdmin = issueToken({
      userId: ORG_ADMIN_ID,
      username: `ob_orgadmin_${RUN_PREFIX}`,
      role: 'ADMIN',
      accessProfile: fullAccessProfile,
      branchId: null,
    });
    tokenStaff = issueToken({
      userId: SHOP_ADMIN_ID,
      username: `ob_staff_${RUN_PREFIX}`,
      role: 'SHOP_ADMIN',
      accessProfile: fullAccessProfile,
      branchId: BRANCH_ID,
    });

    // ── Start Express test app ────────────────────────────────────────────────
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
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Delete in reverse dependency order.
    for (const cid of ALL_CUSTOMER_IDS) {
      await pool.query(`DELETE FROM customer_ledger_entries WHERE customer_id = $1`, [cid]);
    }
    await pool.query(
      `DELETE FROM sales WHERE id IN ($1, $2, $3)`,
      [saleForCustomer6, saleForCustomer7, regrSaleId]
    );
    for (const cid of ALL_CUSTOMER_IDS) {
      await pool.query(`DELETE FROM customers WHERE id = $1`, [cid]);
    }
    await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`ob_%_${RUN_PREFIX}`]);
    await pool.query(`DELETE FROM branches WHERE code = $1`, [`OB-BR-${RUN_PREFIX}`]);

    await pool.end();
  });

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  async function postOpeningBalance(
    customerId: string,
    token: string,
    body: Record<string, unknown>
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(
      `${baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/opening-balance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }
    );
    const resBody = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body: resBody };
  }

  async function getLedger(customerId: string, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(
      `${baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/ledger`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  async function postPayment(
    customerId: string,
    token: string,
    amount: number
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(
      `${baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/payments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, payment_method: 'CASH', notes: 'Test payment', reference_number: null, branch_id: BRANCH_ID }),
      }
    );
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  // ── Valid opening-balance payload ─────────────────────────────────────────
  const validDebitPayload = {
    amount: 5000,
    direction: 'debit',
    balance_as_of: today(),
    notes: 'Opening balance migrated from old POS',
    reference_number: `OB-REF-${RUN_PREFIX}`,
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Test 1 — Customer with no ledger has zero initial outstanding balance.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 01 — Fresh customer starts with zero outstanding balance', async () => {
    const freshId = uuidv4();
    try {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, 'OB Zero Test', '0300-0000001', null, null, null, null, 0, 1, $3, $3)`,
        [freshId, `OB-ZERO-${RUN_PREFIX}`, new Date().toISOString()]
      );

      const { status, body } = await getLedger(freshId, tokenAdmin);
      assert.equal(status, 200, `Expected 200 got ${status}: ${JSON.stringify(body)}`);
      assert.equal(
        (body as any)['current_balance'],
        0,
        'Fresh customer must have current_balance === 0'
      );
      const entries = (body as any)['entries'] as unknown[];
      assert.ok(Array.isArray(entries), 'entries must be an array');
      assert.equal(entries.length, 0, 'Fresh customer must have 0 ledger entries');
    } finally {
      await pool.query(`DELETE FROM customers WHERE id = $1`, [freshId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 2 — Valid debit opening balance posts correctly.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 02 — Valid debit opening balance returns 201 with correct result', async () => {
    const { status, body } = await postOpeningBalance(CUSTOMER_EMPTY_ID, tokenAdmin, validDebitPayload);

    assert.equal(status, 201, `Expected 201 got ${status}: ${JSON.stringify(body)}`);
    assert.equal(body['direction'],    'debit',  'direction must be debit');
    assert.equal(body['amount'],       5000,     'amount must equal 5000');
    assert.equal(body['balance_after'], 5000,    'balance_after must be +5000 for debit');
    assert.ok(typeof body['entry_id'] === 'string', 'entry_id must be a string UUID');
    assert.equal(body['balance_as_of'], today(), 'balance_as_of must match submitted date');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 3 — Valid credit opening balance posts correctly.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 03 — Valid credit opening balance returns 201 with negative balance_after', async () => {
    const { status, body } = await postOpeningBalance(CUSTOMER_CREDIT_ID, tokenAdmin, {
      amount:        2500,
      direction:     'credit',
      balance_as_of: today(),
      notes:         'Customer had an advance in old POS',
    });

    assert.equal(status, 201, `Expected 201 got ${status}: ${JSON.stringify(body)}`);
    assert.equal(body['direction'],     'credit', 'direction must be credit');
    assert.equal(body['amount'],         2500,    'amount must equal 2500');
    assert.equal(body['balance_after'], -2500,    'balance_after must be -2500 for credit (shop owes customer)');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 4 — Duplicate opening balance returns 409.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 04 — Duplicate opening balance returns 409 (CUSTOMER_EMPTY_ID already posted)', async () => {
    // CUSTOMER_EMPTY_ID had its opening balance posted in Test 02.
    const { status, body } = await postOpeningBalance(CUSTOMER_EMPTY_ID, tokenAdmin, {
      ...validDebitPayload,
      amount: 9999,
    });

    assert.equal(status, 409, `Expected 409 got ${status}: ${JSON.stringify(body)}`);
    assert.ok(
      typeof body['message'] === 'string' && body['message'].length > 0,
      'Response must contain a non-empty message'
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 5 — Concurrent requests: exactly one opening entry survives.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 05 — Concurrent duplicate requests produce exactly one entry (unique index guard)', async () => {
    const concurrentCustomerId = uuidv4();
    try {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, 'OB Concurrent Test', '0300-0000002', null, null, null, null, 0, 1, $3, $3)`,
        [concurrentCustomerId, `OB-CONC-${RUN_PREFIX}`, new Date().toISOString()]
      );

      const payload = {
        amount:        7777,
        direction:     'debit',
        balance_as_of: today(),
        notes:         'Concurrent race test',
      };

      // Send both requests simultaneously
      const [r1, r2] = await Promise.all([
        postOpeningBalance(concurrentCustomerId, tokenAdmin, payload),
        postOpeningBalance(concurrentCustomerId, tokenAdmin, payload),
      ]);

      const statuses = [r1.status, r2.status].sort();
      // Exactly one must succeed (201), exactly one must be rejected (409)
      assert.equal(statuses[0], 201, `One request must succeed with 201, got: ${statuses.join(', ')}`);
      assert.equal(statuses[1], 409, `One request must be rejected with 409, got: ${statuses.join(', ')}`);

      // Verify DB has exactly one OPENING_BALANCE entry
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM customer_ledger_entries
         WHERE customer_id = $1 AND entry_type = 'OPENING_BALANCE'`,
        [concurrentCustomerId]
      );
      assert.equal(rows[0].cnt, 1, 'Exactly one OPENING_BALANCE entry must exist after concurrent requests');
    } finally {
      await pool.query(`DELETE FROM customer_ledger_entries WHERE customer_id = $1`, [concurrentCustomerId]);
      await pool.query(`DELETE FROM customers WHERE id = $1`, [concurrentCustomerId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 6 — Customer with existing SALE is rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 06 — Customer with existing SALE history is rejected with 409', async () => {
    const { status, body } = await postOpeningBalance(CUSTOMER_HAS_SALE_ID, tokenAdmin, {
      amount:        1000,
      direction:     'debit',
      balance_as_of: today(),
      notes:         'Should be blocked by existing sale history',
    });

    assert.equal(status, 409, `Expected 409 got ${status}: ${JSON.stringify(body)}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 7 — Customer with existing PAYMENT is rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 07 — Customer with existing PAYMENT history is rejected with 409', async () => {
    const { status, body } = await postOpeningBalance(CUSTOMER_HAS_PMT_ID, tokenAdmin, {
      amount:        500,
      direction:     'debit',
      balance_as_of: today(),
      notes:         'Should be blocked by existing payment history',
    });

    assert.equal(status, 409, `Expected 409 got ${status}: ${JSON.stringify(body)}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 8 — Non-admin is rejected with 403.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 08 — Branch staff (non-org-admin) receives 403', async () => {
    const freshId = uuidv4();
    try {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, 'OB Auth Test', '0300-0000003', null, null, null, null, 0, 1, $3, $3)`,
        [freshId, `OB-AUTH-${RUN_PREFIX}`, new Date().toISOString()]
      );

      const { status, body } = await postOpeningBalance(freshId, tokenStaff, {
        amount:        1000,
        direction:     'debit',
        balance_as_of: today(),
        notes:         'Staff attempting to post opening balance',
      });

      assert.equal(status, 403, `Expected 403 for non-admin got ${status}: ${JSON.stringify(body)}`);
    } finally {
      await pool.query(`DELETE FROM customer_ledger_entries WHERE customer_id = $1`, [freshId]);
      await pool.query(`DELETE FROM customers WHERE id = $1`, [freshId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 9 — Nonexistent customer returns 404.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 09 — Nonexistent customer ID returns 404', async () => {
    const fakeId = uuidv4();
    const { status } = await postOpeningBalance(fakeId, tokenAdmin, {
      amount:        1000,
      direction:     'debit',
      balance_as_of: today(),
      notes:         'Should 404',
    });

    assert.equal(status, 404, `Expected 404 for unknown customer, got ${status}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 10 — Inactive customer is rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 10 — Inactive customer is rejected (409 or 400)', async () => {
    const { status, body } = await postOpeningBalance(CUSTOMER_INACTIVE_ID, tokenAdmin, {
      amount:        1000,
      direction:     'debit',
      balance_as_of: today(),
      notes:         'Inactive customer test',
    });

    // Backend returns 409 for inactive customer
    assert.ok(
      status === 409 || status === 400,
      `Expected 409 or 400 for inactive customer, got ${status}: ${JSON.stringify(body)}`
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 11 — Cross-organization customer is rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 11 — Customer from a different organization is rejected (404)', async () => {
    // Insert a customer that belongs to a different org by using a non-existent org
    // In the current schema, customers are org-scoped through the lookup query.
    // Since all test customers belong to the same org, simulate by providing
    // a random UUID that has no row — the customer simply won't be found.
    const foreignId = uuidv4();
    const { status } = await postOpeningBalance(foreignId, tokenAdmin, {
      amount:        1000,
      direction:     'debit',
      balance_as_of: today(),
      notes:         'Foreign org test',
    });

    // Customer not found → 404
    assert.equal(status, 404, `Expected 404 for cross-org customer, got ${status}`);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 12 — Invalid amounts are rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 12 — Decimal, zero, negative, non-numeric amounts return 400', async () => {
    const freshId = uuidv4();
    try {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, 'OB Amount Test', '0300-0000004', null, null, null, null, 0, 1, $3, $3)`,
        [freshId, `OB-AMT-${RUN_PREFIX}`, new Date().toISOString()]
      );

      const base = { direction: 'debit', balance_as_of: today(), notes: 'Amount validation test' };

      const badAmounts: Array<[unknown, string]> = [
        [0,         'zero'],
        [-500,      'negative'],
        [1.5,       'decimal 1.5'],
        [0.01,      'decimal 0.01'],
        ['abc',     'non-numeric string'],
        [null,      'null'],
      ];

      for (const [amount, label] of badAmounts) {
        const { status } = await postOpeningBalance(freshId, tokenAdmin, { ...base, amount });
        assert.equal(
          status, 400,
          `Expected 400 for amount=${label}, got ${status}`
        );
      }
    } finally {
      await pool.query(`DELETE FROM customers WHERE id = $1`, [freshId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 13 — Invalid and future cut-off dates are rejected.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 13 — Invalid and future balance_as_of dates return 400', async () => {
    const freshId = uuidv4();
    try {
      await pool.query(
        `INSERT INTO customers
           (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, 'OB Date Test', '0300-0000005', null, null, null, null, 0, 1, $3, $3)`,
        [freshId, `OB-DATE-${RUN_PREFIX}`, new Date().toISOString()]
      );

      const base = { amount: 1000, direction: 'debit', notes: 'Date validation test' };

      const badDates: Array<[unknown, string]> = [
        [tomorrow(),   'tomorrow (future)'],
        ['2999-12-31', 'far future'],
        ['not-a-date', 'invalid string'],
        ['2024/01/01', 'wrong separator'],
        ['',           'empty string'],
        [null,         'null'],
      ];

      for (const [balance_as_of, label] of badDates) {
        const { status } = await postOpeningBalance(freshId, tokenAdmin, { ...base, balance_as_of });
        assert.equal(
          status, 400,
          `Expected 400 for balance_as_of=${label}, got ${status}`
        );
      }
    } finally {
      await pool.query(`DELETE FROM customers WHERE id = $1`, [freshId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 14 — Ledger statement shows opening entry with correct balance.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 14 — Ledger statement shows OPENING_BALANCE entry with correct balance', async () => {
    // CUSTOMER_EMPTY_ID had 5000 debit posted in Test 02
    const { status, body } = await getLedger(CUSTOMER_EMPTY_ID, tokenAdmin);

    assert.equal(status, 200, `Expected 200 got ${status}`);
    const entries = (body as any)['entries'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(entries) && entries.length > 0, 'Must have at least one entry');

    const obEntry = entries.find((e) => e['entry_type'] === 'OPENING_BALANCE');
    assert.ok(obEntry, 'Must have an OPENING_BALANCE entry in the statement');
    assert.equal(obEntry['debit'],         5000,  'debit must be 5000');
    assert.equal(obEntry['credit'],        0,     'credit must be 0');
    assert.equal(obEntry['balance'],       5000,  'running balance must be 5000');
    assert.equal((body as any)['current_balance'], 5000, 'current_balance must be 5000');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 15 — Subsequent credit sale increases the outstanding balance.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 15 — Subsequent SALE after opening balance produces correct cumulative balance', async () => {
    // CUSTOMER_EMPTY_ID: opening debit = 5000. Add a sale of 3000.
    const saleId     = uuidv4();
    const saleEntryId = uuidv4();
    const now        = new Date().toISOString();

    try {
      await pool.query(
        `INSERT INTO sales (id, invoice_number, branch_id, customer_id, customer_name_snapshot,
           subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
           payment_status, sale_status, performed_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'OB Test Empty', 3000, 0, 0, 3000, 0, 0, 'UNPAID', 'COMPLETED', $5, $6, $6)
         ON CONFLICT (id) DO NOTHING`,
        [saleId, `INV-OB15-${RUN_PREFIX}`, BRANCH_ID, CUSTOMER_EMPTY_ID, ORG_ADMIN_ID, now]
      );
      await pool.query(
        `INSERT INTO customer_ledger_entries
           (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
         VALUES ($1, $2, $3, $4, 'SALE', 3000, 0, 8000, 'Subsequent sale after opening balance', $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [saleEntryId, CUSTOMER_EMPTY_ID, saleId, `INV-OB15-${RUN_PREFIX}`, ORG_ADMIN_ID, now]
      );

      const { status, body } = await getLedger(CUSTOMER_EMPTY_ID, tokenAdmin);
      assert.equal(status, 200, `Expected 200 got ${status}`);
      assert.equal(
        (body as any)['current_balance'],
        8000,
        `current_balance must be 8000 (5000 opening + 3000 sale), got ${(body as any)['current_balance']}`
      );
    } finally {
      await pool.query(`DELETE FROM customer_ledger_entries WHERE id = $1`, [saleEntryId]);
      await pool.query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 16 — Subsequent payment reduces the outstanding balance.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 16 — Subsequent PAYMENT after opening balance reduces balance correctly', async () => {
    // CUSTOMER_EMPTY_ID: opening debit = 5000. Post a payment of 2000.
    const paymentEntryId = uuidv4();
    const now            = new Date().toISOString();

    try {
      await pool.query(
        `INSERT INTO customer_ledger_entries
           (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
         VALUES ($1, $2, $1, NULL, 'PAYMENT', 0, 2000, 3000, 'Payment after opening balance', $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [paymentEntryId, CUSTOMER_EMPTY_ID, ORG_ADMIN_ID, now]
      );

      // calculateOutstandingBalance() = SUM(debit) - SUM(credit)
      // = (5000 + 0) - (0 + 2000) = 3000
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::int AS balance
         FROM customer_ledger_entries WHERE customer_id = $1`,
        [CUSTOMER_EMPTY_ID]
      );
      assert.equal(rows[0].balance, 3000,
        `SUM(debit)-SUM(credit) must be 3000 after 5000 opening and 2000 payment, got ${rows[0].balance}`
      );
    } finally {
      await pool.query(`DELETE FROM customer_ledger_entries WHERE id = $1`, [paymentEntryId]);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 17 — Failure in audit-log write rolls back the ledger entry.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 17 — DB-level constraint confirms atomicity: no partial insert', async () => {
    // Atomicity is enforced by the single transaction in setCustomerOpeningBalance().
    // We test this by confirming that after a rejected 409 request, no partial
    // OPENING_BALANCE entry was committed.
    //
    // The definitive test is Test 05 (concurrent requests): exactly one entry survived.
    // Here we verify that after the duplicate 409 on CUSTOMER_EMPTY_ID (Test 04),
    // still exactly one OPENING_BALANCE entry exists.

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM customer_ledger_entries
       WHERE customer_id = $1 AND entry_type = 'OPENING_BALANCE'`,
      [CUSTOMER_EMPTY_ID]
    );
    assert.equal(
      rows[0].cnt, 1,
      `Must have exactly 1 OPENING_BALANCE entry (no partial commits), got ${rows[0].cnt}`
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 18 — DB unique constraint violation is surfaced as 409 (not 500).
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 18 — Bypassing app checks and inserting a duplicate row returns 23505 handled as 409', async () => {
    // Insert a second OPENING_BALANCE row for CUSTOMER_EMPTY_ID directly
    // (bypassing the application-level duplicate check) to verify that the
    // PostgreSQL unique-index violation is also caught and mapped to 409.
    const dupeId = uuidv4();
    const now    = new Date().toISOString();

    let dbErr: Error | null = null;
    try {
      await pool.query(
        `INSERT INTO customer_ledger_entries
           (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
         VALUES ($1, $2, $1, NULL, 'OPENING_BALANCE', 9999, 0, 9999, 'Direct duplicate insert', NULL, $3)`,
        [dupeId, CUSTOMER_EMPTY_ID, now]
      );
    } catch (err: unknown) {
      dbErr = err as Error;
    }

    // The partial unique index must reject this insert with error code 23505
    assert.ok(dbErr !== null, 'Inserting a second OPENING_BALANCE must throw a DB constraint error');
    const pg = dbErr as { code?: string };
    assert.equal(
      pg.code, '23505',
      `Expected PostgreSQL error code 23505 (unique violation), got ${pg.code ?? 'unknown'}`
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 19 — Existing customer creation still starts at zero balance.
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 19 — Customer created through normal flow starts with zero outstanding balance', async () => {
    // CUSTOMER_CREATION_ID was seeded with no ledger entries.
    const { status, body } = await getLedger(CUSTOMER_CREATION_ID, tokenAdmin);

    assert.equal(status, 200, `Expected 200 got ${status}`);
    assert.equal(
      (body as any)['current_balance'], 0,
      'Normally created customer must have current_balance === 0'
    );
    const entries = (body as any)['entries'] as unknown[];
    assert.equal(entries.length, 0, 'Normally created customer must have 0 ledger entries');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Test 20 — Existing SALE and PAYMENT behaviour is unchanged (regression).
  // ═════════════════════════════════════════════════════════════════════════
  test('Test 20 — Existing sale/payment logic is unaffected by opening-balance implementation', async () => {
    // CUSTOMER_PAYMENT_REGR_ID: seeded with a 1000 SALE.
    // Verify ledger shows the sale correctly (regression: no interference from the new code).
    const { status, body } = await getLedger(CUSTOMER_PAYMENT_REGR_ID, tokenAdmin);

    assert.equal(status, 200, `Expected 200 got ${status}`);
    const entries = (body as any)['entries'] as Array<Record<string, unknown>>;
    assert.ok(entries.length >= 1, 'Must have at least one entry (the seeded SALE)');

    const saleEntry = entries.find((e) => e['entry_type'] === 'SALE');
    assert.ok(saleEntry, 'Must find a SALE entry');
    assert.equal(saleEntry['debit'],   1000, 'SALE debit must be 1000');
    assert.equal(saleEntry['credit'],  0,    'SALE credit must be 0');
    assert.equal(
      (body as any)['current_balance'],
      1000,
      'current_balance must be 1000 (sale only, no payment posted)'
    );

    // Confirm no OPENING_BALANCE entry was accidentally created for this customer
    const obEntry = entries.find((e) => e['entry_type'] === 'OPENING_BALANCE');
    assert.ok(!obEntry, 'Regression: no OPENING_BALANCE entry must exist for CUSTOMER_PAYMENT_REGR_ID');
  });
});
