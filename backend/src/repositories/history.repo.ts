/**
 * Financial History PostgreSQL Repository
 * Queries sales, purchases, expenses, ledger, and stock movements
 * to construct a unified audit history feed and summary statistics.
 */

import { Pool } from 'pg';

export interface HistoryItem {
  id: string;
  type: 'sale' | 'purchase' | 'payment' | 'expense' | 'import' | 'stock_adjustment';
  referenceId: string;
  party: {
    id: string;
    name: string;
    type: 'customer' | 'supplier' | null;
  };
  amount: number;
  status: 'paid' | 'pending' | 'partial';
  source: 'pos' | 'manual' | 'import' | 'whatsapp';
  createdAt: string;
}

export interface HistoryStats {
  totalSales: number;
  totalInvoices: number;
  totalExpenses: number;
  netRevenue: number;
  pendingPayments: number;
}

export interface HistoryFilterParams {
  page?: number;
  limit?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  branch_id?: string | null;
}

export class HistoryRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 500) {
    super(message);
    this.name = 'HistoryRepoError';
  }
}

export async function listHistoryItems(
  pool: Pool,
  filter?: HistoryFilterParams
): Promise<{ data: HistoryItem[]; total: number }> {
  const limit = Math.min(filter?.limit ?? 50, 500);
  const page = Math.max(filter?.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const params: unknown[] = [];
  let paramIdx = 1;

  let salesWhere = 'WHERE 1=1';
  if (filter?.branch_id) {
    salesWhere += ` AND branch_id = $${paramIdx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.startDate) {
    salesWhere += ` AND created_at >= $${paramIdx++}`;
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    salesWhere += ` AND created_at <= $${paramIdx++}`;
    params.push(filter.endDate);
  }
  if (filter?.search) {
    salesWhere += ` AND (invoice_number ILIKE $${paramIdx} OR customer_name_snapshot ILIKE $${paramIdx})`;
    params.push(`%${filter.search}%`);
    paramIdx++;
  }

  const query = `
    SELECT 
      id,
      'sale' AS type,
      invoice_number AS "referenceId",
      COALESCE(customer_id, '') AS "party_id",
      COALESCE(customer_name_snapshot, 'Walk-in Customer') AS "party_name",
      'customer' AS "party_type",
      total_amount AS amount,
      CASE 
        WHEN payment_status = 'PAID' THEN 'paid'
        WHEN payment_status = 'PARTIALLY_PAID' THEN 'partial'
        ELSE 'pending'
      END AS status,
      'pos' AS source,
      created_at AS "createdAt"
    FROM sales
    ${salesWhere}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countQuery = `SELECT COUNT(*)::BIGINT FROM sales ${salesWhere}`;

  try {
    const [rowsRes, countRes] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params),
    ]);

    const total = Number(countRes.rows[0]?.count ?? 0);
    const data: HistoryItem[] = rowsRes.rows.map((r) => ({
      id: r.id as string,
      type: 'sale',
      referenceId: r.referenceId as string,
      party: {
        id: (r.party_id as string) || '',
        name: (r.party_name as string) || 'Walk-in Customer',
        type: 'customer',
      },
      amount: Number(r.amount ?? 0),
      status: r.status as 'paid' | 'pending' | 'partial',
      source: 'pos',
      createdAt: r.createdAt as string,
    }));

    return { data, total };
  } catch (err) {
    console.error('[history.repo] Error fetching history:', err);
    throw new HistoryRepoError('Failed to fetch history records', 500);
  }
}

export async function getHistoryStats(
  pool: Pool,
  branchId?: string | null
): Promise<HistoryStats> {
  let salesWhere = 'WHERE sale_status != \'VOIDED\'';
  const params: unknown[] = [];

  if (branchId) {
    salesWhere += ' AND branch_id = $1';
    params.push(branchId);
  }

  const salesQuery = `
    SELECT 
      COALESCE(SUM(total_amount), 0)::BIGINT AS total_sales,
      COUNT(*)::BIGINT AS total_invoices,
      COALESCE(SUM(total_amount - paid_amount), 0)::BIGINT AS pending_payments
    FROM sales
    ${salesWhere}
  `;

  const expenseQuery = `
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total_expenses
    FROM expenses
    ${branchId ? 'WHERE branch_id = $1' : ''}
  `;

  try {
    const [salesRes, expenseRes] = await Promise.all([
      pool.query(salesQuery, params),
      pool.query(expenseQuery, branchId ? [branchId] : []),
    ]);

    const sRow = salesRes.rows[0] as Record<string, unknown>;
    const eRow = expenseRes.rows[0] as Record<string, unknown>;

    const totalSales = Number(sRow?.['total_sales'] ?? 0);
    const totalInvoices = Number(sRow?.['total_invoices'] ?? 0);
    const pendingPayments = Number(sRow?.['pending_payments'] ?? 0);
    const totalExpenses = Number(eRow?.['total_expenses'] ?? 0);
    const netRevenue = Math.max(totalSales - totalExpenses, 0);

    return {
      totalSales,
      totalInvoices,
      totalExpenses,
      netRevenue,
      pendingPayments,
    };
  } catch (err) {
    console.error('[history.repo] Error fetching history stats:', err);
    throw new HistoryRepoError('Failed to fetch history statistics', 500);
  }
}
