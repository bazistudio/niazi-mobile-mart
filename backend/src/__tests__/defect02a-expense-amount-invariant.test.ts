/**
 * Niazi Mobile Mart — DEFECT-02a Test Suite
 *
 * Verifies the backend enforcement of:
 *
 *   amount = quantity × unit_price
 *
 * for both expense creation and expense updates (full and partial PUT).
 *
 * Test matrix (all 13 required scenarios):
 *
 *   D02A-01  Valid expense creation (qty × price = amount)                → createExpense resolves
 *   D02A-02  Invalid amount during creation (qty × price ≠ amount)        → 400 VALIDATION
 *   D02A-03  Valid full update (qty + price + amount all consistent)       → updateExpense resolves
 *   D02A-04  Qty-only partial update producing inconsistent combination    → 400 VALIDATION
 *   D02A-05  Unit-price-only partial update producing inconsistency        → 400 VALIDATION
 *   D02A-06  Amount-only partial update producing inconsistency            → 400 VALIDATION
 *   D02A-07  Description-only partial update (no numeric change)           → updateExpense resolves
 *   D02A-08  Request omitting all three numeric fields                     → updateExpense resolves
 *   D02A-09  Decimal values and rounding boundaries                        → 400 VALIDATION (not integer)
 *   D02A-10  Malformed numeric inputs (string, NaN, Infinity)              → 400 VALIDATION
 *   D02A-11  Zero and negative inputs                                      → 400 VALIDATION
 *   D02A-12  Failed validation leaves persisted values unchanged (no repo call)
 *   D02A-13  Valid update still respects SEC-01 organization authorization
 *
 * Design
 * ──────
 * Tests exercise ExpenseService directly (unit layer) with a stub repo that:
 *   - Returns controlled Expense objects from getExpenseById / updateExpense / createExpense
 *   - Increments mutation counters so D02A-12 can verify no-write behaviour
 *
 * No live database is required.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { ExpenseService, ExpenseServiceError } from '../services/expense.service.js';
import type { Expense, CreateExpenseDto, UpdateExpenseDto } from '../repositories/expense.repo.js';
import type { Pool } from 'pg';

// ─── Shared fixture expense ───────────────────────────────────────────────────

const BASE_EXPENSE: Expense = {
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

// ─── Stub pool (no live DB needed) ───────────────────────────────────────────

const STUB_POOL = {} as unknown as Pool;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeService(overrides: {
  getById?: () => Promise<Expense>;
  create?: () => Promise<Expense>;
  update?: () => Promise<Expense>;
  createCallCount?: { n: number };
  updateCallCount?: { n: number };
}): ExpenseService {
  const svc = new ExpenseService(STUB_POOL);

  if (overrides.getById) {
    (svc as unknown as Record<string, unknown>)['repo'] = {
      getExpenseById: async (_id: string) => overrides.getById!(),
      createExpense: async (..._args: unknown[]) => {
        if (overrides.createCallCount) overrides.createCallCount.n++;
        return overrides.create ? overrides.create() : Promise.resolve(BASE_EXPENSE);
      },
      updateExpense: async (..._args: unknown[]) => {
        if (overrides.updateCallCount) overrides.updateCallCount.n++;
        return overrides.update ? overrides.update() : Promise.resolve(BASE_EXPENSE);
      },
    };
  } else {
    // For creation tests only — no getById needed
    (svc as unknown as Record<string, unknown>)['repo'] = {
      getExpenseById: async (_id: string) => null,
      createExpense: async (..._args: unknown[]) => {
        if (overrides.createCallCount) overrides.createCallCount.n++;
        return overrides.create ? overrides.create() : Promise.resolve(BASE_EXPENSE);
      },
      updateExpense: async (..._args: unknown[]) => {
        if (overrides.updateCallCount) overrides.updateCallCount.n++;
        return overrides.update ? overrides.update() : Promise.resolve(BASE_EXPENSE);
      },
    };
  }

  return svc;
}

function validCreateDto(overrides: Partial<CreateExpenseDto> = {}): CreateExpenseDto {
  return {
    category_id: 'cccccccc-0000-0000-0000-000000000001',
    branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    amount: 1000,
    quantity: 2,
    unit_price: 500,
    payment_method: 'CASH',
    description: 'Test expense',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DEFECT-02a — Expense Amount Invariant (amount = qty × unit_price)', () => {

  // D02A-01: Valid creation — consistent values pass
  test('D02A-01: valid creation (2 × 500 = 1000) resolves without error', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    const result = await svc.createExpense(validCreateDto());

    assert.ok(result, 'should return an Expense');
    assert.strictEqual(createCount.n, 1, 'repo.createExpense must be called exactly once');
  });

  // D02A-02: Invalid creation — inconsistent amount rejected before repo call
  test('D02A-02: creation with inconsistent amount (2 × 500 ≠ 999) throws 400', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ amount: 999 })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError, 'must be ExpenseServiceError');
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        assert.ok((err as ExpenseServiceError).message.includes('unit price'), 'message must mention unit price');
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0, 'repo.createExpense must NOT be called on invariant violation');
  });

  // D02A-03: Valid full update — all three consistent values accepted
  test('D02A-03: full update (3 × 600 = 1800) resolves without error', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { quantity: 3, unit_price: 600, amount: 1800 };
    const result = await svc.updateExpense(BASE_EXPENSE.id, dto);

    assert.ok(result, 'should return an Expense');
    assert.strictEqual(updateCount.n, 1, 'repo.updateExpense must be called exactly once');
  });

  // D02A-04: Qty-only partial update — effective qty 3, existing price 500, existing amount 1000 → inconsistent
  test('D02A-04: qty-only partial update (new qty=3, persisted price=500, persisted amount=1000) throws 400', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,  // qty=2, unit_price=500, amount=1000
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { quantity: 3 };  // effective: 3 × 500 = 1500 ≠ 1000
    await assert.rejects(
      () => svc.updateExpense(BASE_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        assert.ok((err as ExpenseServiceError).message.includes('unit price'));
        return true;
      }
    );
    assert.strictEqual(updateCount.n, 0, 'repo.updateExpense must NOT be called on invariant violation');
  });

  // D02A-05: Unit-price-only partial update — effective price 600, existing qty 2, existing amount 1000 → inconsistent
  test('D02A-05: unit_price-only partial update (new price=600, persisted qty=2, persisted amount=1000) throws 400', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,  // qty=2, unit_price=500, amount=1000
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { unit_price: 600 };  // effective: 2 × 600 = 1200 ≠ 1000
    await assert.rejects(
      () => svc.updateExpense(BASE_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(updateCount.n, 0, 'repo.updateExpense must NOT be called');
  });

  // D02A-06: Amount-only partial update — new amount 900 ≠ persisted 2 × 500 = 1000
  test('D02A-06: amount-only partial update (new amount=900, persisted qty=2, price=500) throws 400', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { amount: 900 };  // effective: 2 × 500 = 1000 ≠ 900
    await assert.rejects(
      () => svc.updateExpense(BASE_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(updateCount.n, 0, 'repo.updateExpense must NOT be called');
  });

  // D02A-07: Description-only update — no numeric fields → invariant not evaluated
  test('D02A-07: description-only partial update resolves without error', async () => {
    const updateCount = { n: 0 };
    // Even if getById would fail, it must NOT be called (no numeric fields touched)
    const svc = makeService({
      getById: async () => { throw new Error('getById must NOT be called for description-only update'); },
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { description: 'Updated description' };
    const result = await svc.updateExpense(BASE_EXPENSE.id, dto);

    assert.ok(result, 'should return an Expense');
    assert.strictEqual(updateCount.n, 1, 'repo.updateExpense must be called');
  });

  // D02A-08: Empty numeric payload — no numeric fields → invariant not evaluated
  test('D02A-08: update omitting all three numeric fields resolves without error', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => { throw new Error('getById must NOT be called when no numeric fields supplied'); },
      updateCallCount: updateCount,
    });

    const dto: UpdateExpenseDto = { notes: 'Internal note' };
    const result = await svc.updateExpense(BASE_EXPENSE.id, dto);

    assert.ok(result);
    assert.strictEqual(updateCount.n, 1);
  });

  // D02A-09: Decimal / non-integer values — existing validation rejects before invariant
  test('D02A-09: decimal unit_price (500.5) rejected as non-integer', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ unit_price: 500.5, amount: 1001 })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0);
  });

  // D02A-10: Malformed numeric inputs — string passed as amount
  test('D02A-10: string amount ("1000") rejected as non-number', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    // Cast through unknown to simulate a runtime caller bypassing TypeScript
    const dto = validCreateDto({ amount: '1000' as unknown as number });
    await assert.rejects(
      () => svc.createExpense(dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0, 'repo.createExpense must NOT be called');
  });

  // D02A-11a: Zero amount rejected
  test('D02A-11a: zero amount rejected', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ amount: 0 })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0);
  });

  // D02A-11b: Negative amount rejected
  test('D02A-11b: negative amount rejected', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ amount: -100 })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0);
  });

  // D02A-11c: NaN amount rejected
  test('D02A-11c: NaN amount rejected', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ amount: NaN })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0);
  });

  // D02A-11d: Infinity amount rejected
  test('D02A-11d: Infinity amount rejected', async () => {
    const createCount = { n: 0 };
    const svc = makeService({ createCallCount: createCount });

    await assert.rejects(
      () => svc.createExpense(validCreateDto({ amount: Infinity })),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseServiceError);
        assert.strictEqual((err as ExpenseServiceError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(createCount.n, 0);
  });

  // D02A-12: Failed update leaves persisted values unchanged — repo NOT called on validation failure
  test('D02A-12: failed update validation leaves persisted values unchanged (no repo mutation)', async () => {
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,  // qty=2, price=500, amount=1000
      updateCallCount: updateCount,
    });

    // Supply inconsistent values: qty=4 alone → effective 4×500=2000 ≠ 1000
    await assert.rejects(
      () => svc.updateExpense(BASE_EXPENSE.id, { quantity: 4 }),
      (err: unknown) => err instanceof ExpenseServiceError
    );

    // Key assertion: repo.updateExpense was never called, so no DB row was touched
    assert.strictEqual(updateCount.n, 0,
      'CRITICAL: repo.updateExpense must NOT have been called — no persisted value may change');
  });

  // D02A-13: Valid update that also traverses the SEC-01 org boundary check
  test('D02A-13: valid update (3 × 600 = 1800) passes through SEC-01 org check', async () => {
    // Expense belongs to org 00000000-0000-0000-0000-000000000001 (NIAZI_ORGANIZATION_ID)
    const updateCount = { n: 0 };
    const svc = makeService({
      getById: async () => BASE_EXPENSE,  // branch_organization_id = NIAZI_ORGANIZATION_ID
      updateCallCount: updateCount,
    });

    // Consistent values + same org_id as the expense branch
    const dto: UpdateExpenseDto = { quantity: 3, unit_price: 600, amount: 1800 };
    const result = await svc.updateExpense(
      BASE_EXPENSE.id,
      dto,
      'some-user-id',
      '00000000-0000-0000-0000-000000000001'  // NIAZI_ORGANIZATION_ID
    );

    assert.ok(result, 'should resolve successfully');
    assert.strictEqual(updateCount.n, 1, 'repo.updateExpense should be called once');
  });

});
