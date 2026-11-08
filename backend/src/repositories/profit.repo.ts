/**
 * Profit & Gross Margin PostgreSQL Repository
 * Direct TypeScript port of src-tauri/src/services/profit_service.rs.
 *
 * DASHBOARD-KPI-PHASE3: Added sales_returns deduction queries so that
 * completed cash returns reduce net_sales, total_cogs, gross_profit and
 * gross_margin exactly as the Rust profit_repository.rs reference does.
 */

import { Pool } from 'pg';

export interface ProfitReportFilter {
  branch_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ProfitSummaryDto {
  gross_sales: number;
  total_discounts: number;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin: number; // percentage
  total_invoices: number;
  total_items_sold: number;
  returns_count: number; // DASHBOARD-KPI-PHASE3B: completed returns in period
  returned_revenue: number;
  returned_cogs: number;
}

export interface ProductProfitDto {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_sold: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
}

export interface ProfitMetricsDto {
  gross_revenue: number;
  discounts: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  orders_count: number;
  returns_count?: number;
  returned_revenue?: number;
}

export interface DashboardProfitSummaryDto {
  today: ProfitMetricsDto;
  this_week: ProfitMetricsDto;
  this_month: ProfitMetricsDto;
  total: ProfitMetricsDto;
}

export class ProfitRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'ProfitRepoError';
  }
}

function parseLocalDateStart(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).toISOString();
  }
  return dateStr;
}

function parseLocalDateEnd(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).toISOString();
  }
  return dateStr;
}

