/**
 * Direct Advance Voucher PostgreSQL Repository
 *
 * Implements atomic, concurrency-safe PostgreSQL persistence for:
 *   - INSTANT_INVENTORY (registration-only product + initial stock, no duplicate POS sale)
 *   - DIRECT_ADVANCE (immediate physical delivery + financial obligation + pending inventory match)
 *   - PRE_BOOKING (zero initial delivery + advance collection + deferred SALE debit on delivery)
 *
 * All financial mutations execute inside a single parent PoolClient transaction
 * using whole-PKR BIGINT arithmetic and row-level FOR UPDATE locking.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  getSchemaCaps,
  resolveEffectiveCategoryId,
  resolveEffectiveUnitId,
  resolveProductSku,
} from './product.repo';
import { writeChangeLogEntry } from './change_log.repo';
import { NIAZI_ORGANIZATION_ID } from '../auth';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type VoucherType = 'INSTANT_INVENTORY' | 'DIRECT_ADVANCE' | 'PRE_BOOKING';
export type VoucherStatus = 'PENDING_RECEIPT' | 'PARTIALLY_MATCHED' | 'FULFILLED' | 'CANCELLED';

export interface VoucherRecord {
  id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  organization_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  product_id: string | null;
  product_name: string;
  spec_category: string | null;
  spec_quality: string | null;
  spec_color: string | null;
  spec_brand: string | null;
  spec_company: string | null;
  voucher_qty: number;
  delivered_qty: number;
  matched_qty: number;
  remaining_qty: number;
  locked_purchase_price: number;
  catalog_sale_price: number | null;
  voucher_sale_price: number;
  total_sale_amount: number;
  payment_method: string;
  payment_status: string;
  paid_amount: number;
  cash_movement_id: string | null;
  customer_ledger_id: string | null;
  sale_id: string | null;
  status: VoucherStatus;
  notes: string | null;
  performed_by: string;
  created_at: string;
  updated_at: string;
}

export interface VoucherPaymentRecord {
  id: string;
  organization_id: string;
  branch_id: string;
  voucher_id: string;
  payment_method: string;
  amount: number;
  reference_number: string | null;
  notes: string | null;
  cash_movement_id: string | null;
  customer_ledger_id: string | null;
  is_reversed: boolean;
  reversed_by_payment_id: string | null;
  performed_by: string;
  created_at: string;
  account_id: string | null; // Phase 1: FK to business_accounts for EASYPAISA/JAZZCASH/BANK_TRANSFER
}

export interface VoucherInventoryMatchRecord {
  id: string;
  organization_id: string;
  voucher_id: string;
  purchase_id: string | null;
  purchase_line_id: string | null;
  stock_movement_in_id: string | null;
  stock_movement_out_id: string | null;
  branch_id: string;
  product_id: string;
  quantity_matched: number;
  locked_unit_cost: number;
  actual_receiving_cost: number;
  unit_cost_discrepancy: number;
  total_cost_discrepancy: number;
  reconciliation_notes: string | null;
  matched_by: string;
  created_at: string;
}

export interface VoucherDeliveryRecord {
  id: string;
  voucher_id: string;
  quantity_delivered: number;
  customer_ledger_id: string | null;
  idempotency_key: string;
  request_fingerprint: string | null;
  performed_by: string;
  notes: string | null;
  created_at: string;
}

export function mapVoucherDeliveryRow(r: Record<string, unknown>): VoucherDeliveryRecord {
  return {
    id: String(r['id']),
    voucher_id: String(r['voucher_id']),
    quantity_delivered: Number(r['quantity_delivered']),
    customer_ledger_id: r['customer_ledger_id'] ? String(r['customer_ledger_id']) : null,
    idempotency_key: String(r['idempotency_key']),
    request_fingerprint: r['request_fingerprint'] ? String(r['request_fingerprint']) : null,
    performed_by: String(r['performed_by']),
    notes: r['notes'] ? String(r['notes']) : null,
    created_at: String(r['created_at']),
  };
}

export interface VoucherListFilter {
  organization_id: string;
  branch_id?: string | null;
  voucher_type?: VoucherType | null;
  status?: VoucherStatus | null;
  customer_id?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface VoucherPaymentInput {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';
  amount: number;
  reference_number?: string | null;
  notes?: string | null;
  account_id?: string | null; // Phase 1: FK to business_accounts for EASYPAISA/JAZZCASH/BANK_TRANSFER
}

export interface CreateVoucherRepoInput {
  voucher_type: VoucherType;
  organization_id: string;
  branch_id: string;
  performed_by: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  product_id: string | null;
  product_name: string;
  spec_category: string | null;
  spec_quality: string | null;
  spec_color: string | null;
  spec_brand: string | null;
  spec_company: string | null;
  new_product?: {
    name: string;
    category_id?: string | null;
    brand_id?: string | null;
    company_id?: string | null;
    color_id?: string | null;
    quality_id?: string | null;
    unit_id?: string | null;
    sku?: string | null;
    barcode?: string | null;
    description?: string | null;
    purchase_price: number;
    catalog_sale_price: number;
    open_stock: number;
    low_stock_threshold?: number;
  } | null;
  voucher_qty: number;
  delivered_qty: number;
  locked_purchase_price: number;
  catalog_sale_price: number | null;
  voucher_sale_price: number;
  payment_method: string;
  payment_status: string;
  paid_amount: number;
  payments: VoucherPaymentInput[];
  post_sale_debit: boolean;
  sale_debit_amount: number;
  post_payment_credit: boolean;
  payment_credit_amount: number;
  notes: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
}

export interface CreateVoucherResult {
  voucher: VoucherRecord;
  payments: VoucherPaymentRecord[];
  customer_balance_after: number | null;
  registered_product: Record<string, unknown> | null;
  idempotent_replay: boolean;
}

export class VoucherRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'VoucherRepoError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodYYYYMM(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
}

function advisoryLockKey(branchId: string, key: string): [number, number] {
  const hash = createHash('sha256').update(`voucher:${branchId}:${key}`).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeOptionalUuid(val?: string | null): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length >= 32 ? trimmed : null;
}

function mapVoucherRow(row: Record<string, unknown>): VoucherRecord {
  return {
    id: String(row['id']),
    voucher_number: String(row['voucher_number']),
    voucher_type: String(row['voucher_type']) as VoucherType,
    organization_id: String(row['organization_id']),
    branch_id: String(row['branch_id']),
    customer_id: row['customer_id'] ? String(row['customer_id']) : null,
    customer_name_snapshot: String(row['customer_name_snapshot']),
    customer_phone_snapshot: row['customer_phone_snapshot'] ? String(row['customer_phone_snapshot']) : null,
    product_id: row['product_id'] ? String(row['product_id']) : null,
    product_name: String(row['product_name']),
    spec_category: row['spec_category'] ? String(row['spec_category']) : null,
    spec_quality: row['spec_quality'] ? String(row['spec_quality']) : null,
    spec_color: row['spec_color'] ? String(row['spec_color']) : null,
    spec_brand: row['spec_brand'] ? String(row['spec_brand']) : null,
    spec_company: row['spec_company'] ? String(row['spec_company']) : null,
    voucher_qty: Number(row['voucher_qty']),
    delivered_qty: Number(row['delivered_qty']),
    matched_qty: Number(row['matched_qty']),
    remaining_qty: Number(row['remaining_qty']),
    locked_purchase_price: Number(row['locked_purchase_price']),
    catalog_sale_price: row['catalog_sale_price'] != null ? Number(row['catalog_sale_price']) : null,
    voucher_sale_price: Number(row['voucher_sale_price']),
    total_sale_amount: Number(row['total_sale_amount']),
    payment_method: String(row['payment_method']),
    payment_status: String(row['payment_status']),
    paid_amount: Number(row['paid_amount']),
    cash_movement_id: row['cash_movement_id'] ? String(row['cash_movement_id']) : null,
    customer_ledger_id: row['customer_ledger_id'] ? String(row['customer_ledger_id']) : null,
    sale_id: row['sale_id'] ? String(row['sale_id']) : null,
    status: String(row['status']) as VoucherStatus,
    notes: row['notes'] ? String(row['notes']) : null,
    performed_by: String(row['performed_by']),
    created_at: String(row['created_at']),
    updated_at: String(row['updated_at']),
  };
}

function mapVoucherPaymentRow(row: Record<string, unknown>): VoucherPaymentRecord {
  return {
    id: String(row['id']),
    organization_id: String(row['organization_id']),
    branch_id: String(row['branch_id']),
    voucher_id: String(row['voucher_id']),
    payment_method: String(row['payment_method']),
    amount: Number(row['amount']),
    reference_number: row['reference_number'] ? String(row['reference_number']) : null,
    notes: row['notes'] ? String(row['notes']) : null,
    cash_movement_id: row['cash_movement_id'] ? String(row['cash_movement_id']) : null,
    customer_ledger_id: row['customer_ledger_id'] ? String(row['customer_ledger_id']) : null,
    is_reversed: Boolean(row['is_reversed']),
    reversed_by_payment_id: row['reversed_by_payment_id'] ? String(row['reversed_by_payment_id']) : null,
    performed_by: String(row['performed_by']),
    created_at: String(row['created_at']),
    account_id: row['account_id'] ? String(row['account_id']) : null, // Phase 1
  };
}

function mapVoucherMatchRow(row: Record<string, unknown>): VoucherInventoryMatchRecord {
  return {
    id: String(row['id']),
    organization_id: String(row['organization_id']),
    voucher_id: String(row['voucher_id']),
    purchase_id: row['purchase_id'] ? String(row['purchase_id']) : null,
    purchase_line_id: row['purchase_line_id'] ? String(row['purchase_line_id']) : null,
    stock_movement_in_id: row['stock_movement_in_id'] ? String(row['stock_movement_in_id']) : null,
    stock_movement_out_id: row['stock_movement_out_id'] ? String(row['stock_movement_out_id']) : null,
    branch_id: String(row['branch_id']),
    product_id: String(row['product_id']),
    quantity_matched: Number(row['quantity_matched']),
    locked_unit_cost: Number(row['locked_unit_cost']),
    actual_receiving_cost: Number(row['actual_receiving_cost']),
    unit_cost_discrepancy: Number(row['unit_cost_discrepancy']),
    total_cost_discrepancy: Number(row['total_cost_discrepancy']),
    reconciliation_notes: row['reconciliation_notes'] ? String(row['reconciliation_notes']) : null,
    matched_by: String(row['matched_by']),
    created_at: String(row['created_at']),
  };
}

/**
 * Generates an atomic, branch-scoped monthly voucher number:
 * Format: <BRANCH_CODE>-VCH-<YYYYMM>-<000001>
 */
