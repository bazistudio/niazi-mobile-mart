/**
 * Purchase PostgreSQL Repository — TypeScript (Phase 5A migration)
 * Direct 1-to-1 port of src-tauri/src/repositories/postgres_purchase_repo.rs.
 * DO NOT change business logic, schema, or calculations.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type PurchasePaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
export type PurchaseStatus = 'COMPLETED' | 'VOIDED' | 'CANCELLED';

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  branch_id: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  credit_amount: number;
  payment_status: PurchasePaymentStatus;
  status: PurchaseStatus;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseLine {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface PurchaseItemInputDto {
  product_id: string;
  quantity: number;
  unit_cost?: number | null;
  discount?: number | null;
}

export interface CompletePurchaseDto {
  supplier_id: string;
  branch_id?: string | null;
  items: PurchaseItemInputDto[];
  discount?: number | null;
  paid_amount?: number | null;
  notes?: string | null;
}

export interface PurchaseResultDto {
  purchase: Purchase;
  lines: PurchaseLine[];
  credit_amount: number;
  supplier_balance_after: number | null;
}

export interface PurchaseFilterDto {
  supplier_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  status?: string | null;
  search?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export class PurchaseRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'PurchaseRepoError';
  }
}

const DEFAULT_MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Executes an atomic complete purchase transaction.
 * Mirrors PostgresPurchaseRepository::complete_purchase_tx() in postgres_purchase_repo.rs.
 */