export async function getProfitSummary(
  pool: Pool,
  filter?: ProfitReportFilter
): Promise<ProfitSummaryDto> {
  // ── Sales query params (Query 1) ──────────────────────────────────────────
  let salesWhere = "WHERE sale_status != 'VOIDED'";
  const params: unknown[] = [];
  let pIdx = 1;

  if (filter?.branch_id) {
    salesWhere += ` AND branch_id = $${pIdx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    salesWhere += ` AND created_at >= $${pIdx++}`;
    params.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    salesWhere += ` AND created_at <= $${pIdx++}`;
    params.push(eDate);
  }

  const salesSummaryQuery = `
    SELECT 
      COALESCE(SUM(subtotal), 0)::BIGINT AS gross_sales,
      COALESCE(SUM(discount), 0)::BIGINT AS total_discounts,
      COALESCE(SUM(total_amount), 0)::BIGINT AS net_sales,
      COUNT(*)::BIGINT AS total_invoices
    FROM sales
    ${salesWhere}
  `;

  // ── Sale-lines query params (Query 2) ─────────────────────────────────────
  let linesWhere = "WHERE sale_id IN (SELECT id FROM sales WHERE sale_status != 'VOIDED'";
  const lineParams: unknown[] = [];
  let lpIdx = 1;

  if (filter?.branch_id) {
    linesWhere += ` AND branch_id = $${lpIdx++}`;
    lineParams.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    linesWhere += ` AND created_at >= $${lpIdx++}`;
    lineParams.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    linesWhere += ` AND created_at <= $${lpIdx++}`;
    lineParams.push(eDate);
  }
  linesWhere += ')';

  const linesSummaryQuery = `
    SELECT 
      COALESCE(SUM(quantity * cost_price_snapshot), 0)::BIGINT AS total_cogs,
      COALESCE(SUM(quantity), 0)::BIGINT AS total_items_sold
    FROM sale_lines
    ${linesWhere}
  `;

  // ── Mobile-sale-items query params (Query 2b) ────────────────────────────
  // Serialized mobile devices record cost in mobile_sale_items rather than sale_lines.
  // We query non-returned mobile sale items for the matching non-voided sales.
  let mobileWhere = "WHERE is_return = FALSE AND sale_id IN (SELECT id FROM sales WHERE sale_status != 'VOIDED'";
  const mobileParams: unknown[] = [];
  let mpIdx = 1;

  if (filter?.branch_id) {
    mobileWhere += ` AND branch_id = $${mpIdx++}`;
    mobileParams.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    mobileWhere += ` AND created_at >= $${mpIdx++}`;
    mobileParams.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    mobileWhere += ` AND created_at <= $${mpIdx++}`;
    mobileParams.push(eDate);
  }
  mobileWhere += ')';

  const mobileSummaryQuery = `
    SELECT
      COALESCE(SUM(cost_price_snapshot), 0)::BIGINT AS total_mobile_cogs,
      COUNT(*)::BIGINT AS total_mobiles_sold
    FROM mobile_sale_items
    ${mobileWhere}
  `;

  // ── DASHBOARD-KPI-PHASE3: Returns revenue query params (Query 3) ──────────
  // Uses sr.created_at (return timestamp) with the same date/branch boundaries
  // so that a return made today reduces today's net figures regardless of when
  // the original sale occurred.  Only status='COMPLETED' returns are counted;
  // CANCELLED / PENDING returns do NOT affect KPIs.
  let returnsRevenueWhere = "WHERE status = 'COMPLETED'";
  const retRevParams: unknown[] = [];
  let rrIdx = 1;

  if (filter?.branch_id) {
    returnsRevenueWhere += ` AND branch_id = $${rrIdx++}`;
    retRevParams.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    returnsRevenueWhere += ` AND created_at >= $${rrIdx++}`;
    retRevParams.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    returnsRevenueWhere += ` AND created_at <= $${rrIdx++}`;
    retRevParams.push(eDate);
  }

  const returnsRevenueQuery = `
    SELECT
      COALESCE(SUM(total_amount), 0)::BIGINT AS returned_revenue,
      COUNT(*)::BIGINT AS returns_count
    FROM sales_returns
    ${returnsRevenueWhere}
  `;

  // ── DASHBOARD-KPI-PHASE3: Returns COGS query params (Query 4) ────────────
  // Joins sales_return_lines → sale_lines to recover the original
  // cost_price_snapshot so that COGS reversal uses historical cost, not
  // current product cost.
  let returnsCogsWhere = "WHERE sr.status = 'COMPLETED'";
  const retCogsParams: unknown[] = [];
  let rcIdx = 1;

  if (filter?.branch_id) {
    returnsCogsWhere += ` AND sr.branch_id = $${rcIdx++}`;
    retCogsParams.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? parseLocalDateStart(filter.start_date) : filter.start_date;
    returnsCogsWhere += ` AND sr.created_at >= $${rcIdx++}`;
    retCogsParams.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? parseLocalDateEnd(filter.end_date) : filter.end_date;
    returnsCogsWhere += ` AND sr.created_at <= $${rcIdx++}`;
    retCogsParams.push(eDate);
  }

  const returnsCogsQuery = `
    SELECT
      COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0)::BIGINT AS returned_cogs
    FROM sales_return_lines srl
    JOIN sales_returns sr ON srl.return_id = sr.id
    JOIN sale_lines sl ON srl.sale_line_id = sl.id
    ${returnsCogsWhere}
  `;

  try {
    // Run all five queries in parallel for minimal latency
    const [salesRes, linesRes, mobileRes, retRevRes, retCogsRes] = await Promise.all([
      pool.query(salesSummaryQuery, params),
      pool.query(linesSummaryQuery, lineParams),
      pool.query(mobileSummaryQuery, mobileParams),
      pool.query(returnsRevenueQuery, retRevParams),
      pool.query(returnsCogsQuery, retCogsParams),
    ]);

    const sRow = salesRes.rows[0] as Record<string, unknown>;
    const lRow = linesRes.rows[0] as Record<string, unknown>;
    const mRow = mobileRes.rows[0] as Record<string, unknown>;
    const rrRow = retRevRes.rows[0] as Record<string, unknown>;
    const rcRow = retCogsRes.rows[0] as Record<string, unknown>;

    // Gross figures from sales / sale_lines / mobile_sale_items
    const grossSales         = Number(sRow?.['gross_sales']         ?? 0);
    const totalDiscounts     = Number(sRow?.['total_discounts']     ?? 0);
    const grossNetSales      = Number(sRow?.['net_sales']           ?? 0);
    const grossInvoices      = Number(sRow?.['total_invoices']      ?? 0);
    const linesCogs          = Number(lRow?.['total_cogs']          ?? 0);
    const linesItemsSold     = Number(lRow?.['total_items_sold']    ?? 0);
    const mobileCogs         = Number(mRow?.['total_mobile_cogs']   ?? 0);
    const mobileItemsSold    = Number(mRow?.['total_mobiles_sold']  ?? 0);

    const grossCogs      = linesCogs + mobileCogs;
    const totalItemsSold = linesItemsSold + mobileItemsSold;

    // DASHBOARD-KPI-PHASE3: Return deductions
    const returnedRevenue = Number(rrRow?.['returned_revenue'] ?? 0);
    const returnsCount    = Number(rrRow?.['returns_count']    ?? 0);
    const returnedCogs    = Number(rcRow?.['returned_cogs']    ?? 0);

    // Phase 3B Critical Accounting: Do NOT clamp net sales or COGS to zero,
    // as returns on a day without sales are valid negative financial events.
    const netSales    = grossNetSales - returnedRevenue;
    const totalCogs   = grossCogs - returnedCogs;
    // Completed sales invoice count is kept strictly separate from returns count.
    // One original sale can have multiple partial returns.
    const totalInvoices = grossInvoices;

    const grossProfit = netSales - totalCogs;
    const grossMargin = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;

    return {
      gross_sales:      grossSales,
      total_discounts:  totalDiscounts,
      net_sales:        netSales,
      total_cogs:       totalCogs,
      gross_profit:     grossProfit,
      gross_margin:     grossMargin,
      total_invoices:   totalInvoices,
      total_items_sold: totalItemsSold,
      returns_count:    returnsCount,
      returned_revenue: returnedRevenue,
      returned_cogs:    returnedCogs,
    };
  } catch (err) {
    console.error('[profit.repo] Error fetching profit summary:', err);
    throw new ProfitRepoError('Failed to fetch profit summary report', 500);
  }
}

async function getPeriodProfitMetrics(
  pool: Pool,
  startDate?: string,
  endDate?: string,
  branchId?: string | null
): Promise<ProfitMetricsDto> {
  const summary = await getProfitSummary(pool, {
    start_date: startDate,
    end_date: endDate,
    branch_id: branchId,
  });

  return {
    gross_revenue:    summary.gross_sales,
    discounts:        summary.total_discounts,
    net_revenue:      summary.net_sales,
    cogs:             summary.total_cogs,
    gross_profit:     summary.gross_profit,
    gross_margin:     summary.gross_margin,
    orders_count:     summary.total_invoices,
    returns_count:    summary.returns_count,
    returned_revenue: summary.returned_revenue,
  };
}

export async function getDashboardProfitSummary(
  pool: Pool,
  branchId?: string | null
): Promise<DashboardProfitSummaryDto> {
  // DEF-SALE-08: Use PKT (UTC+5) timezone boundaries regardless of the host
  // process timezone (Cloud Run runs in UTC).  Shift UTC now by +5 h to get
  // the current PKT wall-clock date, build ISO timestamps that mark midnight
  // and end-of-day in PKT, then convert back to UTC ISO strings for the query.
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const nowUtcMs = Date.now();
  const pktMs = nowUtcMs + PKT_OFFSET_MS;
  const pktDate = new Date(pktMs);

  // PKT calendar components
  const pktYear  = pktDate.getUTCFullYear();
  const pktMonth = pktDate.getUTCMonth();   // 0-based
  const pktDay   = pktDate.getUTCDate();

  // Midnight PKT = 19:00 previous day UTC (or 00:00 PKT - 5h)
  const todayStartUtc = new Date(Date.UTC(pktYear, pktMonth, pktDay, 0, 0, 0, 0) - PKT_OFFSET_MS);
  const todayEndUtc   = new Date(Date.UTC(pktYear, pktMonth, pktDay, 23, 59, 59, 999) - PKT_OFFSET_MS);
  const monthStartUtc = new Date(Date.UTC(pktYear, pktMonth, 1, 0, 0, 0, 0) - PKT_OFFSET_MS);

  // Week boundary: Monday 00:00 PKT. getUTCDay() returns 0=Sun..6=Sat;
  // daysSinceMonday maps that to 0=Mon..6=Sun.
  const pktDayOfWeek = pktDate.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysSinceMonday = (pktDayOfWeek + 6) % 7; // 0=Mon,...,6=Sun
  const weekStartUtc = new Date(
    Date.UTC(pktYear, pktMonth, pktDay - daysSinceMonday, 0, 0, 0, 0) - PKT_OFFSET_MS
  );

  const todayStart = todayStartUtc.toISOString();
  const todayEnd   = todayEndUtc.toISOString();
  const monthStart = monthStartUtc.toISOString();
  const weekStart  = weekStartUtc.toISOString();

  const [today, this_week, this_month, total] = await Promise.all([
    getPeriodProfitMetrics(pool, todayStart, todayEnd, branchId),
    getPeriodProfitMetrics(pool, weekStart, undefined, branchId),
    getPeriodProfitMetrics(pool, monthStart, undefined, branchId),
    getPeriodProfitMetrics(pool, undefined, undefined, branchId),
  ]);

  return { today, this_week, this_month, total };
}