async function allocateVoucherNumber(client: PoolClient, branchId: string): Promise<string> {
  const branchRes = await client.query<{ code: string }>(
    'SELECT code FROM branches WHERE id = $1',
    [branchId]
  );
  const branchCode = (branchRes.rows[0]?.code || 'MAIN').trim().toUpperCase();
  const periodYYYYMM = getPeriodYYYYMM();

  const seqRes = await client.query<{ seq: string }>(
    `INSERT INTO voucher_counters (branch_id, period_yyyymm, next_value)
     VALUES ($1, $2, 2)
     ON CONFLICT (branch_id, period_yyyymm)
     DO UPDATE SET next_value = voucher_counters.next_value + 1
     RETURNING (next_value - 1)::TEXT AS seq`,
    [branchId, periodYYYYMM]
  );
  const seqNum = Number(seqRes.rows[0]?.seq ?? 1);
  return `${branchCode}-VCH-${periodYYYYMM}-${String(seqNum).padStart(6, '0')}`;
}

/**
 * Computes current customer balance (SUM(debit) - SUM(credit)) inside an active transaction.
 * Caller MUST hold FOR UPDATE on the customer row.
 */
async function getCustomerBalanceTx(client: PoolClient, customerId: string): Promise<number> {
  const res = await client.query<{ balance: string }>(
    `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
     FROM customer_ledger_entries
     WHERE customer_id = $1`,
    [customerId]
  );
  return Number(res.rows[0]?.balance ?? 0);
}

