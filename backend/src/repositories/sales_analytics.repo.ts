/**
 * Sales Analytics PostgreSQL Repository
 *
 * Read-only analytics queries. All monetary values are whole PKR integers (BIGINT).
 * Follows the same date-parsing and filter-building conventions as profit.repo.ts.
 */

import { Pool } from 'pg';

// ─── Filter & shared helpers ──────────────────────────────────────────────────

export interface SaFilters {
  branch_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

function parseDateStart(d: string): string {
  const p = d.split('-').map(Number);
  if (p.length === 3 && p.every(n => !isNaN(n))) {
    return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).toISOString();
  }
  return d;
}

function parseDateEnd(d: string): string {
  const p = d.split('-').map(Number);
  if (p.length === 3 && p.every(n => !isNaN(n))) {
    return new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).toISOString();
  }
  return d;
}

function buildSalesWhere(f: SaFilters, pIdx: number, tablePrefix = ''): { clause: string; params: unknown[]; nextIdx: number } {
  const p = tablePrefix ? `${tablePrefix}.` : '';
  let clause = `WHERE ${p}sale_status != 'VOIDED'`;
  const params: unknown[] = [];
  if (f.branch_id) {
    clause += ` AND ${p}branch_id = $${pIdx++}`;
    params.push(f.branch_id);
  }
  if (f.start_date) {
    clause += ` AND ${p}created_at >= $${pIdx++}`;
    params.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    clause += ` AND ${p}created_at <= $${pIdx++}`;
    params.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }
  return { clause, params, nextIdx: pIdx };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaOverviewData {
  gross_sales: number;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin: number;
  cash_received: number;
  credit_sales: number;
  total_invoices: number;
  returns_count: number;
  returned_revenue: number;
}

export interface SaProductRow {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_sold: number;
  gross_revenue: number;
  net_revenue: number;
  total_cogs: number;
  gross_profit: number;
  margin_pct: number;
  missing_cost_snapshot: boolean;
}

export interface SaRepairSummary {
  total_jobs: number;
  completed_jobs: number;
  total_billed: number;
  total_collected: number;
  outstanding_balance: number;
  parts_revenue: number;
  parts_cost: number;
  labour_revenue: number;
  total_profit: number;
}

export interface SaMobileSummary {
  total_devices: number;
  devices_sold: number;
  devices_in_stock: number;
  total_sale_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
}

export type SaAnomalyType = 'PAYMENT_MISMATCH' | 'BELOW_COST_SALE' | 'MISSING_COST_SNAPSHOT';

export interface SaAnomaly {
  anomaly_type: SaAnomalyType;
  sale_id: string;
  invoice_ref: string | null;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number | null;
  created_at: string;
}

export interface SaException {
  id: string;
  category: string;
  severity: string;
  source_type: string;
  source_id: string;
  source_ref: string | null;
  rule_code: string;
  explanation: string;
  status: string;
  created_at: string;
}

export interface SaFullReport {
  overview: SaOverviewData;
  products: SaProductRow[];
  repair_summary: SaRepairSummary;
  mobile_summary: SaMobileSummary;
  anomalies: SaAnomaly[];
  exceptions: SaException[];
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(pool: Pool, f: SaFilters): Promise<SaOverviewData> {
  const { clause: salesClause, params: salesParams } = buildSalesWhere(f, 1);

  // 1. Gross sales & invoice count from sales
  const salesQ = `
    SELECT
      COALESCE(SUM(total_amount), 0)::BIGINT AS gross_sales,
      COUNT(*)::BIGINT                        AS total_invoices
    FROM sales ${salesClause}
  `;

  // 2. COGS from sale_lines (product sales)
  const { clause: linesClause, params: linesParams } = buildSalesWhere(f, 1, 's');
  const linesCogsQ = `
    SELECT COALESCE(SUM(sl.quantity * sl.cost_price_snapshot), 0)::BIGINT AS lines_cogs
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    ${linesClause}
  `;

  // 3. COGS from mobile_sale_items
  const { clause: mobileClause, params: mobileParams } = buildSalesWhere(f, 1, 's');
  const mobileCogsQ = `
    SELECT COALESCE(SUM(msi.cost_price_snapshot), 0)::BIGINT AS mobile_cogs
    FROM mobile_sale_items msi
    JOIN sales s ON msi.sale_id = s.id
    ${mobileClause}
      AND msi.is_return = FALSE
  `;

  // 4. Cash received from CASH sale_payments
  const { clause: cashClause, params: cashParams } = buildSalesWhere(f, 1, 's');
  const cashQ = `
    SELECT COALESCE(SUM(sp.amount), 0)::BIGINT AS cash_received
    FROM sale_payments sp
    JOIN sales s ON sp.sale_id = s.id
    ${cashClause}
      AND sp.payment_method = 'CASH'
  `;

  // 5. Credit sales (customer ledger debit entries of type SALE)
  // Branch attribution hierarchy:
  // Primary: s.branch_id via cle.reference_id = s.id
  // Fallback: u.branch_id via cle.performed_by = u.id
  let creditWhere = "WHERE cle.entry_type = 'SALE'";
  const creditParams: unknown[] = [];
  let cIdx = 1;
  if (f.branch_id) {
    creditWhere += ` AND COALESCE(s.branch_id, u.branch_id) = $${cIdx++}`;
    creditParams.push(f.branch_id);
  }
  if (f.start_date) {
    creditWhere += ` AND cle.created_at >= $${cIdx++}`;
    creditParams.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    creditWhere += ` AND cle.created_at <= $${cIdx++}`;
    creditParams.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }
  const creditQ = `
    SELECT COALESCE(SUM(cle.debit), 0)::BIGINT AS credit_sales
    FROM customer_ledger_entries cle
    LEFT JOIN sales s ON cle.reference_id = s.id AND cle.entry_type = 'SALE'
    LEFT JOIN users u ON cle.performed_by = u.id
    ${creditWhere}
  `;

  // 6. Returns revenue & count
  let retWhere = "WHERE status = 'COMPLETED'";
  const retParams: unknown[] = [];
  let rIdx = 1;
  if (f.branch_id) {
    retWhere += ` AND branch_id = $${rIdx++}`;
    retParams.push(f.branch_id);
  }
  if (f.start_date) {
    retWhere += ` AND created_at >= $${rIdx++}`;
    retParams.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    retWhere += ` AND created_at <= $${rIdx++}`;
    retParams.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }
  const returnsQ = `
    SELECT
      COALESCE(SUM(total_amount), 0)::BIGINT AS returned_revenue,
      COUNT(*)::BIGINT                        AS returns_count
    FROM sales_returns ${retWhere}
  `;

  // 7. Returns COGS from sales_return_lines joined to sale_lines
  let retCogsWhere = "WHERE sr.status = 'COMPLETED'";
  const retCogsParams: unknown[] = [];
  let rcIdx = 1;
  if (f.branch_id) {
    retCogsWhere += ` AND sr.branch_id = $${rcIdx++}`;
    retCogsParams.push(f.branch_id);
  }
  if (f.start_date) {
    retCogsWhere += ` AND sr.created_at >= $${rcIdx++}`;
    retCogsParams.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    retCogsWhere += ` AND sr.created_at <= $${rcIdx++}`;
    retCogsParams.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }
  const returnsCogsQ = `
    SELECT
      COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0)::BIGINT AS returned_cogs
    FROM sales_return_lines srl
    JOIN sales_returns sr ON srl.return_id = sr.id
    JOIN sale_lines sl ON srl.sale_line_id = sl.id
    ${retCogsWhere}
  `;

  const [sRes, lcRes, mcRes, cashRes, creditRes, retRes, retCogsRes] = await Promise.all([
    pool.query(salesQ, salesParams),
    pool.query(linesCogsQ, linesParams),
    pool.query(mobileCogsQ, mobileParams),
    pool.query(cashQ, cashParams),
    pool.query(creditQ, creditParams),
    pool.query(returnsQ, retParams),
    pool.query(returnsCogsQ, retCogsParams),
  ]);

  const grossSales      = Number(sRes.rows[0]?.['gross_sales']      ?? 0);
  const totalInvoices   = Number(sRes.rows[0]?.['total_invoices']   ?? 0);
  const linesCogs       = Number(lcRes.rows[0]?.['lines_cogs']      ?? 0);
  const mobileCogs      = Number(mcRes.rows[0]?.['mobile_cogs']     ?? 0);
  const cashReceived    = Number(cashRes.rows[0]?.['cash_received']  ?? 0);
  const creditSales     = Number(creditRes.rows[0]?.['credit_sales'] ?? 0);
  const returnedRevenue = Number(retRes.rows[0]?.['returned_revenue'] ?? 0);
  const returnsCount    = Number(retRes.rows[0]?.['returns_count']    ?? 0);
  const returnedCogs    = Number(retCogsRes.rows[0]?.['returned_cogs'] ?? 0);

  const grossCogs   = linesCogs + mobileCogs;
  const totalCogs   = grossCogs - returnedCogs;
  const netSales    = grossSales - returnedRevenue;
  const grossProfit = netSales - totalCogs;
  const grossMargin = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;

  return {
    gross_sales: grossSales,
    net_sales: netSales,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    cash_received: cashReceived,
    credit_sales: creditSales,
    total_invoices: totalInvoices,
    returns_count: returnsCount,
    returned_revenue: returnedRevenue,
  };
}

// ─── Product profitability ────────────────────────────────────────────────────

export async function getProductAnalytics(pool: Pool, f: SaFilters): Promise<SaProductRow[]> {
  const params: unknown[] = [];
  let pIdx = 1;
  let branchJoin = '';
  let branchWhere = '';
  if (f.branch_id) {
    branchWhere = ` AND s.branch_id = $${pIdx++}`;
    params.push(f.branch_id);
  }
  if (f.start_date) {
    branchWhere += ` AND s.created_at >= $${pIdx++}`;
    params.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    branchWhere += ` AND s.created_at <= $${pIdx++}`;
    params.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }
  void branchJoin;

  const q = `
    SELECT
      sl.product_id,
      MIN(sl.product_name_snapshot)                                       AS product_name,
      MIN(sl.sku_snapshot)                                                AS sku,
      COALESCE(SUM(sl.quantity), 0)::BIGINT                              AS quantity_sold,
      COALESCE(SUM(sl.unit_price * sl.quantity), 0)::BIGINT              AS gross_revenue,
      COALESCE(SUM(sl.line_total), 0)::BIGINT                            AS net_revenue,
      COALESCE(SUM(sl.quantity * sl.cost_price_snapshot), 0)::BIGINT     AS total_cogs,
      BOOL_OR(sl.cost_price_snapshot IS NULL OR sl.cost_price_snapshot = 0) AS missing_cost_snapshot
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    WHERE s.sale_status != 'VOIDED'${branchWhere}
    GROUP BY sl.product_id
    ORDER BY SUM(sl.line_total) DESC
    LIMIT 200
  `;

  const res = await pool.query(q, params);
  return (res.rows as Array<Record<string, unknown>>).map(row => {
    const netRev   = Number(row['net_revenue']  ?? 0);
    const totalCogs = Number(row['total_cogs']  ?? 0);
    const profit   = netRev - totalCogs;
    const margin   = netRev > 0 ? Number(((profit / netRev) * 100).toFixed(2)) : 0;
    return {
      product_id:            String(row['product_id'] ?? ''),
      product_name:          String(row['product_name'] ?? ''),
      sku:                   String(row['sku'] ?? ''),
      quantity_sold:         Number(row['quantity_sold'] ?? 0),
      gross_revenue:         Number(row['gross_revenue'] ?? 0),
      net_revenue:           netRev,
      total_cogs:            totalCogs,
      gross_profit:          profit,
      margin_pct:            margin,
      missing_cost_snapshot: row['missing_cost_snapshot'] === true,
    };
  });
}

// ─── Repair profitability ─────────────────────────────────────────────────────

export async function getRepairAnalytics(pool: Pool, f: SaFilters): Promise<SaRepairSummary> {
  // Gate 4 (G4-FIX-03 / SA-01 / NEW-SA-02): Fix status casing from mixed-case 'Delivered'
    // to canonical all-caps 'DELIVERED' matching repair_jobs.status CHECK constraint values.
    // Prior code returned zero rows for completed_jobs when DB stores 'DELIVERED'.
    let where = "WHERE rj.status = 'DELIVERED'";
  const params: unknown[] = [];
  let pIdx = 1;
  if (f.branch_id) {
    where += ` AND rj.branch_id = $${pIdx++}`;
    params.push(f.branch_id);
  }
  if (f.start_date) {
    where += ` AND rj.created_at >= $${pIdx++}`;
    params.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    where += ` AND rj.created_at <= $${pIdx++}`;
    params.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }

  // Count total jobs (all statuses) for the branch/period
  let totalWhere = 'WHERE 1=1';
  const totalParams: unknown[] = [];
  let tIdx = 1;
  if (f.branch_id) {
    totalWhere += ` AND branch_id = $${tIdx++}`;
    totalParams.push(f.branch_id);
  }
  if (f.start_date) {
    totalWhere += ` AND created_at >= $${tIdx++}`;
    totalParams.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    totalWhere += ` AND created_at <= $${tIdx++}`;
    totalParams.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }

  // Delivered repair jobs in period
  // DEFECT-SA-01, DEFECT-SA-02, DEFECT-SA-03, DEFECT-SA-04 & DEFECT-SA-05 (Hardened) FIX:
  // 1. Separate parts and payments aggregations to eliminate Cartesian product multiplication (DEFECT-SA-01).
  // 2. Only count genuinely consumed parts: stock_deducted = TRUE (or consumables without product_id) (DEFECT-SA-02).
  // 3. DEFECT-SA-03 & DEFECT-SA-05: Use authoritative final_charge from repair_commission_records,
  //    or fallback reconstructing max(estimated_cost, partsTotal + laborTotal + additionalCharges - discount).
  //    Hardened against invalid JSON and non-numeric strings: rj.labor_charges is selected as TEXT and parsed safely via parseJsonField in Node.
  // 4. DEFECT-SA-04: Calculate outstanding balance independently per job: GREATEST(0, job_billed - job_collected)
  //    before summing, ensuring overpayments on one repair job never forgive customer debt on another job.
  const deliveredQ = `
    WITH delivered_jobs AS (
      SELECT
        rj.id,
        rj.estimated_cost,
        rj.additional_charges,
        rj.discount,
        rj.labor_charges,
        rcr.final_charge AS comm_final_charge
      FROM repair_jobs rj
      LEFT JOIN repair_commission_records rcr ON rcr.repair_job_id = rj.id
      ${where}
    ),
    parts_agg AS (
      SELECT
        rp.repair_job_id,
        COALESCE(SUM(rp.qty * rp.price), 0)::BIGINT AS parts_revenue,
        COALESCE(SUM(rp.qty * rp.cost), 0)::BIGINT  AS parts_cost
      FROM repair_parts rp
      WHERE rp.repair_job_id IN (SELECT id FROM delivered_jobs)
        AND (rp.stock_deducted = TRUE OR rp.product_id IS NULL)
      GROUP BY rp.repair_job_id
    ),
    payments_agg AS (
      SELECT
        rpay.repair_job_id,
        COALESCE(SUM(rpay.amount), 0)::BIGINT AS job_collected
      FROM repair_payments rpay
      WHERE rpay.repair_job_id IN (SELECT id FROM delivered_jobs)
      GROUP BY rpay.repair_job_id
    )
    SELECT
      dj.id,
      dj.estimated_cost,
      dj.additional_charges,
      dj.discount,
      dj.labor_charges,
      dj.comm_final_charge,
      COALESCE(pa.parts_revenue, 0)::BIGINT AS parts_revenue,
      COALESCE(pa.parts_cost, 0)::BIGINT    AS parts_cost,
      COALESCE(pya.job_collected, 0)::BIGINT AS job_collected
    FROM delivered_jobs dj
    LEFT JOIN parts_agg pa ON pa.repair_job_id = dj.id
    LEFT JOIN payments_agg pya ON pya.repair_job_id = dj.id
  `;

  const totalCountQ = `SELECT COUNT(*)::BIGINT AS total_jobs FROM repair_jobs ${totalWhere}`;

  const [deliveredRes, totalRes] = await Promise.all([
    pool.query(deliveredQ, params),
    pool.query(totalCountQ, totalParams),
  ]);

  let partsRevenue = 0;
  let partsCost = 0;
  let totalBilled = 0;
  let totalCollected = 0;
  let outstandingBalance = 0;

  for (const row of deliveredRes.rows as Array<Record<string, unknown>>) {
    const jobPartsRev = Number(row['parts_revenue'] ?? 0);
    const jobPartsCost = Number(row['parts_cost'] ?? 0);
    const jobCollected = Number(row['job_collected'] ?? 0);

    partsRevenue += jobPartsRev;
    partsCost += jobPartsCost;
    totalCollected += jobCollected;

    let jobBilled = 0;
    const commFinalCharge = row['comm_final_charge'];
    if (commFinalCharge !== null && commFinalCharge !== undefined) {
      jobBilled = Number(commFinalCharge);
    } else {
      const estCost = Number(row['estimated_cost'] ?? 0);
      const addCharges = Number(row['additional_charges'] ?? 0);
      const discount = Number(row['discount'] ?? 0);

      // Safe JSON parsing identical to repair.repo.ts parseJsonField
      let laborTotal = 0;
      const rawLabor = row['labor_charges'];
      if (typeof rawLabor === 'string' && rawLabor.trim()) {
        try {
          const parsed = JSON.parse(rawLabor.trim());
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === 'object' && 'amount' in item) {
                const val = Number((item as Record<string, unknown>)['amount']);
                if (Number.isFinite(val)) {
                  laborTotal += Math.trunc(val);
                }
              }
            }
          }
        } catch {
          laborTotal = 0;
        }
      }

      jobBilled = Math.max(estCost, jobPartsRev + laborTotal + addCharges - discount);
    }

    totalBilled += jobBilled;
    // DEFECT-SA-04: Calculate outstanding balance independently per job: MAX(0, jobBilled - jobCollected)
    outstandingBalance += Math.max(0, jobBilled - jobCollected);
  }

  const completedJobs = deliveredRes.rows.length;
  const totalJobs = Number(totalRes.rows[0]?.['total_jobs'] ?? 0);
  const labourRevenue = Math.max(0, totalBilled - partsRevenue);
  const totalProfit = totalBilled - partsCost;

  return {
    total_jobs:           totalJobs,
    completed_jobs:       completedJobs,
    total_billed:         totalBilled,
    total_collected:      totalCollected,
    outstanding_balance:  outstandingBalance,
    parts_revenue:        partsRevenue,
    parts_cost:           partsCost,
    labour_revenue:       labourRevenue,
    total_profit:         totalProfit,
  };
}

