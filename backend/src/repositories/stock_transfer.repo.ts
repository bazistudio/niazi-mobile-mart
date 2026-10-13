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
import crypto from 'crypto';

export interface StockTransferDto {
  transfer_id?: string | null;
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

const MAX_TRANSIENT_RETRIES = 3;

function isTransientDbError(err: any): boolean {
  return err?.code === '40P01' || err?.code === '40001';
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

  const transferId = dto.transfer_id && dto.transfer_id.trim() ? dto.transfer_id.trim() : uuidv4();

  let attempt = 0;
  while (attempt < MAX_TRANSIENT_RETRIES) {
    attempt++;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check: return existing record if this transfer was already processed
      if (dto.transfer_id && dto.transfer_id.trim()) {
        const existing = await client.query(
          `SELECT st.*,
                  (SELECT quantity FROM stock WHERE product_id = st.product_id AND branch_id = st.source_branch_id) AS src_stock,
                  (SELECT quantity FROM stock WHERE product_id = st.product_id AND branch_id = st.destination_branch_id) AS dst_stock
           FROM stock_transfers st
           WHERE st.id = $1`,
          [transferId]
        );
        if (existing.rows.length > 0) {
          const row = existing.rows[0] as Record<string, unknown>;
          const existingProductId = String(row['product_id'] ?? '').trim();
          const existingSrcId = String(row['source_branch_id'] ?? '').trim();
          const existingDstId = String(row['destination_branch_id'] ?? '').trim();
          const existingQty = Number(row['quantity'] ?? 0);

          if (
            existingProductId !== productId ||
            existingSrcId !== srcId ||
            existingDstId !== dstId ||
            existingQty !== qty
          ) {
            await client.query('ROLLBACK');
            throw new StockTransferRepoError(
              `Transfer ID '${transferId}' was already used with a different transfer payload (conflict)`,
              409
            );
          }

          await client.query('COMMIT');
          return {
            transfer_id: transferId,
            source_branch_id: existingSrcId,
            destination_branch_id: existingDstId,
            product_id: existingProductId,
            quantity: existingQty,
            source_stock_after: Number(row['src_stock'] ?? 0),
            destination_stock_after: Number(row['dst_stock'] ?? 0),
            reason: (row['reason'] as string) ?? null,
            performed_by: (row['performed_by'] as string) ?? null,
            created_at: row['created_at'] as string,
          };
        }
      }

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

      // 4. Globally consistent row-level locking (F-14 / Blocker B):
      // Always lock the branch with the lower ID first, then the branch with the higher ID second.
      // Matches the identical lock acquisition order in transferStockBatch.
      const firstBranchId = srcId < dstId ? srcId : dstId;
      const secondBranchId = srcId < dstId ? dstId : srcId;

      const firstStockRes = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [productId, firstBranchId]
      );
      const secondStockRes = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [productId, secondBranchId]
      );

      const srcStockRes = firstBranchId === srcId ? firstStockRes : secondStockRes;

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

      const now = new Date().toISOString();

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
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});

      // Concurrent duplicate request race condition:
      // If another concurrent request inserted stock_transfers with the same ID first,
      // verify the committed transfer payload and return the prior result if identical.
      if (err?.code === '23505' && dto.transfer_id && dto.transfer_id.trim()) {
        try {
          const checkRes = await pool.query(
            `SELECT st.*,
                    (SELECT quantity FROM stock WHERE product_id = st.product_id AND branch_id = st.source_branch_id) AS src_stock,
                    (SELECT quantity FROM stock WHERE product_id = st.product_id AND branch_id = st.destination_branch_id) AS dst_stock
             FROM stock_transfers st
             WHERE st.id = $1`,
            [dto.transfer_id.trim()]
          );
          if (checkRes.rows.length > 0) {
            const row = checkRes.rows[0] as Record<string, unknown>;
            const existingProductId = String(row['product_id'] ?? '').trim();
            const existingSrcId = String(row['source_branch_id'] ?? '').trim();
            const existingDstId = String(row['destination_branch_id'] ?? '').trim();
            const existingQty = Number(row['quantity'] ?? 0);

            if (
              existingProductId !== productId ||
              existingSrcId !== srcId ||
              existingDstId !== dstId ||
              existingQty !== qty
            ) {
              throw new StockTransferRepoError(
                `Transfer ID '${dto.transfer_id.trim()}' was already used with a different transfer payload (conflict)`,
                409
              );
            }

            return {
              transfer_id: dto.transfer_id.trim(),
              source_branch_id: existingSrcId,
              destination_branch_id: existingDstId,
              product_id: existingProductId,
              quantity: existingQty,
              source_stock_after: Number(row['src_stock'] ?? 0),
              destination_stock_after: Number(row['dst_stock'] ?? 0),
              reason: (row['reason'] as string) ?? null,
              performed_by: (row['performed_by'] as string) ?? null,
              created_at: row['created_at'] as string,
            };
          }
        } catch (checkErr) {
          if (checkErr instanceof StockTransferRepoError) throw checkErr;
        }
      }

      // If transient deadlock (40P01) or serialization (40001) error and attempts remain, backoff and retry
      if (isTransientDbError(err) && attempt < MAX_TRANSIENT_RETRIES) {
        const backoffMs = Math.min(50 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 30), 500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }

  throw new StockTransferRepoError('Stock transfer failed after maximum retry attempts', 500);
}

