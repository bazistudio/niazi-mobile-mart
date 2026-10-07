/**
 * Sales PostgreSQL Repository
 * Direct TypeScript port of src-tauri/src/repositories/postgres_sale_repo.rs.
 * DO NOT change business logic, calculations, or schema.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
export type SaleStatus = 'COMPLETED' | 'VOIDED' | 'REFUNDED';

export interface Sale {
  id: string;
  invoice_number: string;
  branch_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_status: PaymentStatus;
  sale_status: SaleStatus;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price: number;
  cost_price_snapshot: number;
  quantity: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface SaleResultDto {
  sale: Sale;
  lines: SaleLine[];
  payments: SalePayment[];
  credit_amount: number;
  customer_balance_after: number | null;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface SaleItemDto {
  product_id: string;
  quantity: number;
  unit_price?: number;
  price?: number;
  discount?: number;
}

export interface SalePaymentInputDto {
  method: string;
  amount: number;
  reference_number?: string | null;
  notes?: string | null;
}

export interface CompleteSaleDto {
  branch_id?: string | null;
  terminal_id?: string | null;
  customer_id?: string | null;
  items: SaleItemDto[];
  discount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  payments?: SalePaymentInputDto[] | null;
  notes?: string | null;
}

export interface SaleFilterDto {
  customer_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  sale_status?: string | null;
  search?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ─── Error Class ──────────────────────────────────────────────────────────────

export class SaleRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'SaleRepoError';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mirrors normalize_payment_method() in src-tauri/src/domain/sales.rs.
 */
function normalizePaymentMethod(method: string): string {
  if (!method) return 'CASH';
  const m = method.trim().toUpperCase();
  if (m === 'CASH') return 'CASH';
  if (m === 'CARD' || m === 'DEBIT_CARD' || m === 'CREDIT_CARD' || m === 'CARD_PAYMENT') return 'CARD';
  if (m === 'BANK' || m === 'BANK_TRANSFER' || m === 'BANK TRANSFER') return 'BANK_TRANSFER';
  if (m === 'EASYPAISA') return 'EASYPAISA';
  if (m === 'JAZZCASH') return 'JAZZCASH';
  if (
    m === 'CREDIT' ||
    m === 'DEBT' ||
    m === 'DEBIT' ||
    m === 'UDHAR' ||
    m === 'CUSTOMER_CREDIT' ||
    m === 'ON_ACCOUNT' ||
    m === 'DUE' ||
    m === 'CUSTOMER_LEDGER' ||
    m === 'RECEIVABLE'
  ) {
    return 'CREDIT';
  }
  return m || 'CASH';
}

/**
 * Returns current period as YYYYMM in PKT (UTC+5) timezone.
 * Mirrors chrono::FixedOffset::east_opt(5 * 3600) usage in postgres_sale_repo.rs.
 */
