/**
 * Stock Transfer PostgreSQL Repository
 * P4: Implements real branch-to-branch stock transfers, replacing the missing backend
 * that left POST /api/v1/inventory/transfer returning 404.
 *
 * Business rules:
 *  - Organization Admin authorization is enforced in the route layer.
 *  - Source and destination must be different, active, same-organization branches.
 *  - Source stock is locked (FOR UPDATE), deducted, and destination is credited atomically.
 *  - Both movements are recorded with a shared transfer_reference UUID.
 *  - Insufficient source stock causes the entire transaction to fail.
 *  - Transfers never move across organizations.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface StockTransferDto {
  source_branch_id: string;
  destination_branch_id: string;
  product_id: string;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
}

export interface StockTransferResult {
  transfer_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  product_id: string;
  quantity: number;
  source_stock_after: number;
  destination_stock_after: number;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
}

export class StockTransferRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'StockTransferRepoError';
  }
}

export async function transferStock(
  pool: Pool,
  dto: StockTransferDto,
  userId: string | null
): Promise<StockTransferResult> {
  // Validate input
  if (!dto.source_branch_id || !dto.source_branch_id.trim()) {
    throw new StockTransferRepoError('source_branch_id is required', 400);
  }
  if (!dto.destination_branch_id || !dto.destination_branch_id.trim()) {
    throw new StockTransferRepoError('destination_branch_id is required', 400);
  }
  if (!dto.product_id || !dto.product_id.trim()) {
    throw new StockTransferRepoError('product_id is required', 400);
  }
  if (!dto.quantity || dto.quantity <= 0 || !Number.isInteger(dto.quantity)) {
    throw new StockTransferRepoError('quantity must be a positive integer', 400);
  }

  const srcId = dto.source_branch_id.trim();
  const dstId = dto.destination_branch_id.trim();
  const productId = dto.product_id.trim();
  const qty = dto.quantity;

  if (srcId === dstId) {
    throw new StockTransferRepoError('Source and destination branch must be different', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate source branch — must exist and be active
    const srcBranchRes = await client.query(
      'SELECT id, organization_id, is_active FROM branches WHERE id = $1',
      [srcId]
    );
    if (srcBranchRes.rows.length === 0) {
      throw new StockTransferRepoError(`Source branch '${srcId}' not found`, 404);
    }
    const srcBranch = srcBranchRes.rows[0] as Record<string, unknown>;
    if (srcBranch['is_active'] === false || srcBranch['is_active'] === 0) {
      throw new StockTransferRepoError(`Source branch '${srcId}' is inactive`, 400);
    }
    const orgId = srcBranch['organization_id'] as string;

    // 2. Validate destination branch — must exist, be active, same organization
    const dstBranchRes = await client.query(
      'SELECT id, organization_id, is_active FROM branches WHERE id = $1',
      [dstId]
    );
    if (dstBranchRes.rows.length === 0) {
      throw new StockTransferRepoError(`Destination branch '${dstId}' not found`, 404);
    }
    const dstBranch = dstBranchRes.rows[0] as Record<string, unknown>;
    if (dstBranch['is_active'] === false || dstBranch['is_active'] === 0) {
      throw new StockTransferRepoError(`Destination branch '${dstId}' is inactive`, 400);
    }
    if (dstBranch['organization_id'] !== orgId) {
      throw new StockTransferRepoError('Cannot transfer stock across organizations', 403);
    }

    // 3. Validate product exists
    const prodRes = await client.query(
      'SELECT id, name, is_active FROM products WHERE id = $1',
      [productId]
    );
    if (prodRes.rows.length === 0) {
      throw new StockTransferRepoError(`Product '${productId}' not found`, 404);
    }
    const prod = prodRes.rows[0] as Record<string, unknown>;
    if (prod['is_active'] === false || prod['is_active'] === 0) {
      throw new StockTransferRepoError(`Product '${prod['name']}' is inactive`, 400);
    }
    const productName = prod['name'] as string;

    // 4. Lock and validate source stock (FOR UPDATE)
    const srcStockRes = await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
      [productId, srcId]
    );
    if (srcStockRes.rows.length === 0) {
      throw new StockTransferRepoError(
        `Stock record not found for product '${productName}' at source branch. Initialize stock before transferring.`,
        400
      );
    }
    const srcCurrentQty = Number((srcStockRes.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
    if (srcCurrentQty < qty) {
      throw new StockTransferRepoError(
        `Insufficient stock for '${productName}' at source branch: available ${srcCurrentQty}, requested ${qty}`,
        400
      );
    }

    // 5. Lock destination stock row if it exists (FOR UPDATE)
    await client.query(
      'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
      [productId, dstId]
    );

    const now = new Date().toISOString();
    const transferId = uuidv4();

    // 6. Atomically deduct source stock
    const srcUpdateRes = await client.query(
      `UPDATE stock
         SET quantity = quantity - $1, updated_at = $2
         WHERE product_id = $3 AND branch_id = $4
         RETURNING quantity AS new_stock`,
      [qty, now, productId, srcId]
    );
    const srcStockAfter = Number((srcUpdateRes.rows[0] as Record<string, unknown>)?.['new_stock'] ?? 0);

    // 7. Upsert destination stock (add qty, create row if missing)
    const dstUpdateRes = await client.query(
      `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id)
         DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at
         RETURNING quantity AS new_stock`,
      [productId, dstId, qty, now]
    );
    const dstStockAfter = Number((dstUpdateRes.rows[0] as Record<string, unknown>)?.['new_stock'] ?? 0);

    const transferReason = dto.reason?.trim() || 'Branch Stock Transfer';

    // 8. Record outgoing movement at source
    const outMovId = uuidv4();
    await client.query(
      `INSERT INTO stock_movements (
         id, product_id, branch_id, movement_type, quantity,
         previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
       ) VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, $7, $8, $9, $10)`,
      [outMovId, productId, srcId, qty, srcCurrentQty, srcStockAfter,
       `${transferReason} → ${dstId}`, userId ?? null, transferId, now]
    );

    // 9. Record incoming movement at destination
    const dstCurrentQty = dstStockAfter - qty; // before = after - added
    const inMovId = uuidv4();
    await client.query(
      `INSERT INTO stock_movements (
         id, product_id, branch_id, movement_type, quantity,
         previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
       ) VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6, $7, $8, $9, $10)`,
      [inMovId, productId, dstId, qty, dstCurrentQty, dstStockAfter,
       `${transferReason} ← ${srcId}`, userId ?? null, transferId, now]
    );

    // 10. Insert stock_transfers audit record
    await client.query(
      `INSERT INTO stock_transfers (
         id, product_id, source_branch_id, destination_branch_id,
         quantity, reason, notes, performed_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [transferId, productId, srcId, dstId, qty,
       transferReason, dto.notes?.trim() ?? null, userId ?? null, now]
    );

    await client.query('COMMIT');

    return {
      transfer_id: transferId,
      source_branch_id: srcId,
      destination_branch_id: dstId,
      product_id: productId,
      quantity: qty,
      source_stock_after: srcStockAfter,
      destination_stock_after: dstStockAfter,
      reason: transferReason,
      performed_by: userId ?? null,
      created_at: now,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
