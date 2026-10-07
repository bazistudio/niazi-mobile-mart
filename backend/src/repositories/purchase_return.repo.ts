/**
 * Purchase Returns PostgreSQL Repository — TypeScript (Phase 5B migration)
 * Direct 1-to-1 port of src-tauri/src/repositories/postgres_purchase_return_repo.rs.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type PurchaseSettlementMethod = 'CREDIT' | 'CASH';
export type PurchaseReturnStatus = 'COMPLETED' | 'VOIDED';

export interface PurchaseReturn {
  id: string;
  return_number: string;
  purchase_id: string;
  branch_id: string;
  supplier_id: string;
  supplier_name_snapshot: string | null;
  total_amount: number;
  settlement_method: PurchaseSettlementMethod;
  status: PurchaseReturnStatus;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReturnLine {
  id: string;
  return_id: string;
  purchase_line_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_cost: number;
  quantity: number;
  return_amount: number;
  created_at: string;
}

export interface CreatePurchaseReturnLineDto {
  purchase_line_id: string;
  quantity: number;
}

export interface CreatePurchaseReturnDto {
  purchase_id: string;
  lines: CreatePurchaseReturnLineDto[];
  settlement_method?: PurchaseSettlementMethod | null;
  reason?: string | null;
  notes?: string | null;
}

export interface PurchaseReturnDetailDto {
  return_record: PurchaseReturn;
  lines: PurchaseReturnLine[];
  supplier_balance_after: number | null;
}

export class PurchaseReturnRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'PurchaseReturnRepoError';
  }
}

export async function createPurchaseReturnTx(
  client: PoolClient,
  dto: CreatePurchaseReturnDto,
  userId: string | null,
  returnIdOverride?: string | null
): Promise<PurchaseReturnDetailDto> {
  if (!dto.lines || dto.lines.length === 0) {
    throw new PurchaseReturnRepoError('Return must contain at least one line item', 400);
  }

  const purRow = await client.query('SELECT * FROM purchases WHERE id = $1', [dto.purchase_id]);
  if (purRow.rows.length === 0) {
    throw new PurchaseReturnRepoError(`Purchase order '${dto.purchase_id}' not found`, 404);
  }

  const pur = purRow.rows[0] as Record<string, unknown>;
  const purchaseId = pur['id'] as string;
  const branchId = pur['branch_id'] as string;
  const supplierId = pur['supplier_id'] as string;

  const suppRow = await client.query('SELECT name FROM suppliers WHERE id = $1', [supplierId]);
  const supplierName = (suppRow.rows[0] as Record<string, unknown>)?.['name'] as string | null ?? null;

  interface PreparedReturnLine {
    purchase_line_id: string;
    product_id: string;
    product_name_snapshot: string;
    sku_snapshot: string;
    unit_cost: number;
    quantity: number;
    return_amount: number;
  }

  const preparedLines: PreparedReturnLine[] = [];
  let totalReturnAmount = 0;

  for (const item of dto.lines) {
    if (item.quantity <= 0) {
      throw new PurchaseReturnRepoError('Return quantity must be > 0', 400);
    }

    const lineRow = await client.query(
      'SELECT * FROM purchase_lines WHERE id = $1 AND purchase_id = $2',
      [item.purchase_line_id, purchaseId]
    );
    if (lineRow.rows.length === 0) {
      throw new PurchaseReturnRepoError(`Purchase line '${item.purchase_line_id}' not found`, 404);
    }

    const pline = lineRow.rows[0] as Record<string, unknown>;
    const origQty = Number(pline['quantity'] ?? 0);

    const prevReturnedRow = await client.query(
      "SELECT COALESCE(SUM(prl.quantity), 0)::BIGINT AS returned_qty FROM purchase_return_lines prl JOIN purchase_returns pr ON pr.id = prl.return_id WHERE prl.purchase_line_id = $1 AND pr.status = 'COMPLETED'",
      [item.purchase_line_id]
    );
    const prevReturned = Number((prevReturnedRow.rows[0] as Record<string, unknown>)?.['returned_qty'] ?? 0);
    const availableToReturn = origQty - prevReturned;

    if (item.quantity > availableToReturn) {
      throw new PurchaseReturnRepoError(
        `Cannot return ${item.quantity} units for line '${item.purchase_line_id}': only ${availableToReturn} available to return (${origQty} original, ${prevReturned} already returned)`,
        400
      );
    }

    const unitCost = Number(pline['unit_cost'] ?? 0);
    const lineTotal = unitCost * item.quantity;
    totalReturnAmount += lineTotal;

    preparedLines.push({
      purchase_line_id: item.purchase_line_id,
      product_id: pline['product_id'] as string,
      product_name_snapshot: pline['product_name_snapshot'] as string,
      sku_snapshot: pline['sku_snapshot'] as string,
      unit_cost: unitCost,
      quantity: item.quantity,
      return_amount: lineTotal,
    });
  }

  // Counter
  await client.query(`
    CREATE TABLE IF NOT EXISTS counters (
      name VARCHAR(50) PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    INSERT INTO counters (name, value) VALUES ('purchase_return_number', 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
  `);

  const counterRes = await client.query("SELECT value FROM counters WHERE name = 'purchase_return_number'");
  const counterVal = Number(counterRes.rows[0]?.['value'] ?? 1);
  const returnNumber = `PRET-${String(counterVal).padStart(6, '0')}`;
  const returnId = returnIdOverride?.trim() ? returnIdOverride.trim() : uuidv4();
  const now = new Date().toISOString();
  const settlementMethod = dto.settlement_method ?? 'CREDIT';

  const purchaseReturn: PurchaseReturn = {
    id: returnId,
    return_number: returnNumber,
    purchase_id: purchaseId,
    branch_id: branchId,
    supplier_id: supplierId,
    supplier_name_snapshot: supplierName,
    total_amount: totalReturnAmount,
    settlement_method: settlementMethod,
    status: 'COMPLETED',
    reason: dto.reason ?? null,
    notes: dto.notes ?? null,
    performed_by: userId,
    created_at: now,
    updated_at: now,
  };

  await client.query(
    `INSERT INTO purchase_returns (
      id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot,
      total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      purchaseReturn.id,
      purchaseReturn.return_number,
      purchaseReturn.purchase_id,
      purchaseReturn.branch_id,
      purchaseReturn.supplier_id,
      purchaseReturn.supplier_name_snapshot,
      purchaseReturn.total_amount,
      purchaseReturn.settlement_method,
      purchaseReturn.status,
      purchaseReturn.reason,
      purchaseReturn.notes,
      purchaseReturn.performed_by,
      purchaseReturn.created_at,
      purchaseReturn.updated_at,
    ]
  );

  const insertedLines: PurchaseReturnLine[] = [];

  for (const line of preparedLines) {
    const lineId = uuidv4();
    const prline: PurchaseReturnLine = {
      id: lineId,
      return_id: returnId,
      purchase_line_id: line.purchase_line_id,
      product_id: line.product_id,
      product_name_snapshot: line.product_name_snapshot,
      sku_snapshot: line.sku_snapshot,
      unit_cost: line.unit_cost,
      quantity: line.quantity,
      return_amount: line.return_amount,
      created_at: now,
    };

    await client.query(
      `INSERT INTO purchase_return_lines (
        id, return_id, purchase_line_id, product_id, product_name_snapshot,
        sku_snapshot, unit_cost, quantity, return_amount, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        prline.id,
        prline.return_id,
        prline.purchase_line_id,
        prline.product_id,
        prline.product_name_snapshot,
        prline.sku_snapshot,
        prline.unit_cost,
        prline.quantity,
        prline.return_amount,
        prline.created_at,
      ]
    );

    // Stock deduction
    const stockRow = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
      [line.product_id, branchId]
    );
    const currentStock = Number((stockRow.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
    const newStock = Math.max(currentStock - line.quantity, 0);

    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
      [line.product_id, branchId, newStock, now]
    );

    // Movement
    const movementId = uuidv4();
    const reason = `Purchase Return ${returnNumber}`;

    await client.query(
      `INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
       VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)`,
      [
        movementId,
        line.product_id,
        branchId,
        line.quantity,
        currentStock,
        newStock,
        reason,
        userId,
        returnId,
        now,
      ]
    );

    insertedLines.push(prline);
  }

  // Supplier Ledger Entry
  let supplierBalanceAfter: number | null = null;
  if (settlementMethod === 'CREDIT' && totalReturnAmount > 0) {
    const outstandingRow = await client.query(
      'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance FROM supplier_ledger_entries WHERE supplier_id = $1',
      [supplierId]
    );
    const currentOutstanding = Number((outstandingRow.rows[0] as Record<string, unknown>)?.['balance'] ?? 0);
    const newBal = currentOutstanding - totalReturnAmount;
    supplierBalanceAfter = newBal;

    const ledgerId = uuidv4();
    const desc = `Purchase Return ${returnNumber}`;

    await client.query(
      `INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'RETURN', 0, $5, $6, $7, $8, $9)`,
      [
        ledgerId,
        supplierId,
        returnId,
        returnNumber,
        totalReturnAmount,
        newBal,
        desc,
        userId,
        now,
      ]
    );
  }

  return {
    return_record: purchaseReturn,
    lines: insertedLines,
    supplier_balance_after: supplierBalanceAfter,
  };
}

export async function createPurchaseReturn(
  pool: Pool,
  dto: CreatePurchaseReturnDto,
  userId: string | null
): Promise<PurchaseReturnDetailDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await createPurchaseReturnTx(client, dto, userId);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listPurchaseReturns(pool: Pool, purchaseId?: string | null): Promise<PurchaseReturn[]> {
  let sql = 'SELECT * FROM purchase_returns';
  const params: unknown[] = [];
  if (purchaseId) {
    sql += ' WHERE purchase_id = $1';
    params.push(purchaseId);
  }
  sql += ' ORDER BY created_at DESC';

  const res = await pool.query(sql, params);
  return res.rows as PurchaseReturn[];
}