function getPeriodYYYYMM(): string {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Maps a pg query row to Sale.
 */
function mapSaleRow(row: Record<string, unknown>): Sale {
  const paymentStatusRaw = String(row['payment_status'] ?? 'PAID');
  const saleStatusRaw = String(row['sale_status'] ?? 'COMPLETED');

  const validPaymentStatuses: PaymentStatus[] = ['PAID', 'PARTIALLY_PAID', 'UNPAID'];
  const validSaleStatuses: SaleStatus[] = ['COMPLETED', 'VOIDED', 'REFUNDED'];

  const payment_status: PaymentStatus = validPaymentStatuses.includes(paymentStatusRaw as PaymentStatus)
    ? (paymentStatusRaw as PaymentStatus)
    : 'PAID';
  const sale_status: SaleStatus = validSaleStatuses.includes(saleStatusRaw as SaleStatus)
    ? (saleStatusRaw as SaleStatus)
    : 'COMPLETED';

  return {
    id: row['id'] as string,
    invoice_number: row['invoice_number'] as string,
    branch_id: row['branch_id'] as string,
    customer_id: (row['customer_id'] as string | null) ?? null,
    customer_name_snapshot: (row['customer_name_snapshot'] as string | null) ?? null,
    subtotal: Number(row['subtotal'] ?? 0),
    discount: Number(row['discount'] ?? 0),
    tax_amount: Number(row['tax_amount'] ?? 0),
    total_amount: Number(row['total_amount'] ?? 0),
    paid_amount: Number(row['paid_amount'] ?? 0),
    change_amount: Number(row['change_amount'] ?? 0),
    payment_status,
    sale_status,
    performed_by: (row['performed_by'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

// ─── Transaction Implementation ───────────────────────────────────────────────

/**
 * Core sale transaction logic.
 * Mirrors PostgresSaleRepository::complete_sale_tx() in postgres_sale_repo.rs exactly.
 * Uses an already-acquired PoolClient; caller manages BEGIN/COMMIT/ROLLBACK.
 */
export async function completeSaleTx(
  client: PoolClient,
  dto: CompleteSaleDto,
  userId: string | null,
  saleIdOverride?: string | null
): Promise<SaleResultDto> {
  // Step 1: Empty cart check
  if (!dto.items || dto.items.length === 0) {
    throw new SaleRepoError('Cannot complete sale with empty cart', 400);
  }

  // Step 2: Resolve Branch ID
  let branchId: string;
  const rawBranchId = dto.branch_id?.trim();
  if (rawBranchId && rawBranchId.length > 0) {
    branchId = rawBranchId;
  } else {
    const branchRow = await client.query(
      "SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1"
    );
    branchId = (branchRow.rows[0]?.id as string) ?? DEFAULT_MAIN_BRANCH_ID;
  }

  // Step 3: Validate Customer if provided
  let customerOpt: { id: string; name: string; credit_limit: number } | null = null;
  const rawCustomerId = dto.customer_id?.trim();
  if (rawCustomerId && rawCustomerId.length > 0 && rawCustomerId !== 'walk-in') {
    const custRow = await client.query(
      'SELECT id, name, credit_limit, is_active FROM customers WHERE id = $1',
      [rawCustomerId]
    );
    if (custRow.rows.length === 0) {
      throw new SaleRepoError(`Customer '${rawCustomerId}' not found`, 404);
    }
    const cust = custRow.rows[0] as Record<string, unknown>;
    const isActive = Number(cust['is_active'] ?? 1);
    if (isActive !== 1) {
      throw new SaleRepoError(
        `Customer '${cust['name']}' is inactive. Cannot complete sale.`,
        400
      );
    }
    customerOpt = {
      id: cust['id'] as string,
      name: cust['name'] as string,
      credit_limit: Number(cust['credit_limit'] ?? 0),
    };
  }

  // Step 4: Resolve Product details & Authoritative Pricing
  interface PreparedLine {
    product_id: string;
    product_name: string;
    sku: string;
    unit_price: number;
    cost_price: number;
    quantity: number;
    discount: number;
    line_total: number;
  }

  const preparedLines: PreparedLine[] = [];

  for (const item of dto.items) {
    if (item.quantity <= 0) {
      throw new SaleRepoError('Item quantity must be greater than 0', 400);
    }

    const prodRow = await client.query(
      'SELECT id, name, sku, purchase_price, average_cost, sale_price, is_active FROM products WHERE id = $1',
      [item.product_id]
    );

    if (prodRow.rows.length === 0) {
      throw new SaleRepoError(`Product '${item.product_id}' not found`, 404);
    }

    const prod = prodRow.rows[0] as Record<string, unknown>;
    const isActive = Number(prod['is_active'] ?? 1);
    if (isActive !== 1) {
      throw new SaleRepoError(
        `Product '${prod['name']}' is inactive. Cannot complete sale.`,
        400
      );
    }

    const salePrice = Number(prod['sale_price'] ?? 0);
    const purchasePrice = Number(prod['purchase_price'] ?? 0);
    const avgCost = Number(prod['average_cost'] ?? 0);
    let costPrice = avgCost > 0 ? avgCost : purchasePrice;
    if (purchasePrice > 0 && avgCost > purchasePrice * 3) {
      costPrice = purchasePrice;
    }

    const lineDisc = Math.max(Number(item.discount ?? 0), 0);
    const subtotalLine = salePrice * item.quantity;
    const lineTotal = Math.max(subtotalLine - lineDisc, 0);

    preparedLines.push({
      product_id: prod['id'] as string,
      product_name: prod['name'] as string,
      sku: prod['sku'] as string,
      unit_price: salePrice,
      cost_price: costPrice,
      quantity: item.quantity,
      discount: lineDisc,
      line_total: lineTotal,
    });
  }

  // Step 5: Calculate Authoritative Totals
  const subtotal = preparedLines.reduce((sum, l) => sum + l.line_total, 0);
  const invoiceDiscount = Math.max(Number(dto.discount ?? 0), 0);
  const totalAmount = Math.max(subtotal - invoiceDiscount, 0);

  // Step 6: Normalize Payment inputs
  interface TenderInput {
    method: string;
    amount: number;
    reference_number: string | null;
    notes: string | null;
  }

  const tenderInputs: TenderInput[] = [];

  if (dto.payments && dto.payments.length > 0) {
    for (const p of dto.payments) {
      const normalized = normalizePaymentMethod(p.method);
      if (normalized !== 'CREDIT' && p.amount > 0) {
        tenderInputs.push({
          method: normalized,
          amount: p.amount,
          reference_number: p.reference_number ?? null,
          notes: p.notes ?? null,
        });
      }
    }
  }

  // Legacy fallback: single paid_amount + payment_method
  if (tenderInputs.length === 0) {
    const legacyMethod = normalizePaymentMethod(dto.payment_method ?? 'CASH');
    let rawPaid: number;
    if (dto.paid_amount !== undefined && dto.paid_amount !== null && !isNaN(Number(dto.paid_amount))) {
      const val = Number(dto.paid_amount);
      if (val === 0 && legacyMethod !== 'CREDIT' && customerOpt === null) {
        // Walk-in customer non-credit sale defaults to full payment
        rawPaid = totalAmount;
      } else {
        rawPaid = val;
      }
    } else {
      rawPaid = legacyMethod === 'CREDIT' ? 0 : totalAmount;
    }
    const legacyAmount = Math.max(rawPaid, 0);
    if (legacyMethod !== 'CREDIT' && legacyAmount > 0) {
      tenderInputs.push({
        method: legacyMethod,
        amount: legacyAmount,
        reference_number: null,
        notes: dto.notes ?? null,
      });
    }
  }

  const totalTendered = tenderInputs.reduce((sum, t) => sum + t.amount, 0);

  // Step 7: Determine payment status
  let recordedPaid: number;
  let changeAmount: number;
  let creditAmount: number;
  let paymentStatus: PaymentStatus;

  if (totalTendered >= totalAmount) {
    const change = totalTendered - totalAmount;
    recordedPaid = totalAmount;
    changeAmount = change;
    creditAmount = 0;
    paymentStatus = 'PAID';
  } else {
    const credit = totalAmount - totalTendered;
    recordedPaid = totalTendered;
    changeAmount = 0;
    creditAmount = credit;
    paymentStatus = totalTendered > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
  }

  // Step 8: Enforce credit sale constraint
  if (creditAmount > 0 && customerOpt === null) {
    throw new SaleRepoError(
      'Credit sales require a registered active customer. Walk-in customers cannot make credit purchases.',
      400
    );
  }

  const customerId = customerOpt?.id ?? null;
  const customerNameSnapshot = customerOpt?.name ?? null;
  const customerCreditLimit = customerOpt?.credit_limit ?? 0;

  const now = new Date().toISOString();
  const uid = userId ?? null;

  // Step 9: Validate stock availability for all lines (FOR UPDATE lock)
  for (const line of preparedLines) {
    const stockRow = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
      [line.product_id, branchId]
    );
    const currentStock = Number((stockRow.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);

    if (currentStock < line.quantity) {
      throw new SaleRepoError(
        `Insufficient stock for product '${line.product_name}': available ${currentStock}, requested ${line.quantity}`,
        400
      );
    }
  }

  // Step 10: Generate User-Scoped Invoice Number (Requirement 11 & 12)
  const branchCodeRow = await client.query(
    'SELECT code FROM branches WHERE id = $1',
    [branchId]
  );
  const branchCode: string = (branchCodeRow.rows[0] as Record<string, unknown>)?.['code'] as string ?? 'MAIN';

  // Ensure user_invoice_counters table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_invoice_counters (
      branch_id UUID NOT NULL,
      user_id UUID NOT NULL,
      period_yyyymm VARCHAR(10) NOT NULL,
      next_value BIGINT NOT NULL DEFAULT 1,
      PRIMARY KEY (branch_id, user_id, period_yyyymm)
    )
  `);

  const effectiveUserId = userId || '00000000-0000-0000-0000-000000000001';
  
  // Resolve User Short Code (e.g. U01, U17)
  let userCode = 'U01';
  if (userId && userId !== '00000000-0000-0000-0000-000000000001') {
    try {
      const userRow = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [userId]
      );
      if (userRow.rows.length > 0) {
        const shortHex = userId.replace(/-/g, '').slice(-2).toUpperCase();
        userCode = `U${shortHex}`;
      }
    } catch {
      const shortHex = userId.replace(/-/g, '').slice(-2).toUpperCase();
      userCode = `U${shortHex}`;
    }
  }

  const periodYYYYMM = getPeriodYYYYMM();

  const seqRow = await client.query(
    `INSERT INTO user_invoice_counters (branch_id, user_id, period_yyyymm, next_value)
     VALUES ($1, $2, $3, 2)
     ON CONFLICT (branch_id, user_id, period_yyyymm)
     DO UPDATE SET next_value = user_invoice_counters.next_value + 1
     RETURNING next_value - 1`,
    [branchId, effectiveUserId, periodYYYYMM]
  );
  const seqRowData = seqRow.rows[0] as Record<string, unknown>;
  const seqValue = Number(Object.values(seqRowData)[0]);
  const invoiceNumber = `${branchCode}-${userCode}-${periodYYYYMM}-${String(seqValue).padStart(6, '0')}`;

  const saleId =
    saleIdOverride?.trim()
      ? saleIdOverride.trim()
      : uuidv4();

  // Step 11: Handle Customer Credit & Ledger Entry
  let customerBalanceAfter: number | null = null;
  if (creditAmount > 0) {
    const cid = customerId!;
    const outstandingRow = await client.query(
      'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT FROM customer_ledger_entries WHERE customer_id = $1',
      [cid]
    );
    const outstandingData = outstandingRow.rows[0] as Record<string, unknown>;
    const currentOutstanding = Number(Object.values(outstandingData)[0] ?? 0);

    if (customerCreditLimit > 0) {
      const potentialOutstanding = currentOutstanding + creditAmount;
      if (potentialOutstanding > customerCreditLimit) {
        throw new SaleRepoError(
          `Credit limit exceeded: current outstanding Rs ${currentOutstanding}, new credit Rs ${creditAmount}, credit limit Rs ${customerCreditLimit}`,
          400
        );
      }
    }

    const newBalance = currentOutstanding + creditAmount;
    customerBalanceAfter = newBalance;
    const ledgerId = uuidv4();
    const desc = `Credit Sale ${invoiceNumber}`;

    await client.query(
      `INSERT INTO customer_ledger_entries (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
      [ledgerId, cid, saleId, invoiceNumber, creditAmount, newBalance, desc, uid, now]
    );
  }

  // Step 12: Insert Sale Header
  await client.query(
    `INSERT INTO sales (
       id, invoice_number, branch_id, customer_id, customer_name_snapshot,
       subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
       payment_status, sale_status, performed_by, notes, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      saleId, invoiceNumber, branchId, customerId, customerNameSnapshot,
      subtotal, invoiceDiscount, 0, totalAmount, recordedPaid, changeAmount,
      paymentStatus, 'COMPLETED', uid, dto.notes ?? null, now, now,
    ]
  );

  const sale: Sale = {
    id: saleId,
    invoice_number: invoiceNumber,
    branch_id: branchId,
    customer_id: customerId,
    customer_name_snapshot: customerNameSnapshot,
    subtotal,
    discount: invoiceDiscount,
    tax_amount: 0,
    total_amount: totalAmount,
    paid_amount: recordedPaid,
    change_amount: changeAmount,
    payment_status: paymentStatus,
    sale_status: 'COMPLETED',
    performed_by: uid,
    notes: dto.notes ?? null,
    created_at: now,
    updated_at: now,
  };

  // Step 13: Insert Sale Lines & Deduct Stock
  const insertedLines: SaleLine[] = [];

  for (const line of preparedLines) {
    const lineId = uuidv4();

    await client.query(
      `INSERT INTO sale_lines (
         id, sale_id, product_id, product_name_snapshot, sku_snapshot,
         unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [lineId, saleId, line.product_id, line.product_name, line.sku,
       line.unit_price, line.cost_price, line.quantity, line.discount, line.line_total, now]
    );

    const currentStockRow = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
      [line.product_id, branchId]
    );
    const currentStock = Number((currentStockRow.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
    const newStock = currentStock - line.quantity;

    await client.query(
      'UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4',
      [newStock, now, line.product_id, branchId]
    );

    const movementId = uuidv4();
    const reason = `Sale Checkout ${invoiceNumber}`;

    await client.query(
      `INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
       VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)`,
      [movementId, line.product_id, branchId, line.quantity, currentStock, newStock, reason, uid, saleId, now]
    );

    insertedLines.push({
      id: lineId,
      sale_id: saleId,
      product_id: line.product_id,
      product_name_snapshot: line.product_name,
      sku_snapshot: line.sku,
      unit_price: line.unit_price,
      cost_price_snapshot: line.cost_price,
      quantity: line.quantity,
      discount: line.discount,
      line_total: line.line_total,
      created_at: now,
    });
  }

  // Step 14: Insert Sale Payments (Clamped to total_amount)
  const salePayments: SalePayment[] = [];
  let remainingAllocation = totalAmount;

  for (const tender of tenderInputs) {
    if (remainingAllocation === 0) break;
    const allocated = Math.min(tender.amount, remainingAllocation);
    if (allocated > 0) {
      const paymentId = uuidv4();
      await client.query(
        `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [paymentId, saleId, allocated, tender.method, tender.reference_number, tender.notes, now]
      );
      salePayments.push({
        id: paymentId,
        sale_id: saleId,
        amount: allocated,
        payment_method: tender.method,
        reference_number: tender.reference_number,
        notes: tender.notes,
        created_at: now,
      });
      remainingAllocation -= allocated;
    }
  }

  // Step 15: Record Cash Movement for CASH portion
  const allocatedCash = salePayments
    .filter((p) => p.payment_method === 'CASH')
    .reduce((sum, p) => sum + p.amount, 0);

  if (allocatedCash > 0) {
    const openSessionRow = await client.query(
      "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
      [branchId]
    );
    const openSessionId: string | null = ((openSessionRow.rows[0] as Record<string, unknown>)?.['id'] as string) ?? null;
    const cashMvId = uuidv4();
    const desc = `Retail Sale Payment ${invoiceNumber}`;

    await client.query(
      `INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
       VALUES ($1, $2, $3, 'SALE_PAYMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
      [cashMvId, openSessionId, branchId, allocatedCash, saleId, invoiceNumber, desc, uid, now]
    );
  }

  const finalCreditAmount = Math.max(sale.total_amount - sale.paid_amount, 0);

  return {
    sale,
    lines: insertedLines,
    payments: salePayments,
    credit_amount: finalCreditAmount,
    customer_balance_after: customerBalanceAfter,
    cogs: 0,
    gross_profit: 0,
    gross_margin: 0,
  };
}

// ─── Public Repository Functions ──────────────────────────────────────────────

export async function completeSale(
  pool: Pool,
  dto: CompleteSaleDto,
  userId: string | null
): Promise<SaleResultDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await completeSaleTx(client, dto, userId);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getSaleById(pool: Pool, id: string): Promise<Sale | null> {
  const sql = `SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                      subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                      payment_status, sale_status, performed_by, notes, created_at, updated_at
               FROM sales WHERE id = $1`;
  const result = await pool.query(sql, [id]);
  if (result.rows.length === 0) return null;
  return mapSaleRow(result.rows[0] as Record<string, unknown>);
}

export async function getSaleByInvoice(pool: Pool, invoiceNumber: string): Promise<Sale | null> {
  const sql = `SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                      subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                      payment_status, sale_status, performed_by, notes, created_at, updated_at
               FROM sales WHERE invoice_number = $1`;
  const result = await pool.query(sql, [invoiceNumber.trim()]);
  if (result.rows.length === 0) return null;
  return mapSaleRow(result.rows[0] as Record<string, unknown>);
}

export async function getSaleLines(pool: Pool, saleId: string): Promise<SaleLine[]> {
  const sql = `SELECT id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                      unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
               FROM sale_lines WHERE sale_id = $1 ORDER BY created_at ASC, id ASC`;
  const result = await pool.query(sql, [saleId]);
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r['id'] as string,
      sale_id: r['sale_id'] as string,
      product_id: r['product_id'] as string,
      product_name_snapshot: r['product_name_snapshot'] as string,
      sku_snapshot: r['sku_snapshot'] as string,
      unit_price: Number(r['unit_price']),
      cost_price_snapshot: Number(r['cost_price_snapshot']),
      quantity: Number(r['quantity']),
      discount: Number(r['discount']),
      line_total: Number(r['line_total']),
      created_at: r['created_at'] as string,
    };
  });
}

export async function getSalePayments(pool: Pool, saleId: string): Promise<SalePayment[]> {
  const sql = `SELECT id, sale_id, amount, payment_method, reference_number, notes, created_at
               FROM sale_payments WHERE sale_id = $1 ORDER BY created_at ASC, id ASC`;
  const result = await pool.query(sql, [saleId]);
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r['id'] as string,
      sale_id: r['sale_id'] as string,
      amount: Number(r['amount']),
      payment_method: r['payment_method'] as string,
      reference_number: (r['reference_number'] as string | null) ?? null,
      notes: (r['notes'] as string | null) ?? null,
      created_at: r['created_at'] as string,
    };
  });
}

