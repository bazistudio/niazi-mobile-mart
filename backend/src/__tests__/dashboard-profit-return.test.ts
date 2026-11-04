/**
 * Dashboard Profit & Cash Return Accounting Unit Test
 * Verifies that getProfitSummary() accurately computes:
 * - net_sales = grossNetSales - returnedRevenue (no zero-clamping)
 * - total_cogs = grossCogs - returnedCogs (no zero-clamping)
 * - grossProfit = netSales - totalCogs
 * - grossMargin = (grossProfit / netSales) * 100
 * - total_invoices = completed sales invoice count (NOT decremented by returns_count)
 * - returns_count and returned_revenue separately tracked
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { getProfitSummary } from '../repositories/profit.repo';

describe('Dashboard Profit Return Accounting Suite', () => {
  test('Cash return reduces net revenue and COGS, reversing profit exactly', async () => {
    // Mock database responses matching the user reference screenshots:
    // Reference B (Sale of a102):
    // 5 sales, gross_sales = 21160, discounts = 0, net_sales = 21160
    // COGS = 20260 (profit = 900)
    //
    // Cash Return of 1 x a102 (Price 2920, Cost 2700):
    // returned_revenue = 2920, returns_count = 1
    // returned_cogs = 2700
    const mockPool = {
      query: async (sqlText: string) => {
        if (/FROM\s+sales_return_lines\b/i.test(sqlText)) {
          return {
            rows: [{
              returned_cogs: '2700',
              returned_items: '1'
            }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sales_returns\b/i.test(sqlText)) {
          return {
            rows: [{
              returned_revenue: '2920',
              returns_count: '1'
            }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sale_lines\b/i.test(sqlText)) {
          return {
            rows: [{
              total_cogs: '20260',
              total_items_sold: '6'
            }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sales\b/i.test(sqlText)) {
          return {
            rows: [{
              gross_sales: '21160',
              total_discounts: '0',
              net_sales: '21160',
              total_invoices: '5'
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }
    } as unknown as Pool;

    const summary = await getProfitSummary(mockPool, { branch_id: 'branch-1' });

    // Mathematical verification:
    // Net Sales = 21160 - 2920 = 18240
    assert.strictEqual(summary.net_sales, 18240, 'net_sales must be 18240');
    // Total COGS = 20260 - 2700 = 17560
    assert.strictEqual(summary.total_cogs, 17560, 'total_cogs must be 17560');
    // Gross Profit = 18240 - 17560 = 680
    assert.strictEqual(summary.gross_profit, 680, 'gross_profit must be 680 (reversed 220)');
    // Gross Margin = (680 / 18240) * 100 = 3.73%
    assert.strictEqual(summary.gross_margin, 3.73, 'gross_margin must be 3.73%');
    // Completed sales invoice count must NOT be decremented (remains 5)
    assert.strictEqual(summary.total_invoices, 5, 'total_invoices must remain 5 sales');
    // Returns count separately tracked
    assert.strictEqual(summary.returns_count, 1, 'returns_count must be 1');
    assert.strictEqual(summary.returned_revenue, 2920, 'returned_revenue must be 2920');
  });

  test('Return-only day retains negative revenue and profit without zero-clamping', async () => {
    // Return of 2920 occurs on a Tuesday when 0 sales occurred:
    const mockPool = {
      query: async (sqlText: string) => {
        if (/FROM\s+sales_return_lines\b/i.test(sqlText)) {
          return {
            rows: [{ returned_cogs: '2700' }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sales_returns\b/i.test(sqlText)) {
          return {
            rows: [{ returned_revenue: '2920', returns_count: '1' }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sale_lines\b/i.test(sqlText)) {
          return {
            rows: [{ total_cogs: '0', total_items_sold: '0' }],
            rowCount: 1,
          };
        }
        if (/FROM\s+sales\b/i.test(sqlText)) {
          return {
            rows: [{ gross_sales: '0', total_discounts: '0', net_sales: '0', total_invoices: '0' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }
    } as unknown as Pool;

    const summary = await getProfitSummary(mockPool, { branch_id: 'branch-1' });

    // Without zero-clamping:
    assert.strictEqual(summary.net_sales, -2920, 'net_sales must reflect -2920');
    assert.strictEqual(summary.total_cogs, -2700, 'total_cogs must reflect -2700');
    assert.strictEqual(summary.gross_profit, -220, 'gross_profit must reflect -220');
    assert.strictEqual(summary.gross_margin, 0, 'gross_margin for negative net_sales is 0');
    assert.strictEqual(summary.total_invoices, 0, 'total_invoices remains 0');
    assert.strictEqual(summary.returns_count, 1, 'returns_count is 1');
  });
});