// ─── Mobile profitability ─────────────────────────────────────────────────────

export async function getMobileAnalytics(pool: Pool, f: SaFilters): Promise<SaMobileSummary> {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let pIdx = 1;
  if (f.branch_id) {
    where += ` AND md.branch_id = $${pIdx++}`;
    params.push(f.branch_id);
  }
  if (f.start_date) {
    where += ` AND md.created_at >= $${pIdx++}`;
    params.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    where += ` AND md.created_at <= $${pIdx++}`;
    params.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }

  const q = `
    SELECT
      COUNT(*)::BIGINT                                                                              AS total_devices,
      COUNT(CASE WHEN md.status = 'SOLD'     THEN 1 END)::BIGINT                                  AS devices_sold,
      COUNT(CASE WHEN md.status = 'IN_STOCK' THEN 1 END)::BIGINT                                  AS devices_in_stock,
      COALESCE(SUM(CASE WHEN md.status = 'SOLD' THEN msi.sale_price         ELSE 0 END), 0)::BIGINT AS total_sale_revenue,
      COALESCE(SUM(CASE WHEN md.status = 'SOLD' THEN msi.cost_price_snapshot ELSE 0 END), 0)::BIGINT AS total_cogs
    FROM mobile_devices md
    LEFT JOIN mobile_sale_items msi ON msi.device_id = md.id AND msi.is_return = FALSE
    ${where}
  `;

  const res = await pool.query(q, params);
  const row = res.rows[0] as Record<string, unknown>;

  const totalDevices    = Number(row['total_devices']     ?? 0);
  const devicesSold     = Number(row['devices_sold']      ?? 0);
  const devicesInStock  = Number(row['devices_in_stock']  ?? 0);
  const totalSaleRev    = Number(row['total_sale_revenue'] ?? 0);
  const totalCogs       = Number(row['total_cogs']         ?? 0);
  const grossProfit     = totalSaleRev - totalCogs;
  const grossMarginPct  = totalSaleRev > 0
    ? Number(((grossProfit / totalSaleRev) * 100).toFixed(2))
    : 0;

  return {
    total_devices:     totalDevices,
    devices_sold:      devicesSold,
    devices_in_stock:  devicesInStock,
    total_sale_revenue: totalSaleRev,
    total_cogs:        totalCogs,
    gross_profit:      grossProfit,
    gross_margin_pct:  grossMarginPct,
  };
}

