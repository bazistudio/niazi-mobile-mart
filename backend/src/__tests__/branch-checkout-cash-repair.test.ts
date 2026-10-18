/**
 * Org Admin Branch Checkout & Cash Session Repair Acceptance Suite
 *
 * Verifies P0 sales correctness and branch isolation:
 *   1. Org Admin selects Branch B, and checkout request carries Branch B.
 *   2. Branch B stock is decremented without changing MAIN stock.
 *   3. The sale, stock movement, invoice context, and cash movement retain Branch B attribution.
 *   4. A branch cashier remains bound to their assigned branch.
 *   5. A branch cashier cannot spoof another branch in the payload (403 Forbidden).
 *   6. An Org Admin cannot select a branch outside their permitted scope (non-existent / warehouse -> 400).
 *   7. Current-session and daily-summary requests use the correct selected branch.
 *   8. Opening a cash session uses the selected authorized branch.
 *   9. Switching from Branch A to Branch B refreshes the displayed session state.
 *   10. Insufficient stock and missing cash sessions return controlled errors, not HTTP 500.
 *   11. Idempotency guarantees are preserved.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createSaleRouter } from '../routes/sale.routes.js';
import { createCashRouter } from '../routes/cash.routes.js';
import { issueToken } from '../services/jwt.service.js';
import { NIAZI_ORGANIZATION_ID, CENTRAL_WAREHOUSE_ID } from '../auth.js';

import fs from 'node:fs';
import path from 'node:path';

// Load keys for test execution
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

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? '';
if (!TEST_DB_URL) {
  console.error('[BLOCKED] TEST_DATABASE_URL is not set. Refusing to run tests.');
  process.exit(1);
}
const DANGEROUS_PATTERNS = ['cloud', 'cloudsql', 'prod', 'production', 'prd', 'cloud.google', 'cloudrun'];
for (const pat of DANGEROUS_PATTERNS) {
  if (TEST_DB_URL.toLowerCase().includes(pat)) {
    console.error(`[BLOCKED] TEST_DATABASE_URL contains pattern "${pat}". Aborting.`);
    process.exit(1);
  }
}

const pool = new Pool({ connectionString: TEST_DB_URL, max: 10 });
const RUN_PREFIX = uuidv4().replace(/-/g, '').slice(0, 8);

const fixtureIds = new Map<string, string>();
function id(label: string): string {
  if (!fixtureIds.has(label)) {
    fixtureIds.set(label, uuidv4());
  }
  return fixtureIds.get(label)!;
}

// Fixtures
const BRANCH_MAIN = '00000000-0000-0000-0000-000000000002';
const BRANCH_B = id('branch-b');
const ADMIN_USER_ID = id('admin-user');
const CASHIER_USER_ID = id('cashier-user');
const PROD_1 = id('product-1');
const CAT_ID = id('category-1');

let adminToken: string;
let cashierToken: string;
let server: Server;
let baseUrl: string;

describe('Org Admin Branch Checkout & Cash Session Repair Suite', () => {
  before(async () => {
    const now = new Date().toISOString();

    // 1. Ensure Organization
    await pool.query(
      `INSERT INTO organizations (id, name, created_at, updated_at)
       VALUES ($1, 'Niazi Mobile Mart', $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [NIAZI_ORGANIZATION_ID, now]
    );

    // 2. Ensure Branches: MAIN, BRANCH_B, and CENTRAL_WAREHOUSE
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, is_warehouse, created_at, updated_at)
       VALUES
         ($1, $4, 'Main Branch', 'MAIN', 1, 0, $5, $5),
         ($2, $4, 'Branch B', 'BR-B-${RUN_PREFIX}', 1, 0, $5, $5),
         ($3, $4, 'Central Warehouse', 'WH-${RUN_PREFIX}', 1, 1, $5, $5)
       ON CONFLICT (id) DO UPDATE SET is_active = 1`,
      [BRANCH_MAIN, BRANCH_B, CENTRAL_WAREHOUSE_ID, NIAZI_ORGANIZATION_ID, now]
    );

    // 3. Ensure Users: Admin (no branch or MAIN) and Cashier (bound to BRANCH_MAIN)
    await pool.query(
      `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
       VALUES
         ($1, NULL, 'Org Admin User', 'admin_${RUN_PREFIX}', 'hash', 'ADMIN', 1, $3, $3),
         ($2, $4, 'Cashier User', 'cashier_${RUN_PREFIX}', 'hash', 'CASHIER', 1, $3, $3)
       ON CONFLICT (id) DO UPDATE SET is_active = 1, branch_id = EXCLUDED.branch_id`,
      [ADMIN_USER_ID, CASHIER_USER_ID, now, BRANCH_MAIN]
    );

    // 4. Issue RS256 Tokens
    adminToken = issueToken({
      userId: ADMIN_USER_ID,
      username: `admin_${RUN_PREFIX}`,
      role: 'ADMIN',
      accessProfile: {
        allowed_pages: ['*'],
        allowed_actions: ['*'],
        limits: {
          max_discount_percent: 100,
          can_price_override: true,
          can_refund: true,
          can_void_sale: true,
          can_view_profit: true,
        },
      },
      branchId: null,
    });

    cashierToken = issueToken({
      userId: CASHIER_USER_ID,
      username: `cashier_${RUN_PREFIX}`,
      role: 'CASHIER',
      accessProfile: {
        allowed_pages: ['pos', 'sales'],
        allowed_actions: ['pos:sale', 'pos:open_drawer', 'pos:read'],
        limits: {
          max_discount_percent: 10,
          can_price_override: false,
          can_refund: false,
          can_void_sale: false,
          can_view_profit: false,
        },
      },
      branchId: BRANCH_MAIN,
    });

    // 5. Ensure Product & Stock
    await pool.query(
      `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
       VALUES ($1, 'Smartphones', 'CAT-${RUN_PREFIX}', 1, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [CAT_ID, now]
    );

    await pool.query(
      `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
       VALUES ($1, 'Smartphone Test Model', 'smartphone test model', 'SKU-SM-${RUN_PREFIX}', $2, 15000, 15000, 20000, 1, $3, $3)
       ON CONFLICT (id) DO UPDATE SET is_active = 1`,
      [PROD_1, CAT_ID, now]
    );

    // Initial stock: MAIN = 25, Branch B = 10
    await pool.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, 25, $4), ($1, $3, 10, $4)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [PROD_1, BRANCH_MAIN, BRANCH_B, now]
    );

    // 6. Ensure open cash sessions for both branches
    const todayStr = new Date().toISOString().split('T')[0];
    await pool.query(
      `UPDATE cash_sessions SET status = 'CLOSED', closed_at = $1 WHERE branch_id IN ($2, $3) AND status = 'OPEN'`,
      [now, BRANCH_MAIN, BRANCH_B]
    );

    await pool.query(
      `INSERT INTO cash_sessions (id, branch_id, business_date, opened_by, opening_cash, status, opened_at)
       VALUES
         ($1, $3, $5, $6, 1000, 'OPEN', $7),
         ($2, $4, $5, $6, 1000, 'OPEN', $7)`,
      [id('session-main'), id('session-b'), BRANCH_MAIN, BRANCH_B, todayStr, ADMIN_USER_ID, now]
    );

    // 7. Mount Express application
    const app = express();
    app.use(express.json());
    app.use('/api/sales', createSaleRouter(pool));
    app.use('/api/cash', createCashRouter(pool));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.end();
  });

  test('1. Org Admin selects Branch B, and checkout request carries Branch B', async () => {
    const res = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: BRANCH_B,
        items: [{ product_id: PROD_1, quantity: 2, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 40000,
        idempotency_key: uuidv4(),
      }),
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}`);
    const data = (await res.json()) as any;
    assert.ok(data.sale, 'Sale object should exist');
    assert.equal(data.sale.branch_id, BRANCH_B, 'Sale must be attributed to Branch B');
  });

  test('2. Branch B stock is decremented without changing MAIN stock', async () => {
    const stockRows = await pool.query<{ branch_id: string; quantity: number }>(
      'SELECT branch_id, quantity FROM stock WHERE product_id = $1',
      [PROD_1]
    );

    const bStock = stockRows.rows.find((r) => r.branch_id === BRANCH_B)?.quantity;
    const mainStock = stockRows.rows.find((r) => r.branch_id === BRANCH_MAIN)?.quantity;

    // Branch B was 10, sold 2 -> 8
    assert.equal(Number(bStock), 8, `Branch B stock should be decremented to 8, got ${bStock}`);
    // MAIN was 25 -> must remain 25
    assert.equal(Number(mainStock), 25, `MAIN branch stock must remain 25, got ${mainStock}`);
  });

  test('3. The sale and stock movement retain Branch B attribution', async () => {
    const mvRows = await pool.query<{ branch_id: string; quantity: string | number; movement_type: string }>(
      'SELECT branch_id, quantity, movement_type FROM stock_movements WHERE product_id = $1 AND branch_id = $2 ORDER BY created_at DESC LIMIT 1',
      [PROD_1, BRANCH_B]
    );
    assert.equal(mvRows.rows.length, 1, 'Stock movement must exist for Branch B');
    assert.equal(mvRows.rows[0].branch_id, BRANCH_B, 'Movement must belong to Branch B');
    assert.equal(Number(mvRows.rows[0].quantity), 2, 'Movement quantity must be 2');
    assert.equal(mvRows.rows[0].movement_type, 'OUT', 'Movement type must be OUT');

    const cashMv = await pool.query<{ branch_id: string; amount: string | number }>(
      "SELECT branch_id, amount FROM cash_movements WHERE branch_id = $1 AND movement_type = 'SALE_PAYMENT' ORDER BY created_at DESC LIMIT 1",
      [BRANCH_B]
    );
    assert.equal(cashMv.rows.length, 1, 'Cash movement must exist for Branch B');
    assert.equal(cashMv.rows[0].branch_id, BRANCH_B, 'Cash movement must belong to Branch B');
    assert.equal(Number(cashMv.rows[0].amount), 40000, 'Cash movement amount must be 40000');
  });

  test('4. A branch cashier remains bound to their assigned branch', async () => {
    const res = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        // Cashier does not supply branch_id
        items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 20000,
        idempotency_key: uuidv4(),
      }),
    });

    const data = (await res.json()) as any;
    assert.equal(res.status, 201, `Expected 201 Created for cashier, got ${res.status}: ${JSON.stringify(data)}`);
    assert.equal(data.sale.branch_id, BRANCH_MAIN, 'Cashier sale must be bound to cashier branch (MAIN)');
  });

  test('5. A branch cashier cannot spoof another branch in the payload', async () => {
    const res = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        branch_id: BRANCH_B, // Cross-branch spoof attempt!
        items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 20000,
        idempotency_key: uuidv4(),
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden for cross-branch spoofing, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.match(body.error, /permission/i, 'Error message should indicate permission denied');
  });

  test('6. An Org Admin cannot select a branch outside their permitted scope', async () => {
    // Attempt 1: Non-existent branch
    const resNonExistent = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: '00000000-0000-0000-0000-999999999999',
        items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 20000,
        idempotency_key: uuidv4(),
      }),
    });
    assert.equal(resNonExistent.status, 400, `Non-existent branch should return 400, got ${resNonExistent.status}`);

    // Attempt 2: Warehouse branch
    const resWarehouse = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: CENTRAL_WAREHOUSE_ID,
        items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 20000,
        idempotency_key: uuidv4(),
      }),
    });
    assert.equal(resWarehouse.status, 400, `Warehouse branch direct sale should return 400, got ${resWarehouse.status}`);
    const whBody = (await resWarehouse.json()) as any;
    assert.match(whBody.error, /Warehouse/i, 'Error should explain warehouse restrictions');
  });

  test('7. Current-session and daily-summary requests use the correct selected branch', async () => {
    // Current session for Branch B
    const sessionRes = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(sessionRes.status, 200);
    const sessionData = (await sessionRes.json()) as any;
    assert.ok(sessionData.session, 'Should return active session');
    assert.equal(sessionData.session.branch_id, BRANCH_B, 'Session must belong to Branch B');

    // Daily summary for Branch B
    const summaryRes = await fetch(`${baseUrl}/api/cash/summary?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(summaryRes.status, 200);
    const summaryData = (await summaryRes.json()) as any;
    assert.equal(summaryData.session_id, sessionData.session.id, 'Summary session_id must match Branch B session id');
    assert.equal(summaryData.cash_sales, 40000, 'Summary cash_sales for Branch B must reflect the sale of 40000');

    // Cashier attempting to query Branch B session -> 403 Forbidden
    const cashierForbidden = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    assert.equal(cashierForbidden.status, 403, 'Cashier querying other branch session must receive 403');
  });

  test('8. Opening a cash session uses the selected authorized branch', async () => {
    const NEW_BRANCH = id('branch-c');
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, is_warehouse, created_at, updated_at)
       VALUES ($1, $2, 'Branch C', 'BR-C-${RUN_PREFIX}', 1, 0, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [NEW_BRANCH, NIAZI_ORGANIZATION_ID, now]
    );

    // Admin opens register for Branch C
    const openRes = await fetch(`${baseUrl}/api/cash/sessions/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: NEW_BRANCH,
        opening_cash: 2500,
        business_date: new Date().toISOString().split('T')[0],
      }),
    });
    assert.equal(openRes.status, 201, `Expected 201 Created for open session, got ${openRes.status}`);
    const session = (await openRes.json()) as any;
    assert.equal(session.branch_id, NEW_BRANCH, 'Session branch_id must match requested branch');
    assert.equal(session.opening_cash, 2500);

    // Cashier attempting to open register for Branch C -> 403 Forbidden
    const cashierOpen = await fetch(`${baseUrl}/api/cash/sessions/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        branch_id: NEW_BRANCH,
        opening_cash: 1000,
      }),
    });
    assert.equal(cashierOpen.status, 403, 'Cashier opening register for other branch must be rejected with 403');

    // Missing branch_id by admin with no assigned branch -> controlled 400 Bad Request, NOT 500
    const missingBranch = await fetch(`${baseUrl}/api/cash/sessions/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        opening_cash: 1000,
      }),
    });
    assert.equal(missingBranch.status, 400, 'Missing branch_id must return 400');
  });

  test('9. Switching from Branch A to Branch B refreshes the displayed session state', async () => {
    const resA = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_MAIN}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sessionA = ((await resA.json()) as any).session;

    const resB = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sessionB = ((await resB.json()) as any).session;

    assert.ok(sessionA, 'Session A should exist');
    assert.ok(sessionB, 'Session B should exist');
    assert.notEqual(sessionA.id, sessionB.id, 'Session A and Session B must be distinct records');
    assert.equal(sessionA.branch_id, BRANCH_MAIN);
    assert.equal(sessionB.branch_id, BRANCH_B);
  });

  test('10. Insufficient stock and missing cash sessions return controlled errors, not HTTP 500', async () => {
    // Insufficient stock test
    const stockFailRes = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: BRANCH_B,
        items: [{ product_id: PROD_1, quantity: 9999, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 199980000,
        idempotency_key: uuidv4(),
      }),
    });
    assert.equal(stockFailRes.status, 400, `Insufficient stock must return 400, got ${stockFailRes.status}`);
    const stockErr = (await stockFailRes.json()) as any;
    assert.match(stockErr.error, /insufficient/i);

    // Missing cash session: close Branch B session first
    const currentSessionRes = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const currentSession = ((await currentSessionRes.json()) as any).session;

    await fetch(`${baseUrl}/api/cash/sessions/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        session_id: currentSession.id,
        actual_closing_cash: 41000,
      }),
    });

    // Now attempt cash sale on Branch B without open till
    const noTillRes = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: BRANCH_B,
        items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
        payment_method: 'CASH',
        paid_amount: 20000,
        idempotency_key: uuidv4(),
      }),
    });
    assert.equal(noTillRes.status, 400, `Cash sale without open till must return 400, got ${noTillRes.status}`);
    const noTillErr = (await noTillRes.json()) as any;
    assert.match(noTillErr.error, /till|session/i);
  });

  test('11. Existing idempotency guarantees continue to pass across branches', async () => {
    // Re-open session for Branch B for this test
    await fetch(`${baseUrl}/api/cash/sessions/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        branch_id: BRANCH_B,
        opening_cash: 1000,
        business_date: new Date().toISOString().split('T')[0],
      }),
    });

    const key = uuidv4();
    const payload = {
      branch_id: BRANCH_B,
      items: [{ product_id: PROD_1, quantity: 1, unit_price: 20000 }],
      payment_method: 'CASH',
      paid_amount: 20000,
      idempotency_key: key,
    };

    // First attempt
    const res1 = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res1.status, 201);
    const sale1 = ((await res1.json()) as any).sale;

    // Retry with identical key and payload
    const res2 = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res2.status, 201);
    const sale2 = ((await res2.json()) as any).sale;

    assert.equal(sale1.id, sale2.id, 'Idempotent retry must return original sale ID');
  });
});
