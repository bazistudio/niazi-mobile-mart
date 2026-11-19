/**
 * Command Center API Service
 *
 * Reuses ONLY verified existing backend endpoints and client services.
 * Zero new backend routes, zero fabricated metrics.
 */

import { httpClient } from '@/lib/http/httpClient';
import type { Branch } from '@/lib/tauri/tauriClient';

export interface PeriodProfitSummaryResponse {
  gross_sales: number;
  total_discounts: number;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin: number;
  total_invoices: number;
  total_items_sold: number;
  returns_count: number;
  returned_revenue: number;
  returned_cogs: number;
}

export interface BranchComparisonMetricRow {
  branchId: string;
  branchName: string;
  branchCode: string;
  netSales: number;
  grossSales: number;
  returnedRevenue: number;
  grossProfit: number;
  grossMargin: number;
  totalInvoices: number;
  returnsCount: number;
}

export const commandCenterApi = {
  /**
   * Authoritative profit & return-deducted sales summary for arbitrary PKT UTC ISO bounds.
   * Calls GET /api/reports/profit/summary (available to ADMIN, SHOP_ADMIN, MANAGER).
   * Returns null if caller lacks profit permission (HTTP 403).
   */
  async getProfitSummaryForPeriod(params: {
    startIso: string;
    endIso: string;
    branchId?: string | null;
  }): Promise<PeriodProfitSummaryResponse | null> {
    const qs = new URLSearchParams();
    qs.set('start_date', params.startIso);
    qs.set('end_date', params.endIso);
    if (params.branchId) {
      qs.set('branch_id', params.branchId);
    }
    try {
      return await httpClient.get<PeriodProfitSummaryResponse>(
        `/api/reports/profit/summary?${qs.toString()}`
      );
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number })?.status ??
        (err as { statusCode?: number })?.statusCode;
      if (status === 403) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Organization Admin only: gathers per-branch profit/sales metrics in parallel
   * using GET /api/reports/profit/summary for each active retail branch.
   */
  async getBranchComparisonMetrics(params: {
    branches: Branch[];
    startIso: string;
    endIso: string;
  }): Promise<BranchComparisonMetricRow[]> {
    const retail = params.branches.slice(0, 10);
    if (retail.length === 0) return [];

    const results = await Promise.allSettled(
      retail.map(async (branch) => {
        const res = await commandCenterApi.getProfitSummaryForPeriod({
          startIso: params.startIso,
          endIso: params.endIso,
          branchId: branch.id,
        });
        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          netSales: Number(res?.net_sales ?? 0),
          grossSales: Number(res ? res.net_sales + res.returned_revenue : 0),
          returnedRevenue: Number(res?.returned_revenue ?? 0),
          grossProfit: Number(res?.gross_profit ?? 0),
          grossMargin: Number(res?.gross_margin ?? 0),
          totalInvoices: Number(res?.total_invoices ?? 0),
          returnsCount: Number(res?.returns_count ?? 0),
        } satisfies BranchComparisonMetricRow;
      })
    );

    const rows: BranchComparisonMetricRow[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        rows.push(r.value);
      }
    }
    return rows.sort((a, b) => b.netSales - a.netSales);
  },
};
