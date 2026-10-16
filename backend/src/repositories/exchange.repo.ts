/**
 * Exchange Repository — Atomic Product Exchange Implementation
 *
 * Implements the atomic exchange of returned products and replacement items in one
 * PostgreSQL database transaction with:
 * - Distributed advisory lock serialization and idempotency checking via sale_idempotency_keys
 * - Strict branch/tenant isolation: validates and locks the original sale and products
 * - Exact returnable line checks against prior returns
 * - Stock restoration for returned items and stock deduction for replacement items
 * - Comprehensive financial settlement:
 *     - Positive diff: customer pays difference (cash session validation or customer credit constraint)
 *     - Negative diff (refund): cash refund (with cash session OUT movement) OR customer account credit
 *     - Zero diff: balanced exchange (no artificial payments or credits)
 * - Complete rollback if any step fails.
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import {
  Sale,
  SaleLine,
  SalePayment,
  PaymentStatus,
  SaleStatus,
  SaleItemDto,
  SalePaymentInputDto,
  SaleResultDto,
  SaleRepoError,
  getSaleById,
  getSaleLines,
  getSalePayments,
} from './sale.repo';
import {
  SalesReturn,
  SalesReturnLine,
  RefundMethod,
  ReturnsRepoError,
} from './returns.repo';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ProcessExchangeReturnLineDto {
  sale_line_id: string;
  quantity: number;
}

export interface ProcessExchangeDto {
  original_sale_id: string;
  return_lines: ProcessExchangeReturnLineDto[];
  replacement_items: SaleItemDto[];
  replacement_discount?: number | null;
  /**
   * For negative difference: 'CASH' or 'CREDIT'.
   * Required if net difference < 0.
   */
  refund_method?: 'CASH' | 'CREDIT' | null;
  /**
   * For positive difference: payments breakdown or single payment method & paid_amount
   */
  payments?: SalePaymentInputDto[] | null;
  payment_method?: string | null;
  paid_amount?: number | null;
  notes?: string | null;
  reason?: string | null;
  /**
   * Client-supplied idempotency key for duplicate submission protection.
   */
  idempotency_key: string;
}

