/**
 * Profit & Gross Margin PostgreSQL Repository
 * Direct TypeScript port of src-tauri/src/services/profit_service.rs.
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
}

export interface DashboardProfitSummaryDto {
  today: ProfitMetricsDto;
  this_month: ProfitMetricsDto;
  total: ProfitMetricsDto;
}

export class ProfitRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'ProfitRepoError';
  }
}

export async function getProfitSummary(
  pool: Pool,
  filter?: ProfitReportFilter
): Promise<ProfitSummaryDto> {
  let salesWhere = "WHERE sale_status != 'VOIDED'";
  const params: unknown[] = [];
  let pIdx = 1;

  if (filter?.branch_id) {
    salesWhere += ` AND branch_id = $${pIdx++}`;
    params.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? `${filter.start_date}T00:00:00.000Z` : filter.start_date;
    salesWhere += ` AND created_at >= $${pIdx++}`;
    params.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? `${filter.end_date}T23:59:59.999Z` : filter.end_date;
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

  let linesWhere = "WHERE sale_id IN (SELECT id FROM sales WHERE sale_status != 'VOIDED'";
  const lineParams: unknown[] = [];
  let lpIdx = 1;

  if (filter?.branch_id) {
    linesWhere += ` AND branch_id = $${lpIdx++}`;
    lineParams.push(filter.branch_id);
  }
  if (filter?.start_date) {
    const sDate = filter.start_date.length === 10 ? `${filter.start_date}T00:00:00.000Z` : filter.start_date;
    linesWhere += ` AND created_at >= $${lpIdx++}`;
    lineParams.push(sDate);
  }
  if (filter?.end_date) {
    const eDate = filter.end_date.length === 10 ? `${filter.end_date}T23:59:59.999Z` : filter.end_date;
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

  try {
    const [salesRes, linesRes] = await Promise.all([
      pool.query(salesSummaryQuery, params),
      pool.query(linesSummaryQuery, lineParams),
    ]);

    const sRow = salesRes.rows[0] as Record<string, unknown>;
    const lRow = linesRes.rows[0] as Record<string, unknown>;

    const grossSales = Number(sRow?.['gross_sales'] ?? 0);
    const totalDiscounts = Number(sRow?.['total_discounts'] ?? 0);
    const netSales = Number(sRow?.['net_sales'] ?? 0);
    const totalInvoices = Number(sRow?.['total_invoices'] ?? 0);

    const totalCogs = Number(lRow?.['total_cogs'] ?? 0);
    const totalItemsSold = Number(lRow?.['total_items_sold'] ?? 0);

    const grossProfit = netSales - totalCogs;
    const grossMargin = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;

    return {
      gross_sales: grossSales,
      total_discounts: totalDiscounts,
      net_sales: netSales,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      total_invoices: totalInvoices,
      total_items_sold: totalItemsSold,
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
    gross_revenue: summary.gross_sales,
    discounts: summary.total_discounts,
    net_revenue: summary.net_sales,
    cogs: summary.total_cogs,
    gross_profit: summary.gross_profit,
    gross_margin: summary.gross_margin,
    orders_count: summary.total_invoices,
  };
}

export async function getDashboardProfitSummary(
  pool: Pool,
  branchId?: string | null
): Promise<DashboardProfitSummaryDto> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  const todayStart = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
  const todayEnd = `${yyyy}-${mm}-${dd}T23:59:59.999Z`;
  const monthStart = `${yyyy}-${mm}-01T00:00:00.000Z`;

  const [today, this_month, total] = await Promise.all([
    getPeriodProfitMetrics(pool, todayStart, todayEnd, branchId),
    getPeriodProfitMetrics(pool, monthStart, undefined, branchId),
    getPeriodProfitMetrics(pool, undefined, undefined, branchId),
  ]);

  return { today, this_month, total };
}
