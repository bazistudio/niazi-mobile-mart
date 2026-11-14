/**
 * Niazi Mobile Mart — CONCURRENCY-01 Test Suite
 *
 * Verifies the repository-level amount = quantity × unit_price invariant added
 * in CONCURRENCY-01, which runs inside the FOR UPDATE row lock in
 * ExpenseRepo.updateExpense().
 *
 * Design
 * ──────
 * Tests exercise ExpenseRepo directly (repository layer) using a stub pool/client
 * that simulates the locked SELECT … FOR UPDATE returning controlled expense rows.
 *
 * The stub intercepts:
 *   BEGIN / COMMIT / ROLLBACK       → no-op (succeed silently)
 *   SELECT … FOR UPDATE             → returns a controlled existing expense row
 *   SELECT … cash_sessions          → returns a stub open session (to reach invariant)
 *   UPDATE expenses SET …           → recorded (counts mutations)
 *   INSERT INTO cash_movements …    → no-op
 *   INSERT INTO change_log …        → no-op
 *
 * This validates that:
 *   - Consistent effective values pass through (repo.updateExpense resolves)
 *   - Inconsistent effective values throw ExpenseRepoError 400 BEFORE the UPDATE
 *   - The check fires against locked (server) values, not stale DTO values
 *
 * Test matrix (8 required scenarios):
 *
 *   C01-01  Consistent full supply (qty=3, price=600, amount=1800)             → resolves
 *   C01-02  Inconsistent full supply (qty=3, price=600, amount=1801)           → 400 VALIDATION
 *   C01-03  qty-only partial (new qty=4, locked price=500, locked amount=1000) → 400 VALIDATION
 *   C01-04  unit_price-only partial (new price=600, locked qty=2, amount=1000) → 400 VALIDATION
 *   C01-05  amount-only partial (new amount=900, locked qty=2, price=500)      → 400 VALIDATION
 *   C01-06  Description-only update (no numeric fields)                        → resolves
 *   C01-07  Both qty and unit_price null in DB, amount-only change             → resolves (invariant N/A)
 *   C01-08  Concurrent stale-pass scenario: locked row changed under service   → 400 VALIDATION
 *
 * No live database required.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { EventEmitter } from 'node:events';

import { ExpenseRepo, ExpenseRepoError } from '../repositories/expense.repo.js';
import type { Expense, UpdateExpenseDto } from '../repositories/expense.repo.js';
import type { Pool, PoolClient, QueryResult } from 'pg';

// ─── Base locked expense row ──────────────────────────────────────────────────

const LOCKED_EXPENSE: Expense = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  expense_number: 'EXP-000001',
  category_id: 'cccccccc-0000-0000-0000-000000000001',
  category_name: 'Office Supplies',
  branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
  branch_name: 'Main Branch',
  branch_organization_id: '00000000-0000-0000-0000-000000000001',
  amount: 1000,         // 2 × 500
  quantity: 2,
  unit_price: 500,
  payment_method: 'CASH',
  description: 'Pens',
  notes: null,
  expense_date: '2026-11-14',
  status: 'COMPLETED',
  performed_by: null,
  performed_by_name: null,
  performed_by_role: null,
  created_at: '2026-11-14T10:00:00Z',
  updated_at: '2026-11-14T10:00:00Z',
};

// ─── Stub pool/client builder ─────────────────────────────────────────────────

interface StubControl {
  lockedExpense: Expense;
  updateCount: { n: number };
}

function makeStubPool(ctrl: StubControl): Pool {
  let committed = false;
  let rolledBack = false;

  const client = {
    query: async (sql: string, _params?: unknown[]): Promise<QueryResult<Expense>> => {
      const s = typeof sql === 'string' ? sql.trim().toUpperCase() : '';

      if (s === 'BEGIN') return { rows: [], rowCount: 0, command: 'BEGIN', oid: 0, fields: [] };
      if (s === 'COMMIT') { committed = true; return { rows: [], rowCount: 0, command: 'COMMIT', oid: 0, fields: [] }; }
      if (s === 'ROLLBACK') { rolledBack = true; return { rows: [], rowCount: 0, command: 'ROLLBACK', oid: 0, fields: [] }; }

      // FOR UPDATE — return the locked expense
      if (s.includes('FOR UPDATE') && s.includes('FROM EXPENSES')) {
        return { rows: [ctrl.lockedExpense], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }

      // cash_sessions FOR UPDATE — return an open session so we don't fail on CASH movements
      if (s.includes('FOR UPDATE') && s.includes('CASH_SESSIONS')) {
        return { rows: [{ id: 'sess-0000-0000-0000-000000000001' }] as unknown as Expense[], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }

      // Final re-read after COMMIT (getExpenseByIdWithClient)
      if (s.includes('FROM EXPENSES') && !s.includes('FOR UPDATE')) {
        return { rows: [ctrl.lockedExpense], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }

      // UPDATE expenses SET …
      if (s.startsWith('UPDATE EXPENSES')) {
        ctrl.updateCount.n++;
        return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }

      // INSERT (cash_movements, change_log) — no-op
      if (s.startsWith('INSERT')) {
        return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }

      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    },
    release: () => { /* no-op */ },
  } as unknown as PoolClient;

  return {
    connect: async () => client,
  } as unknown as Pool;
}

