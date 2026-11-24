/**
 * Sales Analytics Return Accounting Unit Tests
 *
 * Exercises getAnalyticsOverview() calculations with mocked PostgreSQL Pool queries.
 * Validates:
 *  1. Normal sales without returns.
 *  2. Full product return.
 *  3. Partial product return.
 *  4. Multiple partial returns.
 *  5. Return-only reporting period with negative net sales.
 *  6. Historical cost snapshot usage in COGS reversal.
 *  7. Correct gross-profit calculation for negative net sales.
 *  8. Gross margin zero guard on non-positive net sales.
 *  9. Matching branch and date filters between returned revenue and returned COGS.
 * 10. Correct SQL query parameter ordering.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { getAnalyticsOverview, SaFilters } from '../repositories/sales_analytics.repo';

interface QueryMockState {
  salesGross: string;
  salesInvoices: string;
  linesCogs: string;
  mobileCogs: string;
  cashReceived: string;
  creditSales: string;
  returnedRevenue: string;
  returnsCount: string;
  returnedCogs: string;
  capturedQueries: Array<{ sql: string; params: unknown[] }>;
}

function createMockPool(state: QueryMockState): Pool {
  return {
    query: async (sqlText: string, params: unknown[] = []) => {
      state.capturedQueries.push({ sql: sqlText, params });

      // 7. Returns COGS from sales_return_lines
      if (/FROM\s+sales_return_lines\b/i.test(sqlText)) {
        return {
          rows: [{ returned_cogs: state.returnedCogs }],
          rowCount: 1,
        };
      }

      // 6. Returns revenue & count from sales_returns
      if (/FROM\s+sales_returns\b/i.test(sqlText)) {
        return {
          rows: [{
            returned_revenue: state.returnedRevenue,
            returns_count: state.returnsCount,
          }],
          rowCount: 1,
        };
      }

      // 5. Credit sales from customer_ledger_entries
      if (/FROM\s+customer_ledger_entries\b/i.test(sqlText)) {
        return {
          rows: [{ credit_sales: state.creditSales }],
          rowCount: 1,
        };
      }

      // 4. Cash received from sale_payments
      if (/FROM\s+sale_payments\b/i.test(sqlText)) {
        return {
          rows: [{ cash_received: state.cashReceived }],
          rowCount: 1,
        };
      }

      // 3. Mobile COGS from mobile_sale_items
      if (/FROM\s+mobile_sale_items\b/i.test(sqlText)) {
        return {
          rows: [{ mobile_cogs: state.mobileCogs }],
          rowCount: 1,
        };
      }

      // 2. Lines COGS from sale_lines
      if (/FROM\s+sale_lines\b/i.test(sqlText)) {
        return {
          rows: [{ lines_cogs: state.linesCogs }],
          rowCount: 1,
        };
      }

      // 1. Sales revenue & invoice count from sales
      if (/FROM\s+sales\b/i.test(sqlText)) {
        return {
          rows: [{
            gross_sales: state.salesGross,
            total_invoices: state.salesInvoices,
          }],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
}

describe('Sales Analytics Return Accounting Suite', () => {
  test('1. Normal sales without returns calculates net sales, COGS and margin accurately', async () => {
    const state: QueryMockState = {
      salesGross: '100000',
      salesInvoices: '10',
      linesCogs: '60000',
      mobileCogs: '15000',
      cashReceived: '70000',
      creditSales: '30000',
      returnedRevenue: '0',
      returnsCount: '0',
      returnedCogs: '0',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.gross_sales, 100000, 'gross_sales must match');
    assert.strictEqual(result.net_sales, 100000, 'net_sales must equal gross_sales when no returns');
    assert.strictEqual(result.total_cogs, 75000, 'total_cogs must be 60000 + 15000');
    assert.strictEqual(result.gross_profit, 25000, 'gross_profit must be 100000 - 75000');
    assert.strictEqual(result.gross_margin, 25.0, 'gross_margin must be 25%');
    assert.strictEqual(result.total_invoices, 10, 'total_invoices must be 10');
    assert.strictEqual(result.returns_count, 0, 'returns_count must be 0');
    assert.strictEqual(result.returned_revenue, 0, 'returned_revenue must be 0');
  });

  test('2. Full product return reverses both revenue and COGS completely', async () => {
    // Original sale: Rs 20,000, COGS: Rs 15,000
    // Entire invoice returned: returnedRevenue: 20,000, returnedCogs: 15,000
    const state: QueryMockState = {
      salesGross: '20000',
      salesInvoices: '1',
      linesCogs: '15000',
      mobileCogs: '0',
      cashReceived: '20000',
      creditSales: '0',
      returnedRevenue: '20000',
      returnsCount: '1',
      returnedCogs: '15000',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.gross_sales, 20000);
    assert.strictEqual(result.net_sales, 0, 'net_sales must be exactly 0 after full return');
    assert.strictEqual(result.total_cogs, 0, 'total_cogs must be exactly 0 after full return');
    assert.strictEqual(result.gross_profit, 0, 'gross_profit must be 0');
    assert.strictEqual(result.gross_margin, 0, 'gross_margin must be 0 when net_sales is 0');
    assert.strictEqual(result.total_invoices, 1, 'invoice count remains 1');
    assert.strictEqual(result.returns_count, 1, 'returns_count is 1');
  });

  test('3. Partial product return reverses proportional revenue and historical COGS', async () => {
    // 5 units sold @ Rs 2,000 = Rs 10,000; cost @ Rs 1,400 = Rs 7,000
    // 2 units returned = returnedRevenue: 4,000; returnedCogs: 2,800
    const state: QueryMockState = {
      salesGross: '10000',
      salesInvoices: '1',
      linesCogs: '7000',
      mobileCogs: '0',
      cashReceived: '10000',
      creditSales: '0',
      returnedRevenue: '4000',
      returnsCount: '1',
      returnedCogs: '2800',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.gross_sales, 10000);
    assert.strictEqual(result.net_sales, 6000, 'net_sales must be 10000 - 4000 = 6000');
    assert.strictEqual(result.total_cogs, 4200, 'total_cogs must be 7000 - 2800 = 4200');
    assert.strictEqual(result.gross_profit, 1800, 'gross_profit must be 6000 - 4200 = 1800');
    assert.strictEqual(result.gross_margin, 30.0, 'gross_margin must be (1800 / 6000) * 100 = 30%');
  });

  test('4. Multiple partial returns aggregate cumulative returned revenue and COGS', async () => {
    // Sale: Rs 50,000, linesCogs: Rs 35,000
    // Return 1: Rs 10,000, COGS: Rs 7,000
    // Return 2: Rs 15,000, COGS: Rs 10,500
    // Total returns: Rs 25,000, returnedCogs: Rs 17,500, returnsCount: 2
    const state: QueryMockState = {
      salesGross: '50000',
      salesInvoices: '2',
      linesCogs: '35000',
      mobileCogs: '0',
      cashReceived: '50000',
      creditSales: '0',
      returnedRevenue: '25000',
      returnsCount: '2',
      returnedCogs: '17500',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.net_sales, 25000, 'net_sales = 50000 - 25000');
    assert.strictEqual(result.total_cogs, 17500, 'total_cogs = 35000 - 17500');
    assert.strictEqual(result.gross_profit, 7500, 'gross_profit = 25000 - 17500');
    assert.strictEqual(result.gross_margin, 30.0, 'gross_margin = (7500 / 25000) * 100');
    assert.strictEqual(result.returns_count, 2);
  });

  test('5. Return-only period produces legitimate negative net sales without zero-clamping', async () => {
    // A reporting period with 0 sales and a return of Rs 5,000 (historical cost Rs 3,500):
    const state: QueryMockState = {
      salesGross: '0',
      salesInvoices: '0',
      linesCogs: '0',
      mobileCogs: '0',
      cashReceived: '0',
      creditSales: '0',
      returnedRevenue: '5000',
      returnsCount: '1',
      returnedCogs: '3500',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.gross_sales, 0);
    assert.strictEqual(result.net_sales, -5000, 'net_sales must be -5000 and NOT clamped to 0');
    assert.strictEqual(result.total_cogs, -3500, 'total_cogs must be 0 - 3500 = -3500');
  });

  test('6. Historical cost snapshot usage is preserved during COGS reversal', async () => {
    // Product sold when cost was Rs 800 (current inventory cost might be Rs 1,000)
    // SQL query joins sales_return_lines srl -> sale_lines sl ON srl.sale_line_id = sl.id
    // to retrieve SUM(srl.quantity * sl.cost_price_snapshot)
    const state: QueryMockState = {
      salesGross: '3000',
      salesInvoices: '1',
      linesCogs: '800',
      mobileCogs: '0',
      cashReceived: '3000',
      creditSales: '0',
      returnedRevenue: '1500',
      returnsCount: '1',
      returnedCogs: '400', // 0.5 * 800
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.total_cogs, 400, 'total_cogs should be 800 - 400 = 400');
    assert.strictEqual(result.gross_profit, 1100, 'gross_profit = 1500 - 400 = 1100');
  });

  test('7. Gross profit calculation for negative net sales reverses profit exactly', async () => {
    // Net sales: -5000, total COGS: -3500
    // Gross profit: -5000 - (-3500) = -1500 (exactly reverses the original Rs 1500 profit)
    const state: QueryMockState = {
      salesGross: '0',
      salesInvoices: '0',
      linesCogs: '0',
      mobileCogs: '0',
      cashReceived: '0',
      creditSales: '0',
      returnedRevenue: '5000',
      returnsCount: '1',
      returnedCogs: '3500',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const result = await getAnalyticsOverview(pool, { branch_id: 'b-1' });

    assert.strictEqual(result.gross_profit, -1500, 'gross_profit must reflect exact reversed profit: -1500');
  });

  test('8. Gross margin zero guard: non-positive net sales returns margin 0 without NaN/Inf', async () => {
    const stateZero: QueryMockState = {
      salesGross: '0',
      salesInvoices: '0',
      linesCogs: '0',
      mobileCogs: '0',
      cashReceived: '0',
      creditSales: '0',
      returnedRevenue: '0',
      returnsCount: '0',
      returnedCogs: '0',
      capturedQueries: [],
    };
    const poolZero = createMockPool(stateZero);
    const resultZero = await getAnalyticsOverview(poolZero, { branch_id: 'b-1' });
    assert.strictEqual(resultZero.gross_margin, 0, 'gross_margin must be 0 when net_sales is 0');
    assert.ok(!isNaN(resultZero.gross_margin), 'gross_margin must not be NaN');

    const stateNeg: QueryMockState = {
      salesGross: '0',
      salesInvoices: '0',
      linesCogs: '0',
      mobileCogs: '0',
      cashReceived: '0',
      creditSales: '0',
      returnedRevenue: '5000',
      returnsCount: '1',
      returnedCogs: '3500',
      capturedQueries: [],
    };
    const poolNeg = createMockPool(stateNeg);
    const resultNeg = await getAnalyticsOverview(poolNeg, { branch_id: 'b-1' });
    assert.strictEqual(resultNeg.gross_margin, 0, 'gross_margin must be 0 when net_sales is negative');
    assert.ok(!isNaN(resultNeg.gross_margin), 'gross_margin must not be NaN for negative net_sales');
  });

  test('9. Matching branch and date filters between returned revenue and returned COGS', async () => {
    const state: QueryMockState = {
      salesGross: '50000',
      salesInvoices: '5',
      linesCogs: '30000',
      mobileCogs: '0',
      cashReceived: '50000',
      creditSales: '0',
      returnedRevenue: '5000',
      returnsCount: '1',
      returnedCogs: '3000',
      capturedQueries: [],
    };
    const pool = createMockPool(state);
    const filters: SaFilters = {
      branch_id: 'branch-xyz',
      start_date: '2026-11-01',
      end_date: '2026-11-30',
    };
    await getAnalyticsOverview(pool, filters);

    const retRevQuery = state.capturedQueries.find(q => /FROM\s+sales_returns\b/i.test(q.sql));
    const retCogsQuery = state.capturedQueries.find(q => /FROM\s+sales_return_lines\b/i.test(q.sql));

    assert.ok(retRevQuery, 'returnsQ must be executed');
    assert.ok(retCogsQuery, 'returnsCogsQ must be executed');

    // Both queries must have 3 parameters: branch_id, start_date (00:00:00.000Z), end_date (23:59:59.999Z)
    assert.strictEqual(retRevQuery.params.length, 3, 'returnsQ must have 3 parameters');
    assert.strictEqual(retCogsQuery.params.length, 3, 'returnsCogsQ must have 3 parameters');

    assert.strictEqual(retRevQuery.params[0], 'branch-xyz');
    assert.strictEqual(retCogsQuery.params[0], 'branch-xyz');

    // Verify parsed ISO boundaries match exactly
    assert.strictEqual(retRevQuery.params[1], retCogsQuery.params[1], 'start_date must match');
    assert.strictEqual(retRevQuery.params[2], retCogsQuery.params[2], 'end_date must match');

    // Verify SQL filter predicates
    assert.ok(retRevQuery.sql.includes('branch_id = $1'), 'returnsQ filters by branch_id');
    assert.ok(retCogsQuery.sql.includes('sr.branch_id = $1'), 'returnsCogsQ filters by sr.branch_id');
    assert.ok(retRevQuery.sql.includes("status = 'COMPLETED'"), 'returnsQ filters by COMPLETED');
    assert.ok(retCogsQuery.sql.includes("sr.status = 'COMPLETED'"), 'returnsCogsQ filters by sr.status COMPLETED');
  });

  test('10. Correct SQL query parameter ordering for returnsCogsQ with partial filters', async () => {
    const state: QueryMockState = {
      salesGross: '0',
      salesInvoices: '0',
      linesCogs: '0',
      mobileCogs: '0',
      cashReceived: '0',
      creditSales: '0',
      returnedRevenue: '0',
      returnsCount: '0',
      returnedCogs: '0',
      capturedQueries: [],
    };
    const pool = createMockPool(state);

    // Test with only start_date (no branch_id, no end_date)
    await getAnalyticsOverview(pool, { start_date: '2026-11-22' });
    const cogsQuery = state.capturedQueries.find(q => /FROM\s+sales_return_lines\b/i.test(q.sql));
    assert.ok(cogsQuery);
    assert.strictEqual(cogsQuery.params.length, 1);
    assert.ok(cogsQuery.sql.includes('sr.created_at >= $1'));
  });
});
