/**
 * Niazi Mobile Mart — Phase 2.4.1
 * DEF-BROWSER-02: Automatic Customer Advance & Credit Financial Acceptance Suite
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';

import { completeSale, getSaleById, getSalePayments } from '../repositories/sale.repo.js';

// Setup test database target
const envPath = path.join(process.cwd(), '.env');
const backendEnvPath = path.join(process.cwd(), 'backend', '.env');
const targetEnv = fs.existsSync(backendEnvPath) ? backendEnvPath : envPath;
if (fs.existsSync(targetEnv)) {
  const envContent = fs.readFileSync(targetEnv, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      const val = trimmed.substring('DATABASE_URL='.length).trim();
      process.env['DATABASE_URL'] = val;
    }
  }
}

const rawUrl = process.env['TEST_DATABASE_URL'] || process.env['DATABASE_URL'] || '';
const TEST_DB_URL = rawUrl.replace('/niazi_mobile_mart?', '/niazi_local_test?');

if (!TEST_DB_URL.includes('niazi_local_test')) {
  console.error('[SAFETY ERROR] TEST_DB_URL must target niazi_local_test. Current:', TEST_DB_URL);
  process.exit(1);
}

describe('DEF-BROWSER-02: Automatic Customer Advance & Credit Financial Acceptance Suite', () => {
  let pool: Pool;
  const RUN_PREFIX = uuidv4().slice(0, 8);

  function id(name: string): string {
    const hex = Buffer.from(name).toString('hex').padEnd(8, '0').slice(0, 8);
    return `${hex}-${RUN_PREFIX.slice(0, 4)}-4${RUN_PREFIX.slice(4, 7)}-8${RUN_PREFIX.slice(0, 3)}-${RUN_PREFIX}0000`.slice(0, 36);
  }

  const ORG_ID = '00000000-0000-4000-8000-000000000001';
  const BRANCH_A = id('branch-adv-a');
  const PROD_X = id('product-adv-x');
  const USER_A = id('user-adv-a');
  const SESSION_A = id('sess-adv-a');
  const CAT_ID = id('cat-adv');

  let testCustomerIds: string[] = [];

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const now = new Date().toISOString();

    // 1. Organization
    await pool.query(
      `INSERT INTO organizations (id, name, created_at, updated_at)
       VALUES ($1, 'Test Org', $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_ID, now]
    );

    // 2. Branch
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, is_warehouse, created_at, updated_at)
       VALUES ($1, $2, 'Test Adv Branch', 'TAB-${RUN_PREFIX}', 1, 0, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_A, ORG_ID, now]
    );

    // 3. User
    await pool.query(
      `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Adv User', 'adv_u_${RUN_PREFIX}', 'dummy_hash', 'CASHIER', 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [USER_A, BRANCH_A, now]
    );

    // 4. Cash Session
    await pool.query(
      `INSERT INTO cash_sessions (id, branch_id, opened_by, status, opening_cash, opened_at, business_date)
       VALUES ($1, $2, $3, 'OPEN', 10000, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [SESSION_A, BRANCH_A, USER_A, now, now.slice(0, 10)]
    );

    // 5. Product Category & Product
    await pool.query(
      `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
       VALUES ($1, 'Adv Cat', 'ACAT-${RUN_PREFIX}', 1, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [CAT_ID, now]
    );

    await pool.query(
      `INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, is_active, created_at, updated_at)
       VALUES ($1, 'Adv Product', 'adv product', 'SKU-ADV-${RUN_PREFIX}', $2, 100, 100, 1000, 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [PROD_X, CAT_ID, now]
    );

    // 6. Stock
    await pool.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, 10000, $3)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = 10000`,
      [PROD_X, BRANCH_A, now]
    );
  });

  after(async () => {
    if (pool) {
      if (testCustomerIds.length > 0) {
        await pool.query('DELETE FROM customer_ledger_entries WHERE customer_id = ANY($1::text[])', [testCustomerIds]);
        await pool.query('DELETE FROM customers WHERE id = ANY($1::text[])', [testCustomerIds]);
      }
      await pool.query('DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE branch_id = $1)', [BRANCH_A]);
      await pool.query('DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE branch_id = $1)', [BRANCH_A]);
      await pool.query('DELETE FROM sales WHERE branch_id = $1', [BRANCH_A]);
      await pool.query('DELETE FROM stock_movements WHERE product_id = $1', [PROD_X]);
      await pool.query('DELETE FROM stock WHERE product_id = $1', [PROD_X]);
      await pool.query('DELETE FROM products WHERE id = $1', [PROD_X]);
      await pool.query('DELETE FROM product_types WHERE id = $1', [CAT_ID]);
      await pool.query('DELETE FROM cash_sessions WHERE id = $1', [SESSION_A]);
      await pool.query('DELETE FROM users WHERE id = $1', [USER_A]);
      await pool.end();
    }
  });

  async function createCustomer(name: string, creditLimit: number = 50000): Promise<string> {
    const cid = uuidv4();
    testCustomerIds.push(cid);
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6)`,
      [cid, `CUST-${cid.slice(0, 8)}`, name, `0300-${Math.floor(1000000 + Math.random() * 9000000)}`, creditLimit, now]
    );
    return cid;
  }

  async function getCustomerBalance(customerId: string): Promise<number> {
    const res = await pool.query(
      'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance FROM customer_ledger_entries WHERE customer_id = $1',
      [customerId]
    );
    return Number(res.rows[0]?.balance ?? 0);
  }

  test('Case A — Excess payment creates customer advance (Niazi Business Scenario 1)', async () => {
    // Current purchase Rs 8,700, Paid Rs 9,000 -> Rs 300 excess retained as advance
    const customerId = await createCustomer('Case A Customer');

    const result = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 8700 }],
        paid_amount: 9000,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 9000 }],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(result.sale.total_amount, 8700);
    assert.equal(result.sale.paid_amount, 8700, 'Invoice paid amount clamped to total amount');
    assert.equal(result.sale.payment_status, 'PAID');
    assert.equal(result.credit_amount, 0);

    // Negative balance = advance in customer ledger
    const balance = await getCustomerBalance(customerId);
    assert.equal(balance, -300, 'Customer must hold Rs 300 advance (-300 balance)');

    // Verify ledger entries
    const entries = await pool.query(
      'SELECT entry_type, debit, credit, balance_after, description FROM customer_ledger_entries WHERE customer_id = $1 ORDER BY created_at ASC',
      [customerId]
    );
    assert.equal(entries.rows.length, 1);
    assert.equal(entries.rows[0].entry_type, 'PAYMENT');
    assert.equal(Number(entries.rows[0].credit), 300);
    assert.equal(Number(entries.rows[0].balance_after), -300);
    assert.ok(entries.rows[0].description.includes('Customer advance received'));
  });

  test('Case B & C — Advance automatically reduces next invoice (Niazi Business Scenario 2)', async () => {
    // Existing advance Rs 300, New invoice Rs 5,000 -> Customer pays Rs 4,700 cash -> Invoice fully paid
    const customerId = await createCustomer('Case B Customer');

    // Step 1: Create Rs 300 advance
    await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 8700 }],
        paid_amount: 9000,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 9000 }],
      },
      USER_A, BRANCH_A, true
    );
    assert.equal(await getCustomerBalance(customerId), -300);

    // Step 2: Next purchase Rs 5,000, cash tendered Rs 4,700 (cashier collects remaining Rs 4,700)
    const result2 = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 5000 }],
        paid_amount: 4700,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 4700 }],
      },
      USER_A, BRANCH_A, true
    );

    // Sale should be fully paid (300 advance + 4700 cash = 5000)
    assert.equal(result2.sale.total_amount, 5000);
    assert.equal(result2.sale.paid_amount, 5000, 'Total recorded paid must include advance applied');
    assert.equal(result2.sale.payment_status, 'PAID');
    assert.equal(result2.credit_amount, 0);

    // Customer balance must be exactly 0 (advance consumed)
    const newBalance = await getCustomerBalance(customerId);
    assert.equal(newBalance, 0, 'Advance of Rs 300 was fully consumed, balance is 0');

    // Verify payments recorded
    const payments = await pool.query(
      'SELECT payment_method, amount, notes FROM sale_payments WHERE sale_id = $1 ORDER BY amount DESC',
      [result2.sale.id]
    );
    assert.equal(payments.rows.length, 2);
    assert.equal(payments.rows[0].payment_method, 'CASH');
    assert.equal(Number(payments.rows[0].amount), 4700);
    assert.equal(payments.rows[1].payment_method, 'OTHER');
    assert.equal(Number(payments.rows[1].amount), 300);
    assert.ok(payments.rows[1].notes.includes('Customer Advance Applied: Rs 300'));
  });

  test('Case D — Advance exceeds invoice: invoice fully paid and remainder stays as advance', async () => {
    const customerId = await createCustomer('Case D Customer');

    // Give customer Rs 6,000 advance directly in ledger
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 6000, -6000, 'Opening advance payment', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );
    assert.equal(await getCustomerBalance(customerId), -6000);

    // Next purchase Rs 5,000, 0 cash tendered
    const result = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 5000 }],
        paid_amount: 0,
        payment_method: 'CASH',
        payments: [],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(result.sale.total_amount, 5000);
    assert.equal(result.sale.paid_amount, 5000);
    assert.equal(result.sale.payment_status, 'PAID');
    assert.equal(result.credit_amount, 0);

    // Remaining advance must be Rs 1,000 (-1000 balance)
    const balAfter = await getCustomerBalance(customerId);
    assert.equal(balAfter, -1000, 'Rs 1,000 advance remains on customer account');
  });

  test('Case E — Existing credit customer: payment settles debt, no false advance', async () => {
    const customerId = await createCustomer('Case E Customer');

    // Customer owes Rs 10,000
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'SALE', 10000, 0, 10000, 'Prior credit invoice', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );
    assert.equal(await getCustomerBalance(customerId), 10000);

    // New invoice Rs 5,000, Customer tenders Rs 9,000 cash
    const result = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 5000 }],
        paid_amount: 9000,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 9000 }],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(result.sale.total_amount, 5000);
    assert.equal(result.sale.paid_amount, 5000);
    assert.equal(result.sale.payment_status, 'PAID');

    // Customer balance must be +6,000 (debt remaining). NO advance created.
    const finalBal = await getCustomerBalance(customerId);
    assert.equal(finalBal, 6000, 'Customer must owe exactly Rs 6,000 with no false advance');
  });

  test('Case F — Partial payment without excess: balance increases, advance zero', async () => {
    const customerId = await createCustomer('Case F Customer');

    const result = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 5000 }],
        paid_amount: 2000,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 2000 }],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(result.sale.total_amount, 5000);
    assert.equal(result.sale.paid_amount, 2000);
    assert.equal(result.sale.payment_status, 'PARTIALLY_PAID');
    assert.equal(result.credit_amount, 3000);

    const bal = await getCustomerBalance(customerId);
    assert.equal(bal, 3000, 'Customer owes Rs 3,000 remaining');
  });

  test('Case G — Multiple purchases correctly carry forward advance', async () => {
    const customerId = await createCustomer('Case G Customer');

    // Seed Rs 1,000 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 1000, -1000, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    // Sale 1: Rs 400 invoice, 0 cash tendered -> 400 absorbed from advance, 600 remaining
    const s1 = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 400 }],
        paid_amount: 0,
        payment_method: 'CASH',
        payments: [],
      },
      USER_A, BRANCH_A, true
    );
    assert.equal(s1.sale.payment_status, 'PAID');
    assert.equal(await getCustomerBalance(customerId), -600);

    // Sale 2: Rs 400 invoice, 0 cash tendered -> 400 absorbed from advance, 200 remaining
    const s2 = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 400 }],
        paid_amount: 0,
        payment_method: 'CASH',
        payments: [],
      },
      USER_A, BRANCH_A, true
    );
    assert.equal(s2.sale.payment_status, 'PAID');
    assert.equal(await getCustomerBalance(customerId), -200);

    // Sale 3: Rs 500 invoice, 0 cash tendered -> 200 absorbed, remaining 300 becomes credit debt
    const s3 = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 500 }],
        paid_amount: 0,
        payment_method: 'CASH',
        payments: [],
      },
      USER_A, BRANCH_A, true
    );
    assert.equal(s3.sale.payment_status, 'PARTIALLY_PAID');
    assert.equal(s3.sale.paid_amount, 200);
    assert.equal(s3.credit_amount, 300);
    assert.equal(await getCustomerBalance(customerId), 300);
  });

  test('Case H — Multiple payment methods with advance retain correct amounts & references', async () => {
    const customerId = await createCustomer('Case H Customer');

    // Seed Rs 500 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 500, -500, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    // Invoice Rs 2,500: Rs 500 advance + Rs 1,000 cash + Rs 1,000 card
    const res = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 2500 }],
        payments: [
          { method: 'CASH', amount: 1000 },
          { method: 'CARD', amount: 1000, reference_number: 'CARD-REF-99' },
        ],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(res.sale.total_amount, 2500);
    assert.equal(res.sale.paid_amount, 2500);
    assert.equal(res.sale.payment_status, 'PAID');

    const payments = await pool.query(
      'SELECT payment_method, amount, reference_number FROM sale_payments WHERE sale_id = $1 ORDER BY amount DESC, payment_method ASC',
      [res.sale.id]
    );
    assert.equal(payments.rows.length, 3);
    assert.equal(Number(payments.rows.find((p: any) => p.payment_method === 'CASH')?.amount), 1000);
    assert.equal(Number(payments.rows.find((p: any) => p.payment_method === 'CARD')?.amount), 1000);
    assert.equal(payments.rows.find((p: any) => p.payment_method === 'CARD')?.reference_number, 'CARD-REF-99');
    assert.equal(Number(payments.rows.find((p: any) => p.payment_method === 'OTHER')?.amount), 500);
  });

  test('Case I — Concurrent cashier requests: advance cannot be double-spent', async () => {
    const customerId = await createCustomer('Case I Customer');

    // Seed Rs 1,000 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 1000, -1000, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    const p1 = completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 1000 }],
        payments: [],
      },
      USER_A, BRANCH_A, true
    );
    const p2 = completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 1000 }],
        payments: [],
      },
      USER_A, BRANCH_A, true
    );

    const [r1, r2] = await Promise.all([p1, p2]);

    const adv1 = r1.payments.find((p) => p.payment_method === 'OTHER')?.amount ?? 0;
    const adv2 = r2.payments.find((p) => p.payment_method === 'OTHER')?.amount ?? 0;
    assert.equal(adv1 + adv2, 1000, 'Exactly Rs 1,000 advance must be consumed across concurrent sales');

    const finalBal = await getCustomerBalance(customerId);
    assert.equal(finalBal, 0);
  });

  test('Case J — Idempotency: duplicate submission does not re-consume advance', async () => {
    const customerId = await createCustomer('Case J Customer');
    const idemKey = `idem_${Date.now()}_${RUN_PREFIX}`;

    // Seed Rs 500 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 500, -500, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    const dto = {
      branch_id: BRANCH_A,
      customer_id: customerId,
      items: [{ product_id: PROD_X, quantity: 1, unit_price: 500 }],
      payments: [],
      idempotency_key: idemKey,
    };

    const first = await completeSale(pool, dto, USER_A, BRANCH_A, true);
    assert.equal(first.sale.payment_status, 'PAID');
    assert.equal(await getCustomerBalance(customerId), 0);

    const duplicate = await completeSale(pool, dto, USER_A, BRANCH_A, true);
    assert.equal(duplicate.sale.id, first.sale.id);

    assert.equal(await getCustomerBalance(customerId), 0);
  });

  test('Case K — Rollback: aborted sale restores complete financial & advance state', async () => {
    const customerId = await createCustomer('Case K Customer');

    // Seed Rs 500 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 500, -500, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    await assert.rejects(
      async () => {
        await completeSale(
          pool,
          {
            branch_id: BRANCH_A,
            customer_id: customerId,
            items: [{ product_id: uuidv4(), quantity: 1, unit_price: 500 }],
            payments: [],
          },
          USER_A, BRANCH_A, true
        );
      }
    );

    assert.equal(await getCustomerBalance(customerId), -500);
  });

  test('Case L — Historical customer balances & positive debt preserved', async () => {
    const customerId = await createCustomer('Case L Customer');

    // Existing positive debt Rs 15,000
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'SALE', 15000, 0, 15000, 'Historical credit debt', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    assert.equal(await getCustomerBalance(customerId), 15000);

    const res = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 2000 }],
        paid_amount: 0,
        payment_method: 'CREDIT',
        payments: [],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(Number(res.credit_amount || (res.sale.total_amount - res.sale.paid_amount)), 2000);
    assert.equal(res.customer_balance_after, 17000);
    assert.equal(await getCustomerBalance(customerId), 17000);
  });

  test('Case M — Walk-in customers: unaffected, change returned, no advance created', async () => {
    const res = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: 'walk-in',
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 1500 }],
        paid_amount: 2000,
        payment_method: 'CASH',
        payments: [{ method: 'CASH', amount: 2000 }],
      },
      USER_A, BRANCH_A, true
    );

    assert.equal(res.sale.total_amount, 1500);
    assert.equal(res.sale.paid_amount, 1500);
    assert.equal(res.sale.change_amount, 500);
    assert.equal(res.sale.customer_id, null);
    assert.equal(res.customer_balance_after, null);
  });

  test('Case N — Invoice history and reprint displays correct totals', async () => {
    const customerId = await createCustomer('Case N Customer');

    // Seed Rs 300 advance
    await pool.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, 'PAYMENT', 0, 300, -300, 'Opening advance', $3, NOW())`,
      [uuidv4(), customerId, USER_A]
    );

    const completed = await completeSale(
      pool,
      {
        branch_id: BRANCH_A,
        customer_id: customerId,
        items: [{ product_id: PROD_X, quantity: 1, unit_price: 1000 }],
        payments: [{ method: 'CASH', amount: 700 }],
      },
      USER_A, BRANCH_A, true
    );

    const fetchedSale = await getSaleById(pool, completed.sale.id);
    assert.ok(fetchedSale);
    assert.equal(fetchedSale.total_amount, 1000);
    assert.equal(fetchedSale.paid_amount, 1000);
    assert.equal(fetchedSale.payment_status, 'PAID');

    const fetchedPayments = await getSalePayments(pool, completed.sale.id);
    assert.equal(fetchedPayments.length, 2);
    assert.equal(fetchedPayments.find((p: any) => p.payment_method === 'CASH')?.amount, 700);
    assert.equal(fetchedPayments.find((p: any) => p.payment_method === 'OTHER')?.amount, 300);
  });
});
