/**
 * Gate 3 Phase 1 Regression Tests
 *
 * Covers:
 * 1. G3-CASH-01: openCashSession() prevents duplicate open sessions with advisory lock & FOR UPDATE check.
 * 2. G3-CASH-03: recordCashMovement() fail-closed when CASH movement has no open session.
 * 3. G3-CUST-01: recordCustomerPayment() atomic counter increment with RETURNING value.
 * 4. G3-RET-02 / G3-SYNC-01: createSalesReturn() emits SALES_RETURN_CREATED change_log entry in transaction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openCashSession, recordCashMovement, CashRepoError } from '../repositories/cash.repo';
import { recordCustomerPayment } from '../repositories/customer.repo';
import { createSalesReturn } from '../repositories/returns.repo';

describe('Gate 3 Phase 1 — G3-CASH-01: openCashSession() Concurrency Guard', () => {
  it('opens first cash session successfully with advisory lock', async () => {
    let advisoryLockCalled = false;
    let beginCalled = false;
    let commitCalled = false;

    const mockClient = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.trim() === 'BEGIN') { beginCalled = true; return { rows: [] }; }
        if (sql.trim() === 'COMMIT') { commitCalled = true; return { rows: [] }; }
        if (sql.trim() === 'ROLLBACK') return { rows: [] };

        if (sql.includes('hashtext')) {
          return { rows: [{ h: '12345678' }] };
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          advisoryLockCalled = true;
          return { rows: [] };
        }
        if (sql.includes('SELECT id FROM cash_sessions') && sql.includes('FOR UPDATE')) {
          return { rows: [] }; // no existing session
        }
        if (sql.includes('INSERT INTO cash_sessions')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient,
      query: async () => ({ rows: [] }),
    } as any;

    const session = await openCashSession(
      mockPool,
      { branch_id: 'branch-001', opening_cash: 5000, notes: 'Opening till' },
      'user-001'
    );

    assert.ok(beginCalled, 'Transaction BEGIN must be called');
    assert.ok(advisoryLockCalled, 'PostgreSQL pg_advisory_xact_lock must be acquired');
    assert.ok(commitCalled, 'Transaction COMMIT must be called');
    assert.strictEqual(session.branch_id, 'branch-001');
    assert.strictEqual(session.status, 'OPEN');
  });

  it('rejects opening second session when OPEN session already exists', async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT' || sql.trim() === 'ROLLBACK') return { rows: [] };
        if (sql.includes('hashtext')) return { rows: [{ h: '12345678' }] };
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
        if (sql.includes('SELECT id FROM cash_sessions') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'existing-sess-001' }] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient,
    } as any;

    await assert.rejects(
      () => openCashSession(mockPool, { branch_id: 'branch-001' }, 'user-001'),
      (err: Error) => {
        assert.ok(err instanceof CashRepoError, `Expected CashRepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('already exists for this branch'));
        assert.strictEqual((err as CashRepoError).statusCode, 400);
        return true;
      }
    );
  });
});

describe('Gate 3 Phase 1 — G3-CASH-03: recordCashMovement() Fail-Closed on Missing Session', () => {
  it('throws HTTP 400 when recording CASH movement with no open session', async () => {
    const mockPool = {
      query: async (sql: string) => {
        if (sql.includes('FROM cash_sessions')) return { rows: [] }; // no open session
        return { rows: [] };
      },
    } as any;

    await assert.rejects(
      () => recordCashMovement(
        mockPool,
        {
          branch_id: 'branch-001',
          movement_type: 'EXPENSE',
          direction: 'OUT',
          amount: 500,
          payment_method: 'CASH',
        },
        'user-001'
      ),
      (err: Error) => {
        assert.ok(err instanceof CashRepoError, `Expected CashRepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('No open cash register session exists for this branch'));
        assert.strictEqual((err as CashRepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('allows non-CASH (BANK_TRANSFER) movement without open cash session', async () => {
    let inserted = false;
    const mockPool = {
      query: async (sql: string) => {
        if (sql.includes('FROM cash_sessions')) return { rows: [] }; // no open session
        if (sql.includes('INSERT INTO cash_movements')) {
          inserted = true;
          return { rows: [] };
        }
        return { rows: [] };
      },
    } as any;

    const result = await recordCashMovement(
      mockPool,
      {
        branch_id: 'branch-001',
        movement_type: 'BANK_DEPOSIT',
        direction: 'IN',
        amount: 50000,
        payment_method: 'BANK_TRANSFER',
      },
      'user-001'
    );

    assert.ok(inserted, 'Non-CASH movement should proceed and insert');
    assert.strictEqual(result.session_id, null);
    assert.strictEqual(result.amount, 50000);
  });
});

describe('Gate 3 Phase 1 — G3-CUST-01: recordCustomerPayment() Atomic Counter', () => {
  it('increments counter atomically with single INSERT ... ON CONFLICT DO UPDATE RETURNING statement', async () => {
    let atomicCounterSql = '';
    const capturedLedger: any[] = [];

    const mockClient = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT' || sql.trim() === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM customers WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 'cust-001', balance: 5000 }] };
        }
        if (sql.includes('FROM customer_ledger_entries') && sql.includes('customer_id = $1')) {
          return { rows: [{ balance: '5000' }] };
        }
        if (sql.includes('counters') && sql.includes('ON CONFLICT') && sql.includes('RETURNING value')) {
          atomicCounterSql = sql;
          return { rows: [{ value: 42 }] };
        }
        if (sql.includes('INSERT INTO customer_ledger_entries')) {
          capturedLedger.push(params);
          return { rows: [] };
        }
        if (sql.includes('SELECT id FROM cash_sessions')) {
          return { rows: [{ id: 'sess-001' }] };
        }
        if (sql.includes('INSERT INTO cash_movements')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient,
    } as any;

    const result = await recordCustomerPayment(
      mockPool,
      'cust-001',
      {
        amount: 2000,
        payment_method: 'CASH',
      },
      'user-001',
      'branch-001'
    );

    assert.ok(atomicCounterSql.includes('INSERT INTO counters'), 'Must use atomic upsert counter');
    assert.ok(atomicCounterSql.includes('RETURNING value'), 'Must return value in single atomic statement');
    assert.strictEqual(result.reference_number, 'RCP-000042');
    assert.strictEqual(result.new_balance, 3000);
  });
});

describe('Gate 3 Phase 1 — G3-RET-02 / G3-SYNC-01: createSalesReturn() change_log Emission', () => {
  it('writes change_log entry for SALES_RETURN_CREATED inside atomic transaction', async () => {
    let changeLogEntry: any = null;
    let committed = false;

    const mockSale = {
      id: 'sale-001',
      invoice_number: 'INV-1001',
      branch_id: 'branch-001',
      customer_id: 'cust-001',
      customer_name: 'Walk-in',
      total_amount: 1000,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      organization_id: 'org-001',
    };

    const mockClient = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.trim() === 'BEGIN') return { rows: [] };
        if (sql.trim() === 'COMMIT') { committed = true; return { rows: [] }; }
        if (sql.trim() === 'ROLLBACK') return { rows: [] };

        if (sql.includes('FROM customers WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 'cust-001', name: 'Walk-in', balance: 0 }] };
        }
        if (sql.includes('FROM sales WHERE id = $1 FOR UPDATE')) {
          return { rows: [mockSale] };
        }
        if (sql.includes('FROM sale_lines') && sql.includes('id = $1 AND sale_id = $2')) {
          return { rows: [{ id: 'line-001', product_id: 'prod-001', quantity: 2, unit_price: 500, total_price: 1000 }] };
        }
        if (sql.includes('FROM sales_returns')) return { rows: [] };
        if (sql.includes('sales_return_counters')) return { rows: [{ seq: 1 }] };
        if (sql.includes('INSERT INTO sales_returns')) return { rows: [] };
        if (sql.includes('INSERT INTO sales_return_lines')) return { rows: [] };
        if (sql.includes('UPDATE stock') && sql.includes('RETURNING')) {
          return { rows: [{ previous_stock: 5, new_stock: 6 }] };
        }
        if (sql.includes('INSERT INTO stock_movements')) return { rows: [] };
        if (sql.includes('FROM cash_sessions') && sql.includes("status = 'OPEN'")) {
          return { rows: [{ id: 'sess-001' }] };
        }
        if (sql.includes('INSERT INTO cash_movements')) return { rows: [] };
        if (sql.includes('INSERT INTO change_log') && params) {
          changeLogEntry = params;
          return { rows: [] };
        }
        if (sql.includes('FROM sale_lines sl') && sql.includes('LEFT JOIN sales_return_lines srl')) {
          return { rows: [{ id: 'line-001', orig_qty: 2, returned_qty: 1 }] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient,
      query: async (sql: string) => {
        if (sql.includes('FROM sales_return_lines')) return { rows: [] };
        return { rows: [] };
      },
    } as any;

    const result = await createSalesReturn(
      mockPool,
      {
        sale_id: 'sale-001',
        refund_method: 'CASH',
        lines: [{ sale_line_id: 'line-001', quantity: 1 }],
      },
      'user-001',
      'branch-001',
      false
    );

    assert.ok(committed, 'Transaction must be committed');
    assert.ok(changeLogEntry !== null, 'change_log entry must be written');
    // params: [orgId ($1), branchId ($2), clientEventId ($3), evType ($4), entType ($5), entId ($6), payloadStr ($7), now ($8)]
    assert.strictEqual(changeLogEntry[3], 'SALES_RETURN_CREATED', 'Event type must be SALES_RETURN_CREATED');
    assert.strictEqual(changeLogEntry[4], 'sales_return', 'Entity type must be sales_return');
    assert.strictEqual(result.sales_return.status, 'COMPLETED');

    // Gate 3 Phase 1.2: Validate canonical SalesReturnSyncEventDto contract
    const parsedPayload = JSON.parse(changeLogEntry[6]);
    assert.ok(parsedPayload.sales_return, 'Payload must contain sales_return entity');
    assert.strictEqual(parsedPayload.sales_return.id, result.sales_return.id);
    assert.ok(Array.isArray(parsedPayload.lines), 'Payload must contain lines array');
    assert.strictEqual(parsedPayload.lines.length, 1);
    assert.ok(Array.isArray(parsedPayload.stock_movements), 'Payload must contain stock_movements array');
    assert.strictEqual(parsedPayload.stock_movements.length, 1);
    assert.strictEqual(parsedPayload.stock_movements[0].movement_type, 'IN');
    assert.ok(parsedPayload.cash_movement, 'CASH refund must produce cash_movement object');
    assert.strictEqual(parsedPayload.cash_movement.amount, 500);
    assert.strictEqual(parsedPayload.cash_movement.payment_method, 'CASH');
    assert.strictEqual(parsedPayload.customer_ledger_entry, null, 'CASH refund has no customer ledger entry');
    assert.strictEqual(parsedPayload.is_fully_refunded, false, 'Sale is partially returned (1 of 2 units)');
  });
});
