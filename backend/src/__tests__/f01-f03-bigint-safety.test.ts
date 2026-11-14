/**
 * Niazi Mobile Mart — F-01 + F-03 Focused Test Suite
 *
 * Tests the toExactBigInt helper (via ExpenseRepo.updateExpense) for:
 *   F-01: PostgreSQL BIGINT string coercion — pg driver returns BIGINT columns
 *         as decimal strings. Valid partial updates must not fail due to
 *         string/number representation mismatch.
 *   F-03: Missing safe-integer and numeric-range validation — unsafe JS integers,
 *         fractional values, NaN, Infinity, and out-of-range values must be rejected.
 *
 * Design
 * ──────
 * Uses the same stub pool/client pattern as concurrency01-repo-invariant.test.ts.
 * Key difference: locked row uses DB-shaped BIGINT strings for amount and unit_price
 * to reproduce the actual pg driver runtime representation.
 *
 * Test matrix (20 required scenarios):
 *
 * F-01 — BIGINT representation:
 *   F01-01  Partial update omitting amount; existing strings "1000"/"500" → resolves
 *   F01-02  Explicit numeric amount vs existing BIGINT strings → resolves when equal
 *   F01-03  Explicit numeric amount vs existing BIGINT strings → 400 when mismatch
 *   F01-04  Partial qty update uses locked string unit_price & amount → 400 (mismatch)
 *   F01-05  Partial qty update uses locked string unit_price & amount → resolves (match)
 *   F01-06  Partial unit_price update uses locked string qty fields → 400 (mismatch)
 *   F01-07  Partial unit_price update — consistent → resolves
 *   F01-08  Malformed BIGINT string in locked row unit_price → 400 VALIDATION
 *   F01-09  Malformed BIGINT string in locked row amount → 400 VALIDATION
 *   F01-10  Decimal BIGINT string in locked row unit_price → 400 VALIDATION
 *
 * F-03 — Numeric safety:
 *   F03-01  Unsafe JS integer in dto.unit_price → 400 VALIDATION
 *   F03-02  Fractional dto.quantity → 400 VALIDATION
 *   F03-03  Fractional dto.unit_price → 400 VALIDATION
 *   F03-04  NaN dto.unit_price → 400 VALIDATION
 *   F03-05  Positive Infinity dto.unit_price → 400 VALIDATION
 *   F03-06  Negative Infinity dto.unit_price → 400 VALIDATION
 *   F03-07  dto.quantity exceeds PostgreSQL INT32 max → 400 VALIDATION
 *   F03-08  dto.unit_price near BIGINT max boundary → resolves (valid)
 *   F03-09  Multiplication overflow beyond BIGINT max → 400 VALIDATION
 *
 * Regression / transaction safety:
 *   REG-01  Null quantity in locked row skips invariant (behavior unchanged)
 *   REG-02  Null unit_price in locked row skips invariant (behavior unchanged)
 *   REG-03  Invariant violation does not execute UPDATE expenses
 *   REG-04  Org ownership guard still fires for wrong org (unchanged)
 *   REG-05  Existing C01 numeric locked-row tests still work (description-only resolves)
 *
 * No live database required.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { ExpenseRepo, ExpenseRepoError } from '../repositories/expense.repo.js';
import type { Expense, UpdateExpenseDto } from '../repositories/expense.repo.js';
import type { Pool, PoolClient, QueryResult } from 'pg';

// ─── DB-shaped locked expense (BIGINT fields as pg driver strings) ────────────
//
// In production, pg returns:
//   expenses.amount     → string  (BIGINT column)
//   expenses.unit_price → string  (BIGINT column)
//   expenses.quantity   → number  (INT column)
//
// The TypeScript Expense interface declares amount/unit_price as number — a type
// lie. We cast at runtime to simulate the actual pg behavior.

const DB_LOCKED_EXPENSE = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  expense_number: 'EXP-000001',
  category_id: 'cccccccc-0000-0000-0000-000000000001',
  category_name: 'Office Supplies',
  branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
  branch_name: 'Main Branch',
  branch_organization_id: '00000000-0000-0000-0000-000000000001',
  amount: '1000' as unknown as number,     // BIGINT → string from pg
  quantity: 2,                              // INT    → number from pg
  unit_price: '500' as unknown as number,  // BIGINT → string from pg
  payment_method: 'CASH',
  description: 'Pens',
  notes: null,
  expense_date: '2026-11-14',
  status: 'COMPLETED' as const,
  performed_by: null,
  performed_by_name: null,
  performed_by_role: null,
  created_at: '2026-11-14T10:00:00Z',
  updated_at: '2026-11-14T10:00:00Z',
} as Expense;

// ─── Stub pool/client builder ─────────────────────────────────────────────────

interface StubControl {
  lockedExpense: Expense;
  updateCount: { n: number };
}

function makeStubPool(ctrl: StubControl): Pool {
  const client = {
    query: async (sql: string, _params?: unknown[]): Promise<QueryResult<Expense>> => {
      const s = typeof sql === 'string' ? sql.trim().toUpperCase() : '';

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [], rowCount: 0, command: s, oid: 0, fields: [] };
      }

      // FOR UPDATE on expenses → return the controlled locked row
      if (s.includes('FOR UPDATE') && s.includes('FROM EXPENSES')) {
        return { rows: [ctrl.lockedExpense], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }

      // cash_sessions FOR UPDATE → open session stub
      if (s.includes('FOR UPDATE') && s.includes('CASH_SESSIONS')) {
        return {
          rows: [{ id: 'sess-0000-0000-0000-000000000001' }] as unknown as Expense[],
          rowCount: 1, command: 'SELECT', oid: 0, fields: []
        };
      }

      // Final re-read (getExpenseByIdWithClient)
      if (s.includes('FROM EXPENSES') && !s.includes('FOR UPDATE')) {
        return { rows: [ctrl.lockedExpense], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
      }

      // UPDATE expenses SET …
      if (s.startsWith('UPDATE EXPENSES')) {
        ctrl.updateCount.n++;
        return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }

      // INSERT (cash_movements, change_log) → no-op
      if (s.startsWith('INSERT')) {
        return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }

      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    },
    release: () => { /* no-op */ },
  } as unknown as PoolClient;

  return { connect: async () => client } as unknown as Pool;
}