// ─── Reconciliation anomalies ─────────────────────────────────────────────────

export async function getReconciliationAnomalies(pool: Pool, f: SaFilters): Promise<SaAnomaly[]> {
  const { clause: salesClause, params: salesParams } = buildSalesWhere(f, 1);

  // Q1: Payment mismatches
  const mismatchQ = `
    SELECT
      s.id               AS sale_id,
      s.invoice_number   AS invoice_ref,
      s.total_amount     AS expected_amount,
      COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0)::BIGINT AS actual_amount,
      s.created_at
    FROM sales s
    ${salesClause}
      AND s.total_amount != COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0)
    ORDER BY s.created_at DESC
    LIMIT 100
  `;

  // Q2: Below-cost sales
  const belowCostQ = `
    SELECT DISTINCT
      s.id              AS sale_id,
      s.invoice_number  AS invoice_ref,
      sl.unit_price     AS actual_amount,
      sl.cost_price_snapshot AS expected_amount,
      s.created_at
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    ${salesClause.replace('WHERE sale_status', 'WHERE s.sale_status')}
      AND sl.cost_price_snapshot > 0
      AND sl.unit_price < sl.cost_price_snapshot
    ORDER BY s.created_at DESC
    LIMIT 100
  `;

  // Q3: Missing cost snapshots
  const missingCostQ = `
    SELECT DISTINCT
      s.id             AS sale_id,
      s.invoice_number AS invoice_ref,
      s.created_at
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    ${salesClause.replace('WHERE sale_status', 'WHERE s.sale_status')}
      AND (sl.cost_price_snapshot IS NULL OR sl.cost_price_snapshot = 0)
    ORDER BY s.created_at DESC
    LIMIT 100
  `;

  const [mmRes, bcRes, mcRes] = await Promise.all([
    pool.query(mismatchQ, salesParams),
    pool.query(belowCostQ, salesParams),
    pool.query(missingCostQ, salesParams),
  ]);

  const toAnomaly = (
    rows: Array<Record<string, unknown>>,
    type: SaAnomalyType
  ): SaAnomaly[] =>
    rows.map(r => ({
      anomaly_type:    type,
      sale_id:         String(r['sale_id'] ?? ''),
      invoice_ref:     r['invoice_ref'] != null ? String(r['invoice_ref']) : null,
      expected_amount: r['expected_amount'] != null ? Number(r['expected_amount']) : null,
      actual_amount:   r['actual_amount']   != null ? Number(r['actual_amount'])   : null,
      difference:
        r['expected_amount'] != null && r['actual_amount'] != null
          ? Number(r['expected_amount']) - Number(r['actual_amount'])
          : null,
      created_at: r['created_at'] ? String(r['created_at']) : new Date().toISOString(),
    }));

  return [
    ...toAnomaly(mmRes.rows as Array<Record<string, unknown>>, 'PAYMENT_MISMATCH'),
    ...toAnomaly(bcRes.rows as Array<Record<string, unknown>>, 'BELOW_COST_SALE'),
    ...toAnomaly(mcRes.rows as Array<Record<string, unknown>>, 'MISSING_COST_SNAPSHOT'),
  ];
}

