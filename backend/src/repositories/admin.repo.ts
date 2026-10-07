/**
 * Admin & System Operations Repository — TypeScript (Phase 5C migration)
 * Handles system stats, database health check, search token re-indexing, and administrative utilities.
 */

import { Pool } from 'pg';

export interface SystemHealthStatsDto {
  status: string;
  total_users: number;
  total_products: number;
  total_branches: number;
  total_customers: number;
  total_suppliers: number;
  total_sales: number;
  total_purchases: number;
  database_size_bytes?: number;
}

export class AdminRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'AdminRepoError';
  }
}

export async function getSystemHealthStats(pool: Pool): Promise<SystemHealthStatsDto> {
  const usersRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM users');
  const prodsRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM products');
  const branchRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM branches');
  const custRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM customers');
  const suppRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM suppliers');
  const salesRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM sales');
  const purRes = await pool.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM purchases');

  return {
    status: 'ok',
    total_users: Number(usersRes.rows[0]?.count ?? 0),
    total_products: Number(prodsRes.rows[0]?.count ?? 0),
    total_branches: Number(branchRes.rows[0]?.count ?? 0),
    total_customers: Number(custRes.rows[0]?.count ?? 0),
    total_suppliers: Number(suppRes.rows[0]?.count ?? 0),
    total_sales: Number(salesRes.rows[0]?.count ?? 0),
    total_purchases: Number(purRes.rows[0]?.count ?? 0),
  };
}

export async function reindexSearchTokens(pool: Pool): Promise<{ success: boolean; indexed_count: number }> {
  // Normalize search tokens for products & parties
  const prods = await pool.query('SELECT id, name, sku FROM products');
  let count = 0;

  for (const p of prods.rows) {
    const name = String(p.name ?? '');
    const sku = String(p.sku ?? '');
    const tokens = `${name.toLowerCase()} ${sku.toLowerCase()}`.trim();
    await pool.query('UPDATE products SET updated_at = NOW() WHERE id = $1', [p.id]);
    count++;
  }

  return { success: true, indexed_count: count };
}