function parseLocalDateStart(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).toISOString();
  }
  return dateStr;
}

function parseLocalDateEnd(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).toISOString();
  }
  return dateStr;
}

export async function listSales(pool: Pool, filter?: SaleFilterDto | null): Promise<Sale[]> {
  let query = `SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                      subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                      payment_status, sale_status, performed_by, notes, created_at, updated_at
               FROM sales WHERE 1=1`;

  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter?.customer_id) {
    query += ` AND customer_id = $${paramIndex++}`;
    params.push(filter.customer_id);
  }
  if (filter?.branch_id) {
    query += ` AND branch_id = $${paramIndex++}`;
    params.push(filter.branch_id);
  }
  if (filter?.payment_status) {
    query += ` AND payment_status = $${paramIndex++}`;
    params.push(filter.payment_status);
  }
  if (filter?.sale_status) {
    query += ` AND sale_status = $${paramIndex++}`;
    params.push(filter.sale_status);
  }
  if (filter?.search && filter.search.trim()) {
    const term = `%${filter.search.trim()}%`;
    query += ` AND (invoice_number ILIKE $${paramIndex} OR customer_name_snapshot ILIKE $${paramIndex} OR notes ILIKE $${paramIndex})`;
    paramIndex++;
    params.push(term);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    query += ` AND created_at >= $${paramIndex++}`;
    params.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    query += ` AND created_at <= $${paramIndex++}`;
    params.push(eDate);
  }

  query += ' ORDER BY created_at DESC, id DESC';

  const lim = filter?.limit ?? 50;
  query += ` LIMIT ${lim}`;

  if (filter?.offset != null) {
    query += ` OFFSET ${filter.offset}`;
  }

  const result = await pool.query(query, params);
  return result.rows.map((row) => mapSaleRow(row as Record<string, unknown>));
}
