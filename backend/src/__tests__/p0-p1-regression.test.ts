/**
 * P0/P1 Regression Tests — Niazi Mobile Mart v1.3.36
 *
 * P0: Sale idempotency, concurrency safety, fail-closed behavior, payload hashing.
 * P1: Week-to-date metrics (PKT timezone), branch-correct financial history.
 *
 * DATABASE ISOLATION REQUIREMENT (mission brief §8):
 *   Set TEST_DATABASE_URL to a disposable local PostgreSQL database.
 *   The suite REFUSES to run against a URL containing 'prod', 'live', or 'cloud' patterns.
 *   If TEST_DATABASE_URL is not set, integration tests are SKIPPED (not failed).
 *
 * HOW TO RUN:
 *   cd backend
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/niazi_test \
 *     node --loader ts-node/esm src/__tests__/p0-p1-regression.test.ts
 *
 *   Or compile first:
 *     npx tsc && TEST_DATABASE_URL=postgres://... node dist/__tests__/p0-p1-regression.test.js
 *
 * CONCURRENCY NOTE:
 *   P0-4 makes actual concurrent database calls — it does NOT mock the DB layer.
 *   This is required to validate the UNIQUE constraint on
 *   sale_idempotency_keys(idempotency_key, branch_id).
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  completeSale,
  completeSaleTx,
  SaleRepoError,
  CompleteSaleDto,
  SaleResultDto,
} from '../repositories/sale.repo';
import { getDashboardProfitSummary } from '../repositories/profit.repo';
import { listHistoryItems, getHistoryStats } from '../repositories/history.repo';

// ---------------------------------------------------------------------------
// Environment guard — disposable DB only
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? null;

const PRODUCTION_PATTERNS = [
  /prod/i, /live/i, /cloud\.google/i, /cloudsql/i, /neon\.tech/i,
];

if (TEST_DB_URL) {
  for (const pat of PRODUCTION_PATTERNS) {
    if (pat.test(TEST_DB_URL)) {
      throw new Error(
        `[SAFETY] TEST_DATABASE_URL matches production pattern "${pat}". ` +
        'Refusing to run regression tests against a non-disposable database.'
      );
    }
  }
}

function requireDb(label: string): boolean {
  if (!TEST_DB_URL) {
    console.warn(`  SKIP (no TEST_DATABASE_URL): ${label}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shared pool
// ---------------------------------------------------------------------------

let pool: Pool;

before(async () => {
  if (TEST_DB_URL) {
    pool = new Pool({ connectionString: TEST_DB_URL });
  }
});

after(async () => {
  if (pool) await pool.end();
});

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

const RUN_PREFIX = `p0p1-${Date.now()}`;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_A = '00000000-0000-0000-0000-000000000010';
const USER_B = '00000000-0000-0000-0000-000000000011';

/** Stable deterministic UUID for a label within this run */
function id(label: string): string {
  const hash = createHash('sha256').update(`${RUN_PREFIX}:${label}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const BRANCH_A = id('branch-a');
const BRANCH_B = id('branch-b');
const PROD_X   = id('prod-x');
const PROD_Y   = id('prod-y');
const CAT_ID   = id('category');
const CUST_1   = id('customer-1');

// Deterministic ordering for multi-item opposing test: PROD_A < PROD_B
const PROD_A = PROD_X < PROD_Y ? PROD_X : PROD_Y;
const PROD_B = PROD_X < PROD_Y ? PROD_Y : PROD_X;

async function setupFixtures(client: PoolClient): Promise<void> {
  const now = new Date().toISOString();
  const todayDate = now.slice(0, 10);

  // Product Type
  await client.query(
    `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
     VALUES ($1, 'P0P1 Test Category', $2, 1, $3, $3) ON CONFLICT (id) DO NOTHING`,
    [CAT_ID, `TCAT-${RUN_PREFIX}`, now],
  );

  // Branches
  for (const [branchId, code, name] of [
    [BRANCH_A, `TBA-${RUN_PREFIX}`, 'Branch A (P0P1 test)'],
    [BRANCH_B, `TBB-${RUN_PREFIX}`, 'Branch B (P0P1 test)'],
  ]) {
    await client.query(
      `INSERT INTO branches (id, organization_id, name, code, is_warehouse, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 1, $5, $5) ON CONFLICT (id) DO NOTHING`,
      [branchId, ORG_ID, name, code, now],
    );
  }

  // Users assigned to BRANCH_A
  for (const [userId, username] of [
    [USER_A, `u-${RUN_PREFIX}`],
    [USER_B, `ub-${RUN_PREFIX}`],
  ]) {
    await client.query(
      `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, 'P0P1 Cashier', $3, 'hash', 'CASHIER', 1, $4, $4) ON CONFLICT (id) DO NOTHING`,
      [userId, BRANCH_A, username, now],
    );
  }

  // Products
  await client.query(
    `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
     VALUES ($1, 'Test Phone X', 'test phone x', $2, $3, 800, 820, 1000, 1, $4, $4) ON CONFLICT (id) DO NOTHING`,
    [PROD_X, `SKUX-${RUN_PREFIX}`, CAT_ID, now],
  );
  await client.query(
    `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
     VALUES ($1, 'Test Phone Y', 'test phone y', $2, $3, 900, 920, 1200, 1, $4, $4) ON CONFLICT (id) DO NOTHING`,
    [PROD_Y, `SKUY-${RUN_PREFIX}`, CAT_ID, now],
  );

  // Stock for both branches
  for (const branchId of [BRANCH_A, BRANCH_B]) {
    for (const prodId of [PROD_X, PROD_Y]) {
      await client.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, 500, $3)
         ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = 500, updated_at = $3`,
        [prodId, branchId, now],
      );
    }
  }

  // Open cash session for BRANCH_A (required for CASH sales)
  const sessionId = id('cash-session-a');
  await client.query(
    `INSERT INTO cash_sessions (id, branch_id, opened_by, status, opening_cash, opened_at, business_date)
     VALUES ($1, $2, $3, 'OPEN', 0, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [sessionId, BRANCH_A, USER_A, now, todayDate],
  );

  // Customer with ample credit
  await client.query(
    `INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
     VALUES ($1, $2, 'P0P1 Test Customer', '0300-0000099', 50000, 1, $3, $3) ON CONFLICT (id) DO NOTHING`,
    [CUST_1, `TC1-${RUN_PREFIX}`, now],
  );
}

async function teardownFixtures(client: PoolClient): Promise<void> {
  const branches = [BRANCH_A, BRANCH_B];
  await client.query(`DELETE FROM sale_idempotency_keys WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM cash_movements WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(
    `DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE branch_id = ANY($1::text[]))`,
    [branches],
  );
  await client.query(
    `DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE branch_id = ANY($1::text[]))`,
    [branches],
  );
  await client.query(
    `DELETE FROM customer_ledger_entries
     WHERE reference_id IN (SELECT id FROM sales WHERE branch_id = ANY($1::text[]))
        OR customer_id = $2`,
    [branches, CUST_1],
  );
  await client.query(`DELETE FROM sales WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM stock_movements WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM cash_sessions WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM stock WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM customers WHERE id = $1`, [CUST_1]);
  await client.query(`DELETE FROM products WHERE id = ANY($1::text[])`, [[PROD_X, PROD_Y]]);
  await client.query(`DELETE FROM change_log WHERE branch_id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM branches WHERE id = ANY($1::text[])`, [branches]);
  await client.query(`DELETE FROM product_types WHERE id = $1`, [CAT_ID]);
  await client.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[USER_A, USER_B]]);
}

