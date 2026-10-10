/**
 * Opening Stock PostgreSQL Repository
 * Handles atomic opening-stock imports with full audit tracking in opening_stock_entries.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface OpeningStockItemDto {
  product_id: string;
  quantity: number;
  unit_cost?: number | null;
  notes?: string | null;
}

export interface ImportOpeningStockDto {
  branch_id?: string | null;
  reference_number?: string | null;
  items: OpeningStockItemDto[];
}

export interface OpeningStockEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  reference_number: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export class OpeningStockRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'OpeningStockRepoError';
  }
}

export async function importOpeningStock(
  pool: Pool,
  dto: ImportOpeningStockDto,
  userId: string | null
): Promise<{ success: boolean; count: number; entries: OpeningStockEntry[] }> {
  if (!dto.items || dto.items.length === 0) {
    throw new OpeningStockRepoError('Cannot import empty opening stock list', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure opening_stock_entries table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS opening_stock_entries (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity BIGINT NOT NULL,
        unit_cost BIGINT NOT NULL DEFAULT 0,
        reference_number VARCHAR(100),
        performed_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `);

    // Resolve Branch & Org
    // P8 fix: No hardcoded UUID fallback. Resolve MAIN branch from DB, or fail explicitly.
    let branchId = dto.branch_id?.trim();
    if (!branchId || branchId.length === 0) {
      const bRow = await client.query("SELECT id FROM branches WHERE code = 'MAIN' AND is_active = TRUE LIMIT 1");
      if (bRow.rows.length === 0) {
        throw new OpeningStockRepoError('Cannot resolve MAIN branch. Please provide an explicit branch_id.', 400);
      }
      branchId = bRow.rows[0]?.id as string;
    }

    const orgRow = await client.query('SELECT organization_id FROM branches WHERE id = $1', [branchId]);
    if (orgRow.rows.length === 0) {
      throw new OpeningStockRepoError(`Branch '${branchId}' not found`, 404);
    }
    const orgId = (orgRow.rows[0] as Record<string, unknown>)?.['organization_id'] as string;

    const now = new Date().toISOString();
    const refNo = dto.reference_number || `OP-${Date.now()}`;
    const insertedEntries: OpeningStockEntry[] = [];

    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new OpeningStockRepoError(`Opening stock quantity must be greater than 0 for product '${item.product_id}'`, 400);
      }

      // Verify Product
      const prodRes = await client.query('SELECT id, name, purchase_price, average_cost FROM products WHERE id = $1', [item.product_id]);
      if (prodRes.rows.length === 0) {
        throw new OpeningStockRepoError(`Product '${item.product_id}' not found`, 404);
      }
      const prod = prodRes.rows[0] as Record<string, unknown>;
      const unitCost = item.unit_cost ?? Number(prod['average_cost'] ?? prod['purchase_price'] ?? 0);

      const entryId = uuidv4();

      // 1. Insert opening_stock_entries audit row
      await client.query(
        `INSERT INTO opening_stock_entries (
           id, organization_id, branch_id, product_id, quantity, unit_cost, reference_number, performed_by, notes, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [entryId, orgId, branchId, item.product_id, item.quantity, unitCost, refNo, userId ? String(userId) : null, item.notes ?? null, now]
      );

      // 2. Fetch current stock & update/upsert stock
      const stockRes = await client.query('SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE', [
        item.product_id,
        branchId,
      ]);

      let prevStock = 0;
      if (stockRes.rows.length > 0) {
        prevStock = Number((stockRes.rows[0] as Record<string, unknown>)?.['quantity'] ?? 0);
        const resultingStock = prevStock + item.quantity;
        await client.query('UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4', [
          resultingStock,
          now,
          item.product_id,
          branchId,
        ]);
      } else {
        await client.query(
          `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
           VALUES ($1, $2, $3, $4)`,
          [item.product_id, branchId, item.quantity, now]
        );
      }
      const resultingStock = prevStock + item.quantity;

      // 3. Insert stock_movements (IN, reason = 'Opening Stock')
      const mvId = uuidv4();
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock,
           reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'IN', $4, $5, $6, 'Opening Stock', $7, $8, $9)`,
        [mvId, item.product_id, branchId, item.quantity, prevStock, resultingStock, userId ?? null, entryId, now]
      );

      insertedEntries.push({
        id: entryId,
        organization_id: orgId,
        branch_id: branchId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: unitCost,
        reference_number: refNo,
        performed_by: userId ?? null,
        notes: item.notes ?? null,
        created_at: now,
      });
    }

    await client.query('COMMIT');

    return {
      success: true,
      count: insertedEntries.length,
      entries: insertedEntries,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