export interface BatchTransferItem {
  product_id: string;
  quantity: number;
}

export interface StockTransferBatchDto {
  transfer_id?: string | null;
  source_branch_id: string;
  destination_branch_id: string;
  items: BatchTransferItem[];
  reason?: string | null;
  notes?: string | null;
}

export interface StockTransferBatchItemResult {
  product_id: string;
  product_name: string;
  quantity: number;
  source_stock_before: number;
  source_stock_after: number;
  destination_stock_before: number;
  destination_stock_after: number;
}

export interface StockTransferBatchResult {
  batch_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  total_items: number;
  total_quantity: number;
  items: StockTransferBatchItemResult[];
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

/**
 * Executes an atomic multi-product stock transfer batch.
 * Guarantees all-or-nothing transactional integrity:
 * - Deterministic sorting of product IDs prevents deadlocks under concurrent load.
 * - Pessimistic row-level locks (FOR UPDATE) validate source availability across ALL products.
 * - If ANY product has insufficient stock, the entire transaction is rolled back with zero inventory changes.
 * - Deducts source stock, credits destination stock, records TRANSFER_OUT and TRANSFER_IN movements,
 *   and logs audit entries in stock_transfers within a single PostgreSQL transaction.
 */
export async function transferStockBatch(
  pool: Pool,
  dto: StockTransferBatchDto,
  userId: string | null
): Promise<StockTransferBatchResult> {
  // 1. Validate branch inputs
  if (!dto.source_branch_id || !dto.source_branch_id.trim()) {
    throw new StockTransferRepoError('source_branch_id is required', 400);
  }
  if (!dto.destination_branch_id || !dto.destination_branch_id.trim()) {
    throw new StockTransferRepoError('destination_branch_id is required', 400);
  }

  const srcId = dto.source_branch_id.trim();
  const dstId = dto.destination_branch_id.trim();

  if (srcId === dstId) {
    throw new StockTransferRepoError('Source and destination branch must be different', 400);
  }

  // 2. Validate items array
  if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
    throw new StockTransferRepoError('Transfer batch must contain at least one item', 400);
  }