export interface ExchangeResultDto {
  success: boolean;
  sales_return: SalesReturn;
  return_lines: SalesReturnLine[];
  replacement_sale: SaleResultDto;
  difference: number;
  settlement_type: 'POSITIVE_COLLECTION' | 'NEGATIVE_REFUND' | 'BALANCED_ZERO';
  refund_method?: 'CASH' | 'CREDIT' | null;
  cash_refunded?: number | null;
  customer_balance_after?: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPeriodYYYYMM(): string {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function normalizePaymentMethod(method: string): string {
  const m = method.trim().toUpperCase();
  if (m === 'CASH') return 'CASH';
  if (m === 'CARD' || m === 'CREDIT_CARD' || m === 'DEBIT_CARD') return 'CARD';
  if (m === 'BANK' || m === 'BANK_TRANSFER') return 'BANK';
  if (m === 'EASYPAISA') return 'EASYPAISA';
  if (m === 'JAZZCASH') return 'JAZZCASH';
  if (m === 'CREDIT') return 'CREDIT';
  return 'CASH';
}

function computeExchangePayloadHash(dto: ProcessExchangeDto): string {
  const canonical = {
    original_sale_id: dto.original_sale_id,
    return_lines: [...(dto.return_lines ?? [])]
      .sort((a, b) => (a.sale_line_id < b.sale_line_id ? -1 : a.sale_line_id > b.sale_line_id ? 1 : 0))
      .map((l) => ({ sale_line_id: l.sale_line_id, quantity: l.quantity })),
    replacement_items: [...(dto.replacement_items ?? [])]
      .sort((a, b) => (a.product_id < b.product_id ? -1 : a.product_id > b.product_id ? 1 : 0))
      .map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price ?? i.price ?? null,
        discount: i.discount ?? 0,
      })),
    replacement_discount: dto.replacement_discount ?? 0,
    refund_method: dto.refund_method ?? null,
    payments: dto.payments
      ? [...dto.payments]
          .sort((a, b) => (a.method < b.method ? -1 : a.method > b.method ? 1 : 0))
          .map((p) => ({ method: p.method, amount: p.amount }))
      : null,
    paid_amount: dto.paid_amount ?? null,
    payment_method: dto.payment_method ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function computeAdvisoryLockKeys(branchId: string, idempotencyKey: string): [number, number] {
  const hash = createHash('sha256').update(`exchange:${branchId}:${idempotencyKey}`).digest();
  const k1 = hash.readInt32BE(0);
  const k2 = hash.readInt32BE(4);
  return [k1, k2];
}

async function reconstructAuthoritativeExchangeResult(
  pool: Pool,
  saleId: string,
  originalSaleId: string
): Promise<ExchangeResultDto | null> {
  const cachedSale = await getSaleById(pool, saleId);
  if (!cachedSale) return null;

  const cachedLines = await getSaleLines(pool, saleId);
  const cachedPayments = await getSalePayments(pool, saleId);

  // Find associated sales_returns created for this exchange deterministically.
  // 1. Check sale_payments for the exchange return offset payment record which stores return_number in reference_number
  const offsetPayment = cachedPayments.find(
    (p) => p.payment_method === 'OTHER' && (p.notes?.startsWith('Exchange Return Offset:') || p.reference_number?.startsWith('RET-'))
  );

  let returnRow: Record<string, unknown> | undefined;
  if (offsetPayment?.reference_number) {
    const returnByNumberRes = await pool.query(
      'SELECT * FROM sales_returns WHERE return_number = $1 AND sale_id = $2',
      [offsetPayment.reference_number, originalSaleId]
    );
    returnRow = returnByNumberRes.rows[0] as Record<string, unknown> | undefined;
  }

  // 2. Fallback to notes in cachedSale if sale_payments was empty
  if (!returnRow && cachedSale.notes) {
    const match = cachedSale.notes.match(/Exchange against return (RET-[A-Za-z0-9-]+)/);
    if (match && match[1]) {
      const returnByNotesRes = await pool.query(
        'SELECT * FROM sales_returns WHERE return_number = $1 AND sale_id = $2',
        [match[1], originalSaleId]
      );
      returnRow = returnByNotesRes.rows[0] as Record<string, unknown> | undefined;
    }
  }

  // 3. Fallback to sales_returns notes referencing the replacement invoice number
  if (!returnRow && cachedSale.invoice_number) {
    const returnByInvRes = await pool.query(
      'SELECT * FROM sales_returns WHERE notes LIKE $1 AND sale_id = $2',
      [`%${cachedSale.invoice_number}%`, originalSaleId]
    );
    if (returnByInvRes.rows.length === 1) {
      returnRow = returnByInvRes.rows[0] as Record<string, unknown>;
    }
  }

  if (!returnRow) {
    throw new SaleRepoError(
      `Deterministic exchange return linkage could not be resolved for replacement sale '${saleId}' and original sale '${originalSaleId}'.`,
      500
    );
  }

  const salesReturn = returnRow as unknown as SalesReturn;
  const returnTotal = Number(returnRow['total_amount'] ?? 0);
  const retLinesRes = await pool.query(
    'SELECT * FROM sales_return_lines WHERE return_id = $1 ORDER BY created_at ASC',
    [returnRow['id']]
  );
  const returnLines = retLinesRes.rows as SalesReturnLine[];

  // Exact difference between replacement sale total and return total
  const difference = Number(cachedSale.total_amount ?? 0) - returnTotal;
  const settlementType: 'POSITIVE_COLLECTION' | 'NEGATIVE_REFUND' | 'BALANCED_ZERO' =
    difference > 0
      ? 'POSITIVE_COLLECTION'
      : difference < 0
      ? 'NEGATIVE_REFUND'
      : 'BALANCED_ZERO';

  const refundMethod =
    difference < 0 ? (salesReturn.refund_method as 'CASH' | 'CREDIT') ?? null : null;
  const cashRefunded =
    difference < 0 && refundMethod === 'CASH' ? Math.abs(difference) : null;

  // Retrieve customer balance after if applicable
  // Identify the exact ledger entry that represents the final customer balance after this exchange:
  // - If exchangeDiff > 0 and credit was issued, entry is on reference_id = saleId (entry_type = 'SALE')
  // - If exchangeDiff < 0 and credit refund was issued, entry is on reference_id = salesReturn.id (entry_type = 'RETURN')
  // We check the specific reference_id matching the settlement, with deterministic secondary id ordering.
  let customerBalanceAfter: number | null = null;
  if (cachedSale.customer_id) {
    let targetRefId: string | null = null;
    let targetEntryType: string | null = null;
    if (difference > 0) {
      targetRefId = saleId;
      targetEntryType = 'SALE';
    } else if (difference < 0 && refundMethod === 'CREDIT') {
      targetRefId = salesReturn.id;
      targetEntryType = 'RETURN';
    }

    if (targetRefId && targetEntryType) {
      const balRes = await pool.query(
        'SELECT balance_after FROM customer_ledger_entries WHERE customer_id = $1 AND reference_id = $2 AND entry_type = $3 ORDER BY created_at DESC, id DESC LIMIT 1',
        [cachedSale.customer_id, targetRefId, targetEntryType]
      );
      if (balRes.rows.length > 0) {
        customerBalanceAfter = Number(balRes.rows[0].balance_after);
      }
    }
  }

  return {
    success: true,
    sales_return: salesReturn,
    return_lines: returnLines,
    replacement_sale: {
      sale: cachedSale,
      lines: cachedLines,
      payments: cachedPayments,
      credit_amount: Math.max(cachedSale.total_amount - cachedSale.paid_amount, 0),
      customer_balance_after: customerBalanceAfter,
      cogs: 0,
      gross_profit: 0,
      gross_margin: 0,
    },
    difference,
    settlement_type: settlementType,
    refund_method: refundMethod,
    cash_refunded: cashRefunded,
    customer_balance_after: customerBalanceAfter,
  };
}

export async function processAtomicExchange(
  pool: Pool,
  dto: ProcessExchangeDto,
  userId: string | null,
  identityBranchId?: string | null,
  callerIsAdmin?: boolean
): Promise<ExchangeResultDto> {
  const rawIdempotencyKey = dto.idempotency_key?.trim();
  if (!rawIdempotencyKey) {
    throw new SaleRepoError('An idempotency key is required for exchange operations', 400);
  }

  if (!dto.return_lines || dto.return_lines.length === 0) {
    throw new SaleRepoError('Exchange requires at least one returned line item', 400);
  }

  if (!dto.replacement_items || dto.replacement_items.length === 0) {
    throw new SaleRepoError('Exchange requires at least one replacement cart item', 400);
  }

  // Pre-validate original sale existence and branch context
  const preSaleCheck = await pool.query('SELECT branch_id FROM sales WHERE id = $1', [dto.original_sale_id]);
  if (preSaleCheck.rows.length === 0) {
    throw new SaleRepoError(`Original sale '${dto.original_sale_id}' not found`, 404);
  }
  const originalBranchId = preSaleCheck.rows[0].branch_id as string;

  if (!callerIsAdmin) {
    if (!identityBranchId || identityBranchId.trim() !== originalBranchId) {
      throw new SaleRepoError('Access denied: Cannot process exchange for a sale belonging to another branch', 403);
    }
  }

  const lookupBranchId = originalBranchId;

  // ── Fast-path: Check committed idempotency key ──
  const incomingHash = computeExchangePayloadHash(dto);
  try {
    const existing = await pool.query(
      'SELECT sale_id, payload_hash FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2',
      [rawIdempotencyKey, lookupBranchId]
    );
    if (existing.rows.length > 0) {
      const storedHash = existing.rows[0]['payload_hash'] as string | null;
      if (storedHash !== null && storedHash !== incomingHash) {
        throw new SaleRepoError(
          `Idempotency key '${rawIdempotencyKey}' was already used with a different exchange payload.`,
          409
        );
      }
      const existingSaleId = existing.rows[0]['sale_id'] as string;
      const reconstructed = await reconstructAuthoritativeExchangeResult(pool, existingSaleId, dto.original_sale_id);
      if (reconstructed) {
        return reconstructed;
      }
    }
  } catch (lookupErr: unknown) {
    const msg = (lookupErr as Error).message || String(lookupErr);
    if (
      msg.includes('sale_idempotency_keys') ||
      msg.includes('does not exist') ||
      (lookupErr as { code?: string }).code === '42P01'
    ) {
      console.error('[exchange.repo] sale_idempotency_keys table missing. Failing closed.');
      throw new SaleRepoError('Required idempotency schema is not available. Contact system administrator.', 500);
    }
    throw lookupErr;
  }

  // ── Atomic Database Transaction ──
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Advisory lock serialization
    const [k1, k2] = computeAdvisoryLockKeys(lookupBranchId, rawIdempotencyKey);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

    // Recheck idempotency under lock
    const recheck = await client.query(
      'SELECT sale_id, payload_hash FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2',
      [rawIdempotencyKey, lookupBranchId]
    );
    if (recheck.rows.length > 0) {
      await client.query('ROLLBACK');
      const row = recheck.rows[0] as Record<string, unknown>;
      const storedHash = row['payload_hash'] as string | null;
      if (storedHash !== null && storedHash !== incomingHash) {
        throw new SaleRepoError(
          `Idempotency key '${rawIdempotencyKey}' was already used with a different exchange payload.`,
          409
        );
      }
      const existingSaleId = row['sale_id'] as string;
      const reconstructed = await reconstructAuthoritativeExchangeResult(pool, existingSaleId, dto.original_sale_id);
      if (reconstructed) {
        return reconstructed;
      }
    }

    const now = new Date().toISOString();

    // 1. Lock and validate original sale
    const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [dto.original_sale_id]);
    if (saleRes.rows.length === 0) {
      throw new SaleRepoError(`Sale '${dto.original_sale_id}' not found`, 404);
    }
    const origSale = saleRes.rows[0] as Record<string, unknown>;
    const branchId = origSale['branch_id'] as string;

