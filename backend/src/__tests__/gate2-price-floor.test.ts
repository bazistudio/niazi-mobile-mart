/**
 * Gate 2 Regression Tests — F-01 (ADV-01) + NEW-01-C + NEW-01 parity
 *
 * Tests the enforcement that sale_price >= purchase_price on product update,
 * including the ADV-01 fix where WAC governs the floor when purchase_price = 0.
 * Also covers createRepairJobTx() CASH advance fail-closed enforcement (NEW-01-C)
 * and regression parity for addRepairPaymentTx / completeRepairJobTx (NEW-01).
 *
 * All tests use mock pools — no DB connection required.
 *
 * Coverage (original 6 preserved + 12 new):
 *   updateProduct() price-floor (original):
 *     1. Rejects sale price < current purchase price
 *     2. Rejects sale price < simultaneously updated purchase price
 *     3. Accepts sale price exactly equal to purchase price (zero-margin)
 *     4. Accepts sale price above purchase price
 *
 *   receiveStock() price-floor (original):
 *     5. Rejects sale price below restocked unit cost
 *     6. Accepts sale price equal to restocked unit cost
 *
 *   ADV-01: updateProduct() with purchase_price = 0 (WAC fallback):
 *     7.  Rejects sale price below positive WAC when purchase_price = 0
 *     8.  Accepts sale price equal to WAC when purchase_price = 0 (zero-margin)
 *     9.  Accepts sale price above WAC when purchase_price = 0
 *     10. Uses positive purchase_price as floor when both are positive
 *     11. No floor applied when both purchase_price and avg_cost are 0
 *
 *   NEW-01-C: createRepairJobTx() CASH advance fail-closed:
 *     12. CASH advance without branch ID throws HTTP 400
 *     13. CASH advance with no open session throws HTTP 400
 *     14. Non-CASH advance (BANK_TRANSFER) proceeds without session check
 *     15. CASH advance with valid open session accepted (linked session + movement)
 *     16. Failed cash movement insertion rolls back (throws and createRepairJobTx rejects)
 *
 *   NEW-01 regression parity (addRepairPaymentTx / completeRepairJobTx):
 *     17. addRepairPaymentTx() CASH with no open session throws HTTP 400
 *     18. completeRepairJobTx() CASH settlement with no open session throws HTTP 400
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateProduct, receiveStock } from '../repositories/product.repo';
import { RepoError } from '../repositories/product.repo';
import { createRepairJobTx, addRepairPaymentTx, completeRepairJobTx, RepairRepoError } from '../repositories/repair.repo';
import type { CreateRepairJobDto, AddRepairPaymentDto, CompleteRepairJobDto } from '../repositories/repair.repo';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED MOCK HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeCurrentProductRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-test-001',
    name: 'Test Product',
    normalized_name: 'test product',
    sku: 'SKU-001',
    barcode: null,
    organization_id: 'niazi-org',
    category_id: null,
    brand_id: null,
    company_id: null,
    quality_id: null,
    color_id: null,
    unit_id: null,
    sale_price: 5000,
    purchase_price: 3000,
    average_cost: 3000,
    low_stock_threshold: 2,
    is_active: true,
    description: null,
    initial_quantity: 10,
    compatible_models: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockPool(currentProductRow: Record<string, unknown>) {
  const mockClient = {
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.trim() === 'BEGIN' || sql.trim() === 'ROLLBACK' || sql.trim() === 'COMMIT') {
        return { rows: [] };
      }
      if (sql.includes('FOR UPDATE') && sql.includes('FROM products')) {
        return { rows: [currentProductRow] };
      }
      if (sql.includes('SELECT id') && sql.includes('FROM brands')) return { rows: [{ id: 'brand-id' }] };
      if (sql.includes('SELECT id') && sql.includes('FROM categories')) return { rows: [{ id: 'cat-id' }] };
      if (sql.includes('SELECT id') && sql.includes('FROM companies')) return { rows: [{ id: 'comp-id' }] };
      if (sql.includes('SELECT id') && sql.includes('FROM qualities')) return { rows: [{ id: 'qual-id' }] };
      if (sql.includes('SELECT id') && sql.includes('FROM colors')) return { rows: [{ id: 'color-id' }] };
      if (sql.includes('SELECT id') && sql.includes('FROM units')) return { rows: [{ id: 'unit-id' }] };
      if (sql.includes('UPDATE products')) return { rows: [] };
      if (sql.includes('FROM products') && !sql.includes('FOR UPDATE')) {
        return { rows: [currentProductRow] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('information_schema.columns') || sql.includes('schema_caps') || sql.includes('compatible_models')) {
        return { rows: [{ has_compatible_models: true }] };
      }
      return { rows: [] };
    },
  };

  return mockPool as any;
}

function makeReceiveStockPool(currentProduct: { average_cost: number; purchase_price: number; sale_price: number }) {
  const mockClient = {
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.trim() === 'BEGIN' || sql.trim() === 'ROLLBACK' || sql.trim() === 'COMMIT') {
        return { rows: [] };
      }
      if (sql.includes('average_cost') && sql.includes('purchase_price')) {
        return { rows: [currentProduct] };
      }
      return { rows: [{ id: 'movement-id' }] };
    },
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT') && sql.includes('quantity')) {
        return { rows: [{ quantity: 10 }] };
      }
      if (sql.includes('average_cost') && sql.includes('purchase_price')) {
        return { rows: [currentProduct] };
      }
      return { rows: [] };
    },
  };

  return mockPool as any;
}

// ── createRepairJobTx mock pool ──────────────────────────────────────────────
// Configurable: cashSessions controls what the session query returns.
// If throwOnCashMovement=true, INSERT INTO cash_movements throws an error.
// cashMovementId is captured for assertion in success cases.
function makeRepairJobPool(opts: {
  cashSessions: Array<{ id: string }>;
  throwOnCashMovement?: boolean;
}) {
  const capturedPayments: Array<Record<string, unknown>> = [];
  const capturedMovements: Array<Record<string, unknown>> = [];

  // A mock repair job row for getRepairJobById + getPartsForJob/getPaymentsForJob
  const mockJobRow = {
    id: 'repair-uuid-001',
    job_id: 'REP-0001',
    customer_name: 'Test Customer',
    status: 'Received',
    settlement_status: 'UNPAID',
    branch_id: 'branch-uuid-001',
    technician_name: null,
    technician_id: null,
    device_type: '', device_brand: '', device_model: 'iPhone 14',
    device_color: '', device_imei: '', device_password: null,
    acc_charger: false, acc_battery: false, acc_sim: false,
    acc_memory_card: false, acc_cover: false, acc_box: false, acc_other: null,
    problem_description: 'cracked screen',
    initial_inspection: '[]',
    priority: 'Normal',
    estimated_cost: 0,
    expected_delivery_date: null,
    internal_notes: null,
    customer_notes: null,
    timeline: '[]',
    labor_charges: '[]',
    additional_charges: 0,
    discount: 0,
    images_before: '[]', images_after: '[]', images_proof: '[]',
    performed_by: null,
    customer_id: null, customer_phone: null,
    organization_id: 'niazi-org',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockClient = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT') return { rows: [] };
      if (sql.trim() === 'ROLLBACK') return { rows: [] };

      // Advisory lock
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };

      // Sequence for job_id
      if (sql.includes('nextval')) return { rows: [{ seq: 1 }] };

      // Insert repair_jobs
      if (sql.includes('INSERT INTO repair_jobs')) return { rows: [] };

      // Cash session query (the fail-closed check)
      if (sql.includes('cash_sessions') && sql.includes("status = 'OPEN'") && sql.includes('FOR UPDATE')) {
        return { rows: opts.cashSessions };
      }

      // Insert cash_movements
      if (sql.includes('INSERT INTO cash_movements')) {
        if (opts.throwOnCashMovement) {
          throw new Error('simulated cash_movements constraint violation');
        }
        const movId = 'cm-uuid-001';
        capturedMovements.push({ id: movId });
        return { rows: [] };
      }

      // Insert repair_payments
      if (sql.includes('INSERT INTO repair_payments') && params) {
        const p = params as unknown[];
        capturedPayments.push({
          id: p[0], repair_job_id: p[1], amount: p[2], method: p[3],
          session_id: p[5], cash_movement_id: p[6], branch_id: p[7],
        });
        return { rows: [] };
      }

      // change_log
      if (sql.includes('INSERT INTO change_log') || sql.includes('change_log')) return { rows: [] };

      return { rows: [] };
    },
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
    // Pool-level queries: getRepairJobById, getPartsForJob, getPaymentsForJob
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('repair_jobs') && sql.includes('LEFT JOIN users')) {
        return { rows: [mockJobRow] };
      }
      if (sql.includes('repair_parts') || sql.includes('repair_job_parts')) {
        return { rows: [] };
      }
      if (sql.includes('repair_payments')) {
        return { rows: capturedPayments };
      }
      return { rows: [] };
    },
    _capturedPayments: capturedPayments,
    _capturedMovements: capturedMovements,
  };

  return mockPool as any;
}

// Minimal valid CreateRepairJobDto with CASH advance
function makeCashAdvanceDto(overrides: Partial<CreateRepairJobDto> = {}): CreateRepairJobDto {
  return {
    customer_name: 'Test Customer',
    device: { model: 'iPhone 14' },
    problem_description: 'cracked screen',
    branch_id: 'branch-uuid-001',
    advance_payment: { amount: 2000, method: 'CASH' },
    ...overrides,
  } as CreateRepairJobDto;
}

// Mock pool for addRepairPaymentTx (NEW-01 parity)
function makePaymentPool(cashSessions: Array<{ id: string }>) {
  const mockJob = {
    id: 'repair-uuid-001',
    job_id: 'REP-0001',
    branch_id: 'branch-uuid-001',
    status: 'Received',
    settlement_status: 'UNPAID',
    customer_name: 'Test',
    device_model: 'X',
    device_type: '', device_brand: '',
    problem_description: 'test',
    initial_inspection: '[]', timeline: '[]',
    labor_charges: '[]', images_before: '[]', images_after: '[]', images_proof: '[]',
    priority: 'Normal', estimated_cost: 0, additional_charges: 0, discount: 0,
    performed_by: null, technician_id: null, customer_id: null, customer_phone: null,
    device_color: '', device_imei: '', device_password: null, acc_other: null,
    acc_charger: false, acc_battery: false, acc_sim: false,
    acc_memory_card: false, acc_cover: false, acc_box: false,
    internal_notes: null, customer_notes: null, expected_delivery_date: null,
    organization_id: 'niazi-org',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    technician_name: null,
  };

  const mockClient = {
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT' || sql.trim() === 'ROLLBACK') return { rows: [] };
      if (sql.includes('repair_jobs') && sql.includes('FOR UPDATE')) return { rows: [mockJob] };
      if (sql.includes('cash_sessions') && sql.includes("status = 'OPEN'") && sql.includes('FOR UPDATE')) {
        return { rows: cashSessions };
      }
      if (sql.includes('INSERT INTO cash_movements')) return { rows: [] };
      if (sql.includes('INSERT INTO repair_payments')) return { rows: [] };
      if (sql.includes('UPDATE repair_jobs')) return { rows: [mockJob] };
      if (sql.includes('change_log')) return { rows: [] };
      return { rows: [] };
    },
    release: () => {},
  };

  return {
    connect: async () => mockClient,
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('repair_jobs') && sql.includes('LEFT JOIN users')) return { rows: [mockJob] };
      if (sql.includes('repair_parts') || sql.includes('repair_job_parts')) return { rows: [] };
      if (sql.includes('repair_payments')) return { rows: [] };
      return { rows: [] };
    },
  } as any;
}

// Mock pool for completeRepairJobTx (Gate 2.4 Test Suite)
function makeCompleteRepairJobPool(opts: {
  cashSessions: Array<{ id: string }>;
  throwOnCashMovement?: boolean;
}) {
  const capturedPayments: Array<Record<string, unknown>> = [];
  const capturedMovements: Array<Record<string, unknown>> = [];
  let isCommitted = false;
  let isRolledBack = false;
  let isReleased = false;

  const mockJob = {
    id: 'repair-uuid-001',
    job_id: 'REP-0001',
    branch_id: 'branch-uuid-001',
    status: 'Ready for Pickup',
    settlement_status: 'UNPAID',
    customer_id: 'customer-uuid-001',
    customer_name: 'Test Customer',
    device_model: 'iPhone 14',
    device_brand: 'Apple',
    device_type: 'Mobile',
    estimated_cost: 3000,
    additional_charges: 0,
    discount: 0,
    timeline: '[]',
    labor_charges: '[]',
    technician_id: 'tech-uuid-001',
    technician_name: 'Lead Technician',
    organization_id: 'niazi-org',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockClient = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.trim() === 'BEGIN') return { rows: [] };
      if (sql.trim() === 'COMMIT') {
        isCommitted = true;
        return { rows: [] };
      }
      if (sql.trim() === 'ROLLBACK') {
        isRolledBack = true;
        return { rows: [] };
      }

      // Advisory lock
      if (sql.includes('hashtext') || sql.includes('pg_advisory_xact_lock')) {
        return { rows: [{ h: 12345 }] };
      }

      // Job select FOR UPDATE
      if (sql.includes('FROM repair_jobs') && sql.includes('FOR UPDATE')) {
        return { rows: [mockJob] };
      }

      // Invoice counter
      if (sql.includes('repair_invoice_counters')) {
        return { rows: [{ allocated: 101 }] };
      }

      // Parts & Payments sum
      if (sql.includes('FROM repair_parts')) return { rows: [] };
      if (sql.includes('FROM repair_payments') && sql.includes('COALESCE(SUM(amount)')) {
        return { rows: [{ total: 0 }] };
      }

      // Cash sessions check FOR UPDATE
      if (sql.includes('cash_sessions') && sql.includes("status = 'OPEN'") && sql.includes('FOR UPDATE')) {
        return { rows: opts.cashSessions };
      }

      // Insert cash movement
      if (sql.includes('INSERT INTO cash_movements') && params) {
        if (opts.throwOnCashMovement) {
          throw new Error('simulated cash movement insertion failure in settlement');
        }
        const movId = (params as unknown[])[0] as string;
        capturedMovements.push({ id: movId });
        return { rows: [] };
      }

      // Insert repair payment
      if (sql.includes('INSERT INTO repair_payments') && params) {
        const p = params as unknown[];
        capturedPayments.push({
          id: p[0],
          repair_job_id: p[1],
          amount: p[2],
          method: p[3],
          reference: p[4],
          session_id: p[5],
          cash_movement_id: p[6],
          branch_id: p[7],
          performed_by: p[8],
          created_at: p[9],
        });
        return { rows: [] };
      }

      // Update repair_jobs
      if (sql.includes('UPDATE repair_jobs')) return { rows: [mockJob] };

      // Commission service queries
      if (sql.includes('repair_commissions') || sql.includes('SELECT * FROM repair_commissions')) {
        return { rows: [] };
      }

      // Change log & notifications
      if (sql.includes('change_log') || sql.includes('notifications') || sql.includes('FROM users')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release: () => {
      isReleased = true;
    },
  };

  const pool = {
    connect: async () => mockClient,
    query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM repair_jobs')) return { rows: [mockJob] };
      if (sql.includes('repair_parts') || sql.includes('repair_job_parts')) return { rows: [] };
      if (sql.includes('repair_payments')) return { rows: capturedPayments };
      return { rows: [] };
    },
    _capturedPayments: capturedPayments,
    _capturedMovements: capturedMovements,
    _getState: () => ({ isCommitted, isRolledBack, isReleased }),
  };

  return pool as any;
}


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1: updateProduct() — original 4 tests (preserved)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2 — F-01: Product Sale Price Floor (updateProduct)', () => {

  it('rejects when new sale price is less than current purchase price', async () => {
    const current = makeCurrentProductRow({ purchase_price: 3000, sale_price: 5000, average_cost: 3000 });
    const pool = makeMockPool(current);
    await assert.rejects(
      () => updateProduct(pool, 'prod-test-001', { sale_price: 2500 }),
      (err: Error) => {
        assert.ok(err instanceof RepoError, `Expected RepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('Sale price'), `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('rejects when new sale price is less than the simultaneously updated purchase price', async () => {
    const current = makeCurrentProductRow({ purchase_price: 2000, sale_price: 4000, average_cost: 2000 });
    const pool = makeMockPool(current);
    await assert.rejects(
      () => updateProduct(pool, 'prod-test-001', { purchase_price: 5000, sale_price: 4500 }),
      (err: Error) => {
        assert.ok(err instanceof RepoError, `Expected RepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('Sale price'), `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('accepts sale price exactly equal to purchase price (zero-margin sale)', async () => {
    const current = makeCurrentProductRow({ purchase_price: 3000, sale_price: 3000, average_cost: 3000 });
    const pool = makeMockPool(current);
    try {
      await updateProduct(pool, 'prod-test-001', { sale_price: 3000, purchase_price: 3000 });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price')) {
        assert.fail(`Price-floor guard incorrectly rejected equal-to-cost: ${(err as RepoError).message}`);
      }
    }
  });

  it('accepts sale price above purchase price (healthy margin)', async () => {
    const current = makeCurrentProductRow({ purchase_price: 3000, sale_price: 5000, average_cost: 3000 });
    const pool = makeMockPool(current);
    try {
      await updateProduct(pool, 'prod-test-001', { sale_price: 6000, purchase_price: 3000 });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price')) {
        assert.fail(`Price-floor guard incorrectly rejected valid sale price: ${(err as RepoError).message}`);
      }
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2: receiveStock() — original 2 tests (preserved)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2 — F-01: Product Sale Price Floor (receiveStock non-supplier path)', () => {

  function makeReceiveStockPoolLocal(currentProduct: { average_cost: number; purchase_price: number; sale_price: number }) {
    const mockClient = {
      query: async (sql: string, _params?: unknown[]) => {
        if (sql.trim() === 'BEGIN' || sql.trim() === 'ROLLBACK' || sql.trim() === 'COMMIT') return { rows: [] };
        if (sql.includes('average_cost') && sql.includes('purchase_price')) return { rows: [currentProduct] };
        return { rows: [{ id: 'movement-id' }] };
      },
      release: () => {},
    };
    return {
      connect: async () => mockClient,
      query: async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT') && sql.includes('quantity')) return { rows: [{ quantity: 10 }] };
        if (sql.includes('average_cost') && sql.includes('purchase_price')) return { rows: [currentProduct] };
        return { rows: [] };
      },
    } as any;
  }

  it('rejects when sale price is below restocked unit cost', async () => {
    const pool = makeReceiveStockPoolLocal({ average_cost: 3000, purchase_price: 3000, sale_price: 5000 });
    await assert.rejects(
      () => receiveStock(pool, {
        product_id: '00000000-0000-0000-0000-000000000001',
        branch_id: '00000000-0000-0000-0000-000000000002',
        quantity_received: 5,
        unit_cost: 4000,
        new_sale_price: 3500,
      }),
      (err: Error) => {
        assert.ok(err instanceof RepoError, `Expected RepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('Sale price') && err.message.includes('unit cost'),
          `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('accepts sale price exactly equal to restocked unit cost (zero-margin restock)', async () => {
    const pool = makeReceiveStockPoolLocal({ average_cost: 3000, purchase_price: 3000, sale_price: 5000 });
    try {
      await receiveStock(pool, {
        product_id: '00000000-0000-0000-0000-000000000001',
        branch_id: '00000000-0000-0000-0000-000000000002',
        quantity_received: 5,
        unit_cost: 4000,
        new_sale_price: 4000,
      });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price') && (err as RepoError).message.includes('unit cost')) {
        assert.fail(`Price-floor guard incorrectly rejected equal-to-cost restock: ${(err as RepoError).message}`);
      }
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3: ADV-01 — updateProduct() with purchase_price = 0 (WAC fallback)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2 Round 2 — ADV-01: updateProduct() WAC fallback when purchase_price = 0', () => {

  it('rejects sale price below positive WAC when purchase_price = 0', async () => {
    // ADV-01 scenario: purchase 0, avg_cost 1500, sale 500 → REJECT
    const current = makeCurrentProductRow({ purchase_price: 0, average_cost: 1500, sale_price: 2000 });
    const pool = makeMockPool(current);
    await assert.rejects(
      () => updateProduct(pool, 'prod-test-001', { sale_price: 500 }),
      (err: Error) => {
        assert.ok(err instanceof RepoError, `Expected RepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('Sale price'), `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('accepts sale price equal to WAC when purchase_price = 0 (zero-margin)', async () => {
    // ADV-01 scenario: purchase 0, avg_cost 1500, sale 1500 → ACCEPT
    const current = makeCurrentProductRow({ purchase_price: 0, average_cost: 1500, sale_price: 2000 });
    const pool = makeMockPool(current);
    try {
      await updateProduct(pool, 'prod-test-001', { sale_price: 1500 });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price')) {
        assert.fail(`ADV-01: incorrectly rejected sale_price === avg_cost (zero-margin): ${(err as RepoError).message}`);
      }
    }
  });

  it('accepts sale price above WAC when purchase_price = 0', async () => {
    // ADV-01 scenario: purchase 0, avg_cost 1500, sale 1600 → ACCEPT
    const current = makeCurrentProductRow({ purchase_price: 0, average_cost: 1500, sale_price: 2000 });
    const pool = makeMockPool(current);
    try {
      await updateProduct(pool, 'prod-test-001', { sale_price: 1600 });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price')) {
        assert.fail(`ADV-01: incorrectly rejected sale_price > avg_cost: ${(err as RepoError).message}`);
      }
    }
  });

  it('uses positive purchase_price as floor when both purchase_price and avg_cost are positive', async () => {
    // purchase 1500, avg_cost 1500, sale 1490 → REJECT (purchase price governs)
    const current = makeCurrentProductRow({ purchase_price: 1500, average_cost: 1500, sale_price: 2000 });
    const pool = makeMockPool(current);
    await assert.rejects(
      () => updateProduct(pool, 'prod-test-001', { sale_price: 1490 }),
      (err: Error) => {
        assert.ok(err instanceof RepoError);
        assert.ok(err.message.includes('Sale price'));
        assert.strictEqual((err as RepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('applies no price floor when both purchase_price and avg_cost are 0', async () => {
    // purchase 0, avg_cost 0 — effectiveCostBasis = 0, floor skipped (follows checkout policy)
    const current = makeCurrentProductRow({ purchase_price: 0, average_cost: 0, sale_price: 100 });
    const pool = makeMockPool(current);
    try {
      await updateProduct(pool, 'prod-test-001', { sale_price: 1 });
    } catch (err: unknown) {
      if (err instanceof RepoError && (err as RepoError).statusCode === 400 &&
          (err as RepoError).message.includes('Sale price')) {
        assert.fail(`ADV-01: incorrectly applied floor when both costs are 0: ${(err as RepoError).message}`);
      }
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4: NEW-01-C — createRepairJobTx() CASH advance fail-closed
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2 Round 2 — NEW-01-C: createRepairJobTx() CASH advance fail-closed', () => {

  it('throws HTTP 400 when CASH advance has no branch_id', async () => {
    const pool = makeRepairJobPool({ cashSessions: [] });
    const dto = makeCashAdvanceDto({ branch_id: undefined });

    await assert.rejects(
      () => createRepairJobTx(pool, dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        assert.ok(err instanceof RepairRepoError, `Expected RepairRepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('no assigned branch'),
          `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepairRepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('throws HTTP 400 when CASH advance has no open cash session', async () => {
    // branch_id present, but no open session → fail closed
    const pool = makeRepairJobPool({ cashSessions: [] });
    const dto = makeCashAdvanceDto();

    await assert.rejects(
      () => createRepairJobTx(pool, dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        assert.ok(err instanceof RepairRepoError, `Expected RepairRepoError, got ${err.constructor.name}`);
        assert.ok(err.message.includes('No open cash register session'),
          `Unexpected message: ${err.message}`);
        assert.strictEqual((err as RepairRepoError).statusCode, 400);
        return true;
      }
    );
  });

  it('propagates rollback when cash movement insertion fails', async () => {
    // throwOnCashMovement simulates DB constraint violation during insertCashMovement
    const pool = makeRepairJobPool({
      cashSessions: [{ id: 'sess-uuid-001' }],
      throwOnCashMovement: true,
    });
    const dto = makeCashAdvanceDto();

    await assert.rejects(
      () => createRepairJobTx(pool, dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        // Should re-throw the original error (not masked); transaction rolled back
        assert.ok(err.message.includes('simulated cash_movements constraint violation'),
          `Expected cash_movements error, got: ${err.message}`);
        return true;
      }
    );
    // No repair payment captured (payment INSERT never reached)
    assert.strictEqual(pool._capturedPayments.length, 0,
      'repair_payments should NOT be inserted when cash movement fails');
  });

  it('succeeds when CASH advance has valid open session, links session and movement', async () => {
    const pool = makeRepairJobPool({ cashSessions: [{ id: 'sess-uuid-001' }] });
    const dto = makeCashAdvanceDto();

    // Should resolve without throwing
    await assert.doesNotReject(
      () => createRepairJobTx(pool, dto, 'user-001', 'niazi-org')
    );

    // Verify repair_payments captured at least one payment with non-null session_id
    const payments = pool._capturedPayments as Array<Record<string, unknown>>;
    assert.ok(payments.length > 0, 'Expected at least one repair_payment captured');
    const cashPayment = payments.find((p) => p['method'] === 'CASH');
    assert.ok(cashPayment, 'Expected a CASH repair_payment record');
    assert.ok(cashPayment['session_id'] !== null,
      `session_id must NOT be null; got ${cashPayment['session_id']}`);
    assert.ok(cashPayment['cash_movement_id'] !== null,
      `cash_movement_id must NOT be null; got ${cashPayment['cash_movement_id']}`);
  });

  it('allows non-CASH (BANK_TRANSFER) advance without session check', async () => {
    // No open sessions — but BANK_TRANSFER should not trigger the CASH guard
    const pool = makeRepairJobPool({ cashSessions: [] });
    const dto = makeCashAdvanceDto({
      advance_payment: { amount: 2000, method: 'BANK_TRANSFER' },
    });

    await assert.doesNotReject(
      () => createRepairJobTx(pool, dto, 'user-001', 'niazi-org')
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5: NEW-01 regression parity — addRepairPaymentTx / completeRepairJobTx
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2 Round 2 — NEW-01 parity: addRepairPaymentTx() CASH session guard', () => {

  it('throws HTTP 400 when CASH payment has no open session', async () => {
    const pool = makePaymentPool([]);
    const dto: AddRepairPaymentDto = {
      amount: 1500,
      method: 'CASH',
    };

    await assert.rejects(
      () => addRepairPaymentTx(pool, 'repair-uuid-001', dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        assert.ok(err instanceof RepairRepoError, `Expected RepairRepoError, got ${err.constructor.name}`);
        assert.ok(
          err.message.includes('No open cash register session') ||
          err.message.includes('no assigned branch'),
          `Unexpected message: ${err.message}`
        );
        assert.strictEqual((err as RepairRepoError).statusCode, 400);
        return true;
      }
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SUITE 6: GATE 2.4 — completeRepairJobTx() settlement CASH & non-CASH coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate 2.4 — completeRepairJobTx() settlement CASH & non-CASH coverage', () => {

  // Test A — CASH settlement without an open cash session
  it('Test A: rejects CASH settlement with HTTP 400 when no OPEN cash session exists', async () => {
    const pool = makeCompleteRepairJobPool({ cashSessions: [] });
    const dto: CompleteRepairJobDto = {
      settlement_payment: { amount: 3000, method: 'CASH' },
    };

    await assert.rejects(
      () => completeRepairJobTx(pool, 'repair-uuid-001', dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        assert.ok(err instanceof RepairRepoError, `Expected RepairRepoError, got ${err.constructor.name}`);
        assert.ok(
          err.message.includes('No open cash register session exists for this branch'),
          `Unexpected error message: ${err.message}`
        );
        assert.strictEqual((err as RepairRepoError).statusCode, 400);
        return true;
      }
    );

    // Verify invariants: no cash movement, no repair payment, no commit, rolled back & released
    assert.strictEqual(pool._capturedMovements.length, 0, 'No cash movement should be inserted');
    assert.strictEqual(pool._capturedPayments.length, 0, 'No repair payment should be inserted');
    const state = pool._getState();
    assert.strictEqual(state.isCommitted, false, 'Transaction must not commit');
    assert.strictEqual(state.isRolledBack, true, 'Transaction must be rolled back');
    assert.strictEqual(state.isReleased, true, 'Connection client must be released');
  });

  // Test B — CASH settlement with a valid open session
  it('Test B: succeeds with CASH settlement when valid open session exists, links session and movement', async () => {
    const pool = makeCompleteRepairJobPool({ cashSessions: [{ id: 'sess-open-001' }] });
    const dto: CompleteRepairJobDto = {
      settlement_payment: { amount: 3000, method: 'CASH', reference: 'Cash at pickup' },
    };

    await assert.doesNotReject(
      () => completeRepairJobTx(pool, 'repair-uuid-001', dto, 'user-001', 'niazi-org')
    );

    // Assert cash movement was inserted
    assert.strictEqual(pool._capturedMovements.length, 1, 'Exactly one cash movement should be inserted');
    
    // Assert repair payment references correct branch, session, movement, and job
    assert.strictEqual(pool._capturedPayments.length, 1, 'Exactly one repair payment should be inserted');
    const payment = pool._capturedPayments[0];
    const movement = pool._capturedMovements[0];
    assert.strictEqual(payment.repair_job_id, 'repair-uuid-001');
    assert.strictEqual(payment.branch_id, 'branch-uuid-001');
    assert.strictEqual(payment.session_id, 'sess-open-001');
    assert.strictEqual(payment.cash_movement_id, movement.id, 'Payment must link directly to the inserted cash movement ID');
    assert.strictEqual(payment.amount, 3000);
    assert.strictEqual(payment.method, 'CASH');

    // Assert transaction committed and connection released
    const state = pool._getState();
    assert.strictEqual(state.isCommitted, true, 'Transaction must be committed');
    assert.strictEqual(state.isRolledBack, false, 'Transaction must not be rolled back');
    assert.strictEqual(state.isReleased, true, 'Connection client must be released');
  });

  // Test C — Cash movement insertion failure
  it('Test C: propagates rollback and releases connection when cash movement insertion fails', async () => {
    const pool = makeCompleteRepairJobPool({
      cashSessions: [{ id: 'sess-open-001' }],
      throwOnCashMovement: true,
    });
    const dto: CompleteRepairJobDto = {
      settlement_payment: { amount: 3000, method: 'CASH' },
    };

    await assert.rejects(
      () => completeRepairJobTx(pool, 'repair-uuid-001', dto, 'user-001', 'niazi-org'),
      (err: Error) => {
        assert.ok(
          err.message.includes('simulated cash movement insertion failure in settlement'),
          `Expected cash movement failure, got: ${err.message}`
        );
        return true;
      }
    );

    // Verify invariants: no repair payment, no commit, rolled back & released
    assert.strictEqual(pool._capturedPayments.length, 0, 'No repair payment should be inserted when movement fails');
    const state = pool._getState();
    assert.strictEqual(state.isCommitted, false, 'Transaction must not commit');
    assert.strictEqual(state.isRolledBack, true, 'Transaction must be rolled back');
    assert.strictEqual(state.isReleased, true, 'Connection client must be released');
  });

  // Test D — Non-CASH settlement
  it('Test D: allows non-CASH (BANK_TRANSFER) settlement without open cash session and without cash movement', async () => {
    // No open cash sessions available
    const pool = makeCompleteRepairJobPool({ cashSessions: [] });
    const dto: CompleteRepairJobDto = {
      settlement_payment: { amount: 3000, method: 'BANK_TRANSFER', reference: 'TXN-BANK-001' },
    };

    await assert.doesNotReject(
      () => completeRepairJobTx(pool, 'repair-uuid-001', dto, 'user-001', 'niazi-org')
    );

    // Verify invariants: NO cash movement, payment recorded with session_id=null and cm_id=null
    assert.strictEqual(pool._capturedMovements.length, 0, 'Non-CASH settlement must NOT create cash movements');
    assert.strictEqual(pool._capturedPayments.length, 1, 'Non-CASH settlement payment should be inserted');
    const payment = pool._capturedPayments[0];
    assert.strictEqual(payment.repair_job_id, 'repair-uuid-001');
    assert.strictEqual(payment.branch_id, 'branch-uuid-001');
    assert.strictEqual(payment.session_id, null, 'session_id should be null for non-CASH');
    assert.strictEqual(payment.cash_movement_id, null, 'cash_movement_id should be null for non-CASH');
    assert.strictEqual(payment.method, 'BANK_TRANSFER');
    assert.strictEqual(payment.reference, 'TXN-BANK-001');

    // Assert transaction committed and connection released
    const state = pool._getState();
    assert.strictEqual(state.isCommitted, true, 'Transaction must be committed');
    assert.strictEqual(state.isRolledBack, false, 'Transaction must not be rolled back');
    assert.strictEqual(state.isReleased, true, 'Connection client must be released');
  });
});