/**
 * Records a physical cash IN movement against the active OPEN cash session for branchId.
 * Fails closed if no open cash session exists.
 */
async function recordOpenSessionCashInTx(
  client: PoolClient,
  branchId: string,
  amount: number,
  referenceId: string,
  referenceNumber: string,
  description: string,
  performedBy: string,
  now: string
): Promise<string> {
  const sessionRes = await client.query<{ id: string }>(
    `SELECT id FROM cash_sessions
     WHERE branch_id = $1 AND status = 'OPEN'
     ORDER BY opened_at DESC LIMIT 1`,
    [branchId]
  );
  if (!sessionRes.rows[0]) {
    throw new VoucherRepoError(
      'No open cash session found for this branch. Open a cash session before accepting cash voucher payments.',
      400
    );
  }
  const sessionId = sessionRes.rows[0].id;
  const movementId = uuidv4();
  await client.query(
    `INSERT INTO cash_movements
       (id, session_id, branch_id, movement_type, direction, amount,
        reference_id, reference_number, payment_method, description, performed_by, created_at)
     VALUES ($1, $2, $3, 'CUSTOMER_PAYMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
    [movementId, sessionId, branchId, amount, referenceId, referenceNumber, description, performedBy, now]
  );
  return movementId;
}

// ─── Repository Operations ────────────────────────────────────────────────────

export async function createVoucherTx(
  pool: Pool,
  client: PoolClient,
  input: CreateVoucherRepoInput
): Promise<CreateVoucherResult> {
  const now = new Date().toISOString();

  // 1. Idempotency serialization & replay check
  if (input.idempotency_key) {
    const [k1, k2] = advisoryLockKey(input.branch_id, input.idempotency_key);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

    const existingRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM pos_direct_vouchers
       WHERE branch_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [input.branch_id, input.idempotency_key]
    );
    if (existingRes.rows.length > 0) {
      const existing = mapVoucherRow(existingRes.rows[0]!);
      const storedFingerprint = existingRes.rows[0]!['request_fingerprint'] as string | null;
      if (storedFingerprint && input.request_fingerprint && storedFingerprint !== input.request_fingerprint) {
        throw new VoucherRepoError(
          `Idempotency key '${input.idempotency_key}' was already used for a different voucher payload.`,
          409
        );
      }
      const payRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM pos_voucher_payments WHERE voucher_id = $1 ORDER BY created_at ASC',
        [existing.id]
      );
      let prodRow: Record<string, unknown> | null = null;
      if (existing.product_id) {
        const pRes = await client.query<Record<string, unknown>>(
          'SELECT * FROM products WHERE id = $1 LIMIT 1',
          [existing.product_id]
        );
        prodRow = pRes.rows[0] ?? null;
      }
      let balAfter: number | null = null;
      if (existing.customer_id) {
        balAfter = await getCustomerBalanceTx(client, existing.customer_id);
      }
      return {
        voucher: existing,
        payments: payRes.rows.map(mapVoucherPaymentRow),
        customer_balance_after: balAfter,
        registered_product: prodRow,
        idempotent_replay: true,
      };
    }
  }

  // 2. Lock customer row if registered customer is specified
  let customerBalanceAfter: number | null = null;
  let runningCustomerBalance = 0;
  if (input.customer_id) {
    const custRes = await client.query<{ id: string }>(
      'SELECT id FROM customers WHERE id = $1 FOR UPDATE',
      [input.customer_id]
    );
    if (custRes.rows.length === 0) {
      throw new VoucherRepoError(`Customer '${input.customer_id}' not found`, 404);
    }
    runningCustomerBalance = await getCustomerBalanceTx(client, input.customer_id);
    customerBalanceAfter = runningCustomerBalance;
  }

  // 3. For INSTANT_INVENTORY with new_product: create catalog product + initial stock atomically
  let resolvedProductId = input.product_id;
  let registeredProduct: Record<string, unknown> | null = null;

  if (input.voucher_type === 'INSTANT_INVENTORY' && input.new_product) {
    const np = input.new_product;
    const caps = await getSchemaCaps(pool);
    const categoryId = await resolveEffectiveCategoryId(pool, np.category_id);
    const unitId = await resolveEffectiveUnitId(pool, np.unit_id);
    const resolvedSku = await resolveProductSku(pool, categoryId, np.sku);
    const activeVal = caps.isActiveBool ? true : 1;
    const newProductId = uuidv4();
    const normalizedName = normalizeProductName(np.name);
    const barcodeVal = np.barcode && np.barcode.trim().length > 0 ? np.barcode.trim() : null;
    const threshold = np.low_stock_threshold ?? 2;

    const prodInsertRes = await client.query<Record<string, unknown>>(
      `INSERT INTO products (
         id, name, normalized_name, sku, barcode, ${caps.catCol}, brand_id,
         company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price,
         low_stock_threshold, is_active, description, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        newProductId,
        np.name.trim(),
        normalizedName,
        resolvedSku,
        barcodeVal,
        categoryId,
        sanitizeOptionalUuid(np.brand_id),
        sanitizeOptionalUuid(np.company_id),
        sanitizeOptionalUuid(np.quality_id),
        sanitizeOptionalUuid(np.color_id),
        unitId,
        np.purchase_price,
        np.purchase_price,
        np.catalog_sale_price,
        threshold,
        activeVal,
        np.description ?? 'Created via POS Product Advance Voucher',
        now,
        now,
      ]
    );
    registeredProduct = prodInsertRes.rows[0] ?? null;
    resolvedProductId = newProductId;

    const openQty = Math.max(0, Math.round(np.open_stock));
    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, branch_id)
       DO UPDATE SET quantity = stock.quantity + $3, updated_at = $4`,
      [newProductId, input.branch_id, openQty, now]
    );

    if (openQty > 0) {
      const entryId = uuidv4();
      const refNo = `OP-VCH-${Date.now()}`;
      await client.query(
        `INSERT INTO opening_stock_entries (
           id, organization_id, branch_id, product_id, quantity, unit_cost,
           reference_number, performed_by, notes, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entryId,
          input.organization_id || NIAZI_ORGANIZATION_ID,
          input.branch_id,
          newProductId,
          openQty,
          np.purchase_price,
          refNo,
          input.performed_by,
          'Opening Stock via POS Voucher Registration',
          now,
        ]
      );

      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity,
           previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'IN', $4, 0, $5, 'Opening Stock (Voucher Registration)', $6, $7, $8)`,
        [uuidv4(), newProductId, input.branch_id, openQty, openQty, input.performed_by, entryId, now]
      );
    }
  } else if (resolvedProductId) {
    const pRes = await client.query<Record<string, unknown>>(
      'SELECT * FROM products WHERE id = $1 LIMIT 1',
      [resolvedProductId]
    );
    if (pRes.rows.length === 0) {
      throw new VoucherRepoError(`Product '${resolvedProductId}' not found`, 404);
    }
    registeredProduct = pRes.rows[0] ?? null;
  }

  // 4. Allocate atomic branch-scoped voucher number
  const voucherId = uuidv4();
  const voucherNumber = await allocateVoucherNumber(client, input.branch_id);

  // 5. Financial ledger entries (DIRECT_ADVANCE / PRE_BOOKING only; NEVER for INSTANT_INVENTORY)
  let primaryLedgerId: string | null = null;
  let primaryCashMovementId: string | null = null;

  if (input.post_sale_debit && input.sale_debit_amount > 0 && input.customer_id) {
    runningCustomerBalance += input.sale_debit_amount;
    customerBalanceAfter = runningCustomerBalance;
    primaryLedgerId = uuidv4();
    await client.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type,
          debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
      [
        primaryLedgerId,
        input.customer_id,
        voucherId,
        voucherNumber,
        input.sale_debit_amount,
        runningCustomerBalance,
        `Direct Advance Voucher ${voucherNumber} (${input.product_name} x${input.voucher_qty})`,
        input.performed_by,
        now,
      ]
    );
  }

  // 6. Determine initial voucher status
  const initialStatus: VoucherStatus =
    input.voucher_type === 'INSTANT_INVENTORY' ? 'FULFILLED' : 'PENDING_RECEIPT';

  // 7. Insert pos_direct_vouchers header
  const insertVoucherRes = await client.query<Record<string, unknown>>(
    `INSERT INTO pos_direct_vouchers (
       id, voucher_number, voucher_type, organization_id, branch_id,
       customer_id, customer_name_snapshot, customer_phone_snapshot,
       product_id, product_name, spec_category, spec_quality, spec_color, spec_brand, spec_company,
       voucher_qty, delivered_qty, matched_qty,
       locked_purchase_price, catalog_sale_price, voucher_sale_price,
       payment_method, payment_status, paid_amount,
       cash_movement_id, customer_ledger_id, status, notes,
       performed_by, created_at, updated_at, idempotency_key, request_fingerprint
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,
       $9,$10,$11,$12,$13,$14,$15,
       $16,$17,0,
       $18,$19,$20,
       $21,$22,$23,
       NULL,$24,$25,$26,
       $27,$28,$28,$29,$30
     )
     RETURNING *`,
    [
      voucherId,
      voucherNumber,
      input.voucher_type,
      input.organization_id,
      input.branch_id,
      input.customer_id,
      input.customer_name_snapshot,
      input.customer_phone_snapshot,
      resolvedProductId,
      input.product_name,
      input.spec_category,
      input.spec_quality,
      input.spec_color,
      input.spec_brand,
      input.spec_company,
      input.voucher_qty,
      input.delivered_qty,
      input.locked_purchase_price,
      input.catalog_sale_price,
      input.voucher_sale_price,
      input.payment_method,
      input.payment_status,
      input.paid_amount,
      primaryLedgerId,
      initialStatus,
      input.notes,
      input.performed_by,
      now,
      input.idempotency_key,
      input.request_fingerprint,
    ]
  );

  // 8. Insert multi-tender payments + cash movements + payment ledger credit
  const insertedPayments: VoucherPaymentRecord[] = [];
  if (input.payments.length > 0 && input.voucher_type !== 'INSTANT_INVENTORY') {
    let paymentLedgerId: string | null = null;
    if (input.post_payment_credit && input.payment_credit_amount > 0 && input.customer_id) {
      runningCustomerBalance -= input.payment_credit_amount;
      customerBalanceAfter = runningCustomerBalance;
      paymentLedgerId = uuidv4();
      await client.query(
        `INSERT INTO customer_ledger_entries
           (id, customer_id, reference_id, reference_number, entry_type,
            debit, credit, balance_after, description, performed_by, created_at)
         VALUES ($1, $2, $3, $4, 'PAYMENT', 0, $5, $6, $7, $8, $9)`,
        [
          paymentLedgerId,
          input.customer_id,
          voucherId,
          voucherNumber,
          input.payment_credit_amount,
          runningCustomerBalance,
          `Voucher ${input.voucher_type === 'PRE_BOOKING' ? 'Advance' : 'Payment'} ${voucherNumber}`,
          input.performed_by,
          now,
        ]
      );
      if (!primaryLedgerId) {
        primaryLedgerId = paymentLedgerId;
      }
    }

    for (const tender of input.payments) {
      const paymentId = uuidv4();
      let cashMovementId: string | null = null;

      if (tender.method === 'CASH') {
        cashMovementId = await recordOpenSessionCashInTx(
          client,
          input.branch_id,
          tender.amount,
          voucherId,
          voucherNumber,
          `Voucher payment (${voucherNumber}) - ${input.customer_name_snapshot}`,
          input.performed_by,
          now
        );
        if (!primaryCashMovementId) {
          primaryCashMovementId = cashMovementId;
        }
      }

      const pRes = await client.query<Record<string, unknown>>(
        `INSERT INTO pos_voucher_payments (
           id, organization_id, branch_id, voucher_id, payment_method, amount,
           reference_number, notes, cash_movement_id, customer_ledger_id,
           is_reversed, performed_by, created_at, account_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13)
         RETURNING *`,
        [
          paymentId,
          input.organization_id,
          input.branch_id,
          voucherId,
          tender.method,
          tender.amount,
          tender.reference_number ?? null,
          tender.notes ?? null,
          cashMovementId,
          paymentLedgerId,
          input.performed_by,
          now,
          tender.account_id ?? null,
        ]
      );
      insertedPayments.push(mapVoucherPaymentRow(pRes.rows[0]!));
    }

    if (primaryCashMovementId || primaryLedgerId) {
      await client.query(
        `UPDATE pos_direct_vouchers
         SET cash_movement_id = COALESCE($1, cash_movement_id),
             customer_ledger_id = COALESCE($2, customer_ledger_id)
         WHERE id = $3`,
        [primaryCashMovementId, primaryLedgerId, voucherId]
      );
    }
  }

  // Re-fetch header to reflect updated cash_movement_id / customer_ledger_id
  const finalHeaderRes = await client.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1',
    [voucherId]
  );
  const voucher = mapVoucherRow(finalHeaderRes.rows[0] ?? insertVoucherRes.rows[0]!);

  try {
    await writeChangeLogEntry(client, {
      organizationId: input.organization_id,
      branchId: input.branch_id,
      eventType: 'VOUCHER_CREATED',
      entityType: 'pos_direct_voucher',
      entityId: voucherId,
      payloadStr: JSON.stringify({
        voucher_number: voucherNumber,
        voucher_type: input.voucher_type,
        total_sale_amount: voucher.total_sale_amount,
        paid_amount: voucher.paid_amount,
      }),
    });
  } catch (logErr) {
    console.error('[voucher.repo] change_log write warning:', logErr);
  }

  return {
    voucher,
    payments: insertedPayments,
    customer_balance_after: customerBalanceAfter,
    registered_product: registeredProduct,
    idempotent_replay: false,
  };
}

export async function getVoucherById(
  pool: Pool,
  voucherId: string,
  organizationId: string
): Promise<{
  voucher: VoucherRecord;
  payments: VoucherPaymentRecord[];
  matches: VoucherInventoryMatchRecord[];
} | null> {
  const res = await pool.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2 LIMIT 1',
    [voucherId, organizationId]
  );
  if (res.rows.length === 0) return null;

  const [payRes, matchRes] = await Promise.all([
    pool.query<Record<string, unknown>>(
      'SELECT * FROM pos_voucher_payments WHERE voucher_id = $1 ORDER BY created_at ASC',
      [voucherId]
    ),
    pool.query<Record<string, unknown>>(
      'SELECT * FROM pos_voucher_inventory_matches WHERE voucher_id = $1 ORDER BY created_at ASC',
      [voucherId]
    ),
  ]);

  return {
    voucher: mapVoucherRow(res.rows[0]!),
    payments: payRes.rows.map(mapVoucherPaymentRow),
    matches: matchRes.rows.map(mapVoucherMatchRow),
  };
}

export async function listVouchers(pool: Pool, filter: VoucherListFilter): Promise<VoucherRecord[]> {
  const conditions: string[] = ['organization_id = $1'];
  const params: unknown[] = [filter.organization_id];

  if (filter.branch_id) {
    params.push(filter.branch_id);
    conditions.push(`branch_id = $${params.length}`);
  }
  if (filter.voucher_type) {
    params.push(filter.voucher_type);
    conditions.push(`voucher_type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.customer_id) {
    params.push(filter.customer_id);
    conditions.push(`customer_id = $${params.length}`);
  }
  if (filter.search && filter.search.trim()) {
    params.push(`%${filter.search.trim()}%`);
    const idx = params.length;
    conditions.push(`(voucher_number ILIKE $${idx} OR product_name ILIKE $${idx} OR customer_name_snapshot ILIKE $${idx})`);
  }

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  params.push(limit, offset);

  const sql = `
    SELECT * FROM pos_direct_vouchers
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const res = await pool.query<Record<string, unknown>>(sql, params);
  return res.rows.map(mapVoucherRow);
}

export async function recordVoucherPaymentTx(
  client: PoolClient,
  params: {
    voucher_id: string;
    organization_id: string;
    branch_id: string;
    performed_by: string;
    payments: VoucherPaymentInput[];
    idempotency_key?: string | null;
  }
): Promise<{
  voucher: VoucherRecord;
  payments_added: VoucherPaymentRecord[];
  customer_balance_after: number | null;
  idempotent_replay: boolean;
}> {
  const now = new Date().toISOString();

  // Lock voucher row first
  const vRes = await client.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [params.voucher_id, params.organization_id]
  );
  if (vRes.rows.length === 0) {
    throw new VoucherRepoError(`Voucher '${params.voucher_id}' not found`, 404);
  }
  const voucher = mapVoucherRow(vRes.rows[0]!);

  if (voucher.branch_id !== params.branch_id) {
    throw new VoucherRepoError('Branch mismatch: cannot record payment from another branch', 403);
  }
  if (voucher.status === 'CANCELLED') {
    throw new VoucherRepoError('Cannot record payment on a cancelled voucher', 400);
  }
  if (voucher.voucher_type === 'INSTANT_INVENTORY') {
    throw new VoucherRepoError('INSTANT_INVENTORY registration vouchers do not accept separate payments; collect payment via POS checkout.', 400);
  }

  // Idempotency check on payment key
  if (params.idempotency_key) {
    const dupRes = await client.query<Record<string, unknown>>(
      'SELECT * FROM pos_voucher_payments WHERE voucher_id = $1 AND idempotency_key = $2',
      [voucher.id, params.idempotency_key]
    );
    if (dupRes.rows.length > 0) {
      let balAfter: number | null = null;
      if (voucher.customer_id) balAfter = await getCustomerBalanceTx(client, voucher.customer_id);
      return {
        voucher,
        payments_added: dupRes.rows.map(mapVoucherPaymentRow),
        customer_balance_after: balAfter,
        idempotent_replay: true,
      };
    }
  }

  const totalIncoming = params.payments.reduce((sum, p) => sum + p.amount, 0);
  const outstandingBefore = Math.max(0, voucher.total_sale_amount - voucher.paid_amount);
  if (totalIncoming <= 0) {
    throw new VoucherRepoError('Total payment amount must be greater than zero', 400);
  }
  if (totalIncoming > outstandingBefore) {
    throw new VoucherRepoError(
      `Payment total (Rs ${totalIncoming.toLocaleString()}) exceeds remaining voucher balance (Rs ${outstandingBefore.toLocaleString()}).`,
      400
    );
  }

  let customerBalanceAfter: number | null = null;
  let paymentLedgerId: string | null = null;
  if (voucher.customer_id) {
    await client.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [voucher.customer_id]);
    const currentBal = await getCustomerBalanceTx(client, voucher.customer_id);
    customerBalanceAfter = currentBal - totalIncoming;
    paymentLedgerId = uuidv4();
    await client.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type,
          debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'PAYMENT', 0, $5, $6, $7, $8, $9)`,
      [
        paymentLedgerId,
        voucher.customer_id,
        voucher.id,
        voucher.voucher_number,
        totalIncoming,
        customerBalanceAfter,
        `Additional payment for Voucher ${voucher.voucher_number}`,
        params.performed_by,
        now,
      ]
    );
  }

  const addedPayments: VoucherPaymentRecord[] = [];
  for (let i = 0; i < params.payments.length; i++) {
    const tender = params.payments[i]!;
    let cashMovementId: string | null = null;
    if (tender.method === 'CASH') {
      cashMovementId = await recordOpenSessionCashInTx(
        client,
        voucher.branch_id,
        tender.amount,
        voucher.id,
        voucher.voucher_number,
        `Voucher additional payment (${voucher.voucher_number})`,
        params.performed_by,
        now
      );
    }

    const rowKey = params.idempotency_key && i === 0 ? params.idempotency_key : null;
    const pRes = await client.query<Record<string, unknown>>(
      `INSERT INTO pos_voucher_payments (
         id, organization_id, branch_id, voucher_id, payment_method, amount,
         reference_number, notes, cash_movement_id, customer_ledger_id,
         is_reversed, idempotency_key, performed_by, created_at, account_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14)
       RETURNING *`,
      [
        uuidv4(),
        voucher.organization_id,
        voucher.branch_id,
        voucher.id,
        tender.method,
        tender.amount,
        tender.reference_number ?? null,
        tender.notes ?? null,
        cashMovementId,
        paymentLedgerId,
        rowKey,
        params.performed_by,
        now,
        tender.account_id ?? null,
      ]
    );
    addedPayments.push(mapVoucherPaymentRow(pRes.rows[0]!));
  }

  const newPaidAmount = voucher.paid_amount + totalIncoming;
  const newPaymentStatus =
    newPaidAmount >= voucher.total_sale_amount ? 'PAID' : 'PARTIALLY_PAID';

  const updatedRes = await client.query<Record<string, unknown>>(
    `UPDATE pos_direct_vouchers
     SET paid_amount = $1,
         payment_status = $2,
         updated_at = $3
     WHERE id = $4
     RETURNING *`,
    [newPaidAmount, newPaymentStatus, now, voucher.id]
  );

  return {
    voucher: mapVoucherRow(updatedRes.rows[0]!),
    payments_added: addedPayments,
    customer_balance_after: customerBalanceAfter,
    idempotent_replay: false,
  };
}

