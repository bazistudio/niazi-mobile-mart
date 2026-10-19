/**
 * Niazi Mobile Mart — Phase B Repair Booking & Finish Job Transaction Pipeline Integration Suite
 *
 * Scenarios covered:
 *   T1: Deliver job, settlement_payment.amount = full outstanding balance, CASH, open session exists
 *       -> settlement_status = 'PAID'; 1 repair_payments row; 1 cash_movements row (REPAIR_SETTLEMENT); 0 customer_ledger_entries rows.
 *   T2: Deliver job, no settlement payment (balance remaining)
 *       -> settlement_status = 'CREDIT'; 0 new repair_payments rows; 0 cash_movements rows; 0 customer_ledger_entries rows.
 *   T3: Deliver job where customer_id IS NULL (walk-in)
 *       -> All delivery logic completes; invoice number allocated; settlement_status set correctly; no null-dereference errors.
 *   T4: Deliver job, settlement CASH payment, no open cash session
 *       -> RepairRepoError 422 thrown; transaction rolled back; job not marked Delivered.
 *   T5: Advance payment recorded via addRepairPaymentTx (CASH), then deliver with no further payment
 *       -> totalPaid from SUM(repair_payments.amount) includes advance; delivery sets PAID or CREDIT correctly.
 *   T6: Stock deduction on add part and compensating stock restoration on remove part
 *       -> Stock decrements with 'OUT' movement; removing part increments stock with 'IN' compensating movement.
 *   T7: Deliver a job that is already Delivered
 *       -> 409 conflict error; no duplicate invoice number allocated.
 *
 * SAFETY GUARD:
 * Tests execute ONLY against an explicitly configured, disposable PostgreSQL database.
 * If TEST_DATABASE_URL is not set or matches non-disposable patterns, the suite blocks execution.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

import {
  createRepairJobTx,
  addRepairPartTx,
  removeRepairPartTx,
  addRepairPaymentTx,
  completeRepairJobTx,
  getRepairJobById,
  RepairRepoError,
} from '../repositories/repair.repo';

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

  const DANGEROUS_PATTERNS = ['cloud', 'cloudsql', 'prod', 'production', 'prd', 'staging', 'live', 'neon.tech'];
  const fullUrlLower = TEST_DB_URL.toLowerCase();
  for (const pat of DANGEROUS_PATTERNS) {
    if (fullUrlLower.includes(pat)) {
      console.error(`[BLOCKED] TEST_DATABASE_URL contains dangerous pattern "${pat}". Aborting.`);
      process.exit(1);
    }
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const APPROVED_TEST_DATABASES = new Set(['niazi_staging_test', 'niazi_test', 'niazi_local_test']);
  if (!APPROVED_TEST_DATABASES.has(dbName)) {
    console.error(
      `[BLOCKED] TEST_DATABASE_URL targets "${dbName}". Must be one of approved test DBs: ${Array.from(APPROVED_TEST_DATABASES).join(', ')}`
    );
    process.exit(1);
  }
} catch (err: any) {
  console.error(`[BLOCKED] Invalid TEST_DATABASE_URL: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pool and run-unique fixture IDs
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
const BRANCH_A  = id('branch-repair-a');
const BRANCH_B  = id('branch-repair-b');
const USER_A    = id('user-repair-a');
const CUST_1    = id('customer-repair-1');
const PROD_PART = id('product-repair-part');
const SESSION_A = id('session-repair-a');

// ---------------------------------------------------------------------------
// Global Fixture Setup and Teardown
// ---------------------------------------------------------------------------

const TYPE_ID = id('ptype-repair');

async function setupFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    // Verify server-side database identity
    const dbRes = await client.query('SELECT current_database() as db');
    const actualDb = dbRes.rows[0]?.db;
    if (actualDb !== 'niazi_local_test' && actualDb !== 'niazi_test') {
      throw new Error(`Connected database "${actualDb}" is not an authorized test database.`);
    }

    const now = new Date().toISOString();

    // 1. Organization
    await client.query(
      `INSERT INTO organizations (id, name, created_at, updated_at)
       VALUES ($1, 'Test Org Repair', $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_ID, now]
    );

    // 2. Branches
    await client.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, is_warehouse, created_at, updated_at)
       VALUES
         ($1, $3, 'Repair Test Branch A', 'RTBA-${RUN_PREFIX}', 1, 0, $4, $4),
         ($2, $3, 'Repair Test Branch B', 'RTBB-${RUN_PREFIX}', 1, 0, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_A, BRANCH_B, ORG_ID, now]
    );

    // 3. User
    await client.query(
      `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Test Technician', $3, 'x', 'SHOP_ADMIN', 1, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [USER_A, BRANCH_A, `tech_${RUN_PREFIX}`, now]
    );

    // 4. Party & Customer
    await client.query(
      `INSERT INTO parties (id, display_name, phone, is_active, created_at, updated_at)
       VALUES ($1, 'Repair Test Customer', '03001234567', 1, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [CUST_1, now]
    );

    await client.query(
      `INSERT INTO customers (id, party_id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
       VALUES ($1, $1, 'RCUST-${RUN_PREFIX}', 'Repair Test Customer', '03001234567', 10000, 1, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [CUST_1, now]
    );

    // 5. Product Type & Part Product
    await client.query(
      `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
       VALUES ($1, 'Repair Spares', 'RTYP-${RUN_PREFIX}', 1, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [TYPE_ID, now]
    );

    await client.query(
      `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
       VALUES ($1, 'Screen Replacement Panel', 'screen replacement panel', 'SCR-${RUN_PREFIX}', $2, 3000, 3000, 4500, 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [PROD_PART, TYPE_ID, now]
    );

    // Initial stock: 10 units at BRANCH_A
    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, 10, $3)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = 10, updated_at = $3`,
      [PROD_PART, BRANCH_A, now]
    );

    // 6. Cash Session for BRANCH_A
    await client.query(
      `INSERT INTO cash_sessions (id, branch_id, business_date, opening_cash, status, opened_at, opened_by)
       VALUES ($1, $2, $3, 10000, 'OPEN', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [SESSION_A, BRANCH_A, now.slice(0, 10), now, USER_A]
    );
  } finally {
    client.release();
  }
}

async function teardownFixtures(): Promise<void> {
  const client = await pool.connect();
  try {
    // Clean up ONLY this run's fixture records in strict child-to-parent dependency order.
    // Each step is individually guarded to ensure subsequent steps still execute even if an earlier step encounters an issue.
    const runBranchIds = [BRANCH_A, BRANCH_B];

    // 1. Repair child records
    await client.query('DELETE FROM repair_parts WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});
    await client.query('DELETE FROM repair_payments WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});

    // 2. Repair parent jobs and invoice counters
    await client.query('DELETE FROM repair_jobs WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});
    await client.query('DELETE FROM repair_invoice_counters WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});

    // 3. Cash movements & cash sessions
    await client.query('DELETE FROM cash_movements WHERE session_id = $1 OR branch_id = ANY($2::text[])', [SESSION_A, runBranchIds]).catch(() => {});
    await client.query('DELETE FROM cash_sessions WHERE id = $1 OR branch_id = ANY($2::text[])', [SESSION_A, runBranchIds]).catch(() => {});

    // 4. Stock movements, stock, products, product_types
    await client.query('DELETE FROM stock_movements WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});
    await client.query('DELETE FROM stock WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});
    await client.query('DELETE FROM products WHERE type_id = $1 OR id = $2', [TYPE_ID, PROD_PART]).catch(() => {});
    await client.query('DELETE FROM product_types WHERE id = $1', [TYPE_ID]).catch(() => {});

    // 5. Change log entries generated for this run's branches
    await client.query('DELETE FROM change_log WHERE branch_id = ANY($1::text[])', [runBranchIds]).catch(() => {});

    // 6. Customers, parties, and users
    await client.query('DELETE FROM customers WHERE id = $1', [CUST_1]).catch(() => {});
    await client.query('DELETE FROM parties WHERE id = $1', [CUST_1]).catch(() => {});
    await client.query('DELETE FROM users WHERE id = $1', [USER_A]).catch(() => {});

    // 7. Branches
    await client.query('DELETE FROM branches WHERE id = ANY($1::text[])', [runBranchIds]).catch(() => {});
  } finally {
    client.release();
    await pool.end();
  }
}

describe('Repair Booking & Finish Job Transaction Pipeline (T1–T7)', () => {
  before(async () => {
    await setupFixtures();
  });

  after(async () => {
    await teardownFixtures();
  });

  // -------------------------------------------------------------------------
  // T1: Deliver job, settlement_payment = full outstanding, CASH, session OPEN
  // -------------------------------------------------------------------------
  test('T1: Deliver job with full CASH settlement creates payment and cash movement, zero ledger entries', async () => {
    // 1. Book job with estimated cost 5000
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_id: CUST_1,
        customer_name: 'Repair Customer One',
        device: { type: 'Smartphone', brand: 'Samsung', model: 'Galaxy S21' },
        problem_description: 'Broken AMOLED display',
        branch_id: BRANCH_A,
      },
      USER_A,
      ORG_ID
    )) as { id: string; jobId: string };

    // 2. Add part (Screen: 4500)
    await addRepairPartTx(
      pool,
      jobRes.id,
      {
        product_id: PROD_PART,
        product_name: 'Screen Replacement Panel',
        qty: 1,
        cost: 3000,
        price: 4500,
      },
      USER_A,
      ORG_ID
    );

    // 3. Deliver job with full cash settlement payment (4500)
    const delivered = (await completeRepairJobTx(
      pool,
      jobRes.id,
      {
        settlement_payment: {
          amount: 4500,
          method: 'CASH',
          reference: 'FULL-SETTLE',
        },
      },
      USER_A,
      ORG_ID
    )) as { settlementStatus: string; invoiceNumber: string; status: string };

    assert.strictEqual(delivered.status, 'Delivered');
    assert.strictEqual(delivered.settlementStatus, 'PAID');
    assert.match(delivered.invoiceNumber, /^REP-\d{5}$/);

    // Verify exactly 1 payment row
    const payRes = await pool.query('SELECT amount, method, session_id FROM repair_payments WHERE repair_job_id = $1', [jobRes.id]);
    assert.strictEqual(payRes.rows.length, 1);
    assert.strictEqual(Number(payRes.rows[0].amount), 4500);
    assert.strictEqual(payRes.rows[0].method, 'CASH');
    assert.strictEqual(payRes.rows[0].session_id, SESSION_A);

    // Verify 1 cash movement row with type REPAIR_SETTLEMENT, direction IN
    const cmRes = await pool.query(
      "SELECT amount, direction, movement_type FROM cash_movements WHERE reference_id = $1 AND movement_type = 'REPAIR_SETTLEMENT'",
      [jobRes.id]
    );
    assert.strictEqual(cmRes.rows.length, 1);
    assert.strictEqual(Number(cmRes.rows[0].amount), 4500);
    assert.strictEqual(cmRes.rows[0].direction, 'IN');

    // CRITICAL ACCOUNTING INVARIANT: Zero rows in customer_ledger_entries
    const ledgerRes = await pool.query('SELECT count(*) as cnt FROM customer_ledger_entries WHERE reference_id = $1', [jobRes.id]);
    assert.strictEqual(Number(ledgerRes.rows[0].cnt), 0);
  });

  // -------------------------------------------------------------------------
  // T2: Deliver job with remaining balance (no settlement payment)
  // -------------------------------------------------------------------------
  test('T2: Deliver job on credit sets settlement_status = CREDIT and posts zero customer ledger rows', async () => {
    // 1. Book job
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_id: CUST_1,
        customer_name: 'Repair Customer Credit',
        device: { type: 'Smartphone', brand: 'Apple', model: 'iPhone 13' },
        problem_description: 'Battery health degraded',
        branch_id: BRANCH_A,
      },
      USER_A,
      ORG_ID
    )) as { id: string };

    // 2. Add manual labor part (2000)
    await addRepairPartTx(
      pool,
      jobRes.id,
      {
        product_name: 'Battery Replacement Service',
        qty: 1,
        cost: 1000,
        price: 2000,
      },
      USER_A,
      ORG_ID
    );

    // 3. Deliver job without settlement payment (balance remains 2000)
    const delivered = (await completeRepairJobTx(
      pool,
      jobRes.id,
      {
        delivery_notes: 'Delivered with balance due',
      },
      USER_A,
      ORG_ID
    )) as { settlementStatus: string; invoiceNumber: string; status: string };

    assert.strictEqual(delivered.status, 'Delivered');
    assert.strictEqual(delivered.settlementStatus, 'CREDIT');

    // Verify 0 new payment rows and 0 cash movements
    const payRes = await pool.query('SELECT count(*) as cnt FROM repair_payments WHERE repair_job_id = $1', [jobRes.id]);
    assert.strictEqual(Number(payRes.rows[0].cnt), 0);

    const cmRes = await pool.query('SELECT count(*) as cnt FROM cash_movements WHERE reference_id = $1', [jobRes.id]);
    assert.strictEqual(Number(cmRes.rows[0].cnt), 0);

    // CRITICAL: No debt posted to customer_ledger_entries (ledger count remains 0)
    const ledgerRes = await pool.query('SELECT count(*) as cnt FROM customer_ledger_entries WHERE reference_id = $1', [jobRes.id]);
    assert.strictEqual(Number(ledgerRes.rows[0].cnt), 0);
  });

  // -------------------------------------------------------------------------
  // T3: Deliver walk-in job (customer_id IS NULL)
  // -------------------------------------------------------------------------
  test('T3: Deliver walk-in job without customer_id completes cleanly without null-dereference', async () => {
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_id: null,
        customer_name: 'Walk-in Anonymous',
        device: { type: 'Smartphone', brand: 'Xiaomi', model: 'Redmi Note 10' },
        problem_description: 'Charging port loose',
        branch_id: BRANCH_A,
      },
      USER_A,
      ORG_ID
    )) as { id: string };

    const delivered = (await completeRepairJobTx(
      pool,
      jobRes.id,
      {
        settlement_payment: { amount: 1500, method: 'CASH' },
      },
      USER_A,
      ORG_ID
    )) as { settlementStatus: string; invoiceNumber: string; status: string };

    assert.strictEqual(delivered.status, 'Delivered');
    assert.strictEqual(delivered.settlementStatus, 'PAID');
    assert.ok(delivered.invoiceNumber);
  });

  // -------------------------------------------------------------------------
  // T4: Deliver job with CASH payment but closed/missing cash session
  // -------------------------------------------------------------------------
  test('T4: Deliver job with CASH settlement fails with 422 if no cash session is open', async () => {
    // Book job at BRANCH_B (which has no open cash session)
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_name: 'Branch B Customer',
        device: { type: 'Smartphone', brand: 'OnePlus', model: 'Nord 2' },
        problem_description: 'Speaker buzz',
        branch_id: BRANCH_B,
      },
      USER_A,
      ORG_ID
    )) as { id: string };

    await assert.rejects(
      completeRepairJobTx(
        pool,
        jobRes.id,
        {
          settlement_payment: { amount: 2000, method: 'CASH' },
        },
        USER_A,
        ORG_ID
      ),
      (err: any) => {
        assert.ok(err instanceof RepairRepoError);
        assert.strictEqual(err.statusCode, 422);
        assert.match(err.message, /No open cash session/i);
        return true;
      }
    );

    // Verify job remains not Delivered
    const freshJob = (await getRepairJobById(pool, jobRes.id)) as any;
    assert.notStrictEqual(freshJob.status, 'Delivered');
  });

  // -------------------------------------------------------------------------
  // T5: Advance payment recorded, then deliver with no further payment
  // -------------------------------------------------------------------------
  test('T5: Advance payment sums into totalPaid and satisfies delivery settlement', async () => {
    // 1. Book job with advance payment (3000 CASH)
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_name: 'Advance Payer',
        device: { type: 'Smartphone', brand: 'Realme', model: '8 Pro' },
        problem_description: 'Screen replacement with advance',
        branch_id: BRANCH_A,
        advance_payment: { amount: 3000, method: 'CASH', reference: 'ADV-REC-01' },
      },
      USER_A,
      ORG_ID
    )) as { id: string; jobId: string };

    // Explicitly assert REPAIR_ADVANCE cash movement created at booking time
    const advCmRes = await pool.query(
      `SELECT session_id, branch_id, movement_type, direction, amount, reference_id, payment_method
       FROM cash_movements
       WHERE reference_id = $1 AND movement_type = 'REPAIR_ADVANCE'`,
      [jobRes.id]
    );
    assert.strictEqual(advCmRes.rows.length, 1);
    assert.strictEqual(advCmRes.rows[0].session_id, SESSION_A);
    assert.strictEqual(advCmRes.rows[0].branch_id, BRANCH_A);
    assert.strictEqual(advCmRes.rows[0].direction, 'IN');
    assert.strictEqual(Number(advCmRes.rows[0].amount), 3000);
    assert.strictEqual(advCmRes.rows[0].payment_method, 'CASH');

    // 2. Add part costing exactly 3000
    await addRepairPartTx(
      pool,
      jobRes.id,
      {
        product_name: 'Display Assembly',
        qty: 1,
        cost: 2000,
        price: 3000,
      },
      USER_A,
      ORG_ID
    );

    // 3. Deliver job without additional settlement payment
    const delivered = (await completeRepairJobTx(
      pool,
      jobRes.id,
      {},
      USER_A,
      ORG_ID
    )) as { settlementStatus: string; status: string };

    assert.strictEqual(delivered.status, 'Delivered');
    // Since advance 3000 equals net total 3000, status must be PAID
    assert.strictEqual(delivered.settlementStatus, 'PAID');
  });

  // -------------------------------------------------------------------------
  // T6: Stock deduction on add part and compensating restoration on remove
  // -------------------------------------------------------------------------
  test('T6: Part add decrements stock with OUT movement, remove restores stock with IN movement', async () => {
    const PROD_PART_T6 = id('product-repair-part-t6');
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
       VALUES ($1, 'Screen Replacement Panel T6', 'screen replacement panel t6', $2, $3, 3000, 3000, 4500, 1, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [PROD_PART_T6, `SCR-T6-${RUN_PREFIX}`, TYPE_ID, now]
    );
    await pool.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, 10, $3)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = 10, updated_at = $3`,
      [PROD_PART_T6, BRANCH_A, now]
    );

    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_name: 'Stock Test Customer',
        device: { type: 'Smartphone', brand: 'Google', model: 'Pixel 6' },
        problem_description: 'Screen test',
        branch_id: BRANCH_A,
      },
      USER_A,
      ORG_ID
    )) as { id: string };

    // Initial stock is 10. Adding 2 parts.
    const partAdded = (await addRepairPartTx(
      pool,
      jobRes.id,
      {
        product_id: PROD_PART_T6,
        product_name: 'Screen Replacement Panel T6',
        qty: 2,
        cost: 3000,
        price: 4500,
      },
      USER_A,
      ORG_ID
    )) as any;

    const partId = partAdded.partsUsed[0]._id;

    // Check stock decremented to 8
    const stockAfterAdd = await pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_PART_T6, BRANCH_A]);
    assert.strictEqual(Number(stockAfterAdd.rows[0].quantity), 8);

    // Verify OUT stock movement with resulting_stock = 8
    const outMv = await pool.query(
      "SELECT quantity, previous_stock, resulting_stock, movement_type FROM stock_movements WHERE reference_id = $1 AND movement_type = 'OUT'",
      [jobRes.id]
    );
    assert.strictEqual(outMv.rows.length, 1);
    assert.strictEqual(Number(outMv.rows[0].resulting_stock), 8);

    // Remove part
    await removeRepairPartTx(pool, jobRes.id, partId, USER_A, ORG_ID);

    // Check stock restored back to 10
    const stockAfterRemove = await pool.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [PROD_PART_T6, BRANCH_A]);
    assert.strictEqual(Number(stockAfterRemove.rows[0].quantity), 10);

    // Verify IN compensating stock movement with resulting_stock = 10
    const inMv = await pool.query(
      "SELECT quantity, previous_stock, resulting_stock, movement_type FROM stock_movements WHERE reference_id = $1 AND movement_type = 'IN'",
      [jobRes.id]
    );
    assert.strictEqual(inMv.rows.length, 1);
    assert.strictEqual(Number(inMv.rows[0].resulting_stock), 10);
  });

  // -------------------------------------------------------------------------
  // T7: Deliver a job that is already Delivered
  // -------------------------------------------------------------------------
  test('T7: Attempting to finish a job that is already Delivered returns 409 Conflict', async () => {
    const jobRes = (await createRepairJobTx(
      pool,
      {
        customer_name: 'Already Delivered Customer',
        device: { type: 'Smartphone', brand: 'Sony', model: 'Xperia 1' },
        problem_description: 'Camera lens scratch',
        branch_id: BRANCH_A,
      },
      USER_A,
      ORG_ID
    )) as { id: string };

    // Deliver once
    await completeRepairJobTx(pool, jobRes.id, {}, USER_A, ORG_ID);

    // Deliver second time must fail with 409
    await assert.rejects(
      completeRepairJobTx(pool, jobRes.id, {}, USER_A, ORG_ID),
      (err: any) => {
        assert.ok(err instanceof RepairRepoError);
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /already delivered/i);
        return true;
      }
    );
  });
});
