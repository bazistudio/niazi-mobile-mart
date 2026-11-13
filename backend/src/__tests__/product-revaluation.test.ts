/**
 * Niazi Mobile Mart — Release 100 FIX 02 Regression Test Suite
 *
 * Covers Product Edit Manual Average-Cost Revaluation & Concurrency Safety:
 *   AS-01 — Purchase price revaluation (purchase_price: 1600 -> 2400 => avg_cost: 2400)
 *   AS-02 — Explicit average-cost override (purchase_price: 2400, average_cost: 2100 => avg_cost: 2100)
 *   AS-03 — Sale-price-only edit (sale_price changed => avg_cost unchanged)
 *   AS-04 — Unrelated product edit (name/sku/barcode changed => avg_cost unchanged)
 *   AS-05 — Zero-stock revaluation and restock (WAC fallback when stock=0)
 *   AS-06 — Existing-stock revaluation and subsequent WAC (ROUND((Q_old*C_old + Q_rec*C_new)/(Q_old+Q_rec)))
 *   AS-07 — Historical sale snapshot preservation (sale_lines.cost_price_snapshot immutable)
 *   AS-08 — No stock movement from manual revaluation (stock_movements count unchanged)
 *   AS-09 — Negative cost rejection (negative purchase_price or average_cost rejected with 400)
 *   AS-10 — Concurrent product updates (row locking via SELECT FOR UPDATE prevents lost updates)
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';

import {
  updateProduct,
  receiveStock,
  RepoError,
  type UpdateProductDto,
} from '../repositories/product.repo.js';

import {
  completeSale,
  getSaleLines,
} from '../repositories/sale.repo.js';

// ─── Environment bootstrap ────────────────────────────────────────────────────

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath) && !process.env['DATABASE_URL']) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^DATABASE_URL\s*=\s*(.+)$/);
    if (m) process.env['DATABASE_URL'] = m[1].trim().replace(/^["']|["']$/g, '');
  }
}

const DATABASE_URL = process.env['DATABASE_URL'];
const SKIP_DB = !DATABASE_URL;

describe('FIX 02 — Product Edit Average-Cost Revaluation Suite', { skip: SKIP_DB ? 'DATABASE_URL not set' : false }, () => {
  let pool: Pool;
  const createdProductIds: string[] = [];
  const createdSaleIds: string[] = [];
  const defaultBranchId = '00000000-0000-0000-0000-000000000002'; // Main Branch
  const testTypeId = uuidv4();

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
       VALUES ($1, 'Test Product Type', $2, 1, $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [testTypeId, `TYPE-${testTypeId.slice(0, 8)}`, now]
    );
  });

  after(async () => {
    try {
      if (createdSaleIds.length > 0) {
        await pool.query('DELETE FROM sale_payments WHERE sale_id = ANY($1)', [createdSaleIds]);
        await pool.query('DELETE FROM sale_lines WHERE sale_id = ANY($1)', [createdSaleIds]);
        await pool.query('DELETE FROM sales WHERE id = ANY($1)', [createdSaleIds]);
      }
      if (createdProductIds.length > 0) {
        await pool.query('DELETE FROM sale_lines WHERE product_id = ANY($1)', [createdProductIds]);
        await pool.query('DELETE FROM stock_movements WHERE product_id = ANY($1)', [createdProductIds]);
        await pool.query('DELETE FROM stock WHERE product_id = ANY($1)', [createdProductIds]);
        await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds]);
      }
      await pool.query('DELETE FROM product_types WHERE id = $1', [testTypeId]);
    } catch (e) {
      console.error('Error during cleanup:', e);
    } finally {
      await pool.end();
    }
  });

  async function createTestProduct(overrides: {
    purchase_price?: number;
    average_cost?: number;
    sale_price?: number;
    initial_stock?: number;
  } = {}) {
    const id = uuidv4();
    createdProductIds.push(id);
    const sku = `TEST-SKU-${id.slice(0, 8).toUpperCase()}`;
    const name = `Test Product ${id.slice(0, 8)}`;
    const purchasePrice = overrides.purchase_price ?? 1600;
    const avgCost = overrides.average_cost ?? 1600;
    const salePrice = overrides.sale_price ?? 2000;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO products (
        id, name, normalized_name, sku, type_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, created_at, updated_at
      ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, 5, 1, $8, $8)`,
      [id, name, sku, testTypeId, purchasePrice, avgCost, salePrice, now]
    );

    if (overrides.initial_stock !== undefined && overrides.initial_stock > 0) {
      await pool.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = $3`,
        [id, defaultBranchId, overrides.initial_stock, now]
      );
    }

    return { id, sku, name, purchasePrice, avgCost, salePrice };
  }

  test('AS-01 — Purchase price revaluation (purchase_price: 1600 -> 2400 => avg_cost: 2400)', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600 });

    const updated = await updateProduct(pool, prod.id, {
      purchase_price: 2400,
    });

    assert.equal(updated.purchase_price, 2400, 'purchase_price must be updated to 2400');
    assert.equal(updated.average_cost, 2400, 'average_cost must be automatically revalued to 2400');

    // Confirm in DB
    const res = await pool.query('SELECT purchase_price, average_cost FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].purchase_price), 2400);
    assert.equal(Number(res.rows[0].average_cost), 2400);
  });

  test('AS-02 — Explicit average-cost override (purchase_price: 2400, average_cost: 2100 => avg_cost: 2100)', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600 });

    const updated = await updateProduct(pool, prod.id, {
      purchase_price: 2400,
      average_cost: 2100,
    });

    assert.equal(updated.purchase_price, 2400, 'purchase_price must be 2400');
    assert.equal(updated.average_cost, 2100, 'explicit average_cost override (2100) must take precedence');

    const res = await pool.query('SELECT purchase_price, average_cost FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].purchase_price), 2400);
    assert.equal(Number(res.rows[0].average_cost), 2100);
  });

  test('AS-03 — Sale-price-only edit preserves existing average_cost', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600, sale_price: 2000 });

    const updated = await updateProduct(pool, prod.id, {
      sale_price: 2500,
    });

    assert.equal(updated.sale_price, 2500, 'sale_price must be updated to 2500');
    assert.equal(updated.purchase_price, 1600, 'purchase_price must remain 1600');
    assert.equal(updated.average_cost, 1600, 'average_cost must remain unchanged at 1600');

    const res = await pool.query('SELECT purchase_price, average_cost, sale_price FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].sale_price), 2500);
    assert.equal(Number(res.rows[0].purchase_price), 1600);
    assert.equal(Number(res.rows[0].average_cost), 1600);
  });

  test('AS-04 — Unrelated product edit (name/threshold) preserves average_cost and purchase_price', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600 });

    const updated = await updateProduct(pool, prod.id, {
      name: 'Renamed Product Title',
      low_stock_threshold: 12,
    });

    assert.equal(updated.name, 'Renamed Product Title');
    assert.equal(updated.low_stock_threshold, 12);
    assert.equal(updated.purchase_price, 1600, 'purchase_price must be preserved');
    assert.equal(updated.average_cost, 1600, 'average_cost must be preserved');
  });

  test('AS-05 — Zero-stock revaluation and subsequent restock WAC behavior', async () => {
    // Initial product has 0 stock, cost = 1600
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600, initial_stock: 0 });

    // Manually revalue to 2000
    await updateProduct(pool, prod.id, { purchase_price: 2000 });

    // Receive 10 units at 2500
    // With 0 existing stock in warehouse (qOld = 0), WAC fallback sets cWac = cNew = 2500
    const restockRes = await receiveStock(pool, {
      product_id: prod.id,
      branch_id: defaultBranchId,
      quantity_received: 10,
      unit_cost: 2500,
    });

    assert.equal(restockRes.new_average_cost, 2500, 'With 0 stock, restock at 2500 yields new_average_cost = 2500');

    const res = await pool.query('SELECT purchase_price, average_cost FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].purchase_price), 2500);
    assert.equal(Number(res.rows[0].average_cost), 2500);
  });

  test('AS-06 — Existing-stock revaluation and subsequent WAC blending', async () => {
    // 10 units initially in stock at 1000
    const prod = await createTestProduct({ purchase_price: 1000, average_cost: 1000, initial_stock: 10 });

    // Manual revaluation: purchase_price updated to 2000 -> average_cost becomes 2000
    const revalued = await updateProduct(pool, prod.id, { purchase_price: 2000 });
    assert.equal(revalued.average_cost, 2000);

    // Now receive 10 more units at unit_cost = 3000
    // Expected WAC:
    // Q_old = 10, C_old = 2000 (the revalued cost)
    // Q_rec = 10, C_new = 3000
    // C_WAC = ((10 * 2000) + (10 * 3000)) / (10 + 10) = (20000 + 30000) / 20 = 50000 / 20 = 2500
    const restockRes = await receiveStock(pool, {
      product_id: prod.id,
      branch_id: defaultBranchId,
      quantity_received: 10,
      unit_cost: 3000,
    });

    assert.equal(restockRes.new_average_cost, 2500, 'WAC must blend the revalued old cost (2000) with new receipt (3000)');

    const res = await pool.query('SELECT purchase_price, average_cost FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].average_cost), 2500);
    assert.equal(Number(res.rows[0].purchase_price), 3000);
  });

  test('AS-07 — Historical sale snapshot preservation', async () => {
    const prod = await createTestProduct({ purchase_price: 1500, average_cost: 1500, sale_price: 2500, initial_stock: 20 });

    // Complete a sale
    const saleId = uuidv4();
    createdSaleIds.push(saleId);
    const saleRes = await completeSale(
      pool,
      {
        idempotency_key: `sale-test-${saleId.slice(0, 8)}`,
        branch_id: defaultBranchId,
        customer_id: null,
        items: [
          {
            product_id: prod.id,
            quantity: 2,
            unit_price: 2500,
            discount: 0,
          },
        ],
        payments: [
          {
            method: 'CASH',
            amount: 5000,
          },
        ],
      },
      null,
      defaultBranchId,
      true
    );

    assert.ok(saleRes.sale.id);

    // Verify snapshot in sale_lines
    const linesBefore = await getSaleLines(pool, saleRes.sale.id);
    assert.equal(linesBefore.length, 1);
    assert.equal(Number(linesBefore[0].cost_price_snapshot), 1500, 'Snapshot must be 1500 at checkout');

    // Now manually edit product purchase_price and average_cost to 4000
    await updateProduct(pool, prod.id, {
      purchase_price: 4000,
    });

    // Check historical sale lines again
    const linesAfter = await getSaleLines(pool, saleRes.sale.id);
    assert.equal(Number(linesAfter[0].cost_price_snapshot), 1500, 'Historical sale snapshot MUST remain 1500 after product revaluation');
  });

  test('AS-08 — No stock movement created from manual revaluation', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600, initial_stock: 5 });

    const movementsBefore = await pool.query('SELECT COUNT(*) AS cnt FROM stock_movements WHERE product_id = $1', [prod.id]);
    const countBefore = Number(movementsBefore.rows[0].cnt);

    // Perform manual revaluation
    await updateProduct(pool, prod.id, { purchase_price: 2800 });

    const movementsAfter = await pool.query('SELECT COUNT(*) AS cnt FROM stock_movements WHERE product_id = $1', [prod.id]);
    const countAfter = Number(movementsAfter.rows[0].cnt);

    assert.equal(countAfter, countBefore, 'Manual revaluation must NOT generate any stock movements');
  });

  test('AS-09 — Negative cost rejection and transaction rollback', async () => {
    const prod = await createTestProduct({ purchase_price: 1600, average_cost: 1600 });

    // Negative purchase price
    await assert.rejects(
      async () => {
        await updateProduct(pool, prod.id, { purchase_price: -500 });
      },
      (err: RepoError) => {
        assert.equal(err.statusCode, 400);
        return true;
      },
      'Negative purchase price must be rejected with 400'
    );

    // Negative explicit average cost
    await assert.rejects(
      async () => {
        await updateProduct(pool, prod.id, { average_cost: -100 });
      },
      (err: RepoError) => {
        assert.equal(err.statusCode, 400);
        return true;
      },
      'Negative average cost must be rejected with 400'
    );

    // Verify product in DB is unchanged
    const res = await pool.query('SELECT purchase_price, average_cost FROM products WHERE id = $1', [prod.id]);
    assert.equal(Number(res.rows[0].purchase_price), 1600);
    assert.equal(Number(res.rows[0].average_cost), 1600);
  });

  test('AS-10 — Concurrent product updates serialize safely via row locking (SELECT FOR UPDATE)', async () => {
    const prod = await createTestProduct({ purchase_price: 1000, average_cost: 1000, sale_price: 1500 });

    // Run 2 concurrent updates:
    // Update A: updates purchase_price to 2000
    // Update B: updates sale_price to 3000
    const [resA, resB] = await Promise.all([
      updateProduct(pool, prod.id, { purchase_price: 2000 }),
      updateProduct(pool, prod.id, { sale_price: 3000 }),
    ]);

    // Both updates should succeed without deadlock
    assert.ok(resA);
    assert.ok(resB);

    // In the DB, the final state must reflect both changes or the winning serialized order
    const finalRes = await pool.query('SELECT purchase_price, average_cost, sale_price FROM products WHERE id = $1', [prod.id]);
    const row = finalRes.rows[0];

    // purchase_price and average_cost must be 2000 (revalued by Update A)
    // and sale_price must be 3000 (updated by Update B)
    assert.equal(Number(row.purchase_price), 2000, 'purchase_price must be 2000');
    assert.equal(Number(row.average_cost), 2000, 'average_cost must be 2000');
    assert.equal(Number(row.sale_price), 3000, 'sale_price must be 3000');
  });

  test('AS-11 — Concurrent updateProduct() vs receiveStock() row lock serialization', async () => {
    // Initial state: 10 units in stock @ cost 1000, purchase_price = 1000, sale_price = 1500
    const prod = await createTestProduct({
      purchase_price: 1000,
      average_cost: 1000,
      sale_price: 1500,
      initial_stock: 10,
    });

    // We launch updateProduct (revalue purchase_price to 2000) concurrently with
    // receiveStock (receive 10 units @ unit_cost 3000) on the exact same product.
    // Because both operations acquire exclusive row locks (SELECT ... FOR UPDATE) on products,
    // they must execute sequentially:
    //
    // Case A (updateProduct commits first):
    //   1. Product revalued to average_cost = 2000, purchase_price = 2000.
    //   2. receiveStock runs next: reads Q_old = 10, C_old = 2000, Q_rec = 10, C_new = 3000.
    //      WAC = ((10 * 2000) + (10 * 3000)) / (10 + 10) = 2500.
    //      Final stock quantity = 20.
    //      Final purchase_price = 3000 (from restock).
    //
    // Case B (receiveStock commits first):
    //   1. receiveStock runs: reads Q_old = 10, C_old = 1000, Q_rec = 10, C_new = 3000.
    //      WAC = ((10 * 1000) + (10 * 3000)) / 20 = 2000.
    //      Stock quantity = 20, purchase_price = 3000.
    //   2. updateProduct runs next: manually revalues purchase_price to 2000 -> average_cost = 2000.
    //      Final stock quantity = 20.
    //      Final purchase_price = 2000.
    //
    // IN BOTH SERIALIZATIONS:
    // - Final stock quantity is strictly 20 (no lost stock or missing movement).
    // - Exactly 1 stock_movements IN row is created for 10 units.
    // - Zero lost updates or deadlocks occur.
    // - The final average_cost is valid for the serialized order.

    const [updateRes, receiveRes] = await Promise.all([
      updateProduct(pool, prod.id, { purchase_price: 2000 }),
      receiveStock(pool, {
        product_id: prod.id,
        branch_id: defaultBranchId,
        quantity_received: 10,
        unit_cost: 3000,
      }),
    ]);

    assert.ok(updateRes);
    assert.ok(receiveRes);

    // Verify DB state
    const prodCheck = await pool.query(
      'SELECT purchase_price, average_cost FROM products WHERE id = $1',
      [prod.id]
    );
    const finalProd = prodCheck.rows[0];

    const stockCheck = await pool.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
      [prod.id, defaultBranchId]
    );
    assert.equal(Number(stockCheck.rows[0].quantity), 20, 'Final stock quantity must strictly be 20');

    const movementsCheck = await pool.query(
      'SELECT COUNT(*) AS cnt, SUM(quantity) AS total_qty FROM stock_movements WHERE product_id = $1',
      [prod.id]
    );
    assert.equal(Number(movementsCheck.rows[0].cnt), 1, 'Exactly one restock movement must exist');
    assert.equal(Number(movementsCheck.rows[0].total_qty), 10, 'Stock movement quantity must be exactly 10');

    // Confirm final average_cost matches one of the two valid serialized execution outcomes
    const finalAvgCost = Number(finalProd.average_cost);
    const validOutcomes = [2500, 2000];
    assert.ok(
      validOutcomes.includes(finalAvgCost),
      `Final average_cost (${finalAvgCost}) must be one of the valid serialized outcomes: ${validOutcomes.join(', ')}`
    );
  });
});