// ─── Persisted exceptions ─────────────────────────────────────────────────────

export async function listExceptions(
  pool: Pool,
  organizationId: string,
  f: SaFilters,
  limit = 100
): Promise<SaException[]> {
  let where = 'WHERE organization_id = $1';
  const params: unknown[] = [organizationId];
  let pIdx = 2;

  if (f.branch_id) {
    where += ` AND branch_id = $${pIdx++}`;
    params.push(f.branch_id);
  }
  if (f.start_date) {
    where += ` AND created_at >= $${pIdx++}`;
    params.push(f.start_date.length === 10 ? parseDateStart(f.start_date) : f.start_date);
  }
  if (f.end_date) {
    where += ` AND created_at <= $${pIdx++}`;
    params.push(f.end_date.length === 10 ? parseDateEnd(f.end_date) : f.end_date);
  }

  const q = `
    SELECT id, category, severity, source_type, source_id, source_ref,
           rule_code, explanation, status, created_at
    FROM sales_analytics_exceptions
    ${where}
    ORDER BY
      CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH'     THEN 2
        WHEN 'MEDIUM'   THEN 3
        WHEN 'LOW'      THEN 4
        ELSE 5
      END,
      created_at DESC
    LIMIT $${pIdx}
  `;
  params.push(limit);

  const res = await pool.query(q, params);
  return (res.rows as Array<Record<string, unknown>>).map(r => ({
    id:          String(r['id'] ?? ''),
    category:    String(r['category'] ?? ''),
    severity:    String(r['severity'] ?? ''),
    source_type: String(r['source_type'] ?? ''),
    source_id:   String(r['source_id'] ?? ''),
    source_ref:  r['source_ref'] != null ? String(r['source_ref']) : null,
    rule_code:   String(r['rule_code'] ?? ''),
    explanation: String(r['explanation'] ?? ''),
    status:      String(r['status'] ?? ''),
    created_at:  r['created_at'] ? String(r['created_at']) : new Date().toISOString(),
  }));
}

// ─── Full report (parallel fetch) ─────────────────────────────────────────────

export async function getFullReport(
  pool: Pool,
  organizationId: string,
  f: SaFilters
): Promise<SaFullReport> {
  const [overview, products, repair_summary, mobile_summary, anomalies, exceptions] = await Promise.all([
    getAnalyticsOverview(pool, f),
    getProductAnalytics(pool, f),
    getRepairAnalytics(pool, f),
    getMobileAnalytics(pool, f),
    getReconciliationAnomalies(pool, f),
    listExceptions(pool, organizationId, f),
  ]);

  return { overview, products, repair_summary, mobile_summary, anomalies, exceptions };
}