export async function completePurchaseTx(
  client: PoolClient,
  dto: CompletePurchaseDto,
  userId: string | null,
  purchaseIdOverride?: string | null
): Promise<PurchaseResultDto> {
  if (!dto.items || dto.items.length === 0) {
    throw new PurchaseRepoError('Cannot complete purchase with empty items', 400);
  }

  // Validate supplier
  const supplierRow = await client.query(
    'SELECT id, name, credit_limit, is_active FROM suppliers WHERE id = $1',
    [dto.supplier_id]
  );
  if (supplierRow.rows.length === 0) {
    throw new PurchaseRepoError(`Supplier '${dto.supplier_id}' not found`, 404);
  }

  const supplier = supplierRow.rows[0] as Record<string, unknown>;
  const isActiveInt = Number(supplier['is_active'] ?? 1);
  if (isActiveInt !== 1) {
    throw new PurchaseRepoError(`Supplier '${supplier['name']}' is inactive.`, 400);
  }

  const supplierId = supplier['id'] as string;
  const rawBranchId = dto.branch_id?.trim();
  const branchId = rawBranchId && rawBranchId.length > 0 ? rawBranchId : DEFAULT_MAIN_BRANCH_ID;

  interface PreparedLine {
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_cost: number;
    discount: number;
    line_total: number;
  }

  const preparedLines: PreparedLine[] = [];

  for (const item of dto.items) {
    if (item.quantity <= 0) {
      throw new PurchaseRepoError('Quantity must be > 0', 400);
    }
    const unitCost = Number(item.unit_cost ?? 0);
    if (unitCost < 0) {
      throw new PurchaseRepoError('Unit cost cannot be negative', 400);
    }

    const prodRow = await client.query(
      'SELECT id, name, sku, is_active FROM products WHERE id = $1',
      [item.product_id]
    );
    if (prodRow.rows.length === 0) {
      throw new PurchaseRepoError(`Product '${item.product_id}' not found`, 404);
    }

    const prod = prodRow.rows[0] as Record<string, unknown>;
    const prodActive = Number(prod['is_active'] ?? 1);
    if (prodActive !== 1) {
      throw new PurchaseRepoError(`Product '${prod['name']}' is inactive.`, 400);
    }

    const disc = Math.max(Number(item.discount ?? 0), 0);
    const lineTotal = Math.max(unitCost * item.quantity - disc, 0);

    preparedLines.push({
      product_id: prod['id'] as string,
      product_name: prod['name'] as string,
      sku: prod['sku'] as string,
      quantity: item.quantity,
      unit_cost: unitCost,
      discount: disc,
      line_total: lineTotal,
    });
  }

  const subtotal = preparedLines.reduce((sum, l) => sum + l.line_total, 0);
  const discount = Math.max(Number(dto.discount ?? 0), 0);
  const totalAmount = Math.max(subtotal - discount, 0);
  const paidAmount = Math.max(Number(dto.paid_amount ?? 0), 0);
  const creditAmount = Math.max(totalAmount - paidAmount, 0);

  let paymentStatus: PurchasePaymentStatus;
  if (paidAmount >= totalAmount) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  } else {
    paymentStatus = 'UNPAID';
  }

  // Ensure counters table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS counters (
      name VARCHAR(50) PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    INSERT INTO counters (name, value) VALUES ('purchase_number', 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
  `);

  const counterRes = await client.query("SELECT value FROM counters WHERE name = 'purchase_number'");
  const counterVal = Number(counterRes.rows[0]?.['value'] ?? 1);
  const purchaseNumber = `PO-${String(counterVal).padStart(6, '0')}`;
  const purchaseId = purchaseIdOverride?.trim() ? purchaseIdOverride.trim() : uuidv4();
  const now = new Date().toISOString();
  const uid = userId ?? null;

  const purchase: Purchase = {
    id: purchaseId,
    purchase_number: purchaseNumber,
    supplier_id: supplierId,
    branch_id: branchId,
    subtotal,
    discount,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    credit_amount: creditAmount,
    payment_status: paymentStatus,
    status: 'COMPLETED',
    notes: dto.notes ?? null,
    performed_by: uid,
    created_at: now,
    updated_at: now,
  };

  await client.query(
    `INSERT INTO purchases (
      id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount,
      paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      purchase.id,
      purchase.purchase_number,
      purchase.supplier_id,
      purchase.branch_id,
      purchase.subtotal,
      purchase.discount,
      purchase.total_amount,
      purchase.paid_amount,
      purchase.credit_amount,
      purchase.payment_status,
      purchase.status,
      purchase.notes,
      purchase.performed_by,
      purchase.created_at,
      purchase.updated_at,
    ]
  );

  const insertedLines: PurchaseLine[] = [];

  for (const line of preparedLines) {
    const lineId = uuidv4();
    const pline: PurchaseLine = {
      id: lineId,
      purchase_id: purchaseId,
      product_id: line.product_id,
      product_name_snapshot: line.product_name,
      sku_snapshot: line.sku,
      quantity: line.quantity,
      unit_cost: line.unit_cost,
      discount: line.discount,
      line_total: line.line_total,
      created_at: now,
    };

    await client.query(
      `INSERT INTO purchase_lines (id, purchase_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_cost, discount, line_total, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        pline.id,
        pline.purchase_id,
        pline.product_id,
        pline.product_name_snapshot,
        pline.sku_snapshot,
        pline.quantity,
        pline.unit_cost,
        pline.discount,
        pline.line_total,
        pline.created_at,
      ]
    );

    // Update Stock
    const stockRow = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2',
      [line.product_id, branchId]
    );
    const currentStock = Number((stockRow.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
    const newStock = currentStock + line.quantity;

    await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
      [line.product_id, branchId, newStock, now]
    );

    // Stock Movement Log
    const movementId = uuidv4();
    const reason = `Stock Receive ${purchaseNumber}`;

    await client.query(
      `INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
       VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)`,
      [
        movementId,
        line.product_id,
        branchId,
        line.quantity,
        currentStock,
        newStock,
        reason,
        uid,
        purchaseId,
        now,
      ]
    );

    // Update Product Cost/Price
    await client.query(
      'UPDATE products SET purchase_price = $1, updated_at = $2 WHERE id = $3',
      [line.unit_cost, now, line.product_id]
    );

    insertedLines.push(pline);
  }

  // Supplier Ledger Entry
  let supplierBalanceAfter: number | null = null;
  if (creditAmount > 0) {
    const outstandingRow = await client.query(
      'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance FROM supplier_ledger_entries WHERE supplier_id = $1',
      [supplierId]
    );
    const currentOutstanding = Number((outstandingRow.rows[0] as Record<string, unknown>)?.['balance'] ?? 0);
    const newBal = currentOutstanding + creditAmount;
    supplierBalanceAfter = newBal;

    const ledgerId = uuidv4();
    const desc = `Purchase Order ${purchaseNumber}`;

    await client.query(
      `INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, 'PURCHASE', $5, 0, $6, $7, $8, $9)`,
      [
        ledgerId,
        supplierId,
        purchaseId,
        purchaseNumber,
        creditAmount,
        newBal,
        desc,
        uid,
        now,
      ]
    );
  }

  return {
    purchase,
    lines: insertedLines,
    credit_amount: creditAmount,
    supplier_balance_after: supplierBalanceAfter,
  };
}

export async function completePurchase(
  pool: Pool,
  dto: CompletePurchaseDto,
  userId: string | null
): Promise<PurchaseResultDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await completePurchaseTx(client, dto, userId);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPurchaseById(pool: Pool, id: string): Promise<Purchase | null> {
  const res = await pool.query('SELECT * FROM purchases WHERE id = $1', [id]);
  return res.rows[0] ? (res.rows[0] as Purchase) : null;
}

export async function getPurchaseByInvoice(pool: Pool, purchaseNumber: string): Promise<Purchase | null> {
  const res = await pool.query('SELECT * FROM purchases WHERE purchase_number = $1', [purchaseNumber]);
  return res.rows[0] ? (res.rows[0] as Purchase) : null;
}

export async function getPurchaseLines(pool: Pool, purchaseId: string): Promise<PurchaseLine[]> {
  const res = await pool.query('SELECT * FROM purchase_lines WHERE purchase_id = $1 ORDER BY created_at ASC', [purchaseId]);
  return res.rows as PurchaseLine[];
}

export async function listPurchases(pool: Pool, filter?: PurchaseFilterDto): Promise<Purchase[]> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (filter?.supplier_id) {
    where += ` AND supplier_id = $${idx++}`;
    params.push(filter.supplier_id);
  }
  if (filter?.branch_id) {
    where += ` AND branch_id = $${idx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.status) {
    where += ` AND status = $${idx++}`;
    params.push(filter.status);
  }
  if (filter?.start_date) {
    where += ` AND created_at >= $${idx++}`;
    params.push(filter.start_date);
  }
  if (filter?.end_date) {
    where += ` AND created_at <= $${idx++}`;
    params.push(filter.end_date);
  }

  const limit = filter?.limit ?? 100;
  const offset = filter?.offset ?? 0;

  where += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const res = await pool.query(`SELECT * FROM purchases ${where}`, params);
  return res.rows as Purchase[];
}
