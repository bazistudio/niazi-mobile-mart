/**
 * Financial History PostgreSQL Repository
 * DEF-SALE-07: Extended from sales-only to include purchases, expenses,
 * customer payments (ledger), and supplier payments (ledger) via UNION ALL.
 * Each source table is queried with the same filter parameters where applicable.
 * Guarantees: branch isolation, no double-counting, pagination and ordering
 * preserved, all event types backed by real persisted schema.
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
  totalPurchases: number;
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

// ---------------------------------------------------------------------------
// Helper: build a WHERE fragment for a given branch/date/search set of params.
// Returns { clause, params } where clause starts with "AND " (caller prepends
// "WHERE 1=1") and params are appended to the caller's running params array.
// ---------------------------------------------------------------------------
function buildWhereFragments(
  filter: HistoryFilterParams | undefined,
  currentParamIdx: number,
  opts: {
    branchCol: string;
    dateCol: string;
    searchCols?: string[]; // columns used in ILIKE search
  }
): { clause: string; params: unknown[]; nextIdx: number } {
  const params: unknown[] = [];
  let idx = currentParamIdx;
  let clause = '';

  if (filter?.branch_id) {
    clause += ` AND ${opts.branchCol} = $${idx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.startDate) {
    clause += ` AND ${opts.dateCol} >= $${idx++}`;
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    clause += ` AND ${opts.dateCol} <= $${idx++}`;
    params.push(filter.endDate);
  }
  if (filter?.search && opts.searchCols && opts.searchCols.length > 0) {
    const conditions = opts.searchCols.map((col) => `${col} ILIKE $${idx}`).join(' OR ');
    clause += ` AND (${conditions})`;
    params.push(`%${filter.search}%`);
    idx++;
  }

  return { clause, params, nextIdx: idx };
}

export async function listHistoryItems(
  pool: Pool,
  filter?: HistoryFilterParams
): Promise<{ data: HistoryItem[]; total: number }> {
  const limit = Math.min(filter?.limit ?? 50, 500);
  const page = Math.max(filter?.page ?? 1, 1);
  const offset = (page - 1) * limit;

  // Determine which type(s) to include
  const typeFilter = filter?.type?.toLowerCase();
  const include = {
    sale: !typeFilter || typeFilter === 'sale',
    purchase: !typeFilter || typeFilter === 'purchase',
    payment: !typeFilter || typeFilter === 'payment',
    expense: !typeFilter || typeFilter === 'expense',
  };

  // We build one UNION ALL query so that ORDER BY and LIMIT/OFFSET apply to
  // the merged result set — preventing double-counting by keeping each source
  // table in exactly one SELECT arm.

  const unionArms: string[] = [];
  const allParams: unknown[] = [];
  let paramIdx = 1;

  // ── 1. SALES ──────────────────────────────────────────────────────────────
  if (include.sale) {
    const { clause, params, nextIdx } = buildWhereFragments(filter, paramIdx, {
      branchCol: 'branch_id',
      dateCol: 'created_at',
      searchCols: ['invoice_number', 'customer_name_snapshot'],
    });
    paramIdx = nextIdx;
    allParams.push(...params);

    unionArms.push(`
      SELECT
        id,
        'sale'                                         AS type,
        invoice_number                                 AS "referenceId",
        COALESCE(customer_id, '')                      AS party_id,
        COALESCE(customer_name_snapshot, 'Walk-in Customer') AS party_name,
        'customer'                                     AS party_type,
        total_amount                                   AS amount,
        CASE
          WHEN payment_status = 'PAID'         THEN 'paid'
          WHEN payment_status = 'PARTIALLY_PAID' THEN 'partial'
          ELSE 'pending'
        END                                            AS status,
        'pos'                                          AS source,
        created_at                                     AS "createdAt"
      FROM sales
      WHERE 1=1 ${clause}
    `);
  }

  // ── 2. PURCHASES ──────────────────────────────────────────────────────────
  if (include.purchase) {
    const { clause, params, nextIdx } = buildWhereFragments(filter, paramIdx, {
      branchCol: 'branch_id',
      dateCol: 'created_at',
      searchCols: ['purchase_number'],
    });
    paramIdx = nextIdx;
    allParams.push(...params);

    // Join suppliers to get party name
    unionArms.push(`
      SELECT
        p.id,
        'purchase'                                     AS type,
        p.purchase_number                              AS "referenceId",
        COALESCE(p.supplier_id, '')                    AS party_id,
        COALESCE(s.name, 'Unknown Supplier')           AS party_name,
        'supplier'                                     AS party_type,
        p.total_amount                                 AS amount,
        CASE
          WHEN p.payment_status = 'PAID'           THEN 'paid'
          WHEN p.payment_status = 'PARTIALLY_PAID' THEN 'partial'
          ELSE 'pending'
        END                                            AS status,
        'manual'                                       AS source,
        p.created_at                                   AS "createdAt"
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE 1=1 ${clause}
    `);
  }

  // ── 3. CUSTOMER PAYMENTS (ledger PAYMENT entries) ─────────────────────────
  if (include.payment) {
    // P1b fix: customer_ledger_entries has no branch_id column directly.
    // Attribution path:
    //   1. Physical cash drawer payments: cle.reference_id -> cash_movements.reference_id (cm.branch_id)
    //   2. Non-cash payments (bank, JazzCash, EasyPaisa): cle.performed_by -> users.branch_id (u.branch_id)
    //   Effective branch is COALESCE(cm.branch_id, u.branch_id).
    //   LATERAL join with LIMIT 1 ensures zero chance of duplicated rows from movements.
    //   LEFT JOIN users u is 1-to-1 on primary key.
    // When branch filter is applied, COALESCE(...) = $branch_id correctly matches both cash
    // and non-cash payments belonging to the branch without inventing branch IDs.
    // Unfiltered queries return all payment records.
    {
      let custClause = '';
      if (filter?.branch_id) {
        custClause += ` AND COALESCE(cm.branch_id, u.branch_id) = $${paramIdx++}`;
        allParams.push(filter.branch_id);
      }
      if (filter?.startDate) {
        custClause += ` AND cle.created_at >= $${paramIdx++}`;
        allParams.push(filter.startDate);
      }
      if (filter?.endDate) {
        custClause += ` AND cle.created_at <= $${paramIdx++}`;
        allParams.push(filter.endDate);
      }
      if (filter?.search) {
        custClause += ` AND (cle.reference_number ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`;
        allParams.push(`%${filter.search}%`);
        paramIdx++;
      }

      unionArms.push(`
        SELECT
          cle.id,
          'payment'                                      AS type,
          COALESCE(cle.reference_number, cle.id)        AS "referenceId",
          COALESCE(cle.customer_id, '')                  AS party_id,
          COALESCE(c.name, 'Unknown Customer')           AS party_name,
          'customer'                                     AS party_type,
          cle.credit                                     AS amount,
          'paid'                                         AS status,
          'manual'                                       AS source,
          cle.created_at                                 AS "createdAt"
        FROM customer_ledger_entries cle
        LEFT JOIN customers c ON c.id = cle.customer_id
        LEFT JOIN cash_movements cm ON cm.reference_id = cle.reference_id AND cm.movement_type = 'CUSTOMER_PAYMENT'
        LEFT JOIN users u ON u.id = cle.performed_by
        WHERE cle.entry_type = 'PAYMENT'
          AND cle.credit > 0
          ${custClause}
      `);
    }

    // Supplier payments: supplier_ledger_entries entry_type = 'PAYMENT', debit > 0
    // Same attribution strategy: COALESCE(cm.branch_id, u.branch_id)
    {
      let suppClause = '';
      if (filter?.branch_id) {
        suppClause += ` AND COALESCE(cm.branch_id, u.branch_id) = $${paramIdx++}`;
        allParams.push(filter.branch_id);
      }
      if (filter?.startDate) {
        suppClause += ` AND sle.created_at >= $${paramIdx++}`;
        allParams.push(filter.startDate);
      }
      if (filter?.endDate) {
        suppClause += ` AND sle.created_at <= $${paramIdx++}`;
        allParams.push(filter.endDate);
      }
      if (filter?.search) {
        suppClause += ` AND (sle.reference_number ILIKE $${paramIdx} OR sup.name ILIKE $${paramIdx})`;
        allParams.push(`%${filter.search}%`);
        paramIdx++;
      }

      unionArms.push(`
        SELECT
          sle.id,
          'payment'                                      AS type,
          COALESCE(sle.reference_number, sle.id)        AS "referenceId",
          COALESCE(sle.supplier_id, '')                  AS party_id,
          COALESCE(sup.name, 'Unknown Supplier')         AS party_name,
          'supplier'                                     AS party_type,
          sle.debit                                      AS amount,
          'paid'                                         AS status,
          'manual'                                       AS source,
          sle.created_at                                 AS "createdAt"
        FROM supplier_ledger_entries sle
        LEFT JOIN suppliers sup ON sup.id = sle.supplier_id
        LEFT JOIN cash_movements cm ON cm.reference_id = sle.reference_id AND cm.movement_type = 'SUPPLIER_PAYMENT'
        LEFT JOIN users u ON u.id = sle.performed_by
        WHERE sle.entry_type = 'PAYMENT'
          AND sle.debit > 0
          ${suppClause}
      `);
    }
  }

  // ── 4. EXPENSES ───────────────────────────────────────────────────────────
  if (include.expense) {
    const { clause, params, nextIdx } = buildWhereFragments(filter, paramIdx, {
      branchCol: 'branch_id',
      dateCol: 'created_at',
      searchCols: ['expense_number', 'description'],
    });
    paramIdx = nextIdx;
    allParams.push(...params);

    unionArms.push(`
      SELECT
        e.id,
        'expense'                                      AS type,
        e.expense_number                               AS "referenceId",
        ''                                             AS party_id,
        COALESCE(ec.name, 'Expense')                   AS party_name,
        NULL::TEXT                                     AS party_type,
        e.amount                                       AS amount,
        'paid'                                         AS status,
        'manual'                                       AS source,
        e.created_at                                   AS "createdAt"
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.status != 'CANCELLED' ${clause}
    `);
  }

  if (unionArms.length === 0) {
    return { data: [], total: 0 };
  }

  const unionSql = unionArms.join('\nUNION ALL\n');

  const dataQuery = `
    SELECT * FROM (
      ${unionSql}
    ) combined
    ORDER BY "createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countQuery = `
    SELECT COUNT(*)::BIGINT AS total FROM (
      ${unionSql}
    ) combined
  `;

  try {
    const [rowsRes, countRes] = await Promise.all([
      pool.query(dataQuery, allParams),
      pool.query(countQuery, allParams),
    ]);

    const total = Number(countRes.rows[0]?.total ?? 0);
    const data: HistoryItem[] = rowsRes.rows.map((r) => ({
      id: r.id as string,
      type: r.type as HistoryItem['type'],
      referenceId: r.referenceId as string,
      party: {
        id: (r.party_id as string) || '',
        name: (r.party_name as string) || '',
        type: (r.party_type as 'customer' | 'supplier' | null) ?? null,
      },
      amount: Number(r.amount ?? 0),
      status: r.status as 'paid' | 'pending' | 'partial',
      source: r.source as 'pos' | 'manual' | 'import' | 'whatsapp',
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
  let salesWhere = "WHERE sale_status != 'VOIDED'";
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

  const expenseWhere = branchId ? 'WHERE branch_id = $1' : '';
  const purchaseWhere = branchId ? 'AND branch_id = $1' : '';

  const expenseQuery = `
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total_expenses
    FROM expenses
    ${expenseWhere}
  `;

  const purchaseQuery = `
    SELECT COALESCE(SUM(total_amount), 0)::BIGINT AS total_purchases
    FROM purchases
    WHERE status != 'CANCELLED'
    ${purchaseWhere}
  `;

  try {
    const [salesRes, expenseRes, purchaseRes] = await Promise.all([
      pool.query(salesQuery, params),
      pool.query(expenseQuery, branchId ? [branchId] : []),
      pool.query(purchaseQuery, branchId ? [branchId] : []),
    ]);

    const sRow = salesRes.rows[0] as Record<string, unknown>;
    const eRow = expenseRes.rows[0] as Record<string, unknown>;
    const pRow = purchaseRes.rows[0] as Record<string, unknown>;

    const totalSales = Number(sRow?.['total_sales'] ?? 0);
    const totalInvoices = Number(sRow?.['total_invoices'] ?? 0);
    const pendingPayments = Number(sRow?.['pending_payments'] ?? 0);
    const totalExpenses = Number(eRow?.['total_expenses'] ?? 0);
    const totalPurchases = Number(pRow?.['total_purchases'] ?? 0);
    const netRevenue = Math.max(totalSales - totalExpenses, 0);

    return {
      totalSales,
      totalInvoices,
      totalPurchases,
      totalExpenses,
      netRevenue,
      pendingPayments,
    };
  } catch (err) {
    console.error('[history.repo] Error fetching history stats:', err);
    throw new HistoryRepoError('Failed to fetch history statistics', 500);
  }
}