    const customerId = (origSale['customer_id'] as string | null) ?? null;
    const customerName = (origSale['customer_name_snapshot'] as string | null) ?? null;

    // 2. Validate return lines against remaining returnable quantity
    let totalReturnAmount = 0;
    const preparedReturnLines: Array<{
      sale_line_id: string;
      product_id: string;
      product_name: string;
      sku: string;
      unit_price: number;
      cost_price: number;
      quantity: number;
      line_total: number;
    }> = [];

    for (const rLine of dto.return_lines) {
      if (rLine.quantity <= 0) {
        throw new SaleRepoError('Return quantity must be greater than 0', 400);
      }

      const origLineRes = await client.query('SELECT * FROM sale_lines WHERE id = $1 AND sale_id = $2', [
        rLine.sale_line_id,
        dto.original_sale_id,
      ]);
      if (origLineRes.rows.length === 0) {
        throw new SaleRepoError(`Sale line '${rLine.sale_line_id}' not found on sale '${dto.original_sale_id}'`, 404);
      }
      const origLine = origLineRes.rows[0] as Record<string, unknown>;
      const origQty = Number(origLine['quantity'] ?? 0);
      const unitPrice = Number(origLine['unit_price'] ?? 0);
      const costPrice = Number(origLine['cost_price_snapshot'] ?? 0);

      const prevRetRes = await client.query(
        'SELECT COALESCE(SUM(quantity), 0) AS ret_qty FROM sales_return_lines WHERE sale_line_id = $1',
        [rLine.sale_line_id]
      );
      const prevRetQty = Number(prevRetRes.rows[0]?.['ret_qty'] ?? 0);
      const maxAvailable = origQty - prevRetQty;

      if (rLine.quantity > maxAvailable) {
        throw new SaleRepoError(
          `Cannot return ${rLine.quantity} units of '${origLine['product_name_snapshot']}': max returnable is ${maxAvailable}`,
          400
        );
      }

      const lineTotal = unitPrice * rLine.quantity;
      totalReturnAmount += lineTotal;

      preparedReturnLines.push({
        sale_line_id: rLine.sale_line_id,
        product_id: origLine['product_id'] as string,
        product_name: origLine['product_name_snapshot'] as string,
        sku: origLine['sku_snapshot'] as string,
        unit_price: unitPrice,
        cost_price: costPrice,
        quantity: rLine.quantity,
        line_total: lineTotal,
      });
    }