export async function deliverVoucherTx(
  client: PoolClient,
  params: {
    voucher_id: string;
    organization_id: string;
    branch_id: string;
    quantity_delivered: number;
    performed_by: string;
    idempotency_key: string;
    request_fingerprint?: string | null;
    notes?: string | null;
  }
): Promise<{
  voucher: VoucherRecord;
  customer_balance_after: number | null;
  idempotent_replay: boolean;
}> {
  const now = new Date().toISOString();

  // 1. Idempotency serialization via transaction advisory lock
  const [k1, k2] = advisoryLockKey(params.branch_id, `del:${params.voucher_id}:${params.idempotency_key}`);
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

  // 2. Idempotency replay and fingerprint check (DEF-03)
  const existingDelivery = await client.query<Record<string, unknown>>(
    `SELECT * FROM pos_voucher_deliveries
     WHERE voucher_id = $1 AND idempotency_key = $2`,
    [params.voucher_id, params.idempotency_key]
  );
  if (existingDelivery.rows.length > 0) {
    const existing = existingDelivery.rows[0]!;
    const storedFingerprint = existing['request_fingerprint'] as string | null;
    if (storedFingerprint && params.request_fingerprint && storedFingerprint !== params.request_fingerprint) {
      throw new VoucherRepoError(
        `Idempotency key '${params.idempotency_key}' was already used for a different delivery payload.`,
        409
      );
    }
    const vCurrent = await client.query<Record<string, unknown>>(
      'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2',
      [params.voucher_id, params.organization_id]
    );
    let balAfter: number | null = null;
    if (vCurrent.rows.length > 0 && vCurrent.rows[0]!['customer_id']) {
      balAfter = await getCustomerBalanceTx(client, String(vCurrent.rows[0]!['customer_id']));
    }
    return {
      voucher: mapVoucherRow(vCurrent.rows[0]!),
      customer_balance_after: balAfter,
      idempotent_replay: true,
    };
  }

  const vRes = await client.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [params.voucher_id, params.organization_id]
  );
  if (vRes.rows.length === 0) {
    throw new VoucherRepoError(`Voucher '${params.voucher_id}' not found`, 404);
  }
  const voucher = mapVoucherRow(vRes.rows[0]!);

  if (voucher.branch_id !== params.branch_id) {
    throw new VoucherRepoError('Branch mismatch: cannot deliver voucher from another branch', 403);
  }
  if (voucher.status === 'CANCELLED') {
    throw new VoucherRepoError('Cannot record delivery on a cancelled voucher', 400);
  }

  const qtyToDeliver = Math.round(params.quantity_delivered);
  if (qtyToDeliver <= 0) {
    throw new VoucherRepoError('Delivered quantity must be greater than zero', 400);
  }
  if (voucher.delivered_qty + qtyToDeliver > voucher.voucher_qty) {
    throw new VoucherRepoError(
      `Cannot deliver ${qtyToDeliver} units: only ${voucher.voucher_qty - voucher.delivered_qty} undelivered units remain.`,
      400
    );
  }

  // For PRE_BOOKING (where SALE debit was deferred until delivery), post SALE debit now
  let customerBalanceAfter: number | null = null;
  let deliveryLedgerId: string | null = null;
  if (voucher.voucher_type === 'PRE_BOOKING' && voucher.customer_id) {
    await client.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [voucher.customer_id]);
    const currentBal = await getCustomerBalanceTx(client, voucher.customer_id);
    const debitAmount = qtyToDeliver * voucher.voucher_sale_price;
    customerBalanceAfter = currentBal + debitAmount;
    deliveryLedgerId = uuidv4();
    await client.query(
      `INSERT INTO customer_ledger_entries
         (id, customer_id, reference_id, reference_number, entry_type,
          debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
      [
        deliveryLedgerId,
        voucher.customer_id,
        voucher.id,
        voucher.voucher_number,
        debitAmount,
        customerBalanceAfter,
        `Delivery recognized for Pre-Booking Voucher ${voucher.voucher_number} (Qty: ${qtyToDeliver})`,
        params.performed_by,
        now,
      ]
    );
  } else if (voucher.customer_id) {
    customerBalanceAfter = await getCustomerBalanceTx(client, voucher.customer_id);
  }

  // Record delivery event in pos_voucher_deliveries for idempotency, payload fingerprinting and audit trail
  await client.query(
    `INSERT INTO pos_voucher_deliveries
       (id, voucher_id, quantity_delivered, customer_ledger_id, idempotency_key, request_fingerprint, performed_by, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidv4(),
      voucher.id,
      qtyToDeliver,
      deliveryLedgerId,
      params.idempotency_key,
      params.request_fingerprint ?? null,
      params.performed_by,
      params.notes ?? null,
      now,
    ]
  );

  const newDeliveredQty = voucher.delivered_qty + qtyToDeliver;
  const updatedRes = await client.query<Record<string, unknown>>(
    `UPDATE pos_direct_vouchers
     SET delivered_qty = $1,
         updated_at = $2
     WHERE id = $3
     RETURNING *`,
    [newDeliveredQty, now, voucher.id]
  );

  return {
    voucher: mapVoucherRow(updatedRes.rows[0]!),
    customer_balance_after: customerBalanceAfter,
    idempotent_replay: false,
  };
}