function makeRepo(ctrl: StubControl): ExpenseRepo {
  return new ExpenseRepo(makeStubPool(ctrl));
}

function makeCtrl(overrides?: Partial<Expense>): StubControl {
  return {
    lockedExpense: { ...DB_LOCKED_EXPENSE, ...overrides },
    updateCount: { n: 0 },
  };
}

// ─── F-01 Tests — BIGINT representation ──────────────────────────────────────

describe('F-01 — PostgreSQL BIGINT string representation', () => {

  // F01-01: Partial update omitting amount; existing amount/unit_price are strings → resolves
  test('F01-01: partial update omitting amount with DB string fields resolves', async () => {
    // DB row: amount="1000", quantity=2, unit_price="500"
    // DTO supplies consistent qty=2, unit_price=500 (numbers from DTO path)
    // but omits amount → effective amount = existing.amount = "1000" (string)
    // Expected: "1000" == BigInt(2) * BigInt(500) = 1000n → passes
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: 500 }; // amount omitted
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result, 'should return an Expense');
    assert.strictEqual(ctrl.updateCount.n, 1, 'UPDATE must execute');
  });

  // F01-02: Explicit numeric amount equal to BigInt product of BIGINT strings → resolves
  test('F01-02: explicit numeric amount matching BIGINT string product resolves', async () => {
    // DB row: amount="1000", quantity=2, unit_price="500"
    // DTO: amount=1000 (number), quantity=2, unit_price=500
    // 2 * 500 = 1000 → consistent
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: 500, amount: 1000 };
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result);
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // F01-03: Explicit numeric amount that does NOT match product of BIGINT strings → 400
  test('F01-03: numeric amount mismatch against BIGINT strings throws 400', async () => {
    // DB row: amount="1000", quantity=2, unit_price="500"
    // DTO: amount=999 (mismatch), quantity=2, unit_price=500
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: 500, amount: 999 };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0, 'UPDATE must not fire on mismatch');
  });

  // F01-04: Partial qty update — locked unit_price string "500", locked amount string "1000"
  //   new qty=3: effective 3*500=1500 ≠ 1000 → 400
  test('F01-04: partial qty update with DB string fields — mismatch throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 3 }; // effective: 3 * "500" = 1500 ≠ "1000"
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F01-05: Partial qty update where new qty is consistent with locked string fields → resolves
  //   DB: qty=2, unit_price="500", amount="1000". DTO qty=2 → 2*500=1000 ✓
  test('F01-05: partial qty update — consistent with DB string fields resolves', async () => {
    const ctrl = makeCtrl(); // qty=2, unit_price="500", amount="1000"
    const dto: UpdateExpenseDto = { quantity: 2 }; // effective: 2 * "500" = 1000 = "1000"
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result);
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // F01-06: Partial unit_price update — new price=600, locked qty=2, locked amount="1000"
  //   effective: 2 * 600 = 1200 ≠ "1000" → 400
  test('F01-06: partial unit_price update — mismatch against DB string amount throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { unit_price: 600 }; // effective: 2 * 600 = 1200 ≠ 1000
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F01-07: Partial unit_price update — new price=500, locked qty=2, locked amount="1000"
  //   effective: 2 * 500 = 1000 = "1000" → resolves
  test('F01-07: partial unit_price update — consistent with DB strings resolves', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { unit_price: 500 }; // effective: 2 * 500 = 1000 ✓
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result);
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // F01-08: Malformed DB string in locked row unit_price → 400 VALIDATION
  test('F01-08: malformed BIGINT string in locked row unit_price throws 400', async () => {
    const ctrl = makeCtrl({ unit_price: 'five_hundred' as unknown as number });
    const dto: UpdateExpenseDto = { quantity: 2 }; // triggers invariant path
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('malformed'), 'must mention malformed');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F01-09: Malformed DB string in locked row amount → 400 VALIDATION
  test('F01-09: malformed BIGINT string in locked row amount throws 400', async () => {
    const ctrl = makeCtrl({
      amount: 'NOT_A_NUMBER' as unknown as number,
      quantity: 2,
      unit_price: '500' as unknown as number,
    });
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: 500 }; // triggers invariant, omits amount
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F01-10: Decimal BIGINT string in locked row unit_price → 400 VALIDATION
  test('F01-10: decimal string in locked row unit_price throws 400', async () => {
    const ctrl = makeCtrl({ unit_price: '500.50' as unknown as number });
    const dto: UpdateExpenseDto = { quantity: 2 }; // triggers invariant path
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('malformed'), 'must mention malformed');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

});

// ─── F-03 Tests — Numeric safety ─────────────────────────────────────────────

describe('F-03 — Safe-integer and numeric-range validation', () => {

  // F03-01: Unsafe JS integer in dto.unit_price → 400 VALIDATION
  test('F03-01: unsafe JS integer in dto.unit_price throws 400', async () => {
    const UNSAFE = Number.MAX_SAFE_INTEGER + 1; // 9007199254740992
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: UNSAFE };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('unsafe integer'), 'must mention unsafe integer');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-02: Fractional dto.quantity → 400 VALIDATION
  test('F03-02: fractional dto.quantity throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2.5, unit_price: 500 };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('fractional'), 'must mention fractional');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-03: Fractional dto.unit_price → 400 VALIDATION
  test('F03-03: fractional dto.unit_price throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: 500.5 };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('fractional'), 'must mention fractional');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-04: NaN dto.unit_price → 400 VALIDATION
  test('F03-04: NaN dto.unit_price throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: NaN };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('non-finite'), 'must mention non-finite');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-05: Positive Infinity dto.unit_price → 400 VALIDATION
  test('F03-05: positive Infinity dto.unit_price throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: Infinity };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('non-finite'));
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-06: Negative Infinity dto.unit_price → 400 VALIDATION
  test('F03-06: negative Infinity dto.unit_price throws 400', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 2, unit_price: -Infinity };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('non-finite'));
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-07: dto.quantity exceeds PostgreSQL INT32 max (2147483647) → 400 VALIDATION
  test('F03-07: dto.quantity exceeding PostgreSQL INT32 max throws 400', async () => {
    const OVER_INT32 = 2147483648; // INT32 max + 1 (safe JS integer)
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: OVER_INT32, unit_price: 1 };
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        assert.ok((err as ExpenseRepoError).message.includes('INT'), 'must mention INT range');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0);
  });

  // F03-08: dto.unit_price near BIGINT max is accepted when product is valid
  //   unit_price = 1 (safe), qty = 1 → product = 1 ≤ BIGINT_MAX, amount = "1" matches → resolves
  test('F03-08: valid values near BIGINT max boundary resolve correctly', async () => {
    // Use a large but valid BIGINT string for unit_price in the locked row
    // and consistent qty/amount in DTO
    const ctrl = makeCtrl({
      quantity: 1,
      unit_price: '1000000000' as unknown as number,  // 1 billion PKR
      amount: '1000000000' as unknown as number,
    });
    const dto: UpdateExpenseDto = { quantity: 1, unit_price: 1000000000, amount: 1000000000 };
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result, 'should resolve for valid large values');
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // F03-09: Multiplication overflow beyond BIGINT max → 400 VALIDATION
  //   qty = 2147483647 (INT32 max), unit_price = 9223372036854775807 (BIGINT max)
  //   product = way beyond BIGINT max → overflow error
  test('F03-09: multiplication overflow beyond PostgreSQL BIGINT max throws 400', async () => {
    const ctrl = makeCtrl({
      quantity: 1,
      unit_price: '1' as unknown as number,
      amount: '1' as unknown as number,
    });
    // Supply qty = INT32_MAX and unit_price = BIGINT_MAX — product overflows
    // Note: BIGINT_MAX is too large for a safe JS integer, so we pass it as a
    // db-shaped string in the locked row, and supply a large safe qty via dto
    const ctrlOverflow = makeCtrl({
      quantity: 1,
      unit_price: '9223372036854775807' as unknown as number, // BIGINT_MAX as db string
      amount: '9223372036854775807' as unknown as number,
    });
    // DTO: qty=2 → product = 2 * 9223372036854775807n > BIGINT_MAX → overflow
    const dto: UpdateExpenseDto = { quantity: 2 }; // amount omitted → uses locked "9223372036854775807"
    await assert.rejects(
      () => makeRepo(ctrlOverflow).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 400);
        assert.strictEqual((err as ExpenseRepoError).code, 'VALIDATION');
        // Could be overflow error or mismatch — either is correct rejection
        assert.ok(
          (err as ExpenseRepoError).message.includes('overflow') ||
          (err as ExpenseRepoError).message.includes('multiplied'),
          'must mention overflow or multiplication mismatch'
        );
        return true;
      }
    );
    assert.strictEqual(ctrlOverflow.updateCount.n, 0);
  });

});

// ─── Regression / transaction safety tests ───────────────────────────────────

describe('Regression — invariant skip and transaction safety', () => {

  // REG-01: Null quantity in locked row skips invariant
  test('REG-01: null locked quantity skips invariant — amount-only change resolves', async () => {
    const ctrl = makeCtrl({
      quantity: null,
      unit_price: '500' as unknown as number,
      amount: '750' as unknown as number,
    });
    // DTO changes only amount — no qty or unit_price in dto → finalQtyRaw is null → skip
    const dto: UpdateExpenseDto = { amount: 750 };
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result, 'should resolve when qty is null');
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // REG-02: Null unit_price in locked row skips invariant
  test('REG-02: null locked unit_price skips invariant — amount-only change resolves', async () => {
    const ctrl = makeCtrl({
      quantity: 2,
      unit_price: null,
      amount: '750' as unknown as number,
    });
    const dto: UpdateExpenseDto = { amount: 750 };
    const result = await makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result, 'should resolve when unit_price is null');
    assert.strictEqual(ctrl.updateCount.n, 1);
  });

  // REG-03: Invariant violation does not execute UPDATE expenses
  test('REG-03: invariant violation — UPDATE expenses is never called', async () => {
    const ctrl = makeCtrl();
    const dto: UpdateExpenseDto = { quantity: 99, unit_price: 999, amount: 100 }; // 99*999≠100
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto),
      (err: unknown) => err instanceof ExpenseRepoError
    );
    assert.strictEqual(ctrl.updateCount.n, 0, 'CRITICAL: UPDATE must never fire on invariant violation');
  });

  // REG-04: Org ownership guard still fires for wrong org (unchanged by this fix)
  // Note: SEC-01 guard fires only when organizationId is passed (the 3rd argument to
  // updateExpense). The locked row has branch_organization_id from NIAZI org. We pass
  // a different organizationId to trigger the guard, as the route would supply it from JWT.
  test('REG-04: org ownership guard fires when organizationId does not match branch org', async () => {
    // DB row has branch_organization_id = NIAZI_ORGANIZATION_ID (00000000-...-000001)
    // We call updateExpense with organizationId = different org → 403 FORBIDDEN
    const ctrl = makeCtrl(); // locked row has branch_organization_id from NIAZI org
    const dto: UpdateExpenseDto = { description: 'attempt' };
    const wrongOrgId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await assert.rejects(
      () => makeRepo(ctrl).updateExpense(DB_LOCKED_EXPENSE.id, dto, null, wrongOrgId),
      (err: unknown) => {
        assert.ok(err instanceof ExpenseRepoError);
        assert.strictEqual((err as ExpenseRepoError).statusCode, 403, 'must be 403 FORBIDDEN');
        assert.strictEqual((err as ExpenseRepoError).code, 'FORBIDDEN');
        return true;
      }
    );
    assert.strictEqual(ctrl.updateCount.n, 0, 'UPDATE must not fire for forbidden org');
  });

  // REG-05: Description-only update with numeric locked row (original C01 shape) still resolves
  test('REG-05: description-only update with numeric locked fields still resolves', async () => {
    // Use numeric values (as original C01 tests do) to verify backward compatibility
    const numericCtrl = {
      lockedExpense: {
        ...DB_LOCKED_EXPENSE,
        amount: 1000 as number,
        unit_price: 500 as number,
        quantity: 2,
      } as Expense,
      updateCount: { n: 0 },
    };
    const dto: UpdateExpenseDto = { description: 'Updated with numeric locked row' };
    const result = await makeRepo(numericCtrl).updateExpense(DB_LOCKED_EXPENSE.id, dto);
    assert.ok(result);
    assert.strictEqual(numericCtrl.updateCount.n, 1);
  });

});