    // 3. Validate Replacement Products and Stock
    interface PreparedReplacementLine {
      product_id: string;
      product_name: string;
      sku: string;
      unit_price: number;
      cost_price: number;
      quantity: number;
      discount: number;
      line_total: number;
    }

    const preparedReplacementLines: PreparedReplacementLine[] = [];
    const requestedReplacementsByProd = new Map<string, number>();

    for (const item of dto.replacement_items) {
      if (item.quantity <= 0) {
        throw new SaleRepoError('Replacement item quantity must be greater than 0', 400);
      }

      const prodRes = await client.query(
        'SELECT id, name, sku, purchase_price, average_cost, sale_price, is_active FROM products WHERE id = $1',
        [item.product_id]
      );
      if (prodRes.rows.length === 0) {
        throw new SaleRepoError(`Product '${item.product_id}' not found`, 404);
      }
      const prod = prodRes.rows[0] as Record<string, unknown>;
      if (Number(prod['is_active'] ?? 1) !== 1) {
        throw new SaleRepoError(`Product '${prod['name']}' is inactive. Cannot complete exchange.`, 400);
      }

      const salePrice = item.unit_price ?? Number(prod['sale_price'] ?? 0);
      const purchasePrice = Number(prod['purchase_price'] ?? 0);
      const avgCost = Number(prod['average_cost'] ?? 0);
      const costPrice = avgCost > 0 ? avgCost : purchasePrice;

      const lineDisc = Math.max(Number(item.discount ?? 0), 0);
      const subtotalLine = salePrice * item.quantity;
      const lineTotal = Math.max(subtotalLine - lineDisc, 0);

      preparedReplacementLines.push({
        product_id: prod['id'] as string,
        product_name: prod['name'] as string,
        sku: prod['sku'] as string,
        unit_price: salePrice,
        cost_price: costPrice,
        quantity: item.quantity,
        discount: lineDisc,
        line_total: lineTotal,
      });

      const currentReq = requestedReplacementsByProd.get(item.product_id) ?? 0;
      requestedReplacementsByProd.set(item.product_id, currentReq + item.quantity);
    }

