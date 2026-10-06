/**
 * Sales Returns PostgreSQL Repository
 * Direct TypeScript port of src-tauri/src/services/sales_return_service.rs.
 * Handles atomic returns, stock restoration, customer ledger adjustments, and cash refunds.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type RefundMethod = 'CASH' | 'CREDIT' | 'ORIGINAL';
export type ReturnStatus = 'COMPLETED' | 'VOIDED';

export interface SalesReturn {
  id: string;
  return_number: string;
  sale_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  total_amount: number;
  refund_method: RefundMethod;
  status: ReturnStatus;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesReturnLine {
  id: string;
  return_id: string;
  sale_line_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price: number;
  quantity: number;
  return_amount: number;
  created_at: string;
}

export interface CreateSalesReturnLineDto {
  sale_line_id: string;
  quantity: number;
}

export interface CreateSalesReturnDto {
  sale_id: string;
  lines: CreateSalesReturnLineDto[];
  refund_method: string;
  reason?: string | null;
  notes?: string | null;
}

export interface SalesReturnResultDto {
  sales_return: SalesReturn;
  lines: SalesReturnLine[];
  customer_balance_after: number | null;
  cash_refunded: number | null;
}

export interface ReturnableLineDto {
  sale_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  original_quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
  unit_price: number;
}

export interface SaleReturnableInfoDto {
  sale_id: string;
  invoice_number: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number;
  lines: ReturnableLineDto[];
}

export interface SalesReturnFilterDto {
  branch_id?: string | null;
  customer_id?: string | null;
  sale_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export class ReturnsRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'ReturnsRepoError';
  }
}

function normalizeRefundMethod(method: string): RefundMethod {
  const m = method.trim().toUpperCase();
  if (m === 'CREDIT') return 'CREDIT';
  if (m === 'CASH') return 'CASH';
  return 'CASH';
}

function getPeriodYYYYMM(): string {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

export async function getSaleReturnableInfo(pool: Pool, saleId: string): Promise<SaleReturnableInfoDto> {
  const saleRes = await pool.query('SELECT * FROM sales WHERE id = $1', [saleId]);
  if (saleRes.rows.length === 0) {
    throw new ReturnsRepoError(`Sale '${saleId}' not found`, 404);
  }
  const sale = saleRes.rows[0] as Record<string, unknown>;

  const linesRes = await pool.query('SELECT * FROM sale_lines WHERE sale_id = $1 ORDER BY id ASC', [saleId]);
  
  const returnableLines: ReturnableLineDto[] = [];
  for (const lineRow of linesRes.rows) {
    const l = lineRow as Record<string, unknown>;
    const lineId = l['id'] as string;
    const origQty = Number(l['quantity'] ?? 0);

    const prevRetRes = await pool.query(
      'SELECT COALESCE(SUM(quantity), 0) AS ret_qty FROM sales_return_lines WHERE sale_line_id = $1',
      [lineId]
    );
    const retQty = Number(prevRetRes.rows[0]?.['ret_qty'] ?? 0);
    const remaining = Math.max(origQty - retQty, 0);

    returnableLines.push({
      sale_line_id: lineId,
      product_id: l['product_id'] as string,
      product_name: l['product_name_snapshot'] as string,
      sku: l['sku_snapshot'] as string,
      original_quantity: origQty,
      returned_quantity: retQty,
      remaining_quantity: remaining,
      unit_price: Number(l['unit_price'] ?? 0),
    });
  }

  return {
    sale_id: sale['id'] as string,
    invoice_number: sale['invoice_number'] as string,
    branch_id: sale['branch_id'] as string,
    customer_id: (sale['customer_id'] as string | null) ?? null,
    customer_name: (sale['customer_name_snapshot'] as string | null) ?? null,
    total_amount: Number(sale['total_amount'] ?? 0),
    lines: returnableLines,
  };
}

export async function createSalesReturn(
  pool: Pool,
  dto: CreateSalesReturnDto,
  userId: string | null
): Promise<SalesReturnResultDto> {
  if (!dto.lines || dto.lines.length === 0) {
    throw new ReturnsRepoError('Cannot process return with no items selected', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch & lock original sale
    const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [dto.sale_id]);
    if (saleRes.rows.length === 0) {
      throw new ReturnsRepoError(`Sale '${dto.sale_id}' not found`, 404);
    }
    const sale = saleRes.rows[0] as Record<string, unknown>;
    const branchId = sale['branch_id'] as string;
    const customerId = (sale['customer_id'] as string | null) ?? null;
    const customerName = (sale['customer_name_snapshot'] as string | null) ?? null;

    // 2. Validate return lines against returnable quantities
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

    for (const lineDto of dto.lines) {
      if (lineDto.quantity <= 0) {
        throw new ReturnsRepoError('Return quantity must be greater than 0', 400);
      }

      const origLineRes = await client.query('SELECT * FROM sale_lines WHERE id = $1 AND sale_id = $2', [
        lineDto.sale_line_id,
        dto.sale_id,
      ]);
      if (origLineRes.rows.length === 0) {
        throw new ReturnsRepoError(`Sale line '${lineDto.sale_line_id}' not found on sale '${dto.sale_id}'`, 404);
      }
      const origLine = origLineRes.rows[0] as Record<string, unknown>;
      const origQty = Number(origLine['quantity'] ?? 0);
      const unitPrice = Number(origLine['unit_price'] ?? 0);
      const costPrice = Number(origLine['cost_price_snapshot'] ?? 0);

      const prevRetRes = await client.query(
        'SELECT COALESCE(SUM(quantity), 0) AS ret_qty FROM sales_return_lines WHERE sale_line_id = $1',
        [lineDto.sale_line_id]
      );
      const prevRetQty = Number(prevRetRes.rows[0]?.['ret_qty'] ?? 0);
      const maxAvailable = origQty - prevRetQty;

      if (lineDto.quantity > maxAvailable) {
        throw new ReturnsRepoError(
          `Cannot return ${lineDto.quantity} units of '${origLine['product_name_snapshot']}': max returnable is ${maxAvailable}`,
          400
        );
      }

      const lineTotal = unitPrice * lineDto.quantity;
      totalReturnAmount += lineTotal;

      preparedReturnLines.push({
        sale_line_id: lineDto.sale_line_id,
        product_id: origLine['product_id'] as string,
        product_name: origLine['product_name_snapshot'] as string,
        sku: origLine['sku_snapshot'] as string,
        unit_price: unitPrice,
        cost_price: costPrice,
        quantity: lineDto.quantity,
        line_total: lineTotal,
      });
    }

    // 3. Generate Return Number (RET-BRANCH-YYYYMM-SEQ)
    const branchCodeRes = await client.query('SELECT code FROM branches WHERE id = $1', [branchId]);
    const branchCode = (branchCodeRes.rows[0]?.['code'] as string) || 'MAIN';
    const period = getPeriodYYYYMM();

    const seqRes = await client.query(
      `INSERT INTO counters (name, value) VALUES ($1, 2)
       ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
       RETURNING value - 1`,
      [`return_seq_${branchId}_${period}`]
    );
    const seqVal = Number(Object.values((seqRes.rows[0] as Record<string, unknown>) ?? {})[0] ?? 1);
    const returnNumber = `RET-${branchCode}-${period}-${String(seqVal).padStart(6, '0')}`;

    const returnId = uuidv4();
    const now = new Date().toISOString();
    const refundMethod = normalizeRefundMethod(dto.refund_method);

    // 4. Insert sales_returns header
    await client.query(
      `INSERT INTO sales_returns (
         id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot,
         total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, $10, $11, $12, $13)`,
      [
        returnId,
        returnNumber,
        dto.sale_id,
        branchId,
        customerId,
        customerName,
        totalReturnAmount,
        refundMethod,
        dto.reason ?? null,
        dto.notes ?? null,
        userId ?? null,
        now,
        now,
      ]
    );

    // 5. Insert sales_return_lines & Restore Stock
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

      // Restore Stock (IN)
      const stockRes = await client.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2', [
        rLine.product_id,
        branchId,
      ]);
      const currentStock = Number((stockRes.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
      const newStock = currentStock + rLine.quantity;

      await client.query(
        'UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4',
        [newStock, now, rLine.product_id, branchId]
      );

      // Insert stock_movements (IN)
      const mvId = uuidv4();
      const reasonStr = `Sales Return ${returnNumber}`;
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock,
           reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)`,
        [mvId, rLine.product_id, branchId, rLine.quantity, currentStock, newStock, reasonStr, userId ?? null, returnId, now]
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

    // 6. Handle Customer Balance & Cash Refunds
    let customerBalanceAfter: number | null = null;
    let cashRefunded: number | null = null;

    if (refundMethod === 'CREDIT' && customerId) {
      const outRes = await client.query(
        'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS bal FROM customer_ledger_entries WHERE customer_id = $1',
        [customerId]
      );
      const currentBal = Number((outRes.rows[0] as Record<string, unknown>)?.['bal'] ?? 0);
      const newBal = currentBal - totalReturnAmount;
      customerBalanceAfter = newBal;

      const ledgerId = uuidv4();
      const desc = `Sales Return Refund ${returnNumber}`;
      await client.query(
        `INSERT INTO customer_ledger_entries (
           id, customer_id, reference_id, reference_number, entry_type, debit, credit,
           balance_after, description, performed_by, created_at
         ) VALUES ($1, $2, $3, $4, 'RETURN', 0, $5, $6, $7, $8, $9)`,
        [ledgerId, customerId, returnId, returnNumber, totalReturnAmount, newBal, desc, userId ?? null, now]
      );
    } else if (refundMethod === 'CASH') {
      cashRefunded = totalReturnAmount;
      const openSessRes = await client.query(
        "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
        [branchId]
      );
      const sessionId = ((openSessRes.rows[0] as Record<string, unknown>)?.['id'] as string) ?? null;

      const cashMvId = uuidv4();
      const desc = `Sales Return Cash Refund ${returnNumber}`;
      await client.query(
        `INSERT INTO cash_movements (
           id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number,
           payment_method, description, performed_by, created_at
         ) VALUES ($1, $2, $3, 'RETURN_REFUND', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)`,
        [cashMvId, sessionId, branchId, totalReturnAmount, returnId, returnNumber, desc, userId ?? null, now]
      );
    }

    await client.query('COMMIT');

    const salesReturn: SalesReturn = {
      id: returnId,
      return_number: returnNumber,
      sale_id: dto.sale_id,
      branch_id: branchId,
      customer_id: customerId,
      customer_name_snapshot: customerName,
      total_amount: totalReturnAmount,
      refund_method: refundMethod,
      status: 'COMPLETED',
      reason: dto.reason ?? null,
      notes: dto.notes ?? null,
      performed_by: userId ?? null,
      created_at: now,
      updated_at: now,
    };

    return {
      sales_return: salesReturn,
      lines: insertedReturnLines,
      customer_balance_after: customerBalanceAfter,
      cash_refunded: cashRefunded,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listSalesReturns(
  pool: Pool,
  filter?: SalesReturnFilterDto
): Promise<SalesReturn[]> {
  let query = 'SELECT * FROM sales_returns WHERE 1=1';
  const params: unknown[] = [];
  let pIdx = 1;

  if (filter?.branch_id) {
    query += ` AND branch_id = $${pIdx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.customer_id) {
    query += ` AND customer_id = $${pIdx++}`;
    params.push(filter.customer_id);
  }
  if (filter?.sale_id) {
    query += ` AND sale_id = $${pIdx++}`;
    params.push(filter.sale_id);
  }
  if (filter?.start_date) {
    query += ` AND created_at >= $${pIdx++}`;
    params.push(filter.start_date);
  }
  if (filter?.end_date) {
    query += ` AND created_at <= $${pIdx++}`;
    params.push(filter.end_date);
  }

  query += ' ORDER BY created_at DESC LIMIT ' + (filter?.limit ?? 50);

  const res = await pool.query(query, params);
  return res.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row['id'] as string,
      return_number: row['return_number'] as string,
      sale_id: row['sale_id'] as string,
      branch_id: row['branch_id'] as string,
      customer_id: (row['customer_id'] as string | null) ?? null,
      customer_name_snapshot: (row['customer_name_snapshot'] as string | null) ?? null,
      total_amount: Number(row['total_amount'] ?? 0),
      refund_method: (row['refund_method'] as RefundMethod) ?? 'CASH',
      status: (row['status'] as ReturnStatus) ?? 'COMPLETED',
      reason: (row['reason'] as string | null) ?? null,
      notes: (row['notes'] as string | null) ?? null,
      performed_by: (row['performed_by'] as string | null) ?? null,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
    };
  });
}