function makeRepo(ctrl: StubControl): ExpenseRepo {
  return new ExpenseRepo(makeStubPool(ctrl));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CONCURRENCY-01 — Repository-level amount invariant inside FOR UPDATE', () => {

  // C01-01: Consistent full supply → resolves
  test('C01-01: consistent full supply (3 × 600 = 1800) passes through repo', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { quantity: 3, unit_price: 600, amount: 1800 };
    const result = await repo.updateExpense(LOCKED_EXPENSE.id, dto);

    assert.ok(result, 'should return an Expense');
    assert.strictEqual(ctrl.updateCount.n, 1, 'UPDATE expenses must be called once');
  });

  // C01-02: Inconsistent full supply → 400 BEFORE UPDATE
  test('C01-02: inconsistent full supply (3 × 600 ≠ 1801) throws 400 before UPDATE', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { quantity: 3, unit_price: 600, amount: 1801 };
    await assert.rejects(
      () => repo.updateExpense(LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError, 'must be ExpenseRepoError');
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.ok((err as ExpenseRepoError).message.includes('unit price'), 'message must name unit price');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0, 'UPDATE expenses must NOT be called on invariant violation');
  });

  // C01-03: qty-only partial — effective 4×500=2000 ≠ locked amount 1000 → 400
  test('C01-03: qty-only partial (new qty=4, locked price=500, locked amount=1000) throws 400', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { quantity: 4 };   // effective: 4×500=2000 ≠ 1000
    await assert.rejects(
      () => repo.updateExpense(LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // C01-04: unit_price-only partial — effective 2×600=1200 ≠ locked amount 1000 → 400
  test('C01-04: unit_price-only partial (new price=600, locked qty=2, locked amount=1000) throws 400', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { unit_price: 600 };  // effective: 2×600=1200 ≠ 1000
    await assert.rejects(
      () => repo.updateExpense(LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // C01-05: amount-only partial — effective 2×500=1000 ≠ new amount 900 → 400
  test('C01-05: amount-only partial (new amount=900, locked qty=2, locked price=500) throws 400', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { amount: 900 };  // effective: 2×500=1000 ≠ 900
    await assert.rejects(
      () => repo.updateExpense(LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // C01-06: Description-only update — no numeric fields → invariant N/A → resolves
  test('C01-06: description-only update resolves without touching invariant', async () => {
    const ctrl = { lockedExpense: { ...LOCKED_EXPENSE }, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    const dto: UpdateExpenseDto = { description: 'Updated description' };
    const result = await repo.updateExpense(LOCKED_EXPENSE.id, dto);

    assert.ok(result);
    assert.strictEqual(ctrl.updateCount.n, 1, 'UPDATE must be called (description field)');
  });

  // C01-07: Both qty and unit_price null in DB (amount-only expense) → invariant N/A → resolves
  test('C01-07: locked qty=null, unit_price=null — invariant skipped, amount change resolves', async () => {
    const expenseNoBreakdown: Expense = { ...LOCKED_EXPENSE, quantity: null, unit_price: null, amount: 500 };
    const ctrl = { lockedExpense: expenseNoBreakdown, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    // amount-only change — no qty/price breakdown so invariant must not fire
    const dto: UpdateExpenseDto = { amount: 750 };
    const result = await repo.updateExpense(LOCKED_EXPENSE.id, dto);

    assert.ok(result);
    assert.strictEqual(ctrl.updateCount.n, 1, 'UPDATE must proceed when breakdown is null');
  });

  // C01-08: Concurrent stale-pass scenario — service saw qty=2/price=500/amount=1000,
  //   but between its read and the repo lock, another request changed price to 400 in the DB.
  //   Service allowed qty=3 (3×500=1500 — consistent with what service saw).
  //   Repo sees locked row qty=2, unit_price=400, amount=1000; effective = 3×400=1200 ≠ 1000.
  //   → 400 VALIDATION from repo (TOCTOU race caught at lock time).
  test('C01-08: TOCTOU — locked row changed under service read; repo rejects stale-consistent DTO', async () => {
    // Simulate: DB row was concurrently modified (price changed from 500 → 400 by another TX)
    const concurrentlyModified: Expense = { ...LOCKED_EXPENSE, unit_price: 400, amount: 800 };
    const ctrl = { lockedExpense: concurrentlyModified, updateCount: { n: 0 } };
    const repo = makeRepo(ctrl);

    // DTO that was valid against the STALE service read (qty=3, price=500 → 1500)
    // but is inconsistent against the LOCKED row (qty=3, price=400 → 1200 ≠ 1000)
    // We supply qty=3, amount=1500 (what the service believed was consistent)
    const dto: UpdateExpenseDto = { quantity: 3, amount: 1500 };
    // effective: finalQty=3, finalUnitPrice=400 (locked), finalAmount=1500 → 3×400=1200 ≠ 1500 → REJECT
    await assert.rejects(
      () => repo.updateExpense(LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError, 'must be ExpenseRepoError');
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0,
      'CRITICAL: UPDATE expenses must NOT fire for a TOCTOU-detected inconsistency');
  });

});
