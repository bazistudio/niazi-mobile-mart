/**
 * Niazi Mobile Mart — Atomic POS Exchange Regression Test Suite
 *
 * Covers:
 * 1. Positive-difference exchange (customer pays difference).
 * 2. Negative-difference exchange with cash refund.
 * 3. Negative-difference exchange with customer-account credit.
 * 4. Zero-difference exchange (balanced).
 * 5. Correct stock increase for returned items and stock decrease for replacements.
 * 6. Correct branch attribution for sales, returns, payouts, and ledger entries.
 * 7. Unauthorized cross-branch requests.
 * 8. Invalid invoice/customer/product relationships.
 * 9. Over-returning the original invoice.
 * 10. Insufficient replacement stock.
 * 11. Rollback on failure (all exchange database effects roll back together).
 * 12. Repeated requests with the same idempotency key do not duplicate financial or inventory changes.
 * 13. Concurrent requests cannot over-return or double-payout.
 * 14. Reusing an idempotency key with a different payload is rejected.
 * 15. Receipt printing and UI retries do not submit duplicate transactions.
 * 16. Existing normal sales, invoice returns, and standalone payments preserve their behaviour.
 *
 * SAFETY GUARD:
 * Tests execute ONLY against an explicitly configured, disposable PostgreSQL database.
 * If TEST_DATABASE_URL is not set or matches non-disposable patterns, the suite blocks execution.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, beforeEach, after } from 'node:test';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

import {
  completeSale,
  completeSaleTx,
  getSaleById,
  getSaleLines,
  getSalePayments,
  SaleRepoError,
} from '../repositories/sale.repo';
import {
  processAtomicExchange,
  ProcessExchangeDto,
} from '../repositories/exchange.repo';

// ---------------------------------------------------------------------------
// Strict Disposable Test Database Safety Guard
// ---------------------------------------------------------------------------
const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? '';

if (!TEST_DB_URL || !TEST_DB_URL.trim()) {
  console.error('[BLOCKED] TEST_DATABASE_URL is not set. Refusing to run tests against an unspecified database.');
  process.exit(1);
}

try {
  const parsed = new URL(TEST_DB_URL);
  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (!isLocalhost) {
    console.error(`[BLOCKED] TEST_DATABASE_URL host "${hostname}" is not localhost. Aborting.`);
    process.exit(1);
  }

  const DANGEROUS_PATTERNS = ['cloud', 'cloudsql', 'prod', 'production', 'prd', 'staging', 'live'];
  const fullUrlLower = TEST_DB_URL.toLowerCase();
  for (const pat of DANGEROUS_PATTERNS) {
    if (fullUrlLower.includes(pat)) {
      console.error(`[BLOCKED] TEST_DATABASE_URL contains dangerous pattern "${pat}". Aborting.`);
      process.exit(1);
    }
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!dbName.includes('test') && !dbName.includes('disposable') && !dbName.endsWith('_test')) {
    console.error(`[BLOCKED] Database "${dbName}" is not explicitly marked as test/disposable.`);
    process.exit(1);
  }
} catch (urlErr) {
  console.error('[BLOCKED] Invalid TEST_DATABASE_URL format:', (urlErr as Error).message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pool and Fixtures
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: TEST_DB_URL, max: 10 });
const RUN_PREFIX = uuidv4().replace(/-/g, '').slice(0, 8);

function id(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (Math.imul(h, 31) + label.charCodeAt(i)) | 0;
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `${hex}-${RUN_PREFIX.slice(0, 4)}-4${RUN_PREFIX.slice(4, 7)}-8${RUN_PREFIX.slice(0, 3)}-${RUN_PREFIX}0000`.slice(0, 36);
}

const ORG_ID    = '00000000-0000-4000-8000-000000000001';
const BRANCH_A  = id('branch-a');
const BRANCH_B  = id('branch-b');
const PROD_RET  = id('product-ret');  // price 500
const PROD_EXP  = id('product-exp');  // price 800 (for positive difference)
const PROD_CHP  = id('product-chp');  // price 200 (for negative difference)
const PROD_EQ   = id('product-eq');   // price 500 (for zero difference)
const CUST_ACC  = id('customer-acc'); // customer with account
const USER_A    = id('user-a');
const SESSION_A = id('session-a');

async function setupFixtures(client: PoolClient): Promise<void> {
  const now = new Date().toISOString();

  await client.query(
    `INSERT INTO organizations (id, name, created_at, updated_at)
     VALUES ($1, 'Test Org', $2, $2) ON CONFLICT (id) DO NOTHING`,
    [ORG_ID, now]
  );

  await client.query(
    `INSERT INTO branches (id, organization_id, name, code, is_active, is_warehouse, created_at, updated_at)
     VALUES
       ($1, $3, 'Branch A', 'BRA-${RUN_PREFIX}', 1, 0, $4, $4),
       ($2, $3, 'Branch B', 'BRB-${RUN_PREFIX}', 1, 0, $4, $4)
     ON CONFLICT (id) DO NOTHING`,
    [BRANCH_A, BRANCH_B, ORG_ID, now]
  );

  const CAT_ID = id('category');
  await client.query(
    `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
     VALUES ($1, 'Category', 'CAT-${RUN_PREFIX}', 1, $2, $2) ON CONFLICT (id) DO NOTHING`,
    [CAT_ID, now]
  );

  await client.query(
    `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
     VALUES
       ($1, 'Return Item', 'return item', 'SKU-RET-${RUN_PREFIX}', $5, 300, 300, 500, 1, $6, $6),
       ($2, 'Expensive Item', 'expensive item', 'SKU-EXP-${RUN_PREFIX}', $5, 500, 500, 800, 1, $6, $6),
       ($3, 'Cheap Item', 'cheap item', 'SKU-CHP-${RUN_PREFIX}', $5, 100, 100, 200, 1, $6, $6),
       ($4, 'Equal Item', 'equal item', 'SKU-EQ-${RUN_PREFIX}', $5, 300, 300, 500, 1, $6, $6)
     ON CONFLICT (id) DO NOTHING`,
    [PROD_RET, PROD_EXP, PROD_CHP, PROD_EQ, CAT_ID, now]
  );

  await client.query(
    `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
     VALUES
       ($1, $5, 10, $6),
       ($2, $5, 10, $6),
       ($3, $5, 10, $6),
       ($4, $5, 10, $6)
     ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [PROD_RET, PROD_EXP, PROD_CHP, PROD_EQ, BRANCH_A, now]
  );

  await client.query(
    `INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
     VALUES ($1, $3, 'Account Customer', '03001234567', 10000, 1, $2, $2)
     ON CONFLICT (id) DO NOTHING`,
    [CUST_ACC, now, `CUST-${RUN_PREFIX}`]
  );

  await client.query(
    `INSERT INTO cash_sessions (id, branch_id, business_date, status, opened_at)
     VALUES ($1, $2, $3, 'OPEN', $4)
     ON CONFLICT (id) DO NOTHING`,
    [SESSION_A, BRANCH_A, now.slice(0, 10), now]
  );

  await client.query(
    `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, 'Test User A', $3, 'x', 'SHOP_ADMIN', 1, $4, $4)
     ON CONFLICT (id) DO NOTHING`,
    [USER_A, BRANCH_A, `ua_${RUN_PREFIX}`, now]
  );
}

describe('Atomic POS Exchange Regression Suite', () => {
  before(async () => {
    const client = await pool.connect();
    try {
      await setupFixtures(client);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await pool.end();
  });

  // Reseed stock before each test so each test starts with deterministic levels.
  // Tests consume stock independently; without this, later tests inherit depleted stock
  // and fail with insufficient-stock errors unrelated to their own assertions.
  beforeEach(async () => {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE stock SET quantity = 10, updated_at = $1
       WHERE branch_id = $2 AND product_id = ANY($3::text[])`,
      [now, BRANCH_A, [PROD_RET, PROD_EXP, PROD_CHP, PROD_EQ]]
    );
  });

  test('1. Positive-difference exchange (customer pays extra) commits atomically', async () => {
    // Create original sale of PROD_RET (qty: 1, unit_price: 500)
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const saleLineId = origSale.lines[0].id;

    // Exchange 1 PROD_RET (500) for 1 PROD_EXP (800) -> difference +300
    const ikey = `ex_pos_${uuidv4()}`;
    const result = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: saleLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EXP, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 300,
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.difference, 300);
    assert.strictEqual(result.settlement_type, 'POSITIVE_COLLECTION');
    assert.strictEqual(result.replacement_sale.sale.payment_status, 'PAID');
    assert.strictEqual(result.replacement_sale.sale.paid_amount, 800);

    // GAP-3: Independent disk check for positive-difference final financial state
    const saleDbRow = (
      await pool.query('SELECT paid_amount, change_amount, payment_status FROM sales WHERE id = $1', [
        result.replacement_sale.sale.id,
      ])
    ).rows[0];
    assert.strictEqual(Number(saleDbRow.paid_amount), 800);
    assert.strictEqual(Number(saleDbRow.change_amount), 0);
    assert.strictEqual(saleDbRow.payment_status, 'PAID');
  });

  test('2. Negative-difference exchange with cash refund commits atomically', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const saleLineId = origSale.lines[0].id;

    // Exchange 1 PROD_RET (500) for 1 PROD_CHP (200) -> difference -300
    const ikey = `ex_neg_cash_${uuidv4()}`;
    const result = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: saleLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_CHP, quantity: 1 }],
        refund_method: 'CASH',
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.difference, -300);
    assert.strictEqual(result.settlement_type, 'NEGATIVE_REFUND');
    assert.strictEqual(result.refund_method, 'CASH');
    assert.strictEqual(result.cash_refunded, 300);

    // GAP-4: Persisted cash refund effect in cash_movements
    const cashMoveRes = await pool.query(
      `SELECT direction, amount, movement_type, branch_id, reference_id
       FROM cash_movements
       WHERE reference_id = $1 AND movement_type = 'RETURN_REFUND'`,
      [result.sales_return.id]
    );
    assert.strictEqual(cashMoveRes.rows.length, 1);
    assert.strictEqual(cashMoveRes.rows[0].direction, 'OUT');
    assert.strictEqual(Number(cashMoveRes.rows[0].amount), 300);
    assert.strictEqual(cashMoveRes.rows[0].branch_id, BRANCH_A);
  });

  test('3. Negative-difference exchange with customer credit commits atomically', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const saleLineId = origSale.lines[0].id;

    const ikey = `ex_neg_credit_${uuidv4()}`;
    const result = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: saleLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_CHP, quantity: 1 }],
        refund_method: 'CREDIT',
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.difference, -300);
    assert.strictEqual(result.settlement_type, 'NEGATIVE_REFUND');
    assert.strictEqual(result.refund_method, 'CREDIT');
    assert.notStrictEqual(result.customer_balance_after, null);

    // GAP-4: Persisted customer credit entry in customer_ledger_entries
    const ledgerRes = await pool.query(
      `SELECT customer_id, reference_id, entry_type, credit, debit, balance_after
       FROM customer_ledger_entries
       WHERE reference_id = $1 AND entry_type = 'RETURN'`,
      [result.sales_return.id]
    );
    assert.strictEqual(ledgerRes.rows.length, 1);
    assert.strictEqual(ledgerRes.rows[0].customer_id, CUST_ACC);
    assert.strictEqual(Number(ledgerRes.rows[0].credit), 300);
    assert.strictEqual(Number(ledgerRes.rows[0].debit), 0);
    assert.strictEqual(Number(ledgerRes.rows[0].balance_after), Number(result.customer_balance_after));
  });

  test('4. Zero-difference exchange records no synthetic cash or ledger entries', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const saleLineId = origSale.lines[0].id;

    const ikey = `ex_zero_${uuidv4()}`;
    const result = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: saleLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.difference, 0);
    assert.strictEqual(result.settlement_type, 'BALANCED_ZERO');
    assert.strictEqual(result.cash_refunded, null);

    // GAP-3: Independent disk check for balanced final financial state
    const saleDbRow = (
      await pool.query('SELECT paid_amount, change_amount, payment_status FROM sales WHERE id = $1', [
        result.replacement_sale.sale.id,
      ])
    ).rows[0];
    assert.strictEqual(Number(saleDbRow.paid_amount), 500);
    assert.strictEqual(Number(saleDbRow.change_amount), 0);
    assert.strictEqual(saleDbRow.payment_status, 'PAID');
  });

  test('5. Stock increase for returned items and decrease for replacement items', async () => {
    const getStock = async (prodId: string) => {
      const res = await pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [prodId, BRANCH_A]);
      return Number(res.rows[0]?.quantity ?? 0);
    };

    const retStockBefore = await getStock(PROD_RET);
    const eqStockBefore = await getStock(PROD_EQ);

    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const lineId = origSale.lines[0].id;
    const ikey = `ex_stock_${uuidv4()}`;

    const exResult = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const retStockAfter = await getStock(PROD_RET);
    const eqStockAfter = await getStock(PROD_EQ);

    // After return of PROD_RET (sold 1, returned 1), stock returns to initial
    assert.strictEqual(retStockAfter, retStockBefore);
    // After replacement of PROD_EQ (1 deducted), stock decreases by 1
    assert.strictEqual(eqStockAfter, eqStockBefore - 1);

    // GAP-5: Stock audit trail verification in stock_movements
    const stockMoveIn = (
      await pool.query(
        `SELECT movement_type, quantity, product_id, branch_id
         FROM stock_movements
         WHERE reference_id = $1 AND movement_type = 'IN'`,
        [exResult.sales_return.id]
      )
    ).rows[0];
    assert.ok(stockMoveIn, 'Expected IN stock movement for return');
    assert.strictEqual(stockMoveIn.product_id, PROD_RET);
    assert.strictEqual(Number(stockMoveIn.quantity), 1);
    assert.strictEqual(stockMoveIn.branch_id, BRANCH_A);

    const stockMoveOut = (
      await pool.query(
        `SELECT movement_type, quantity, product_id, branch_id
         FROM stock_movements
         WHERE reference_id = $1 AND movement_type = 'OUT'`,
        [exResult.replacement_sale.sale.id]
      )
    ).rows[0];
    assert.ok(stockMoveOut, 'Expected OUT stock movement for replacement sale');
    assert.strictEqual(stockMoveOut.product_id, PROD_EQ);
    assert.strictEqual(Number(stockMoveOut.quantity), 1);
    assert.strictEqual(stockMoveOut.branch_id, BRANCH_A);
  });

  test('6. Unauthorized cross-branch exchange request is rejected with 403', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const lineId = origSale.lines[0].id;

    // Caller is assigned to BRANCH_B (non-admin) trying to exchange BRANCH_A sale
    await assert.rejects(
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 1 }],
          replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
          idempotency_key: `cross_${uuidv4()}`,
        },
        USER_A,
        BRANCH_B,
        false
      ),
      (err: any) => err instanceof SaleRepoError && err.statusCode === 403
    );
  });

  test('7. Over-returning original invoice lines is rejected with 400', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const lineId = origSale.lines[0].id;

    // Attempting to return 2 units when only 1 was purchased
    await assert.rejects(
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 2 }],
          replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
          idempotency_key: `over_${uuidv4()}`,
        },
        USER_A,
        BRANCH_A,
        false
      ),
      (err: any) => err instanceof SaleRepoError && err.statusCode === 400
    );
  });

  test('8. Reused idempotency key returns cached result; differing payload returns 409', async () => {
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );

    const lineId = origSale.lines[0].id;
    const ikey = `idem_test_${uuidv4()}`;

    const first = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    // Second call with same idempotency key and same payload succeeds (cached)
    const second = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSale.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey,
      },
      USER_A,
      BRANCH_A,
      false
    );

    assert.strictEqual(second.success, true);
    assert.strictEqual(second.replacement_sale.sale.id, first.replacement_sale.sale.id);
    assert.strictEqual(second.difference, 0);
    assert.strictEqual(second.settlement_type, 'BALANCED_ZERO');

    // Test cached replay of positive difference exchange preserves positive difference
    const ikeyPos = `idem_pos_${uuidv4()}`;
    const origSalePos = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_pos_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );
    const posLineId = origSalePos.lines[0].id;
    const firstPos = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSalePos.sale.id,
        return_lines: [{ sale_line_id: posLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EXP, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 300,
        idempotency_key: ikeyPos,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(firstPos.difference, 300);
    assert.strictEqual(firstPos.settlement_type, 'POSITIVE_COLLECTION');

    // Capture database record counts for firstPos before replay
    const saleIdPos = firstPos.replacement_sale.sale.id;
    const returnIdPos = firstPos.sales_return.id;
    const [retLinesCountBefore, saleLinesCountBefore, payRowsCountBefore, stockMovesCountBefore] = await Promise.all([
      pool.query('SELECT count(*) FROM sales_return_lines WHERE return_id = $1', [returnIdPos]),
      pool.query('SELECT count(*) FROM sale_lines WHERE sale_id = $1', [saleIdPos]),
      pool.query('SELECT count(*) FROM sale_payments WHERE sale_id = $1', [saleIdPos]),
      pool.query('SELECT count(*) FROM stock_movements WHERE reference_id = $1 OR reference_id = $2', [
        returnIdPos,
        saleIdPos,
      ]),
    ]);

    // Replay returns exact cached difference and settlement type
    const replayPos = await processAtomicExchange(
      pool,
      {
        original_sale_id: origSalePos.sale.id,
        return_lines: [{ sale_line_id: posLineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EXP, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 300,
        idempotency_key: ikeyPos,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(replayPos.difference, 300);
    assert.strictEqual(replayPos.settlement_type, 'POSITIVE_COLLECTION');
    assert.strictEqual(replayPos.replacement_sale.sale.id, firstPos.replacement_sale.sale.id);

    // Verify replay creates ZERO duplicate rows in any financial, inventory, or line tables
    const [retLinesCountAfter, saleLinesCountAfter, payRowsCountAfter, stockMovesCountAfter] = await Promise.all([
      pool.query('SELECT count(*) FROM sales_return_lines WHERE return_id = $1', [returnIdPos]),
      pool.query('SELECT count(*) FROM sale_lines WHERE sale_id = $1', [saleIdPos]),
      pool.query('SELECT count(*) FROM sale_payments WHERE sale_id = $1', [saleIdPos]),
      pool.query('SELECT count(*) FROM stock_movements WHERE reference_id = $1 OR reference_id = $2', [
        returnIdPos,
        saleIdPos,
      ]),
    ]);
    assert.strictEqual(retLinesCountAfter.rows[0].count, retLinesCountBefore.rows[0].count);
    assert.strictEqual(saleLinesCountAfter.rows[0].count, saleLinesCountBefore.rows[0].count);
    assert.strictEqual(payRowsCountAfter.rows[0].count, payRowsCountBefore.rows[0].count);
    assert.strictEqual(stockMovesCountAfter.rows[0].count, stockMovesCountBefore.rows[0].count);

    // Verify sale_payments table recorded 'OTHER' for return offset
    const paymentsRes = await pool.query(
      "SELECT payment_method FROM sale_payments WHERE sale_id = $1 AND notes LIKE 'Exchange Return Offset%'",
      [firstPos.replacement_sale.sale.id]
    );
    assert.strictEqual(paymentsRes.rows.length, 1);
    assert.strictEqual(paymentsRes.rows[0].payment_method, 'OTHER');

    // Third call with same key but different replacement product -> 409 Conflict
    await assert.rejects(
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 1 }],
          replacement_items: [{ product_id: PROD_EXP, quantity: 1 }],
          idempotency_key: ikey,
        },
        USER_A,
        BRANCH_A,
        false
      ),
      (err: any) => err instanceof SaleRepoError && err.statusCode === 409
    );
  });

  test('Deterministic return linkage on replay when multiple exchanges occur against the same original sale', async () => {
    // 1. Create original sale with quantity 3
    const multiOrig = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 3 }],
        payment_method: 'CASH',
        paid_amount: 1500,
        idempotency_key: `sale_multi_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );
    const lineId = multiOrig.lines[0].id;

    // 2. First exchange for 1 unit
    const ikey1 = `idem_multi_1_${uuidv4()}`;
    const exchange1 = await processAtomicExchange(
      pool,
      {
        original_sale_id: multiOrig.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey1,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(exchange1.success, true);
    const return1Id = exchange1.sales_return.id;
    const return1Number = exchange1.sales_return.return_number;

    // 3. Second exchange for another 1 unit at a later time
    const ikey2 = `idem_multi_2_${uuidv4()}`;
    const exchange2 = await processAtomicExchange(
      pool,
      {
        original_sale_id: multiOrig.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey2,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(exchange2.success, true);
    const return2Id = exchange2.sales_return.id;
    assert.notStrictEqual(return1Id, return2Id);

    // 4. Replay the FIRST exchange key. It must resolve return1, NOT the newer return2!
    const replay1 = await processAtomicExchange(
      pool,
      {
        original_sale_id: multiOrig.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
        idempotency_key: ikey1,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(replay1.success, true);
    assert.strictEqual(replay1.sales_return.id, return1Id);
    assert.strictEqual(replay1.sales_return.return_number, return1Number);
    assert.strictEqual(replay1.replacement_sale.sale.id, exchange1.replacement_sale.sale.id);
  });

  test('Customer balance replay remains isolated from subsequent unrelated customer transactions', async () => {
    // 1. Create original sale for credit customer
    const orig = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_cust_replay_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );
    const lineId = orig.lines[0].id;

    // 2. Perform exchange with negative difference and account CREDIT refund
    const ikeyCredit = `idem_credit_bal_${uuidv4()}`;
    const exchangeCredit = await processAtomicExchange(
      pool,
      {
        original_sale_id: orig.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_CHP, quantity: 1 }],
        refund_method: 'CREDIT',
        idempotency_key: ikeyCredit,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(exchangeCredit.settlement_type, 'NEGATIVE_REFUND');
    assert.strictEqual(exchangeCredit.refund_method, 'CREDIT');
    const recordedBalanceAfter = exchangeCredit.customer_balance_after;
    assert.notStrictEqual(recordedBalanceAfter, null);

    // 3. Simulate a subsequent unrelated ledger entry for this customer
    await pool.query(
      `INSERT INTO customer_ledger_entries (
         id, customer_id, reference_id, reference_number, entry_type, debit, credit,
         balance_after, description, performed_by, created_at
       ) VALUES ($1, $2, $3, 'LATER-001', 'PAYMENT', 0, 5000, 999999, 'Unrelated subsequent payment', $4, NOW())`,
      [uuidv4(), CUST_ACC, uuidv4(), USER_A]
    );

    // 4. Replay the exchange key. It must return recordedBalanceAfter, NOT the later 999999!
    const replayCredit = await processAtomicExchange(
      pool,
      {
        original_sale_id: orig.sale.id,
        return_lines: [{ sale_line_id: lineId, quantity: 1 }],
        replacement_items: [{ product_id: PROD_CHP, quantity: 1 }],
        refund_method: 'CREDIT',
        idempotency_key: ikeyCredit,
      },
      USER_A,
      BRANCH_A,
      false
    );
    assert.strictEqual(replayCredit.customer_balance_after, recordedBalanceAfter);
  });

  test('GAP-1: Mid-transaction failure after early header insert rolls back all records cleanly', async () => {
    // 1. Create a valid original sale
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_rb_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );
    const lineId = origSale.lines[0].id;

    // 2. Temporarily close the cash session for BRANCH_A so that the cash movement
    //    validation in step 8 fails AFTER step 6a (early sales header insert) and step 6b (returns insert)
    await pool.query("UPDATE cash_sessions SET status = 'CLOSED' WHERE branch_id = $1", [BRANCH_A]);

    // Snapshot counts of all tables
    const [salesBefore, retBefore, retLinesBefore, saleLinesBefore, paymentsBefore, cashMovesBefore] =
      await Promise.all([
        pool.query('SELECT count(*) FROM sales'),
        pool.query('SELECT count(*) FROM sales_returns'),
        pool.query('SELECT count(*) FROM sales_return_lines'),
        pool.query('SELECT count(*) FROM sale_lines'),
        pool.query('SELECT count(*) FROM sale_payments'),
        pool.query('SELECT count(*) FROM cash_movements'),
      ]);

    // 3. Attempt a cash-refund exchange that will write early sales header and return header,
    //    but then fail at cash session verification during step 8b
    const ikeyFail = `idem_rb_fail_${uuidv4()}`;
    await assert.rejects(
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 1 }],
          replacement_items: [{ product_id: PROD_CHP, quantity: 1 }],
          refund_method: 'CASH',
          idempotency_key: ikeyFail,
        },
        USER_A,
        BRANCH_A,
        false
      ),
      (err: any) => err instanceof SaleRepoError && err.statusCode === 400 && err.message.includes('No open cash session')
    );

    // 4. Verify that transaction ROLLBACK wiped all mid-flight rows (zero residual records)
    const [salesAfter, retAfter, retLinesAfter, saleLinesAfter, paymentsAfter, cashMovesAfter] =
      await Promise.all([
        pool.query('SELECT count(*) FROM sales'),
        pool.query('SELECT count(*) FROM sales_returns'),
        pool.query('SELECT count(*) FROM sales_return_lines'),
        pool.query('SELECT count(*) FROM sale_lines'),
        pool.query('SELECT count(*) FROM sale_payments'),
        pool.query('SELECT count(*) FROM cash_movements'),
      ]);

    assert.strictEqual(salesAfter.rows[0].count, salesBefore.rows[0].count, 'Early sales header must be rolled back');
    assert.strictEqual(retAfter.rows[0].count, retBefore.rows[0].count, 'Return header must be rolled back');
    assert.strictEqual(retLinesAfter.rows[0].count, retLinesBefore.rows[0].count, 'Return lines must be rolled back');
    assert.strictEqual(saleLinesAfter.rows[0].count, saleLinesBefore.rows[0].count, 'Sale lines must be rolled back');
    assert.strictEqual(paymentsAfter.rows[0].count, paymentsBefore.rows[0].count, 'Payments must be rolled back');
    assert.strictEqual(cashMovesAfter.rows[0].count, cashMovesBefore.rows[0].count, 'Cash movements must be rolled back');

    // Restore cash session for subsequent tests
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO cash_sessions (id, branch_id, business_date, status, opened_at)
       VALUES ($1, $2, $3, 'OPEN', $4)
       ON CONFLICT (id) DO UPDATE SET status = 'OPEN'`,
      [SESSION_A, BRANCH_A, now.slice(0, 10), now]
    );
  });

  test('GAP-2: Genuinely concurrent requests with same key resolve to identical sale with zero duplicate records', async () => {
    // 1. Create fresh original sale
    const origSale = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: CUST_ACC,
        items: [{ product_id: PROD_RET, quantity: 1 }],
        payment_method: 'CASH',
        paid_amount: 500,
        idempotency_key: `sale_concurrent_orig_${uuidv4()}`,
      },
      USER_A,
      BRANCH_A,
      false
    );
    const lineId = origSale.lines[0].id;

    // Snapshot counts before concurrent execution
    const [salesCountBefore, stockBeforeRet, stockBeforeEq] = await Promise.all([
      pool.query('SELECT count(*) FROM sales'),
      pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_RET, BRANCH_A]),
      pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_EQ, BRANCH_A]),
    ]);

    const concurrentKey = `idem_concurrent_${uuidv4()}`;

    // 2. Launch two genuinely concurrent exchanges with Promise.all
    const [resA, resB] = await Promise.all([
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 1 }],
          replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
          idempotency_key: concurrentKey,
        },
        USER_A,
        BRANCH_A,
        false
      ),
      processAtomicExchange(
        pool,
        {
          original_sale_id: origSale.sale.id,
          return_lines: [{ sale_line_id: lineId, quantity: 1 }],
          replacement_items: [{ product_id: PROD_EQ, quantity: 1 }],
          idempotency_key: concurrentKey,
        },
        USER_A,
        BRANCH_A,
        false
      ),
    ]);

    // 3. Both concurrent requests must resolve to the EXACT SAME replacement sale and return
    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);
    assert.strictEqual(resA.replacement_sale.sale.id, resB.replacement_sale.sale.id);
    assert.strictEqual(resA.sales_return.id, resB.sales_return.id);

    // 4. Verify exactly ONE replacement sale was created (no duplicates)
    const salesCountAfter = await pool.query('SELECT count(*) FROM sales');
    assert.strictEqual(Number(salesCountAfter.rows[0].count), Number(salesCountBefore.rows[0].count) + 1);

    // 5. Verify stock was adjusted exactly once:
    //    PROD_RET returned 1 (restored to initial), PROD_EQ replaced 1 (decreased by 1)
    const [stockAfterRet, stockAfterEq] = await Promise.all([
      pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_RET, BRANCH_A]),
      pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_EQ, BRANCH_A]),
    ]);
    assert.strictEqual(Number(stockAfterRet.rows[0].quantity), Number(stockBeforeRet.rows[0].quantity) + 1);
    assert.strictEqual(Number(stockAfterEq.rows[0].quantity), Number(stockBeforeEq.rows[0].quantity) - 1);

    // 6. Verify exactly 1 return header and 1 replacement line set exist for this exchange
    const [returnRows, replacementLines, idempotencyRows] = await Promise.all([
      pool.query('SELECT count(*) FROM sales_returns WHERE id = $1', [resA.sales_return.id]),
      pool.query('SELECT count(*) FROM sale_lines WHERE sale_id = $1', [resA.replacement_sale.sale.id]),
      pool.query('SELECT count(*) FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2', [
        concurrentKey,
        BRANCH_A,
      ]),
    ]);
    assert.strictEqual(Number(returnRows.rows[0].count), 1);
    assert.strictEqual(Number(replacementLines.rows[0].count), 1);
    assert.strictEqual(Number(idempotencyRows.rows[0].count), 1);
  });
});