function makeSaleDto(overrides?: Partial<CompleteSaleDto>): CompleteSaleDto {
  return {
    branch_id: BRANCH_A,
    customer_id: null,
    items: [{ product_id: PROD_X, quantity: 1 }],
    payments: [{ method: 'CASH', amount: 1000 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ============================================================
// P0 — IDEMPOTENCY TESTS
// ============================================================
// ---------------------------------------------------------------------------

describe('P0 — Idempotency (integration)', () => {

  // ── P0-1: First valid checkout creates exactly one sale ──────────────────

  test('P0-1: first checkout creates exactly one sale', async () => {
    if (!requireDb('P0-1')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupFixtures(client);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-1-${uuidv4()}`;
      const result = await completeSale(pool, makeSaleDto({ idempotency_key: ikey }), USER_A, BRANCH_A, false);

      assert.ok(result.sale.id, 'sale id present');
      assert.strictEqual(result.sale.branch_id, BRANCH_A);

      const { rows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sales WHERE invoice_number = $1',
        [result.sale.invoice_number],
      );
      assert.strictEqual(Number((rows[0] as { cnt: string }).cnt), 1, 'exactly one sale row');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-2: Retry with same key+payload returns the original result ─────────

  test('P0-2: retry with same key+payload returns original result without creating a new sale', async () => {
    if (!requireDb('P0-2')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-2-${uuidv4()}`;
      const dto = makeSaleDto({ idempotency_key: ikey });

      const first = await completeSale(pool, dto, USER_A, BRANCH_A, false);
      const retry = await completeSale(pool, dto, USER_A, BRANCH_A, false);

      assert.strictEqual(retry.sale.id, first.sale.id, 'retry returns same sale.id');
      assert.strictEqual(retry.sale.invoice_number, first.sale.invoice_number, 'same invoice_number');

      const { rows: saleCount } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sales WHERE id = $1', [first.sale.id]);
      assert.strictEqual(Number((saleCount[0] as { cnt: string }).cnt), 1, 'exactly one sale row after retry');

      const { rows: ikCount } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sale_idempotency_keys WHERE idempotency_key = $1', [ikey]);
      assert.strictEqual(Number((ikCount[0] as { cnt: string }).cnt), 1, 'exactly one idempotency key row');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-3: Same key, different payload → 409 ───────────────────────────────

  test('P0-3: same idempotency key reused with different payload returns 409 SaleRepoError', async () => {
    if (!requireDb('P0-3')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-3-${uuidv4()}`;
      await completeSale(pool, makeSaleDto({ idempotency_key: ikey, items: [{ product_id: PROD_X, quantity: 1 }] }), USER_A, BRANCH_A, false);

      await assert.rejects(
        () => completeSale(pool, makeSaleDto({ idempotency_key: ikey, items: [{ product_id: PROD_X, quantity: 2 }] }), USER_A, BRANCH_A, false),
        (err: unknown) => {
          assert.ok(err instanceof SaleRepoError, 'error is SaleRepoError');
          assert.strictEqual((err as SaleRepoError).statusCode, 409, 'status 409 Conflict');
          return true;
        },
      );
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-4: Concurrent identical requests produce exactly one sale ──────────

  test('P0-4: concurrent identical requests (5 simultaneous) produce exactly one sale', { timeout: 30_000 }, async () => {
    if (!requireDb('P0-4')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-4-${uuidv4()}`;
      const dto = makeSaleDto({ idempotency_key: ikey });

      const results = await Promise.allSettled([
        completeSale(pool, dto, USER_A, BRANCH_A, false),
        completeSale(pool, dto, USER_A, BRANCH_A, false),
        completeSale(pool, dto, USER_A, BRANCH_A, false),
        completeSale(pool, dto, USER_A, BRANCH_A, false),
        completeSale(pool, dto, USER_A, BRANCH_A, false),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<SaleResultDto>[];
      const failures  = results.filter(r => r.status === 'rejected')  as PromiseRejectedResult[];

      assert.ok(successes.length >= 1, 'at least one request succeeded');

      // All successes must point to the SAME sale
      const saleIds = new Set(successes.map(r => r.value.sale.id));
      assert.strictEqual(saleIds.size, 1, `all successes share one sale_id, got: ${[...saleIds].join(', ')}`);

      // Any failures must be expected concurrency errors
      for (const f of failures) {
        const err = f.reason as any;
        const statusCode = err instanceof SaleRepoError ? err.statusCode : err?.statusCode;
        const errCode = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: string }).code : undefined;
        const isExpected =
          (err instanceof SaleRepoError && (statusCode === 409 || statusCode === 500)) ||
          errCode === '40001' || // serialization failure
          errCode === '23505';   // unique violation
        assert.ok(isExpected, `unexpected failure: ${err?.message} (code=${errCode ?? 'n/a'}, status=${statusCode ?? 'n/a'})`);
      }

      // Exactly one sale row in the DB for this invoice
      const invoiceNumber = successes[0]!.value.sale.invoice_number;
      const { rows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sales WHERE invoice_number = $1', [invoiceNumber]);
      assert.strictEqual(Number((rows[0] as { cnt: string }).cnt), 1, 'exactly one sale in DB');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-4b: Concurrent checkouts with opposing multi-item cart orders avoid deadlock ────

  test('P0-4b: concurrent checkouts with opposing cart orders complete without 40P01 deadlock', { timeout: 30_000 }, async () => {
    if (!requireDb('P0-4b')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const priceA = PROD_A === PROD_X ? 1000 : 1200;
      const priceB = PROD_B === PROD_X ? 1000 : 1200;

      // Initial stock in BRANCH_A: 500 of A, 500 of B
      const { rows: stockInitA } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_A, BRANCH_A]
      );
      const { rows: stockInitB } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_B, BRANCH_A]
      );
      const initialStockA = Number((stockInitA[0] as { quantity: number }).quantity);
      const initialStockB = Number((stockInitB[0] as { quantity: number }).quantity);
      assert.strictEqual(initialStockA, 500);
      assert.strictEqual(initialStockB, 500);

      // Quantities per opposing run:
      // Tx1 requests [PROD_A: 2, PROD_B: 3]
      // Tx2 requests [PROD_B: 1, PROD_A: 4]  <-- Opposing input order!
      const qtyA_tx1 = 2;
      const qtyB_tx1 = 3;
      const total1 = qtyA_tx1 * priceA + qtyB_tx1 * priceB;

      const qtyB_tx2 = 1;
      const qtyA_tx2 = 4;
      const total2 = qtyB_tx2 * priceB + qtyA_tx2 * priceA;

      const NUM_CONCURRENT_PAIRS = 5;
      const observedSqlStates: string[] = [];
      const successfulSaleIds: string[] = [];

      for (let run = 0; run < NUM_CONCURRENT_PAIRS; run++) {
        const key1 = `p0-4b-r${run}-tx1-${uuidv4()}`;
        const key2 = `p0-4b-r${run}-tx2-${uuidv4()}`;

        // Tx1 input order: [PROD_A, PROD_B]
        const dto1: CompleteSaleDto = {
          branch_id: BRANCH_A,
          customer_id: null,
          idempotency_key: key1,
          items: [
            { product_id: PROD_A, quantity: qtyA_tx1 },
            { product_id: PROD_B, quantity: qtyB_tx1 },
          ],
          payments: [{ method: 'CASH', amount: total1 }],
        };

        // Tx2 input order: [PROD_B, PROD_A] (OPPOSITE CART ORDER)
        const dto2: CompleteSaleDto = {
          branch_id: BRANCH_A,
          customer_id: null,
          idempotency_key: key2,
          items: [
            { product_id: PROD_B, quantity: qtyB_tx2 },
            { product_id: PROD_A, quantity: qtyA_tx2 },
          ],
          payments: [{ method: 'CASH', amount: total2 }],
        };

        // Synchronize launch with barrier so both requests enter checkout simultaneously
        let releaseBarrier: () => void;
        const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });

        const task1 = (async () => {
          await barrier;
          return completeSale(pool, dto1, USER_A, BRANCH_A, false);
        })();

        const task2 = (async () => {
          await barrier;
          return completeSale(pool, dto2, USER_B, BRANCH_A, false);
        })();

        releaseBarrier!();

        const results = await Promise.allSettled([task1, task2]);

        for (const res of results) {
          if (res.status === 'rejected') {
            const err = res.reason as any;
            const sqlState = err?.code ?? 'UNKNOWN';
            observedSqlStates.push(sqlState);
            assert.notStrictEqual(sqlState, '40P01', `Deadlock detected (SQLSTATE 40P01) in run ${run}: ${err?.message}`);
            assert.fail(`Unexpected rejection in run ${run}: ${err?.message} (SQLSTATE: ${sqlState})`);
          } else {
            successfulSaleIds.push(res.value.sale.id);
            assert.strictEqual(res.value.sale.sale_status, 'COMPLETED');
            assert.strictEqual(res.value.sale.payment_status, 'PAID');
          }
        }
      }

      // Assert that all 10 transactions (5 pairs) completed successfully
      assert.strictEqual(
        successfulSaleIds.length,
        NUM_CONCURRENT_PAIRS * 2,
        `All ${NUM_CONCURRENT_PAIRS * 2} sales completed without deadlock`,
      );
      assert.strictEqual(observedSqlStates.length, 0, 'Zero errors/deadlocks observed');

      // Assert final stock consistency:
      // In each run: Tx1 deducted 2 of A and 3 of B; Tx2 deducted 4 of A and 1 of B.
      // Total deducted: 5 * (2 + 4) = 30 of A, 5 * (3 + 1) = 20 of B.
      const totalExpectedDeductionA = NUM_CONCURRENT_PAIRS * (qtyA_tx1 + qtyA_tx2);
      const totalExpectedDeductionB = NUM_CONCURRENT_PAIRS * (qtyB_tx1 + qtyB_tx2);

      const { rows: stockFinalA } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_A, BRANCH_A]
      );
      const { rows: stockFinalB } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_B, BRANCH_A]
      );
      const finalStockA = Number((stockFinalA[0] as { quantity: number }).quantity);
      const finalStockB = Number((stockFinalB[0] as { quantity: number }).quantity);

      assert.strictEqual(finalStockA, initialStockA - totalExpectedDeductionA, 'Final stock A exactly matches expected');
      assert.strictEqual(finalStockB, initialStockB - totalExpectedDeductionB, 'Final stock B exactly matches expected');
      assert.ok(finalStockA > 0 && finalStockB > 0, 'Stock remained positive throughout');

      // Assert sale lines and payment integrity for all created sales
      for (const saleId of successfulSaleIds) {
        const { rows: lines } = await pool.query(
          'SELECT product_id, quantity, unit_price, line_total FROM sale_lines WHERE sale_id = $1',
          [saleId]
        );
        assert.strictEqual(lines.length, 2, `Sale ${saleId} has exactly 2 sale lines`);

        const { rows: payments } = await pool.query(
          'SELECT payment_method, amount FROM sale_payments WHERE sale_id = $1',
          [saleId]
        );
        assert.strictEqual(payments.length, 1, `Sale ${saleId} has exactly 1 payment record`);
        assert.strictEqual((payments[0] as { payment_method: string }).payment_method, 'CASH');
      }

      // Assert cash movements were generated
      const { rows: cashMovs } = await pool.query(
        'SELECT COUNT(*) as cnt FROM cash_movements WHERE branch_id = $1 AND reference_id = ANY($2::text[])',
        [BRANCH_A, successfulSaleIds]
      );
      assert.strictEqual(Number((cashMovs[0] as { cnt: string }).cnt), NUM_CONCURRENT_PAIRS * 2);

    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-5: Stock deducted only once across retries ─────────────────────────

  test('P0-5: stock is deducted only once (not duplicated on retry)', async () => {
    if (!requireDb('P0-5')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const { rows: before } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
        [PROD_X, BRANCH_A],
      );
      const stockBefore = Number((before[0] as { quantity: number }).quantity);

      const ikey = `p0-5-${uuidv4()}`;
      const dto = makeSaleDto({
        idempotency_key: ikey,
        items: [{ product_id: PROD_X, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 3000 }],
      });

      await completeSale(pool, dto, USER_A, BRANCH_A, false);
      await completeSale(pool, dto, USER_A, BRANCH_A, false); // retry

      const { rows: after } = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
        [PROD_X, BRANCH_A],
      );
      const stockAfter = Number((after[0] as { quantity: number }).quantity);

      assert.strictEqual(stockBefore - stockAfter, 3, 'deducted exactly 3, not 6');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-6: No duplicate payments/ledger on retry ───────────────────────────

  test('P0-6: customer ledger entries and sale payments not duplicated on retry', async () => {
    if (!requireDb('P0-6')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-6-${uuidv4()}`;
      // Partial payment → generates a customer_ledger_entries credit row
      const dto = makeSaleDto({
        idempotency_key: ikey,
        customer_id: CUST_1,
        payments: [{ method: 'CASH', amount: 500 }], // partial; 500 credit created
      });

      const first = await completeSale(pool, dto, USER_A, BRANCH_A, false);
      await completeSale(pool, dto, USER_A, BRANCH_A, false); // retry — must be idempotent

      const { rows: pmtRows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sale_payments WHERE sale_id = $1', [first.sale.id]);
      assert.strictEqual(Number((pmtRows[0] as { cnt: string }).cnt), 1, 'exactly one payment row');

      const { rows: ledgerRows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM customer_ledger_entries WHERE reference_id = $1', [first.sale.id]);
      assert.ok(
        Number((ledgerRows[0] as { cnt: string }).cnt) <= 1,
        'at most one ledger entry for this sale reference',
      );
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-7: Failed transaction leaves no idempotency record ────────────────

  test('P0-7: failed transaction leaves no false idempotency record', async () => {
    if (!requireDb('P0-7')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-7-${uuidv4()}`;
      // quantity: 0 is invalid; completeSaleTx will throw before the sale is committed
      const dto = makeSaleDto({ idempotency_key: ikey, items: [{ product_id: PROD_X, quantity: 0 }] });

      await assert.rejects(() => completeSale(pool, dto, USER_A, BRANCH_A, false));

      const { rows } = await pool.query(
        'SELECT COUNT(*) AS cnt FROM sale_idempotency_keys WHERE idempotency_key = $1', [ikey]);
      assert.strictEqual(
        Number((rows[0] as { cnt: string }).cnt), 0,
        'no idempotency key persisted after failed transaction',
      );
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-9: Non-null payload hash stored ────────────────────────────────────

  test('P0-9: successful sale stores a non-null payload hash in sale_idempotency_keys', async () => {
    if (!requireDb('P0-9')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p0-9-${uuidv4()}`;
      const result = await completeSale(pool, makeSaleDto({ idempotency_key: ikey }), USER_A, BRANCH_A, false);

      const { rows } = await pool.query(
        'SELECT payload_hash FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2',
        [ikey, result.sale.branch_id],
      );
      assert.strictEqual(rows.length, 1, 'exactly one idempotency row');
      const hash = (rows[0] as { payload_hash: string | null }).payload_hash;
      assert.notStrictEqual(hash, null, 'payload_hash is not null');
      assert.ok(typeof hash === 'string' && hash.length > 0, 'payload_hash is a non-empty string');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  // ── P0-10: Cross-branch isolation ─────────────────────────────────────────

  test('P0-10: same key used by different branches creates independent sales without cross-branch leakage', async () => {
    if (!requireDb('P0-10')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      // Open a cash session for BRANCH_B
      const now = new Date().toISOString();
      const sessionBId = id('csess-b-p10');
      await pool.query(
        `INSERT INTO cash_sessions (id, branch_id, opened_by, status, opening_cash, opened_at, business_date)
         VALUES ($1, $2, $3, 'OPEN', 0, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [sessionBId, BRANCH_B, USER_A, now, now.slice(0, 10)],
      );

      const sharedKey = `p0-10-shared-${uuidv4()}`;
      const dtoA = makeSaleDto({ idempotency_key: sharedKey });
      const dtoB = { ...dtoA, branch_id: BRANCH_B };

      // BRANCH_A non-admin sale
      const resultA = await completeSale(pool, dtoA, USER_A, BRANCH_A, false);
      // BRANCH_B admin sale (admin=true so it can use dto.branch_id)
      const resultB = await completeSale(pool, dtoB, USER_A, BRANCH_B, true);

      assert.notStrictEqual(resultA.sale.id, resultB.sale.id, 'different sale IDs per branch');
      assert.strictEqual(resultA.sale.branch_id, BRANCH_A);
      assert.strictEqual(resultB.sale.branch_id, BRANCH_B);

      // Two separate idempotency rows: (key, BRANCH_A) and (key, BRANCH_B)
      const { rows: ikRows } = await pool.query(
        'SELECT branch_id FROM sale_idempotency_keys WHERE idempotency_key = $1 ORDER BY branch_id',
        [sharedKey],
      );
      assert.strictEqual(ikRows.length, 2, 'two idempotency rows — one per branch');

      // Retry BRANCH_A key → returns original, no new sale
      const retryA = await completeSale(pool, dtoA, USER_A, BRANCH_A, false);
      assert.strictEqual(retryA.sale.id, resultA.sale.id, 'retry returns original BRANCH_A sale');

      // Retry BRANCH_B key → returns original, no new sale
      const retryB = await completeSale(pool, dtoB, USER_A, BRANCH_B, true);
      assert.strictEqual(retryB.sale.id, resultB.sale.id, 'retry returns original BRANCH_B sale');

      // Cleanup extra session
      await pool.query('DELETE FROM cash_sessions WHERE id = $1', [sessionBId]);
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

}); // end P0 integration

// ---------------------------------------------------------------------------
// P0-8: Fail-closed — NO database connection required (unit/mock)
// ---------------------------------------------------------------------------

describe('P0-8 — Fail-closed (unit, no DB)', () => {

  test('P0-8a: completeSale fails closed (SaleRepoError 500) when table missing via 42P01 code', async () => {
    const mockPool = {
      query: async () => {
        const e = Object.assign(
          new Error('relation "sale_idempotency_keys" does not exist'),
          { code: '42P01' }
        );
        throw e;
      },
      connect: async () => {
        const e = Object.assign(
          new Error('relation "sale_idempotency_keys" does not exist'),
          { code: '42P01' }
        );
        throw e;
      },
    } as unknown as Pool;

    await assert.rejects(
      () => completeSale(mockPool, { items: [{ product_id: 'x', quantity: 1 }] }, 'u1', 'b1', false),
      (err: unknown) => {
        assert.ok(err instanceof SaleRepoError, `expected SaleRepoError, got ${(err as Error).constructor?.name}`);
        assert.strictEqual((err as SaleRepoError).statusCode, 500, 'fail-closed with 500');
        return true;
      },
    );
  });

  test('P0-8b: completeSale fails closed (SaleRepoError 500) when "does not exist" in error message', async () => {
    const mockPool = {
      query: async () => {
        throw new Error('relation "sale_idempotency_keys" does not exist');
      },
      connect: async () => {
        throw new Error('relation "sale_idempotency_keys" does not exist');
      },
    } as unknown as Pool;

    await assert.rejects(
      () => completeSale(mockPool, { items: [{ product_id: 'x', quantity: 1 }] }, 'u1', 'b1', false),
      (err: unknown) => {
        assert.ok(err instanceof SaleRepoError);
        assert.strictEqual((err as SaleRepoError).statusCode, 500);
        return true;
      },
    );
  });

}); // end P0-8 unit

// ---------------------------------------------------------------------------
// P0 — Main branch predicate & deterministic stock locking (unit, no DB)
// ---------------------------------------------------------------------------

describe('P0 — Main branch predicate & deterministic stock locking (unit, no DB)', () => {
  const saleRepoPath = existsSync(resolve(__dirname, '../repositories/sale.repo.ts'))
    ? resolve(__dirname, '../repositories/sale.repo.ts')
    : resolve(__dirname, '../../src/repositories/sale.repo.ts');

  test('P0-MAIN-1: sale.repo.ts uses is_active = 1 (integer-compatible predicate) for MAIN branch fallback', () => {
    const src = readFileSync(saleRepoPath, 'utf-8');
    const hasIntegerPredicate = /code\s*=\s*'MAIN'\s+AND\s+is_active\s*=\s*1/i.test(src);
    const hasIncompatibleBoolean = /code\s*=\s*'MAIN'\s+AND\s+is_active\s*=\s*TRUE/i.test(src);
    assert.ok(hasIntegerPredicate, "sale.repo.ts must query code = 'MAIN' AND is_active = 1");
    assert.ok(!hasIncompatibleBoolean, "sale.repo.ts must NOT query is_active = TRUE on integer column");
  });

  test('P0-LOCK-1: sale.repo.ts sorts product IDs before stock FOR UPDATE row locking', () => {
    const src = readFileSync(saleRepoPath, 'utf-8');
    const sortsProductIds = /sortedProductIds\s*=\s*Array\.from\(aggregatedQty\.keys\(\)\)\.sort\(\)/.test(src);
    assert.ok(sortsProductIds, 'sale.repo.ts must sort product IDs before FOR UPDATE row locking loop');
  });

  function createMockSaleClient() {
    const queriesExecuted: { sql: string; params?: unknown[] }[] = [];
    const lockedProductIds: string[] = [];

    const mockClient = {
      query: async (sqlOrConfig: string | { text: string; values?: unknown[] }, params?: unknown[]) => {
        const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
        const values = typeof sqlOrConfig === 'string' ? params : sqlOrConfig.values;
        queriesExecuted.push({ sql, params: values });

        if (sql.includes("code = 'MAIN'")) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000002' }], rowCount: 1 };
        }
        if (sql.includes('FROM branches WHERE id = $1')) {
          return { rows: [{ id: values?.[0] ?? 'b1', is_active: 1, is_warehouse: 0 }], rowCount: 1 };
        }
        if (sql.includes('FROM products WHERE id = $1')) {
          const pid = values?.[0] as string;
          return {
            rows: [{
              id: pid,
              name: `Product ${pid}`,
              sku: `SKU-${pid}`,
              purchase_price: 100,
              average_cost: 100,
              sale_price: 200,
              is_active: 1,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE')) {
          const pid = values?.[0] as string;
          lockedProductIds.push(pid);
          return { rows: [{ quantity: 100 }], rowCount: 1 };
        }
        if (sql.includes('CREATE TABLE IF NOT EXISTS user_invoice_counters')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO user_invoice_counters')) {
          return { rows: [{ next_val: 1 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO sales')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO sale_lines')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE stock') && sql.includes('quantity = quantity - $1')) {
          return { rows: [{ previous_stock: 100, new_stock: 99 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO stock_movements')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO sale_payments')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('FROM cash_sessions WHERE branch_id = $1')) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000003' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO cash_movements')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      queriesExecuted,
      lockedProductIds,
    };

    return mockClient;
  }

  test('P0-MAIN-2: completeSaleTx executes query with is_active = 1 when resolving MAIN branch', async () => {
    const mock = createMockSaleClient();
    const dto: CompleteSaleDto = {
      branch_id: undefined,
      customer_id: null,
      items: [{ product_id: 'prod-1', quantity: 1 }],
      payments: [{ method: 'CASH', amount: 200 }],
    };

    await completeSaleTx(mock as unknown as PoolClient, dto, null, null, null, true);

    const mainBranchQuery = mock.queriesExecuted.find(q => q.sql.includes("code = 'MAIN'"));
    assert.ok(mainBranchQuery, 'must query branches for code = MAIN');
    assert.ok(
      mainBranchQuery.sql.includes('is_active = 1'),
      `query must contain is_active = 1, got: ${mainBranchQuery.sql}`,
    );
    assert.ok(
      !mainBranchQuery.sql.includes('is_active = TRUE'),
      `query must NOT contain is_active = TRUE, got: ${mainBranchQuery.sql}`,
    );
  });

  test('P0-LOCK-2: completeSaleTx locks stock rows in deterministic ascending product-ID order regardless of cart line order', async () => {
    const mock = createMockSaleClient();
    const dto: CompleteSaleDto = {
      branch_id: 'b1',
      customer_id: null,
      items: [
        { product_id: 'zeta-prod-99', quantity: 1 },
        { product_id: 'alpha-prod-01', quantity: 2 },
        { product_id: 'mid-prod-50', quantity: 1 },
      ],
      payments: [{ method: 'CASH', amount: 800 }],
    };

    await completeSaleTx(mock as unknown as PoolClient, dto, 'u1', null, 'b1', false);

    assert.deepStrictEqual(
      mock.lockedProductIds,
      ['alpha-prod-01', 'mid-prod-50', 'zeta-prod-99'],
      `stock locks must be acquired in ascending lexicographical product-ID order, got: ${JSON.stringify(mock.lockedProductIds)}`,
    );
  });

  test('P0-LOCK-3: completeSaleTx aggregates duplicate cart lines and locks once with combined quantity', async () => {
    const mock = createMockSaleClient();
    const dto: CompleteSaleDto = {
      branch_id: 'b1',
      customer_id: null,
      items: [
        { product_id: 'prod-dup', quantity: 3 },
        { product_id: 'prod-other', quantity: 1 },
        { product_id: 'prod-dup', quantity: 2 },
      ],
      payments: [{ method: 'CASH', amount: 1200 }],
    };

    await completeSaleTx(mock as unknown as PoolClient, dto, 'u1', null, 'b1', false);

    const dupLockCount = mock.lockedProductIds.filter(id => id === 'prod-dup').length;
    assert.strictEqual(dupLockCount, 1, 'duplicate product must only be locked once FOR UPDATE');

    assert.deepStrictEqual(
      mock.lockedProductIds,
      ['prod-dup', 'prod-other'],
      'all unique product IDs must be locked in sorted order',
    );
  });
});

// ---------------------------------------------------------------------------
// ============================================================
// P1a — Week-to-date metrics (PKT timezone) — UNIT
// ============================================================
// These tests exercise the date-math logic directly without a database.
// ---------------------------------------------------------------------------

describe('P1a — Week-to-date PKT timezone logic (unit)', () => {

  /**
   * Mirrors the week-boundary calculation from getDashboardProfitSummary in profit.repo.ts.
   * Reproduced here for deterministic unit testing with a fixed clock.
   */
  function computeWeekBoundaries(nowUtcMs: number): { weekStartUtc: Date; todayStartUtc: Date } {
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const pktMs = nowUtcMs + PKT_OFFSET_MS;
    const pktDate = new Date(pktMs);

    const pktYear  = pktDate.getUTCFullYear();
    const pktMonth = pktDate.getUTCMonth();
    const pktDay   = pktDate.getUTCDate();

    const todayStartUtc = new Date(
      Date.UTC(pktYear, pktMonth, pktDay, 0, 0, 0, 0) - PKT_OFFSET_MS
    );

    // Monday=0 … Sunday=6 via (getUTCDay()+6)%7
    const pktDayOfWeek = pktDate.getUTCDay();
    const daysSinceMonday = (pktDayOfWeek + 6) % 7;
    const weekStartUtc = new Date(
      Date.UTC(pktYear, pktMonth, pktDay - daysSinceMonday, 0, 0, 0, 0) - PKT_OFFSET_MS
    );

    return { weekStartUtc, todayStartUtc };
  }

  test('P1a-1: Monday PKT → week starts on that same Monday', () => {
    // 2024-01-15 (Monday) 08:00 PKT = 03:00 UTC
    const mondayUtc = Date.UTC(2024, 0, 15, 3, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(mondayUtc);
    // Week start = 2024-01-15 00:00 PKT = 2024-01-14 19:00 UTC
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-2: Sunday PKT → week starts on previous Monday', () => {
    // 2024-01-21 (Sunday) 12:00 PKT = 07:00 UTC
    const sundayUtc = Date.UTC(2024, 0, 21, 7, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(sundayUtc);
    // Week start = Mon 2024-01-15 00:00 PKT = Sun 2024-01-14 19:00 UTC
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-3: Tuesday PKT → week starts on the previous Monday', () => {
    // 2024-01-16 (Tuesday) 10:00 PKT = 05:00 UTC
    const tuesdayUtc = Date.UTC(2024, 0, 16, 5, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(tuesdayUtc);
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-4: Saturday PKT → week starts on Monday 5 days earlier', () => {
    // 2024-01-20 (Saturday) 14:00 PKT = 09:00 UTC
    const saturdayUtc = Date.UTC(2024, 0, 20, 9, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(saturdayUtc);
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-5: month-boundary rollover — week straddles Feb→Mar', () => {
    // 2024-03-01 (Friday) 06:00 PKT = 01:00 UTC; week started 2024-02-26 (Monday)
    const fridayUtc = Date.UTC(2024, 2, 1, 1, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(fridayUtc);
    // Mon 2024-02-26 00:00 PKT = Sun 2024-02-25 19:00 UTC
    assert.strictEqual(weekStartUtc.toISOString(), '2024-02-25T19:00:00.000Z');
  });

  test('P1a-6: year-boundary rollover — Sunday in last week of 2023', () => {
    // 2023-12-31 (Sunday) 08:00 PKT = 03:00 UTC; week started 2023-12-25 (Monday)
    const newYearsEveUtc = Date.UTC(2023, 11, 31, 3, 0, 0, 0);
    const { weekStartUtc } = computeWeekBoundaries(newYearsEveUtc);
    // Mon 2023-12-25 00:00 PKT = Sun 2023-12-24 19:00 UTC
    assert.strictEqual(weekStartUtc.toISOString(), '2023-12-24T19:00:00.000Z');
  });

  test('P1a-7: 23:59 PKT still within the same PKT calendar day', () => {
    // Mon 2024-01-15 23:59 PKT = 18:59 UTC
    const nearMidnightUtc = Date.UTC(2024, 0, 15, 18, 59, 0, 0);
    const { todayStartUtc, weekStartUtc } = computeWeekBoundaries(nearMidnightUtc);
    // todayStart = Mon 2024-01-15 00:00 PKT = Sun 2024-01-14 19:00 UTC
    assert.strictEqual(todayStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
    // weekStart same as Monday
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-8: 00:01 PKT next day uses next-day date', () => {
    // Tue 2024-01-16 00:01 PKT = Mon 2024-01-15 19:01 UTC
    const justAfterMidnightUtc = Date.UTC(2024, 0, 15, 19, 1, 0, 0);
    const { todayStartUtc, weekStartUtc } = computeWeekBoundaries(justAfterMidnightUtc);
    // todayStart = Tue 2024-01-16 00:00 PKT = Mon 2024-01-15 19:00 UTC
    assert.strictEqual(todayStartUtc.toISOString(), '2024-01-15T19:00:00.000Z');
    // weekStart still Mon 2024-01-15 00:00 PKT = Sun 2024-01-14 19:00 UTC
    assert.strictEqual(weekStartUtc.toISOString(), '2024-01-14T19:00:00.000Z');
  });

  test('P1a-9: getDashboardProfitSummary returns a this_week field', async () => {
    // Structural check: the function must exist and export this_week in the return shape.
    // We call with a dummy pool that returns 0 rows — we only need to verify the shape.
    const stubPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const summary = await getDashboardProfitSummary(stubPool, null);
    assert.ok('this_week' in summary, 'summary has this_week field');
    assert.ok('gross_revenue' in summary.this_week, 'this_week.gross_revenue present');
    assert.ok('orders_count' in summary.this_week, 'this_week.orders_count present');
  });

  test('P1a-10: sales.service.ts does NOT compute weekly revenue as monthly÷4', () => {
    const salesServicePath = resolve(
      __dirname,
      '../../../frontend/src/features/sales/services/sales.service.ts'
    );
    let src: string;
    try {
      src = readFileSync(salesServicePath, 'utf-8');
    } catch {
      // Frontend not accessible from backend test environment
      console.warn('  SKIP (file not accessible): sales.service.ts path not reachable from backend test runner');
      return;
    }
    // The divide-by-4 anti-pattern must not exist for this_week revenue
    const divideByFourPattern = /this_week[\s\S]{0,300}Math\.round[\s\S]{0,200}\/\s*4/;
    assert.ok(
      !divideByFourPattern.test(src),
      'sales.service.ts must not derive weekly revenue by dividing monthly revenue by 4',
    );
  });

}); // end P1a unit

// ---------------------------------------------------------------------------
// ============================================================
// P1a — Week-to-date metrics — INTEGRATION
// ============================================================
// ---------------------------------------------------------------------------

describe('P1a — Week-to-date metrics (integration)', () => {

  test('P1a-11: this_week gross_revenue increases by the exact amount of a current-week sale', async () => {
    if (!requireDb('P1a-11')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const before = await getDashboardProfitSummary(pool, BRANCH_A);

      const ikey = `p1a-11-${uuidv4()}`;
      const result = await completeSale(
        pool,
        makeSaleDto({
          idempotency_key: ikey,
          items: [{ product_id: PROD_X, quantity: 2 }],
          payments: [{ method: 'CASH', amount: 2000 }],
        }),
        USER_A, BRANCH_A, false,
      );

      const after = await getDashboardProfitSummary(pool, BRANCH_A);

      const weekDelta = after.this_week.gross_revenue - before.this_week.gross_revenue;
      // Product sale_price=1000, qty=2 → total=2000
      assert.ok(
        Math.abs(weekDelta - result.sale.total_amount) < 2,
        `this_week delta (${weekDelta}) should equal sale total (${result.sale.total_amount})`,
      );
      // total should also increase
      assert.ok(
        after.total.gross_revenue >= before.total.gross_revenue + result.sale.total_amount - 1,
        'total.gross_revenue also reflects the new sale',
      );
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  test('P1a-12: last-week sale is excluded from this_week but included in total', async () => {
    if (!requireDb('P1a-12')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    const oldSaleId = id('old-sale-p1a12');
    try {
      const before = await getDashboardProfitSummary(pool, BRANCH_A);

      // Insert a sale with created_at 8 days ago (outside current week boundary)
      const lastWeekDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await pool.query(
        `INSERT INTO sales
           (id, invoice_number, branch_id, performed_by, subtotal, discount, tax_amount,
            total_amount, paid_amount, change_amount, payment_status, sale_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 5000, 0, 0, 5000, 5000, 0, 'PAID', 'COMPLETED', $5, $5)`,
        [oldSaleId, `OLD-${RUN_PREFIX}`, BRANCH_A, USER_A, lastWeekDate],
      );

      const after = await getDashboardProfitSummary(pool, BRANCH_A);

      const weekDelta  = after.this_week.gross_revenue - before.this_week.gross_revenue;
      const totalDelta = after.total.gross_revenue     - before.total.gross_revenue;

      // The old sale (5000) MUST NOT appear in this_week
      assert.ok(weekDelta < 5000, `this_week should not include last-week sale (delta=${weekDelta})`);

      // The old sale MUST appear in total
      assert.ok(totalDelta >= 4999, `total should include old sale (delta=${totalDelta})`);
    } finally {
      await pool.query('DELETE FROM sales WHERE id = $1', [oldSaleId]);
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

}); // end P1a integration

// ---------------------------------------------------------------------------
// ============================================================
// P1b — Branch-correct financial history — STRUCTURAL
// ============================================================
// ---------------------------------------------------------------------------

describe('P1b — History repository (structural, no DB)', () => {

  const historyRepoPath = existsSync(resolve(__dirname, '../repositories/history.repo.ts'))
    ? resolve(__dirname, '../repositories/history.repo.ts')
    : resolve(__dirname, '../../src/repositories/history.repo.ts');

  test('P1b-1: history.repo.ts joins cash_movements for branch-filtered customer/supplier payments', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    // Must contain a JOIN against cash_movements (for branch attribution of payments)
    const hasJoin = /JOIN\s+cash_movements/i.test(src);
    assert.ok(hasJoin, 'history.repo.ts must JOIN cash_movements for branch attribution');
  });

  test('P1b-1a: history.repo.ts attributes non-cash payments using users.branch_id via performed_by', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    const hasUserAttribution = /LEFT\s+JOIN\s+users\s+u\s+ON\s+u\.id\s*=\s*cle\.performed_by/i.test(src);
    assert.ok(hasUserAttribution, 'history.repo.ts must join users on cle.performed_by for non-cash payment attribution');
  });

  test('P1b-1b: HistoryStats interface includes totalPurchases', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    assert.ok(/totalPurchases/.test(src), 'HistoryStats.totalPurchases defined');
  });

  test('P1b-2: history.repo.ts does not assign a hardcoded MAIN branch to payment records', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    // Hardcoded MAIN branch assignment would bypass real branch attribution
    const hardcodedMain = /branch_id\s*=\s*['"]MAIN['"]/i.test(src);
    assert.ok(!hardcodedMain, 'must not hardcode branch_id = MAIN in history queries');
  });

  test('P1b-3: HistoryStats interface distinguishes totalSales, totalExpenses, pendingPayments', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    assert.ok(/totalSales/.test(src), 'HistoryStats.totalSales defined');
    assert.ok(/totalExpenses/.test(src), 'HistoryStats.totalExpenses defined');
    assert.ok(/pendingPayments/.test(src), 'HistoryStats.pendingPayments defined');
  });

  test('P1b-4: UNION ALL branches use only parameterized queries (no branch_id string interpolation)', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    // SQL string interpolation with branch_id would be a SQL injection risk
    const dangerousInterpolation = /`[^`]*\$\{[^}]*branch_id[^}]*\}[^`]*`/.test(src);
    assert.ok(!dangerousInterpolation, 'must not interpolate branch_id directly into SQL template literals');
  });

  test('P1b-5: UNION ALL count is less than total SELECT count (each UNION arm has a SELECT)', () => {
    const src = readFileSync(historyRepoPath, 'utf-8');
    const unionAllCount = (src.match(/UNION\s+ALL/gi) ?? []).length;
    const selectCount   = (src.match(/\bSELECT\b/gi) ?? []).length;
    if (unionAllCount > 0) {
      assert.ok(
        selectCount > unionAllCount,
        `SELECT count (${selectCount}) should exceed UNION ALL count (${unionAllCount})`,
      );
    }
    // If no UNION ALL, the test is vacuously satisfied — still valid
  });

}); // end P1b structural

// ---------------------------------------------------------------------------
// ============================================================
// P1b — Branch history — INTEGRATION
// ============================================================
// ---------------------------------------------------------------------------

describe('P1b — History branch attribution (integration)', () => {

  test('P1b-6: BRANCH_A sale appears in BRANCH_A history but not BRANCH_B history', async () => {
    if (!requireDb('P1b-6')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const ikey = `p1b-6-${uuidv4()}`;
      const result = await completeSale(pool, makeSaleDto({ idempotency_key: ikey }), USER_A, BRANCH_A, false);
      const saleId = result.sale.id;

      const histA = await listHistoryItems(pool, { branch_id: BRANCH_A, limit: 200 });
      const histB = await listHistoryItems(pool, { branch_id: BRANCH_B, limit: 200 });

      const idsA = histA.data.map((h) => h.id);
      const idsB = histB.data.map((h) => h.id);

      assert.ok(idsA.includes(saleId), `BRANCH_A sale (${saleId}) must appear in BRANCH_A history`);
      assert.ok(!idsB.includes(saleId), `BRANCH_A sale (${saleId}) must NOT appear in BRANCH_B history`);
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  test('P1b-7: unfiltered history includes both BRANCH_A and BRANCH_B events without double-counting', async () => {
    if (!requireDb('P1b-7')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      // Open cash session for BRANCH_B
      const now = new Date().toISOString();
      const sessionBId = id('csess-b-p1b7');
      await pool.query(
        `INSERT INTO cash_sessions (id, branch_id, opened_by, status, opening_cash, opened_at, business_date)
         VALUES ($1, $2, $3, 'OPEN', 0, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [sessionBId, BRANCH_B, USER_A, now, now.slice(0, 10)],
      );

      const ikA = `p1b-7-a-${uuidv4()}`;
      const ikB = `p1b-7-b-${uuidv4()}`;
      const resultA = await completeSale(pool, makeSaleDto({ idempotency_key: ikA }), USER_A, BRANCH_A, false);
      const resultB = await completeSale(pool,
        { ...makeSaleDto({ idempotency_key: ikB }), branch_id: BRANCH_B },
        USER_A, BRANCH_B, true,
      );

      const histAll = await listHistoryItems(pool, { limit: 500 });
      const idsAll = histAll.data.map((h) => h.id);

      assert.ok(idsAll.includes(resultA.sale.id), 'unfiltered history contains BRANCH_A sale');
      assert.ok(idsAll.includes(resultB.sale.id), 'unfiltered history contains BRANCH_B sale');

      // No duplicates: each ID appears exactly once
      const countA = idsAll.filter((id: string) => id === resultA.sale.id).length;
      const countB = idsAll.filter((id: string | undefined) => id === resultB.sale.id).length;
      assert.strictEqual(countA, 1, 'BRANCH_A sale appears exactly once in unfiltered history');
      assert.strictEqual(countB, 1, 'BRANCH_B sale appears exactly once in unfiltered history');

      // Cleanup extra session
      await pool.query('DELETE FROM cash_sessions WHERE id = $1', [sessionBId]);
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  test('P1b-8: non-cash customer payment attributes to branch via performed_by and appears in branch history', async () => {
    if (!requireDb('P1b-8')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const payId = uuidv4();
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
         VALUES ($1, $2, $3, $4, 'PAYMENT', 0, 500, 500, 'Bank Transfer Payment', $5, $6)`,
        [payId, CUST_1, payId, 'RCP-BANK-1', USER_A, now]
      );

      const histA = await listHistoryItems(pool, { branch_id: BRANCH_A, limit: 100 });
      const histB = await listHistoryItems(pool, { branch_id: BRANCH_B, limit: 100 });
      const histAll = await listHistoryItems(pool, { limit: 100 });

      const idsA = histA.data.map(h => h.id);
      const idsB = histB.data.map(h => h.id);
      const idsAll = histAll.data.map(h => h.id);

      assert.ok(idsA.includes(payId), 'non-cash payment appears in BRANCH_A history (attributed via USER_A branch)');
      assert.ok(!idsB.includes(payId), 'non-cash payment does NOT appear in BRANCH_B history');
      assert.ok(idsAll.includes(payId), 'non-cash payment appears in unfiltered history');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

  test('P1b-9: getHistoryStats includes totalPurchases', async () => {
    if (!requireDb('P1b-9')) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await setupFixtures(client); await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); client.release(); throw e; }
    client.release();

    try {
      const stats = await getHistoryStats(pool, BRANCH_A);
      assert.ok('totalPurchases' in stats, 'getHistoryStats returns totalPurchases');
      assert.strictEqual(typeof stats.totalPurchases, 'number', 'totalPurchases is a number');
    } finally {
      const c2 = await pool.connect();
      try { await c2.query('BEGIN'); await teardownFixtures(c2); await c2.query('COMMIT'); }
      finally { c2.release(); }
    }
  });

}); // end P1b integration