export async function matchVoucherInventoryTx(
  client: PoolClient,
  params: {
    voucher_id: string;
    organization_id: string;
    branch_id: string;
    product_id: string;
    purchase_id?: string | null;
    purchase_line_id?: string | null;
    stock_movement_in_id?: string | null;
    quantity_matched: number;
    actual_receiving_cost?: number | null;
    reconciliation_notes?: string | null;
    matched_by: string;
  }
): Promise<{
  voucher: VoucherRecord;
  match: VoucherInventoryMatchRecord;
}> {
  const now = new Date().toISOString();

  // 1. Lock voucher row
  const vRes = await client.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [params.voucher_id, params.organization_id]
  );
  if (vRes.rows.length === 0) {
    throw new VoucherRepoError(`Voucher '${params.voucher_id}' not found`, 404);
  }
  const voucher = mapVoucherRow(vRes.rows[0]!);

  if (voucher.branch_id !== params.branch_id) {
    throw new VoucherRepoError('Branch mismatch: voucher belongs to a different branch', 403);
  }
  if (voucher.status === 'CANCELLED' || voucher.status === 'FULFILLED') {
    throw new VoucherRepoError(`Voucher is already ${voucher.status} and cannot be matched`, 400);
  }

  const qtyToMatch = Math.round(params.quantity_matched);
  if (qtyToMatch <= 0) {
    throw new VoucherRepoError('Matched quantity must be greater than zero', 400);
  }
  if (voucher.matched_qty + qtyToMatch > voucher.voucher_qty) {
    throw new VoucherRepoError(
      `Cannot match ${qtyToMatch} units: only ${voucher.voucher_qty - voucher.matched_qty} unmatched units remain for this voucher.`,
      400
    );
  }
  if (voucher.product_id && voucher.product_id !== params.product_id) {
    throw new VoucherRepoError('Product identity mismatch against voucher product', 400);
  }

  let resolvedPurchaseId = params.purchase_id ?? null;
  let actualCost = params.actual_receiving_cost ?? voucher.locked_purchase_price;

  // 2. If purchase_line_id is provided, lock purchase_line and prevent over-matching / cross-branch matching
  if (params.purchase_line_id) {
    const plRes = await client.query<Record<string, unknown>>(
      `SELECT pl.id, pl.purchase_id, pl.product_id, pl.quantity, pl.unit_cost, p.branch_id
       FROM purchase_lines pl
       JOIN purchases p ON p.id = pl.purchase_id
       WHERE pl.id = $1
       FOR UPDATE OF pl`,
      [params.purchase_line_id]
    );
    if (plRes.rows.length === 0) {
      throw new VoucherRepoError(`Purchase line '${params.purchase_line_id}' not found`, 404);
    }
    const pl = plRes.rows[0]!;
    if (String(pl['branch_id']) !== params.branch_id) {
      throw new VoucherRepoError('Purchase line belongs to a different branch', 403);
    }
    if (String(pl['product_id']) !== params.product_id) {
      throw new VoucherRepoError('Purchase line product does not match requested product_id', 400);
    }
    const purchasedQty = Number(pl['quantity']);
    const matchedSoFarRes = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity_matched), 0)::BIGINT AS total
       FROM pos_voucher_inventory_matches
       WHERE purchase_line_id = $1`,
      [params.purchase_line_id]
    );
    const matchedSoFar = Number(matchedSoFarRes.rows[0]?.total ?? 0);
    if (matchedSoFar + qtyToMatch > purchasedQty) {
      throw new VoucherRepoError(
        `Purchase line quantity exceeded: purchased ${purchasedQty}, already matched ${matchedSoFar}, requested ${qtyToMatch}`,
        400
      );
    }
    resolvedPurchaseId = String(pl['purchase_id']);
    actualCost = Number(pl['unit_cost']);
  } else if (params.stock_movement_in_id) {
    // VCH-05: Guard against over-matching when matching via stock_movement_in_id directly
    const smRes = await client.query<Record<string, unknown>>(
      `SELECT id, product_id, branch_id, quantity, movement_type
       FROM stock_movements
       WHERE id = $1`,
      [params.stock_movement_in_id]
    );
    if (smRes.rows.length === 0) {
      throw new VoucherRepoError(`Stock movement '${params.stock_movement_in_id}' not found`, 404);
    }
    const sm = smRes.rows[0]!;
    if (String(sm['branch_id']) !== params.branch_id) {
      throw new VoucherRepoError('Stock movement belongs to a different branch', 403);
    }
    if (String(sm['product_id']) !== params.product_id) {
      throw new VoucherRepoError('Stock movement product does not match requested product_id', 400);
    }
    if (String(sm['movement_type']) !== 'IN' && String(sm['movement_type']) !== 'TRANSFER_IN' && String(sm['movement_type']) !== 'ADJUSTMENT') {
      throw new VoucherRepoError(`Cannot match against ${sm['movement_type']} movement type; must be incoming stock`, 400);
    }
    const movementQty = Number(sm['quantity']);
    const matchedSoFarRes = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity_matched), 0)::BIGINT AS total
       FROM pos_voucher_inventory_matches
       WHERE stock_movement_in_id = $1`,
      [params.stock_movement_in_id]
    );
    const matchedSoFar = Number(matchedSoFarRes.rows[0]?.total ?? 0);
    if (matchedSoFar + qtyToMatch > movementQty) {
      throw new VoucherRepoError(
        `Stock movement quantity exceeded: available ${movementQty}, already matched ${matchedSoFar}, requested ${qtyToMatch}`,
        400
      );
    }
  }

  // 3. Insert immutable reconciliation audit row
  const matchId = uuidv4();
  const matchRes = await client.query<Record<string, unknown>>(
    `INSERT INTO pos_voucher_inventory_matches (
       id, organization_id, voucher_id, purchase_id, purchase_line_id,
       stock_movement_in_id, stock_movement_out_id, branch_id, product_id,
       quantity_matched, locked_unit_cost, actual_receiving_cost,
       reconciliation_notes, matched_by, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      matchId,
      voucher.organization_id,
      voucher.id,
      resolvedPurchaseId,
      params.purchase_line_id ?? null,
      params.stock_movement_in_id ?? null,
      voucher.branch_id,
      params.product_id,
      qtyToMatch,
      voucher.locked_purchase_price,
      Math.round(actualCost),
      params.reconciliation_notes ?? null,
      params.matched_by,
      now,
    ]
  );

  const newMatchedQty = voucher.matched_qty + qtyToMatch;
  const newStatus: VoucherStatus =
    newMatchedQty >= voucher.voucher_qty ? 'FULFILLED' : 'PARTIALLY_MATCHED';

  const updatedVoucherRes = await client.query<Record<string, unknown>>(
    `UPDATE pos_direct_vouchers
     SET product_id = COALESCE(product_id, $1),
         matched_qty = $2,
         status = $3,
         updated_at = $4
     WHERE id = $5
     RETURNING *`,
    [params.product_id, newMatchedQty, newStatus, now, voucher.id]
  );

  return {
    voucher: mapVoucherRow(updatedVoucherRes.rows[0]!),
    match: mapVoucherMatchRow(matchRes.rows[0]!),
  };
}

export async function cancelVoucherTx(
  client: PoolClient,
  params: {
    voucher_id: string;
    organization_id: string;
    branch_id: string;
    reason?: string | null;
  }
): Promise<VoucherRecord> {
  const now = new Date().toISOString();

  const vRes = await client.query<Record<string, unknown>>(
    'SELECT * FROM pos_direct_vouchers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [params.voucher_id, params.organization_id]
  );
  if (vRes.rows.length === 0) {
    throw new VoucherRepoError(`Voucher '${params.voucher_id}' not found`, 404);
  }
  const voucher = mapVoucherRow(vRes.rows[0]!);

  if (voucher.branch_id !== params.branch_id) {
    throw new VoucherRepoError('Branch mismatch: cannot cancel voucher from another branch', 403);
  }
  if (voucher.status === 'CANCELLED') {
    throw new VoucherRepoError('Voucher is already cancelled', 400);
  }
  if (voucher.status === 'FULFILLED' || voucher.matched_qty > 0) {
    throw new VoucherRepoError('Cannot cancel a voucher that has already been fulfilled or matched against inventory', 400);
  }
  if (voucher.paid_amount > 0 || voucher.delivered_qty > 0) {
    throw new VoucherRepoError(
      'Cannot cancel a voucher with recorded payments or physical deliveries. Refund/return reversal workflow is required.',
      400
    );
  }

  const updatedNotes = params.reason?.trim()
    ? `${voucher.notes ? voucher.notes + ' | ' : ''}Cancelled: ${params.reason.trim()}`
    : voucher.notes;

  const updatedRes = await client.query<Record<string, unknown>>(
    `UPDATE pos_direct_vouchers
     SET status = 'CANCELLED',
         notes = $1,
         updated_at = $2
     WHERE id = $3
     RETURNING *`,
    [updatedNotes, now, voucher.id]
  );

  return mapVoucherRow(updatedRes.rows[0]!);
}