  // Consolidate duplicate products if provided and validate positive quantities
  const consolidatedMap = new Map<string, number>();
  for (const item of dto.items) {
    if (!item.product_id || !item.product_id.trim()) {
      throw new StockTransferRepoError('Each transfer item must have a valid product_id', 400);
    }
    const pid = item.product_id.trim();
    const qty = Number(item.quantity);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      throw new StockTransferRepoError(`Item '${pid}' quantity must be a positive integer`, 400);
    }
    consolidatedMap.set(pid, (consolidatedMap.get(pid) || 0) + qty);
  }

  // Sort products deterministically to eliminate deadlock potential under concurrent batches
  const consolidatedItems = Array.from(consolidatedMap.entries())
    .map(([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id));

  // Compute a deterministic SHA-256 fingerprint of the normalized transfer batch payload
  const payloadHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        src: srcId,
        dst: dstId,
        items: consolidatedItems.map((i) => ({ p: i.product_id, q: i.quantity })),
      })
    )
    .digest('hex');

  const batchId = dto.transfer_id && dto.transfer_id.trim() ? dto.transfer_id.trim() : uuidv4();

  let attempt = 0;
  while (attempt < MAX_TRANSIENT_RETRIES) {
    attempt++;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // ── Idempotency Check: verify if this batch was already committed ─────────
      try {
        const existingBatchRes = await client.query(
          'SELECT * FROM stock_transfer_batches WHERE id = $1',
          [batchId]
        );
        if (existingBatchRes.rows.length > 0) {
          const existingRow = existingBatchRes.rows[0];
          if (existingRow.payload_hash !== payloadHash) {
            await client.query('ROLLBACK');
            throw new StockTransferRepoError(
              `Batch ID '${batchId}' was already used with a different transfer payload (conflict)`,
              409
            );
          }
          await client.query('COMMIT');
          return existingRow.response_payload as StockTransferBatchResult;
        }
      } catch (checkErr: any) {
        if (checkErr instanceof StockTransferRepoError) throw checkErr;
        // Blocker A: Fail closed with clear operational error if migration 031 is missing (42P01)
        if (checkErr?.code === '42P01') {
          await client.query('ROLLBACK').catch(() => {});
          throw new StockTransferRepoError(
            'Batch stock transfer requires database migration 031 (stock_transfer_batches table is missing). Please run database migrations before using this feature.',
            503
          );
        }
        throw checkErr;
      }

      // 3. Validate source branch exists and is active
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

      // 4. Validate destination branch exists, is active, and is in the same organization
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

      // 5. Validate all products exist and are active
      const productIds = consolidatedItems.map((i) => i.product_id);
      const prodRes = await client.query(
        'SELECT id, name, is_active FROM products WHERE id = ANY($1)',
        [productIds]
      );
      const prodMap = new Map<string, { name: string; is_active: boolean }>();
      for (const row of prodRes.rows) {
        prodMap.set(row.id, { name: row.name, is_active: Boolean(row.is_active) });
      }

      for (const item of consolidatedItems) {
        const prod = prodMap.get(item.product_id);
        if (!prod) {
          throw new StockTransferRepoError(`Product '${item.product_id}' not found`, 404);
        }
        if (!prod.is_active) {
          throw new StockTransferRepoError(`Product '${prod.name}' is inactive`, 400);
        }
      }

      // 6. Globally consistent row-level locking (F-14 / Blocker B):
      // Always lock the branch with the lower ID first, then the branch with the higher ID second.
      // Explicitly sort locked rows by product_id ASC to guarantee deterministic physical row lock ordering in PostgreSQL.
      const firstBranchId = srcId < dstId ? srcId : dstId;
      const secondBranchId = srcId < dstId ? dstId : srcId;

      const firstStockRes = await client.query(
        'SELECT product_id, quantity FROM stock WHERE branch_id = $1 AND product_id = ANY($2) ORDER BY product_id ASC FOR UPDATE',
        [firstBranchId, productIds]
      );
      const secondStockRes = await client.query(
        'SELECT product_id, quantity FROM stock WHERE branch_id = $1 AND product_id = ANY($2) ORDER BY product_id ASC FOR UPDATE',
        [secondBranchId, productIds]
      );

      const srcStockMap = new Map<string, number>();
      const dstStockMap = new Map<string, number>();

      const srcRows = firstBranchId === srcId ? firstStockRes.rows : secondStockRes.rows;
      const dstRows = firstBranchId === dstId ? firstStockRes.rows : secondStockRes.rows;

      for (const row of srcRows) {
        srcStockMap.set(row.product_id, Number(row.quantity ?? 0));
      }
      for (const row of dstRows) {
        dstStockMap.set(row.product_id, Number(row.quantity ?? 0));
      }

      // Pre-flight validation: check stock availability for every single item before modifying any rows
      for (const item of consolidatedItems) {
        const prodName = prodMap.get(item.product_id)?.name || item.product_id;
        if (!srcStockMap.has(item.product_id)) {
          throw new StockTransferRepoError(
            `Stock record not found for product '${prodName}' at source branch. Initialize stock before transferring.`,
            400
          );
        }
        const available = srcStockMap.get(item.product_id)!;
        if (available < item.quantity) {
          throw new StockTransferRepoError(
            `Insufficient stock for '${prodName}' at source branch: available ${available}, requested ${item.quantity}`,
            400
          );
        }
      }

      const now = new Date().toISOString();
      const transferReason = dto.reason?.trim() || 'Batch Stock Transfer';
      const batchNotes = dto.notes?.trim() || null;
      const itemResults: StockTransferBatchItemResult[] = [];
      let totalQuantity = 0;

      // 7. Execute atomic mutations for every product in the batch
      for (const item of consolidatedItems) {
        const pid = item.product_id;
        const qty = item.quantity;
        const prodName = prodMap.get(pid)?.name || pid;
        const srcBefore = srcStockMap.get(pid)!;
        const dstBefore = dstStockMap.get(pid) ?? 0;

        // Atomically deduct from source branch
        const srcUpdateRes = await client.query(
          `UPDATE stock
           SET quantity = quantity - $1, updated_at = $2
           WHERE product_id = $3 AND branch_id = $4
           RETURNING quantity AS new_stock`,
          [qty, now, pid, srcId]
        );
        const srcAfter = Number((srcUpdateRes.rows[0] as Record<string, unknown>)?.['new_stock'] ?? 0);

        // Atomically upsert to destination branch
        const dstUpdateRes = await client.query(
          `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, branch_id)
           DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at
           RETURNING quantity AS new_stock`,
          [pid, dstId, qty, now]
        );
        const dstAfter = Number((dstUpdateRes.rows[0] as Record<string, unknown>)?.['new_stock'] ?? 0);

        // Record TRANSFER_OUT at source branch
        const outMovId = uuidv4();
        await client.query(
          `INSERT INTO stock_movements (
             id, product_id, branch_id, movement_type, quantity,
             previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
           ) VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, $7, $8, $9, $10)`,
          [outMovId, pid, srcId, qty, srcBefore, srcAfter,
           `${transferReason} [Batch ${batchId}] → ${dstId}`, userId ?? null, batchId, now]
        );

        // Record TRANSFER_IN at destination branch
        const inMovId = uuidv4();
        await client.query(
          `INSERT INTO stock_movements (
             id, product_id, branch_id, movement_type, quantity,
             previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
           ) VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6, $7, $8, $9, $10)`,
          [inMovId, pid, dstId, qty, dstBefore, dstAfter,
           `${transferReason} [Batch ${batchId}] ← ${srcId}`, userId ?? null, batchId, now]
        );

        // Record audit entry in stock_transfers table
        const transferRowId = uuidv4();
        await client.query(
          `INSERT INTO stock_transfers (
             id, product_id, source_branch_id, destination_branch_id,
             quantity, reason, notes, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [transferRowId, pid, srcId, dstId, qty,
           transferReason, batchNotes ? `[Batch: ${batchId}] ${batchNotes}` : `[Batch: ${batchId}]`, userId ?? null, now]
        );

        itemResults.push({
          product_id: pid,
          product_name: prodName,
          quantity: qty,
          source_stock_before: srcBefore,
          source_stock_after: srcAfter,
          destination_stock_before: dstBefore,
          destination_stock_after: dstAfter,
        });

        totalQuantity += qty;
      }

      const finalResult: StockTransferBatchResult = {
        batch_id: batchId,
        source_branch_id: srcId,
        destination_branch_id: dstId,
        total_items: itemResults.length,
        total_quantity: totalQuantity,
        items: itemResults,
        reason: transferReason,
        notes: batchNotes,
        performed_by: userId ?? null,
        created_at: now,
      };

      // 8. Persist durable batch record in stock_transfer_batches for retry recovery (F-13 / Blocker A)
      await client.query(
        `INSERT INTO stock_transfer_batches (
           id, payload_hash, source_branch_id, destination_branch_id,
           total_items, total_quantity, response_payload, reason, notes, performed_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          batchId,
          payloadHash,
          srcId,
          dstId,
          itemResults.length,
          totalQuantity,
          JSON.stringify(finalResult),
          transferReason,
          batchNotes,
          userId ?? null,
          now,
        ]
      );

      await client.query('COMMIT');

      return finalResult;
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});

      // Concurrent duplicate request race condition handling:
      // If another concurrent request inserted stock_transfer_batches with the same batch ID first,
      // verify the committed batch payload hash and return the saved result if identical, or 409 if conflict.
      if (err?.code === '23505' && batchId) {
        try {
          const checkRes = await pool.query(
            'SELECT * FROM stock_transfer_batches WHERE id = $1',
            [batchId]
          );
          if (checkRes.rows.length > 0) {
            const row = checkRes.rows[0];
            if (row.payload_hash !== payloadHash) {
              throw new StockTransferRepoError(
                `Batch ID '${batchId}' was already used with a different transfer payload (conflict)`,
                409
              );
            }
            return row.response_payload as StockTransferBatchResult;
          }
        } catch (checkErr) {
          if (checkErr instanceof StockTransferRepoError) throw checkErr;
        }
      }

      // If transient deadlock (40P01) or serialization (40001) error and attempts remain, backoff and retry
      if (isTransientDbError(err) && attempt < MAX_TRANSIENT_RETRIES) {
        const backoffMs = Math.min(50 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 30), 500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }

  throw new StockTransferRepoError('Batch stock transfer failed after maximum retry attempts', 500);
}

