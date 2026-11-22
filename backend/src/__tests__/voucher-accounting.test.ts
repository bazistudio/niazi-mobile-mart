/**
 * Direct Advance Voucher — Pure In-Memory Service & Accounting Unit Tests
 *
 * Uses mocked pg.Pool / PoolClient (zero database connections or writes).
 * Verifies:
 *   1. INSTANT_INVENTORY registration-only invariant (no duplicate SALE or PAYMENT)
 *   2. DIRECT_ADVANCE immediate delivery + SALE debit + split-tender PAYMENT credit
 *   3. PRE_BOOKING zero initial delivery + advance PAYMENT credit + deferred SALE debit on delivery
 *   4. Whole-rupee integer enforcement & cross-branch RBAC rejection
 *   5. Safe cancellation boundary (rejects when payments or deliveries exist)
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { RequestIdentity } from '../auth';
import {
  createVoucher,
  deliverVoucher,
  cancelVoucher,
  matchVoucherInventory,
} from '../services/voucher.service';
import { VoucherRepoError } from '../repositories/voucher.repo';

const BRANCH_MAIN = '00000000-0000-0000-0000-000000000002';
const BRANCH_ALPHA = '00000000-0000-0000-0000-000000000004';
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000030';
const VOUCHER_ID = '00000000-0000-0000-0000-000000000040';

const cashierIdentity: RequestIdentity = {
  user_id: USER_ID,
  username: 'cashier1',
  role: 'CASHIER',
  organization_id: ORG_ID,
  branch_id: BRANCH_MAIN,
  access_profile: {
    allowed_pages: ['pos'],
    allowed_actions: ['pos:sale'],
    limits: {
      max_discount_percent: 10,
      can_price_override: true,
      can_refund: false,
      can_void_sale: false,
      can_view_profit: false,
    },
  },
  authenticated_at_ms: Date.now(),
};

interface QueryLog {
  sql: string;
  params?: unknown[];
}

function makeMockPool(options?: {
  customerBalance?: number;
  customerCreditLimit?: number;
  voucherRow?: Record<string, unknown>;
}) {
  const queries: QueryLog[] = [];
  const custBalance = options?.customerBalance ?? 0;
  const custCreditLimit = options?.customerCreditLimit ?? 100000;

  const handleQuery = async (sql: string, params?: unknown[]) => {
    const clean = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql: clean, params });

    if (clean === 'BEGIN' || clean === 'COMMIT' || clean === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (clean.includes('FROM customers WHERE id = $1')) {
      return {
        rows: [{ id: CUSTOMER_ID, name: 'Ali Khan', phone: '03001234567', credit_limit: String(custCreditLimit) }],
        rowCount: 1,
      };
    }
    if (clean.includes('FROM customer_ledger_entries WHERE customer_id = $1')) {
      return { rows: [{ balance: String(custBalance) }], rowCount: 1 };
    }
    if (clean.includes('FROM products WHERE id = $1')) {
      return { rows: [{ id: PRODUCT_ID, name: 'X680 LCD', sale_price: 2200, purchase_price: 1500 }], rowCount: 1 };
    }
    if (clean.includes('FROM branches WHERE id = $1')) {
      return { rows: [{ code: 'MAIN' }], rowCount: 1 };
    }
    if (clean.includes('INSERT INTO voucher_counters')) {
      return { rows: [{ seq: '1' }], rowCount: 1 };
    }
    if (clean.includes('FROM cash_sessions')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000099' }], rowCount: 1 };
    }
    if (clean.includes('INSERT INTO pos_direct_vouchers')) {
      const p = params ?? [];
      const row = {
        id: p[0],
        voucher_number: p[1],
        voucher_type: p[2],
        organization_id: p[3],
        branch_id: p[4],
        customer_id: p[5],
        customer_name_snapshot: p[6],
        customer_phone_snapshot: p[7],
        product_id: p[8],
        product_name: p[9],
        spec_category: p[10],
        spec_quality: p[11],
        spec_color: p[12],
        spec_brand: p[13],
        spec_company: p[14],
        voucher_qty: p[15],
        delivered_qty: p[16],
        matched_qty: 0,
        remaining_qty: Number(p[16]),
        locked_purchase_price: p[17],
        catalog_sale_price: p[18],
        voucher_sale_price: p[19],
        total_sale_amount: Number(p[15]) * Number(p[19]),
        payment_method: p[20],
        payment_status: p[21],
        paid_amount: p[22],
        cash_movement_id: null,
        customer_ledger_id: p[23],
        sale_id: null,
        status: p[24],
        notes: p[25],
        performed_by: p[26],
        created_at: p[27],
        updated_at: p[27],
      };
      return { rows: [row], rowCount: 1 };
    }
    if (clean.includes('FROM pos_direct_vouchers WHERE id = $1')) {
      if (options?.voucherRow) {
        return { rows: [options.voucherRow], rowCount: 1 };
      }
      // Return last inserted voucher row from queries
      return { rows: [], rowCount: 0 };
    }
    if (clean.includes('INSERT INTO pos_voucher_payments')) {
      const p = params ?? [];
      return {
        rows: [{
          id: p[0],
          organization_id: p[1],
          branch_id: p[2],
          voucher_id: p[3],
          payment_method: p[4],
          amount: p[5],
          reference_number: p[6],
          notes: p[7],
          cash_movement_id: p[8],
          customer_ledger_id: p[9],
          is_reversed: false,
          reversed_by_payment_id: null,
          performed_by: p[10],
          created_at: p[11],
        }],
        rowCount: 1,
      };
    }
    if (clean.includes('INSERT INTO pos_voucher_deliveries')) {
      const p = params ?? [];
      return {
        rows: [{
          id: p[0],
          voucher_id: p[1],
          quantity_delivered: p[2],
          customer_ledger_id: p[3],
          idempotency_key: p[4],
          performed_by: p[5],
          notes: p[6],
          created_at: p[7],
        }],
        rowCount: 1,
      };
    }
    if (clean.includes('FROM pos_voucher_deliveries WHERE voucher_id = $1 AND idempotency_key = $2')) {
      return { rows: [], rowCount: 0 };
    }
    if (clean.includes('UPDATE pos_direct_vouchers')) {
      const base = options?.voucherRow ?? {};
      return {
        rows: [{
          ...base,
          delivered_qty: clean.includes('delivered_qty = $1') ? params?.[0] : base['delivered_qty'],
          status: clean.includes("status = 'CANCELLED'") ? 'CANCELLED' : base['status'],
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const mockClient = {
    query: handleQuery,
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
    query: handleQuery,
  } as unknown as import('pg').Pool;

  return { mockPool, queries };
}

describe('Direct Advance Voucher — Service & Accounting Invariants', () => {
  it('1. Rejects initial payments on INSTANT_INVENTORY registration-only vouchers', async () => {
    const { mockPool } = makeMockPool();
    await assert.rejects(
      () =>
        createVoucher(mockPool, cashierIdentity, {
          voucher_type: 'INSTANT_INVENTORY',
          product_id: PRODUCT_ID,
          product_name: 'X680 LCD',
          locked_purchase_price: 1500,
          catalog_sale_price: 2200,
          voucher_sale_price: 2000,
          idempotency_key: 'test-idemp-1',
          payments: [{ method: 'CASH', amount: 2000 }],
        }),
      (err: unknown) => err instanceof VoucherRepoError && err.statusCode === 400
    );
  });

  it('2. INSTANT_INVENTORY creates zero ledger debits/credits and zero cash movements', async () => {
    const { mockPool, queries } = makeMockPool();
    const res = await createVoucher(mockPool, cashierIdentity, {
      voucher_type: 'INSTANT_INVENTORY',
      product_id: PRODUCT_ID,
      product_name: 'X680 LCD',
      locked_purchase_price: 1500,
      catalog_sale_price: 2200,
      voucher_sale_price: 2000,
      voucher_qty: 1,
      idempotency_key: 'test-idemp-2',
    });

    assert.equal(res.voucher.voucher_type, 'INSTANT_INVENTORY');
    assert.equal(res.voucher.payment_status, 'REGISTRATION_ONLY');
    assert.equal(res.voucher.delivered_qty, 0);
    assert.equal(res.payments.length, 0);

    const ledgerInserts = queries.filter((q) => q.sql.includes('INSERT INTO customer_ledger_entries'));
    const cashInserts = queries.filter((q) => q.sql.includes('INSERT INTO cash_movements'));
    assert.equal(ledgerInserts.length, 0);
    assert.equal(cashInserts.length, 0);
  });

  it('3. DIRECT_ADVANCE split payment (Cash 10k + Bank 15k on 50k): posts 50k SALE debit, 25k PAYMENT credit, and 10k CASH movement only', async () => {
    const { mockPool, queries } = makeMockPool({ customerBalance: 0, customerCreditLimit: 100000 });
    const res = await createVoucher(mockPool, cashierIdentity, {
      voucher_type: 'DIRECT_ADVANCE',
      customer_id: CUSTOMER_ID,
      product_name: 'Infinix Display',
      voucher_qty: 1,
      locked_purchase_price: 40000,
      voucher_sale_price: 50000,
      idempotency_key: 'test-idemp-3',
      payments: [
        { method: 'CASH', amount: 10000 },
        { method: 'BANK', amount: 15000 },
      ],
    });

    assert.equal(res.voucher.voucher_type, 'DIRECT_ADVANCE');
    assert.equal(res.voucher.delivered_qty, 1);
    assert.equal(res.voucher.payment_method, 'SPLIT');
    assert.equal(res.voucher.payment_status, 'PARTIALLY_PAID');
    assert.equal(res.voucher.paid_amount, 25000);
    assert.equal(res.payments.length, 2);
    assert.equal(res.customer_balance_after, 25000);

    const cashInserts = queries.filter((q) => q.sql.includes('INSERT INTO cash_movements'));
    assert.equal(cashInserts.length, 1);
    assert.equal(cashInserts[0]!.params?.[3], 10000);
  });

  it('4. PRE_BOOKING starts with delivered_qty=0 and posts PAYMENT credit only; SALE debit is posted on deliverVoucher', async () => {
    const { mockPool, queries } = makeMockPool({ customerBalance: 0 });
    const created = await createVoucher(mockPool, cashierIdentity, {
      voucher_type: 'PRE_BOOKING',
      customer_id: CUSTOMER_ID,
      product_name: 'iPhone 16 Pro',
      voucher_qty: 1,
      locked_purchase_price: 40000,
      voucher_sale_price: 50000,
      idempotency_key: 'test-idemp-4',
      payments: [{ method: 'CASH', amount: 20000 }],
    });

    assert.equal(created.voucher.delivered_qty, 0);
    assert.equal(created.customer_balance_after, -20000);

    const saleDebitsAtCreate = queries.filter(
      (q) => q.sql.includes('INSERT INTO customer_ledger_entries') && q.sql.includes("'SALE'")
    );
    assert.equal(saleDebitsAtCreate.length, 0);

    // Now deliver 1 unit
    const deliverPool = makeMockPool({
      customerBalance: -20000,
      voucherRow: {
        ...created.voucher,
        id: VOUCHER_ID,
        voucher_qty: 1,
        delivered_qty: 0,
        matched_qty: 0,
        remaining_qty: 0,
        voucher_sale_price: 50000,
        status: 'PENDING_RECEIPT',
      },
    });
    const delivered = await deliverVoucher(deliverPool.mockPool, cashierIdentity, VOUCHER_ID, {
      quantity_delivered: 1,
      idempotency_key: 'deliver-idemp-4',
    });
    assert.equal(delivered.voucher.delivered_qty, 1);
    assert.equal(delivered.customer_balance_after, 30000);
  });

  it('5. Rejects cross-branch access for non-admin cashier with 403', async () => {
    const { mockPool } = makeMockPool();
    await assert.rejects(
      () =>
        createVoucher(mockPool, cashierIdentity, {
          voucher_type: 'DIRECT_ADVANCE',
          branch_id: BRANCH_ALPHA,
          customer_id: CUSTOMER_ID,
          product_name: 'Test Item',
          locked_purchase_price: 1000,
          voucher_sale_price: 1500,
          idempotency_key: 'test-idemp-5',
          payments: [{ method: 'CASH', amount: 1500 }],
        }),
      (err: unknown) => err instanceof VoucherRepoError && err.statusCode === 403
    );
  });

  it('6. Rejects cancellation when voucher already has recorded payments', async () => {
    const { mockPool } = makeMockPool({
      voucherRow: {
        id: VOUCHER_ID,
        voucher_number: 'MAIN-VCH-202611-000001',
        voucher_type: 'PRE_BOOKING',
        organization_id: ORG_ID,
        branch_id: BRANCH_MAIN,
        customer_id: CUSTOMER_ID,
        customer_name_snapshot: 'Ali Khan',
        customer_phone_snapshot: null,
        product_id: null,
        product_name: 'iPhone 16 Pro',
        spec_category: null,
        spec_quality: null,
        spec_color: null,
        spec_brand: null,
        spec_company: null,
        voucher_qty: 1,
        delivered_qty: 0,
        matched_qty: 0,
        remaining_qty: 0,
        locked_purchase_price: 40000,
        catalog_sale_price: null,
        voucher_sale_price: 50000,
        total_sale_amount: 50000,
        payment_method: 'CASH',
        payment_status: 'PARTIALLY_PAID',
        paid_amount: 20000,
        cash_movement_id: null,
        customer_ledger_id: null,
        sale_id: null,
        status: 'PENDING_RECEIPT',
        notes: null,
        performed_by: USER_ID,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    await assert.rejects(
      () => cancelVoucher(mockPool, cashierIdentity, VOUCHER_ID, { reason: 'Changed mind' }),
      (err: unknown) => err instanceof VoucherRepoError && err.statusCode === 400
    );
  });

  it('7. VCH-04: Rejects voucher creation without idempotency_key', async () => {
    const { mockPool } = makeMockPool();
    await assert.rejects(
      () =>
        createVoucher(mockPool, cashierIdentity, {
          voucher_type: 'INSTANT_INVENTORY',
          product_name: 'Test Product',
          locked_purchase_price: 1000,
          voucher_sale_price: 1500,
        }),
      (err: unknown) =>
        err instanceof VoucherRepoError &&
        err.statusCode === 400 &&
        err.message.includes('idempotency_key is required')
    );
  });

  it('8. VCH-02: DIRECT_ADVANCE with existing customer advance correctly sets voucher paid_amount and status PAID without cash receipt', async () => {
    // Customer has advance balance of -50000 (credit)
    const { mockPool, queries } = makeMockPool({
      customerBalance: -50000,
      customerCreditLimit: 100000,
    });
    const res = await createVoucher(mockPool, cashierIdentity, {
      voucher_type: 'DIRECT_ADVANCE',
      customer_id: CUSTOMER_ID,
      product_name: 'Samsung A55',
      voucher_qty: 1,
      locked_purchase_price: 40000,
      voucher_sale_price: 50000,
      idempotency_key: 'test-vch-02-advance',
      payments: [], // No fresh cash paid; entire amount covered by advance
    });

    assert.equal(res.voucher.voucher_type, 'DIRECT_ADVANCE');
    assert.equal(res.voucher.delivered_qty, 1);
    assert.equal(res.voucher.paid_amount, 50000, 'Voucher paid_amount must reflect advance applied');
    assert.equal(res.voucher.payment_status, 'PAID', 'Voucher status must be PAID when advance covers total');

    // Customer ledger should have SALE debit of 50000, and balance_after should be 0
    const saleDebits = queries.filter(
      (q) => q.sql.includes('INSERT INTO customer_ledger_entries') && q.sql.includes("'SALE'")
    );
    assert.equal(saleDebits.length, 1);
    assert.equal(res.customer_balance_after, 0);

    // No new payment credits or cash movements should be created
    const payCredits = queries.filter(
      (q) => q.sql.includes('INSERT INTO customer_ledger_entries') && q.sql.includes("'PAYMENT'")
    );
    const cashInserts = queries.filter((q) => q.sql.includes('INSERT INTO cash_movements'));
    assert.equal(payCredits.length, 0);
    assert.equal(cashInserts.length, 0);
  });

  it('9. VCH-03: deliverVoucher enforces idempotency and does not post duplicate SALE debit on replay', async () => {
    let deliveryChecked = false;
    let ledgerCount = 0;

    const mockPoolWithDelivery = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          const clean = sql.replace(/\s+/g, ' ').trim();
          if (clean === 'BEGIN' || clean === 'COMMIT' || clean === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
          }
          if (clean.includes('FROM pos_voucher_deliveries WHERE voucher_id = $1 AND idempotency_key = $2')) {
            if (deliveryChecked) {
              return {
                rows: [{
                  id: 'del-1',
                  voucher_id: VOUCHER_ID,
                  quantity_delivered: 1,
                  customer_ledger_id: 'ledger-del-1',
                  idempotency_key: 'del-idemp-key-1',
                  request_fingerprint: 'fa95e8f1b825e76fc8406d9a86706e2952022ef94dd1eafc73fa56ab924b2c7e',
                  performed_by: USER_ID,
                  created_at: new Date().toISOString(),
                }],
                rowCount: 1,
              };
            }
            return { rows: [], rowCount: 0 };
          }
          if (clean.includes('FROM pos_direct_vouchers WHERE id = $1')) {
            return {
              rows: [{
                id: VOUCHER_ID,
                voucher_number: 'MAIN-VCH-202611-000001',
                voucher_type: 'PRE_BOOKING',
                organization_id: ORG_ID,
                branch_id: BRANCH_MAIN,
                customer_id: CUSTOMER_ID,
                voucher_qty: 1,
                delivered_qty: deliveryChecked ? 1 : 0,
                matched_qty: 0,
                voucher_sale_price: 50000,
                status: 'PENDING_RECEIPT',
              }],
              rowCount: 1,
            };
          }
          if (clean.includes('FROM customers WHERE id = $1')) {
            return { rows: [{ id: CUSTOMER_ID }], rowCount: 1 };
          }
          if (clean.includes('FROM customer_ledger_entries WHERE customer_id = $1')) {
            return { rows: [{ balance: '0' }], rowCount: 1 };
          }
          if (clean.includes('INSERT INTO customer_ledger_entries')) {
            ledgerCount++;
            return { rows: [], rowCount: 1 };
          }
          if (clean.includes('INSERT INTO pos_voucher_deliveries')) {
            deliveryChecked = true;
            return { rows: [], rowCount: 1 };
          }
          if (clean.includes('UPDATE pos_direct_vouchers')) {
            return {
              rows: [{
                id: VOUCHER_ID,
                voucher_number: 'MAIN-VCH-202611-000001',
                voucher_type: 'PRE_BOOKING',
                organization_id: ORG_ID,
                branch_id: BRANCH_MAIN,
                customer_id: CUSTOMER_ID,
                voucher_qty: 1,
                delivered_qty: 1,
                matched_qty: 0,
                voucher_sale_price: 50000,
                status: 'PENDING_RECEIPT',
              }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as import('pg').Pool;

    // First delivery attempt
    const firstDelivery = await deliverVoucher(mockPoolWithDelivery, cashierIdentity, VOUCHER_ID, {
      quantity_delivered: 1,
      idempotency_key: 'del-idemp-key-1',
    });
    assert.equal(firstDelivery.idempotent_replay, false);
    assert.equal(ledgerCount, 1, 'First delivery must post SALE debit');

    // Second delivery attempt with same idempotency_key
    const secondDelivery = await deliverVoucher(mockPoolWithDelivery, cashierIdentity, VOUCHER_ID, {
      quantity_delivered: 1,
      idempotency_key: 'del-idemp-key-1',
    });
    assert.equal(secondDelivery.idempotent_replay, true);
    assert.equal(ledgerCount, 1, 'Replay must NOT post duplicate SALE debit');
  });

  it('11. DEF-03: deliverVoucher rejects conflicting payload with same idempotency_key with 409 Conflict', async () => {
    let checkedFingerprint = false;
    const mockPoolFingerprint = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          const clean = sql.replace(/\s+/g, ' ').trim();
          if (clean === 'BEGIN' || clean === 'COMMIT' || clean === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
          }
          if (clean.includes('pg_advisory_xact_lock')) {
            return { rows: [], rowCount: 0 };
          }
          if (clean.includes('FROM pos_voucher_deliveries WHERE voucher_id = $1 AND idempotency_key = $2')) {
            return {
              rows: [{
                id: 'del-1',
                voucher_id: VOUCHER_ID,
                quantity_delivered: 1,
                customer_ledger_id: 'ledger-del-1',
                idempotency_key: 'del-conflicting-key',
                request_fingerprint: 'original-fingerprint-hash',
                performed_by: USER_ID,
                created_at: new Date().toISOString(),
              }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as import('pg').Pool;

    // Retry with different quantity (2 instead of 1)
    await assert.rejects(
      () =>
        deliverVoucher(mockPoolFingerprint, cashierIdentity, VOUCHER_ID, {
          quantity_delivered: 2,
          idempotency_key: 'del-conflicting-key',
        }),
      (err: unknown) =>
        err instanceof VoucherRepoError &&
        err.statusCode === 409 &&
        err.message.includes('different delivery payload')
    );
  });

  it('10. VCH-01: PRE_BOOKING allows inventory matching before physical delivery', async () => {
    let updatedVoucherMatched = 0;
    const mockPoolMatch = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          const clean = sql.replace(/\s+/g, ' ').trim();
          if (clean === 'BEGIN' || clean === 'COMMIT' || clean === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
          }
          if (clean.includes('FROM pos_direct_vouchers WHERE id = $1')) {
            return {
              rows: [{
                id: VOUCHER_ID,
                voucher_number: 'MAIN-VCH-202611-000001',
                voucher_type: 'PRE_BOOKING',
                organization_id: ORG_ID,
                branch_id: BRANCH_MAIN,
                customer_id: CUSTOMER_ID,
                product_id: PRODUCT_ID,
                product_name: 'iPhone 16 Pro',
                voucher_qty: 1,
                delivered_qty: 0, // Undelivered PRE_BOOKING
                matched_qty: 0,
                remaining_qty: 0,
                locked_purchase_price: 40000,
                voucher_sale_price: 50000,
                status: 'PENDING_RECEIPT',
              }],
              rowCount: 1,
            };
          }
          if (clean.includes('FROM purchase_lines pl')) {
            return {
              rows: [{
                id: 'pl-1',
                purchase_id: 'purch-1',
                product_id: PRODUCT_ID,
                quantity: '5',
                unit_cost: '40000',
                branch_id: BRANCH_MAIN,
              }],
              rowCount: 1,
            };
          }
          if (clean.includes('FROM pos_voucher_inventory_matches WHERE purchase_line_id = $1')) {
            return { rows: [{ total: '0' }], rowCount: 1 };
          }
          if (clean.includes('INSERT INTO pos_voucher_inventory_matches')) {
            return {
              rows: [{
                id: 'match-1',
                organization_id: ORG_ID,
                voucher_id: VOUCHER_ID,
                purchase_id: 'purch-1',
                purchase_line_id: 'pl-1',
                stock_movement_in_id: null,
                stock_movement_out_id: null,
                branch_id: BRANCH_MAIN,
                product_id: PRODUCT_ID,
                quantity_matched: 1,
                locked_unit_cost: 40000,
                actual_receiving_cost: 40000,
                unit_cost_discrepancy: 0,
                total_cost_discrepancy: 0,
                reconciliation_notes: null,
                matched_by: USER_ID,
                created_at: new Date().toISOString(),
              }],
              rowCount: 1,
            };
          }
          if (clean.includes('UPDATE pos_direct_vouchers')) {
            updatedVoucherMatched = 1;
            return {
              rows: [{
                id: VOUCHER_ID,
                voucher_number: 'MAIN-VCH-202611-000001',
                voucher_type: 'PRE_BOOKING',
                organization_id: ORG_ID,
                branch_id: BRANCH_MAIN,
                customer_id: CUSTOMER_ID,
                product_id: PRODUCT_ID,
                product_name: 'iPhone 16 Pro',
                voucher_qty: 1,
                delivered_qty: 0,
                matched_qty: 1,
                voucher_sale_price: 50000,
                status: 'FULFILLED',
              }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as import('pg').Pool;

    const res = await matchVoucherInventory(mockPoolMatch, cashierIdentity, VOUCHER_ID, {
      product_id: PRODUCT_ID,
      purchase_line_id: '00000000-0000-0000-0000-000000000088',
      quantity_matched: 1,
    });
    assert.equal(res.voucher.matched_qty, 1);
    assert.equal(updatedVoucherMatched, 1);
  });
});