    // Check replacement stock availability (FOR UPDATE)
    for (const [prodId, reqQty] of requestedReplacementsByProd.entries()) {
      const stockRes = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [prodId, branchId]
      );
      if (stockRes.rows.length === 0) {
        throw new SaleRepoError(`Stock record not found for product '${prodId}' at branch '${branchId}'`, 400);
      }
      const currentStock = Number(stockRes.rows[0].quantity ?? 0);
      if (currentStock < reqQty) {
        throw new SaleRepoError(
          `Insufficient stock for product '${prodId}' at branch '${branchId}'. Available: ${currentStock}, Requested: ${reqQty}`,
          400
        );
      }
    }

    // 4. Calculate Net Exchange Difference
    const subtotalReplacement = preparedReplacementLines.reduce((sum, l) => sum + l.line_total, 0);
    const invoiceDiscount = Math.max(Number(dto.replacement_discount ?? 0), 0);
    const totalReplacementAmount = Math.max(subtotalReplacement - invoiceDiscount, 0);

    // Difference: positive => customer pays extra; negative => customer refund; 0 => balanced
    const exchangeDiff = totalReplacementAmount - totalReturnAmount;

    // Validate settlement prerequisites based on difference
    let chosenRefundMethod: 'CASH' | 'CREDIT' | null = null;
    if (exchangeDiff < 0) {
      if (!dto.refund_method) {
        throw new SaleRepoError('A refund method (CASH or CREDIT) is required when returned value exceeds replacement value', 400);
      }
      chosenRefundMethod = dto.refund_method.toUpperCase() === 'CREDIT' ? 'CREDIT' : 'CASH';
      if (chosenRefundMethod === 'CREDIT' && !customerId) {
        throw new SaleRepoError('Cannot issue account credit to walk-in customer without a registered account', 400);
      }
    }

    // 5. Generate Sequences (RET-... and INV-...)
    const branchCodeRes = await client.query('SELECT code FROM branches WHERE id = $1', [branchId]);
    const branchCode = (branchCodeRes.rows[0]?.['code'] as string) || 'MAIN';
    const period = getPeriodYYYYMM();

    // Sequence for Return
    const retSeqRes = await client.query(
      `INSERT INTO counters (name, value) VALUES ($1, 2)
       ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
       RETURNING value - 1`,
      [`return_seq_${branchId}_${period}`]
    );
    const retSeqVal = Number(Object.values((retSeqRes.rows[0] as Record<string, unknown>) ?? {})[0] ?? 1);
    const returnNumber = `RET-${branchCode}-${period}-${String(retSeqVal).padStart(6, '0')}`;
    const returnId = uuidv4();

    // Sequence for Replacement Sale Invoice
    const invSeqRes = await client.query(
      `INSERT INTO counters (name, value) VALUES ($1, 2)
       ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
       RETURNING value - 1`,
      [`invoice_seq_${branchId}_${period}`]
    );
    const invSeqVal = Number(Object.values((invSeqRes.rows[0] as Record<string, unknown>) ?? {})[0] ?? 1);
    const invoiceNumber = `INV-${branchCode}-${period}-${String(invSeqVal).padStart(6, '0')}`;
    const replacementSaleId = uuidv4();

    // 6a. Insert Replacement Sale Header early (placeholder payment fields) so that
    //     sale_lines (step 7) and sale_payments (step 8) can reference it via FK.
    //     paid_amount, change_amount and payment_status are updated after step 8
    //     once the financial settlement is computed.
    await client.query(
      `INSERT INTO sales (
         id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 0, 0, 'UNPAID', 'COMPLETED', $9, $10, $11, $12)`,
      [
        replacementSaleId,
        invoiceNumber,
        branchId,
        customerId,
        customerName,
        subtotalReplacement,
        invoiceDiscount,
        totalReplacementAmount,
        userId ?? null,
        dto.notes ?? `Exchange against return ${returnNumber}`,
        now,
        now,
      ]
    );

    // 6b. Insert Return Header and Restore Stock
    await client.query(
      `INSERT INTO sales_returns (
         id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot,
         total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, $10, $11, $12, $13)`,
      [
        returnId,
        returnNumber,
        dto.original_sale_id,
        branchId,
        customerId,
        customerName,
        totalReturnAmount,
        chosenRefundMethod ?? 'EXCHANGE',
        dto.reason ?? 'Exchange Return',
        dto.notes ?? `Linked exchange replacement invoice ${invoiceNumber}`,
        userId ?? null,
        now,
        now,
      ]
    );

    const insertedReturnLines: SalesReturnLine[] = [];
    for (const rLine of preparedReturnLines) {
      const returnLineId = uuidv4();
      await client.query(
        `INSERT INTO sales_return_lines (
           id, return_id, sale_line_id, product_id, product_name_snapshot, sku_snapshot,
           unit_price, quantity, return_amount, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          returnLineId,
          returnId,
          rLine.sale_line_id,
          rLine.product_id,
          rLine.product_name,
          rLine.sku,
          rLine.unit_price,
          rLine.quantity,
          rLine.line_total,
          now,
        ]
      );

      // Restore Stock (quantity = quantity + rLine.quantity)
      const stockRestoreRes = await client.query(
        `UPDATE stock
           SET quantity = quantity + $1, updated_at = $2
           WHERE product_id = $3 AND branch_id = $4
           RETURNING (quantity - $1) AS previous_stock, quantity AS new_stock`,
        [rLine.quantity, now, rLine.product_id, branchId]
      );
      const restoreRow = stockRestoreRes.rows[0] as Record<string, unknown>;
      const currentStock = Number(restoreRow['previous_stock'] ?? 0);
      const newStock = Number(restoreRow['new_stock'] ?? 0);

      // Stock movement IN
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock,
           reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          rLine.product_id,
          branchId,
          rLine.quantity,
          currentStock,
          newStock,
          `Exchange Return ${returnNumber}`,
          userId ?? null,
          returnId,
          now,
        ]
      );

      insertedReturnLines.push({
        id: returnLineId,
        return_id: returnId,
        sale_line_id: rLine.sale_line_id,
        product_id: rLine.product_id,
        product_name_snapshot: rLine.product_name,
        sku_snapshot: rLine.sku,
        unit_price: rLine.unit_price,
        quantity: rLine.quantity,
        return_amount: rLine.line_total,
        created_at: now,
      });
    }

    // 7. Deduct Replacement Stock and Insert Replacement Lines
    const insertedSaleLines: SaleLine[] = [];
    for (const sLine of preparedReplacementLines) {
      const saleLineId = uuidv4();

      // Deduct stock (quantity = quantity - sLine.quantity)
      const stockDeductRes = await client.query(
        `UPDATE stock
           SET quantity = quantity - $1, updated_at = $2
           WHERE product_id = $3 AND branch_id = $4
           RETURNING (quantity + $1) AS previous_stock, quantity AS new_stock`,
        [sLine.quantity, now, sLine.product_id, branchId]
      );
      const deductRow = stockDeductRes.rows[0] as Record<string, unknown>;
      const prevStock = Number(deductRow['previous_stock'] ?? 0);
      const resultingStock = Number(deductRow['new_stock'] ?? 0);

      // Stock movement OUT
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock,
           reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          sLine.product_id,
          branchId,
          sLine.quantity,
          prevStock,
          resultingStock,
          `Exchange Sale ${invoiceNumber}`,
          userId ?? null,
          replacementSaleId,
          now,
        ]
      );

      await client.query(
        `INSERT INTO sale_lines (
           id, sale_id, product_id, product_name_snapshot, sku_snapshot,
           unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          saleLineId,
          replacementSaleId,
          sLine.product_id,
          sLine.product_name,
          sLine.sku,
          sLine.unit_price,
          sLine.cost_price,
          sLine.quantity,
          sLine.discount,
          sLine.line_total,
          now,
        ]
      );

      insertedSaleLines.push({
        id: saleLineId,
        sale_id: replacementSaleId,
        product_id: sLine.product_id,
        product_name_snapshot: sLine.product_name,
        sku_snapshot: sLine.sku,
        unit_price: sLine.unit_price,
        cost_price_snapshot: sLine.cost_price,
        quantity: sLine.quantity,
        discount: sLine.discount,
        line_total: sLine.line_total,
        created_at: now,
      });
    }

    // 8. Financial Settlement Handling
    let customerBalanceAfter: number | null = null;
    let cashRefunded: number | null = null;
    const insertedPayments: SalePayment[] = [];

    let salePaidAmount = 0;
    let saleChangeAmount = 0;
    let salePaymentStatus: PaymentStatus = 'PAID';

    if (exchangeDiff > 0) {
      // Customer pays positive difference
      const payments = dto.payments ?? [];
      let tenderInputs: Array<{ method: string; amount: number; reference_number: string | null; notes: string | null }> = [];

      if (payments.length > 0) {
        for (const p of payments) {
          const m = normalizePaymentMethod(p.method);
          if (m !== 'CREDIT' && p.amount > 0) {
            tenderInputs.push({
              method: m,
              amount: p.amount,
              reference_number: p.reference_number ?? null,
              notes: p.notes ?? null,
            });
          }
        }
      }

      if (tenderInputs.length === 0) {
        const legacyMethod = normalizePaymentMethod(dto.payment_method ?? 'CASH');
        const rawPaid = dto.paid_amount !== undefined && dto.paid_amount !== null ? Number(dto.paid_amount) : exchangeDiff;
        if (legacyMethod !== 'CREDIT' && rawPaid > 0) {
          tenderInputs.push({
            method: legacyMethod,
            amount: rawPaid,
            reference_number: null,
            notes: dto.notes ?? null,
          });
        }
      }

      const totalTendered = tenderInputs.reduce((sum, t) => sum + t.amount, 0);

      // The returned items cover totalReturnAmount; customer tenders totalTendered towards exchangeDiff
      // Effective total paid on replacement sale is totalReturnAmount + Math.min(totalTendered, exchangeDiff)
      let allocatedDiffTender = Math.min(totalTendered, exchangeDiff);
      salePaidAmount = totalReturnAmount + allocatedDiffTender;

      if (totalTendered >= exchangeDiff) {
        saleChangeAmount = totalTendered - exchangeDiff;
        salePaymentStatus = 'PAID';
      } else {
        salePaymentStatus = totalTendered > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
        const remainingCredit = exchangeDiff - totalTendered;
        if (!customerId) {
          throw new SaleRepoError('Credit sale requires a registered active customer', 400);
        }

        // Debit remaining credit to customer ledger
        const outRes = await client.query(
          'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS bal FROM customer_ledger_entries WHERE customer_id = $1',
          [customerId]
        );
        const currentBal = Number((outRes.rows[0] as Record<string, unknown>)?.['bal'] ?? 0);
        const newBal = currentBal + remainingCredit;
        customerBalanceAfter = newBal;

        await client.query(
          `INSERT INTO customer_ledger_entries (
             id, customer_id, reference_id, reference_number, entry_type, debit, credit,
             balance_after, description, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
          [
            uuidv4(),
            customerId,
            replacementSaleId,
            invoiceNumber,
            remainingCredit,
            newBal,
            `Exchange Difference Credit Sale ${invoiceNumber}`,
            userId ?? null,
            now,
          ]
        );
      }

      // Record payments in sale_payments: 1 for return credit offset (using schema-allowed 'OTHER'), plus actual tenders
      const retOffsetPaymentId = uuidv4();
      await client.query(
        `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
         VALUES ($1, $2, $3, 'OTHER', $4, $5, $6)`,
        [retOffsetPaymentId, replacementSaleId, totalReturnAmount, returnNumber, `Exchange Return Offset: ${returnNumber}`, now]
      );
      insertedPayments.push({
        id: retOffsetPaymentId,
        sale_id: replacementSaleId,
        amount: totalReturnAmount,
        payment_method: 'OTHER',
        reference_number: returnNumber,
        notes: `Exchange Return Offset: ${returnNumber}`,
        created_at: now,
      });

      let remainingDiffAllocation = exchangeDiff;
      for (const tender of tenderInputs) {
        if (remainingDiffAllocation <= 0) break;
        const allocated = Math.min(tender.amount, remainingDiffAllocation);
        if (allocated > 0) {
          const payId = uuidv4();
          await client.query(
            `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [payId, replacementSaleId, allocated, tender.method, tender.reference_number, tender.notes, now]
          );
          insertedPayments.push({
            id: payId,
            sale_id: replacementSaleId,
            amount: allocated,
            payment_method: tender.method,
            reference_number: tender.reference_number,
            notes: tender.notes,
            created_at: now,
          });
          remainingDiffAllocation -= allocated;
        }
      }

      // If CASH was tendered, insert cash_movements IN (with open cash session check)
      const allocatedCash = insertedPayments
        .filter((p) => p.payment_method === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0);

      if (allocatedCash > 0) {
        const sessRes = await client.query(
          "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
          [branchId]
        );
        const openSessionId = ((sessRes.rows[0] as Record<string, unknown>)?.['id'] as string) ?? null;
        if (!openSessionId) {
          throw new SaleRepoError('No open cash session found. Please open a cash session before accepting cash payments.', 400);
        }
        await client.query(
          `INSERT INTO cash_movements (
             id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number,
             payment_method, description, performed_by, created_at
           ) VALUES ($1, $2, $3, 'SALE_PAYMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
          [
            uuidv4(),
            openSessionId,
            branchId,
            allocatedCash,
            replacementSaleId,
            invoiceNumber,
            `Exchange Payment ${invoiceNumber}`,
            userId ?? null,
            now,
          ]
        );
      }
    } else if (exchangeDiff < 0) {
      // Returned value exceeds replacement value => Shop refunds difference
      const refundAmount = Math.abs(exchangeDiff);
      salePaidAmount = totalReplacementAmount;
      salePaymentStatus = 'PAID';

      // Sale is fully covered by return offset (using schema-allowed 'OTHER')
      const retOffsetPaymentId = uuidv4();
      await client.query(
        `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
         VALUES ($1, $2, $3, 'OTHER', $4, $5, $6)`,
        [retOffsetPaymentId, replacementSaleId, totalReplacementAmount, returnNumber, `Exchange Return Offset: ${returnNumber}`, now]
      );
      insertedPayments.push({
        id: retOffsetPaymentId,
        sale_id: replacementSaleId,
        amount: totalReplacementAmount,
        payment_method: 'OTHER',
        reference_number: returnNumber,
        notes: `Exchange Return Offset: ${returnNumber}`,
        created_at: now,
      });

      if (chosenRefundMethod === 'CREDIT' && customerId) {
        const outRes = await client.query(
          'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS bal FROM customer_ledger_entries WHERE customer_id = $1',
          [customerId]
        );
        const currentBal = Number((outRes.rows[0] as Record<string, unknown>)?.['bal'] ?? 0);
        const newBal = currentBal - refundAmount;
        customerBalanceAfter = newBal;

        await client.query(
          `INSERT INTO customer_ledger_entries (
             id, customer_id, reference_id, reference_number, entry_type, debit, credit,
             balance_after, description, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, 'RETURN', 0, $5, $6, $7, $8, $9)`,
          [
            uuidv4(),
            customerId,
            returnId,
            returnNumber,
            refundAmount,
            newBal,
            `Exchange Refund Credit ${returnNumber} (vs ${invoiceNumber})`,
            userId ?? null,
            now,
          ]
        );
      } else if (chosenRefundMethod === 'CASH') {
        cashRefunded = refundAmount;
        const sessRes = await client.query(
          "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
          [branchId]
        );
        const openSessionId = ((sessRes.rows[0] as Record<string, unknown>)?.['id'] as string) ?? null;
        if (!openSessionId) {
          throw new SaleRepoError('No open cash session found. Please open a cash session before issuing cash refund.', 400);
        }
        await client.query(
          `INSERT INTO cash_movements (
             id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number,
             payment_method, description, performed_by, created_at
           ) VALUES ($1, $2, $3, 'RETURN_REFUND', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)`,
          [
            uuidv4(),
            openSessionId,
            branchId,
            refundAmount,
            returnId,
            returnNumber,
            `Exchange Cash Refund ${returnNumber}`,
            userId ?? null,
            now,
          ]
        );
      }
    } else {
      // Balanced Zero difference: replacement fully covered by return offset (using schema-allowed 'OTHER')
      salePaidAmount = totalReplacementAmount;
      salePaymentStatus = 'PAID';

      const retOffsetPaymentId = uuidv4();
      await client.query(
        `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
         VALUES ($1, $2, $3, 'OTHER', $4, $5, $6)`,
        [retOffsetPaymentId, replacementSaleId, totalReplacementAmount, returnNumber, `Exchange Return Offset: ${returnNumber}`, now]
      );
      insertedPayments.push({
        id: retOffsetPaymentId,
        sale_id: replacementSaleId,
        amount: totalReplacementAmount,
        payment_method: 'OTHER',
        reference_number: returnNumber,
        notes: `Exchange Return Offset: ${returnNumber}`,
        created_at: now,
      });
    }

    // 9. Update Replacement Sale Header with final payment fields
    //    (The sales row was inserted early in step 6a with placeholder values;
    //     here we set the actual paid_amount, change_amount and payment_status
    //     now that financial settlement is complete.)
    await client.query(
      `UPDATE sales
         SET paid_amount = $1, change_amount = $2, payment_status = $3, updated_at = $4
         WHERE id = $5`,
      [salePaidAmount, saleChangeAmount, salePaymentStatus, now, replacementSaleId]
    );

    // 10. Record Idempotency Key inside same transaction
    await client.query(
      `INSERT INTO sale_idempotency_keys (idempotency_key, branch_id, sale_id, payload_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [rawIdempotencyKey, branchId, replacementSaleId, incomingHash, now]
    );

    // 11. Commit transaction
    await client.query('COMMIT');

    const createdSale: Sale = {
      id: replacementSaleId,
      invoice_number: invoiceNumber,
      branch_id: branchId,
      customer_id: customerId,
      customer_name_snapshot: customerName,
      subtotal: subtotalReplacement,
      discount: invoiceDiscount,
      tax_amount: 0,
      total_amount: totalReplacementAmount,
      paid_amount: salePaidAmount,
      change_amount: saleChangeAmount,
      payment_status: salePaymentStatus,
      sale_status: 'COMPLETED',
      performed_by: userId ?? null,
      notes: dto.notes ?? `Exchange against return ${returnNumber}`,
      created_at: now,
      updated_at: now,
    };

    const createdReturn: SalesReturn = {
      id: returnId,
      return_number: returnNumber,
      sale_id: dto.original_sale_id,
      branch_id: branchId,
      customer_id: customerId,
      customer_name_snapshot: customerName,
      total_amount: totalReturnAmount,
      refund_method: (chosenRefundMethod ?? 'EXCHANGE') as RefundMethod,
      status: 'COMPLETED',
      reason: dto.reason ?? 'Exchange Return',
      notes: dto.notes ?? null,
      performed_by: userId ?? null,
      created_at: now,
      updated_at: now,
    };

    const settlementType =
      exchangeDiff > 0
        ? 'POSITIVE_COLLECTION'
        : exchangeDiff < 0
        ? 'NEGATIVE_REFUND'
        : 'BALANCED_ZERO';

    return {
      success: true,
      sales_return: createdReturn,
      return_lines: insertedReturnLines,
      replacement_sale: {
        sale: createdSale,
        lines: insertedSaleLines,
        payments: insertedPayments,
        credit_amount: Math.max(totalReplacementAmount - salePaidAmount, 0),
        customer_balance_after: customerBalanceAfter,
        cogs: 0,
        gross_profit: 0,
        gross_margin: 0,
      },
      difference: exchangeDiff,
      settlement_type: settlementType,
      refund_method: chosenRefundMethod,
      cash_refunded: cashRefunded,
      customer_balance_after: customerBalanceAfter,
    };
  } catch (err: unknown) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
    }
    const msg = (err as Error).message || String(err);
    if (
      msg.includes('sale_idempotency_keys') ||
      msg.includes('does not exist') ||
      (err as { code?: string }).code === '42P01'
    ) {
      console.error('[exchange.repo] sale_idempotency_keys table missing. Failing closed.');
      throw new SaleRepoError('Sale service is temporarily unavailable: required idempotency schema has not been applied.', 500);
    }
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}
