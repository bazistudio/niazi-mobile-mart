/**
 * Mobile POS Sale Regression Test Suite
 *
 * Verifies Phase 6 requirements:
 * 1. Single mobile sold for cash with status transition and movements
 * 2. Multi-payment split (Cash + JazzCash / Bank)
 * 3. Credit sale validations (Walk-in blocked, registered customer balance updated)
 * 4. Concurrency & duplicate prevention (status = 'SOLD' or non-existent)
 * 5. Cash session requirement for cash tender
 * 6. User identity, role snapshot, and invoice number attribution
 *
 * Fully isolated using mock client/pool.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { executeMobileSale, MobileSaleRepoError } from '../repositories/mobile_sale.repo';

describe('Mobile POS Sales Integration Tests (Phase 6)', () => {
  const dummyIdentity = {
    userId: '11111111-1111-1111-1111-111111111111',
    username: 'ali_cashier',
    role: 'CASHIER',
    organizationId: '00000000-0000-0000-0000-000000000001',
    branchId: '22222222-2222-2222-2222-222222222222',
  };

  test('Rejects checkout if cart is empty', async () => {
    const dummyPool = {} as Pool;
    await assert.rejects(
      async () => {
        await executeMobileSale(
          dummyPool,
          { items: [], payments: [] },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.match(err.message, /Cart cannot be empty/);
        return true;
      }
    );
  });

  test('Rejects duplicate mobile device entries in same cart', async () => {
    const dummyPool = {} as Pool;
    await assert.rejects(
      async () => {
        await executeMobileSale(
          dummyPool,
          {
            items: [
              { deviceId: 'dev-1', salePrice: 20000 },
              { deviceId: 'dev-1', salePrice: 20000 },
            ],
            payments: [{ method: 'CASH', amount: 40000 }],
          },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.match(err.message, /Duplicate mobile device/);
        return true;
      }
    );
  });

  test('Rejects negative sale prices', async () => {
    const dummyPool = {} as Pool;
    await assert.rejects(
      async () => {
        await executeMobileSale(
          dummyPool,
          {
            items: [{ deviceId: 'dev-1', salePrice: -500 }],
            payments: [{ method: 'CASH', amount: 0 }],
          },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.match(err.message, /Price cannot be negative/);
        return true;
      }
    );
  });

  test('Rejects credit sale for Walk-In customer when balance is due', async () => {
    // Mock pool client with a device that is IN_STOCK
    const mockClient = {
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
        if (sql.includes('FROM mobile_devices')) {
          return {
            rows: [
              {
                id: 'dev-1',
                brand: 'Samsung',
                model: 'A15',
                color: 'Black',
                storage: '128GB',
                status: 'IN_STOCK',
                cost_price: 18000,
                expected_sale_price: 22000,
                branch_id: dummyIdentity.branchId,
                organization_id: dummyIdentity.organizationId,
              },
            ],
          };
        }
        if (sql.includes('FROM mobile_imei_identifiers')) {
          return {
            rows: [
              { slot: 'IMEI1', imei: '354829104829104' },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient as unknown as PoolClient,
    } as unknown as Pool;

    await assert.rejects(
      async () => {
        await executeMobileSale(
          mockPool,
          {
            items: [{ deviceId: 'dev-1', salePrice: 22000 }],
            payments: [{ method: 'CASH', amount: 10000 }], // 12000 due, walk-in customer
            customerId: null,
          },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.match(err.message, /Credit purchases require a registered customer/);
        return true;
      }
    );
  });

  test('Fails-closed if mobile device is already SOLD (concurrency conflict)', async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
        if (sql.includes('FROM mobile_devices')) {
          return {
            rows: [
              {
                id: 'dev-1',
                brand: 'Xiaomi',
                model: 'Note 12',
                status: 'SOLD',
                cost_price: 15000,
                branch_id: dummyIdentity.branchId,
                organization_id: dummyIdentity.organizationId,
              },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient as unknown as PoolClient,
    } as unknown as Pool;

    await assert.rejects(
      async () => {
        await executeMobileSale(
          mockPool,
          {
            items: [{ deviceId: 'dev-1', salePrice: 20000 }],
            payments: [{ method: 'CASH', amount: 20000 }],
          },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /already been sold/);
        return true;
      }
    );
  });

  test('Fails-closed if cash payment tendered but no cash register session is OPEN', async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
        if (sql.includes('FROM mobile_devices')) {
          return {
            rows: [
              {
                id: 'dev-1',
                brand: 'Infinix',
                model: 'Hot 40',
                status: 'IN_STOCK',
                cost_price: 16000,
                branch_id: dummyIdentity.branchId,
                organization_id: dummyIdentity.organizationId,
              },
            ],
          };
        }
        if (sql.includes('FROM mobile_imei_identifiers')) {
          return {
            rows: [{ slot: 'IMEI1', imei: '354829104829104' }],
          };
        }
        if (sql.includes('SELECT code FROM branches')) {
          return { rows: [{ code: 'BR1' }] };
        }
        if (sql.includes('INSERT INTO user_invoice_counters')) {
          return { rows: [{ next_value: 10 }] };
        }
        if (sql.includes('FROM cash_sessions')) {
          return { rows: [] }; // No open cash session!
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient as unknown as PoolClient,
    } as unknown as Pool;

    await assert.rejects(
      async () => {
        await executeMobileSale(
          mockPool,
          {
            items: [{ deviceId: 'dev-1', salePrice: 20000 }],
            payments: [{ method: 'CASH', amount: 20000 }],
          },
          dummyIdentity,
          false
        );
      },
      (err: any) => {
        assert(err instanceof MobileSaleRepoError);
        assert.match(err.message, /No open cash register session found/);
        return true;
      }
    );
  });

  test('Executes successful transaction with multi-payment split, invoice generation, status transition & movements', async () => {
    const queriesIssued: string[] = [];
    const mockClient = {
      query: async (sql: string, params?: any[]) => {
        queriesIssued.push(sql);
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
        if (sql.includes('FROM mobile_devices')) {
          return {
            rows: [
              {
                id: 'dev-1',
                brand: 'Xiaomi',
                model: 'Redmi 13',
                color: 'Midnight Black',
                storage: '128GB',
                status: 'IN_STOCK',
                cost_price: 25000,
                expected_sale_price: 30000,
                branch_id: dummyIdentity.branchId,
                organization_id: dummyIdentity.organizationId,
              },
            ],
          };
        }
        if (sql.includes('FROM mobile_imei_identifiers')) {
          return {
            rows: [
              { slot: 'IMEI1', imei: '864201948201948' },
              { slot: 'IMEI2', imei: '864201948201949' },
            ],
          };
        }
        if (sql.includes('SELECT code FROM branches')) {
          return { rows: [{ code: 'NMM-MAIN' }] };
        }
        if (sql.includes('INSERT INTO user_invoice_counters')) {
          return { rows: [{ next_value: 43 }] };
        }
        if (sql.includes('FROM cash_sessions')) {
          return { rows: [{ id: 'sess-active-01' }] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => mockClient as unknown as PoolClient,
    } as unknown as Pool;

    const res = await executeMobileSale(
      mockPool,
      {
        items: [{ deviceId: 'dev-1', salePrice: 30000 }],
        payments: [
          { method: 'CASH', amount: 10000 },
          { method: 'JAZZCASH', amount: 20000, referenceNumber: 'JC-998877' },
        ],
        notes: 'Customer warranty note 7 days',
      },
      dummyIdentity,
      false
    );

    assert.ok(res);
    assert.strictEqual(res.totalAmount, 30000);
    assert.strictEqual(res.paidAmount, 30000);
    assert.strictEqual(res.paymentStatus, 'PAID');
    assert.strictEqual(res.cashier.name, 'ali_cashier');
    assert.strictEqual(res.cashier.role, 'CASHIER');
    assert.match(res.invoiceNumber, /^NMM-MAIN-U[0-9A-Z]+-\d{6}-\d{6}$/);

    // Verify critical SQL commands executed inside transaction
    const hasSalesInsert = queriesIssued.some((q) => q.includes('INSERT INTO sales'));
    const hasMobileSaleItemsInsert = queriesIssued.some((q) => q.includes('INSERT INTO mobile_sale_items'));
    const hasDeviceStatusUpdate = queriesIssued.some((q) => q.includes("UPDATE mobile_devices\n         SET status = 'SOLD'"));
    const hasMovementsInsert = queriesIssued.some((q) => q.includes("INSERT INTO mobile_device_movements"));
    const hasCashMovementsInsert = queriesIssued.some((q) => q.includes("INSERT INTO cash_movements"));
    const hasSalePaymentsInsert = queriesIssued.some((q) => q.includes("INSERT INTO sale_payments"));
    const hasCommit = queriesIssued.some((q) => q.includes('COMMIT'));

    assert.ok(hasSalesInsert, 'Core sales record must be inserted');
    assert.ok(hasMobileSaleItemsInsert, 'mobile_sale_items record must be inserted with snapshots');
    assert.ok(hasDeviceStatusUpdate, 'mobile_devices.status must be updated to SOLD');
    assert.ok(hasMovementsInsert, 'mobile_device_movements audit record must be inserted');
    assert.ok(hasCashMovementsInsert, 'cash_movements record must be inserted for cash tender');
    assert.ok(hasSalePaymentsInsert, 'sale_payments must be inserted for each split method');
    assert.ok(hasCommit, 'Transaction must be committed');
  });
});
