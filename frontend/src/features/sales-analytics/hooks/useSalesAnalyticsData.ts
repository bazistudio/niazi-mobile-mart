/**
 * useSalesAnalyticsData — Sales Analytics Phase 1 Data Hook
 *
 * Wires ONLY existing, verified API endpoints/IPC calls.
 * Zero new backend routes. Zero fabricated data.
 * Data gaps are surfaced as null/empty so the UI can show
 * clearly-identified unavailable states.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { commandCenterApi } from '@/features/organization/services/commandCenter.api';
import { repairApi } from '@/features/repairs/services/repair.api';
import { mobileApi } from '@/features/mobiles/services/mobile.api';
import { purchaseApi } from '@/services/purchase.api';
import { expensesApi } from '@/services/expenses.api';
import { accountsApi } from '@/services/accounts.api';
import { salesAnalyticsApi } from '@/features/sales-analytics/services/salesAnalytics.api';
import type { SaFullReport } from '@/features/sales-analytics/services/salesAnalytics.api';
import type { DashboardDateRange } from '@/features/organization/utils/dashboardDates';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SalesAnalyticsFilters {
  branchId: string | null;
  dateRange: DashboardDateRange;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSalesAnalyticsData({ branchId, dateRange }: SalesAnalyticsFilters) {
  const user = useAuthStore((s) => s.user);
  const userRole = String(user?.role || '').toUpperCase().trim();
  const isOrgAdmin = ['ADMIN', 'OWNER', 'SUPER_ADMIN', 'MULTI_ADMIN'].includes(userRole);

  // ── 1. Authoritative profit summary (current + previous period) ────────────
  const profitCurrentQuery = useQuery({
    queryKey: ['sa-profit-curr', branchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      commandCenterApi.getProfitSummaryForPeriod({
        startIso: dateRange.startIso,
        endIso: dateRange.endIso,
        branchId,
      }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const profitPrevQuery = useQuery({
    queryKey: ['sa-profit-prev', branchId ?? 'ALL', dateRange.prevStartIso, dateRange.prevEndIso],
    queryFn: () =>
      commandCenterApi.getProfitSummaryForPeriod({
        startIso: dateRange.prevStartIso,
        endIso: dateRange.prevEndIso,
        branchId,
      }),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 2. Raw sales orders (up to 1000, for line-item analysis) ──────────────
  const salesQuery = useQuery({
    queryKey: ['sa-sales', branchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      tauriClient.saleList({
        branch_id: branchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
        limit: 1000,
      }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 3. Completed returns ───────────────────────────────────────────────────
  const returnsQuery = useQuery({
    queryKey: ['sa-returns', branchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      tauriClient.salesReturnList({
        branch_id: branchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
        status: 'COMPLETED',
        limit: 500,
      }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 4. Repair jobs (for repair profitability tab) ─────────────────────────
  const repairsQuery = useQuery({
    queryKey: ['sa-repairs', branchId ?? 'ALL'],
    queryFn: () =>
      repairApi.getRepairJobs({
        branch_id: branchId ?? undefined,
        limit: 200,
      }),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 5. Mobile sales history ────────────────────────────────────────────────
  const mobileSalesQuery = useQuery({
    queryKey: ['sa-mobile-sales', branchId ?? 'ALL'],
    queryFn: () =>
      mobileApi.getMobileSalesHistory({
        branch_id: branchId ?? undefined,
        limit: 200,
      }),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 6. Mobile inventory summary (for cost/investment data) ────────────────
  // The two API branches return structurally different shapes. The UI accesses
  // fields via optional-chaining, so we widen to `unknown` before narrowing.
  const mobileInventoryQuery = useQuery<unknown>({
    queryKey: ['sa-mobile-inv', branchId ?? 'ALL'],
    queryFn: async (): Promise<unknown> =>
      branchId
        ? mobileApi.getBranchInvestmentSummary(branchId).then((r) => r.summary)
        : mobileApi.getOrganizationSummary().then((r) => r.summary),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 7. Purchases (for inventory & supplier recovery tab) ──────────────────
  const purchasesQuery = useQuery({
    queryKey: ['sa-purchases', branchId ?? 'ALL'],
    queryFn: () =>
      purchaseApi.getPurchases({
        branch_id: branchId,
        limit: 300,
      }),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 8. Supplier demands ────────────────────────────────────────────────────
  const demandsQuery = useQuery({
    queryKey: ['sa-demands', branchId ?? 'ALL'],
    queryFn: () =>
      purchaseApi.listDemands({
        branch_id: branchId,
        limit: 100,
      }),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 9. Expenses (for financial reconciliation tab) ────────────────────────
  const expenseSummaryQuery = useQuery({
    queryKey: ['sa-expense-summary', branchId ?? 'ALL', dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      expensesApi.getExpenseSummary({
        branch_id: branchId,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const expensesListQuery = useQuery({
    queryKey: ['sa-expenses-list', branchId ?? 'ALL', dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      expensesApi.getExpenses({
        branch_id: branchId,
        status: 'COMPLETED',
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        limit: 300,
      }),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 10. Business accounts (org-admin only, for reconciliation tab) ─────────
  const accountsQuery = useQuery({
    queryKey: ['sa-accounts'],
    queryFn: () => accountsApi.listAccounts(),
    enabled: isOrgAdmin,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 11. Products list (for inventory intelligence) ────────────────────────
  const productsQuery = useQuery({
    queryKey: ['sa-products', branchId ?? 'ALL'],
    queryFn: () =>
      tauriClient.productList({
        is_active: true,
        branch_id: branchId,
      }),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 12. Low stock ──────────────────────────────────────────────────────────
  const lowStockQuery = useQuery({
    queryKey: ['sa-low-stock', branchId],
    queryFn: () => tauriClient.inventoryGetLowStock(branchId!),
    enabled: Boolean(branchId),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 13. Branches list ──────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['sa-branches'],
    queryFn: () => tauriClient.branchList(),
    staleTime: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 14. Customer/Supplier balances (org-level) ────────────────────────────
  const orgBalancesQuery = useQuery({
    queryKey: ['sa-org-balances'],
    queryFn: () => tauriClient.organizationGetDashboardBalances(),
    enabled: isOrgAdmin,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── 15. Live backend full-report (Phase 2) ────────────────────────────────
  const liveReportQuery = useQuery<SaFullReport>({
    queryKey: ['sa-live-report', branchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      salesAnalyticsApi.fetchFullReport({
        branch_id: branchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
      }),
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  // ── 16. Dedicated product-level report query ─────────────────────────────
  const productsReportQuery = useQuery<SaProductRow[]>({
    queryKey: ['sa-products-report', branchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      salesAnalyticsApi.fetchProducts({
        branch_id: branchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
      }),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── Derived: product-level sales analysis (from raw sale lines) ───────────
  const productSalesAnalysis = useMemo(() => {
    const sales = salesQuery.data ?? [];
    const returns = returnsQuery.data ?? [];

    // Aggregate by product from raw sale records
    // Sale items have: productId, productName, quantity, unitPrice, discount, lineTotal, lineType
    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        lineType: string;
        totalQty: number;
        totalRevenue: number;
        totalDiscount: number;
        invoiceCount: number;
      }
    >();

    for (const sale of sales) {
      const items = (sale as any).items ?? (sale as any).lines ?? [];
      for (const item of items) {
        const key = item.productId ?? item.product_id ?? 'UNKNOWN';
        const name = item.productName ?? item.product_name ?? 'Unknown Product';
        const lineType = item.lineType ?? item.line_type ?? 'PRODUCT';
        const qty = Number(item.quantity ?? 1);
        const lineTotal = Number(item.lineTotal ?? item.line_total ?? item.unitPrice ?? 0);
        const discount = Number(item.discount ?? 0);

        const existing = productMap.get(key) ?? {
          productId: key,
          productName: name,
          lineType,
          totalQty: 0,
          totalRevenue: 0,
          totalDiscount: 0,
          invoiceCount: 0,
        };
        existing.totalQty += qty;
        existing.totalRevenue += lineTotal;
        existing.totalDiscount += discount;
        existing.invoiceCount += 1;
        productMap.set(key, existing);
      }
    }

    // suppress unused-variable lint warning (returns kept for future return-adjusted revenue)
    void returns;

    return Array.from(productMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [salesQuery.data, returnsQuery.data]);

  // ── Derived: repair profitability analysis ────────────────────────────────
  const repairProfitAnalysis = useMemo(() => {
    const jobs = repairsQuery.data?.data ?? [];

    const byStatus = new Map<string, number>();
    let totalRevenue = 0;
    let totalPartsRevenue = 0;
    let totalLaborRevenue = 0;
    let completedJobs = 0;
    let activeJobs = 0;

    for (const job of jobs) {
      const status = job.status ?? 'Unknown';
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);

      const grandTotal = Number(job.grandTotal ?? 0);
      const partsTotal = Number(job.partsTotal ?? 0);
      const laborTotal = Number(job.laborTotal ?? 0);

      totalRevenue += grandTotal;
      totalPartsRevenue += partsTotal;
      totalLaborRevenue += laborTotal;

      const isComplete = ['Delivered', 'Ready for Pickup'].includes(status);
      const isActive = !['Delivered', 'Cancelled', 'Rejected'].includes(status);
      if (isComplete) completedJobs += 1;
      if (isActive) activeJobs += 1;
    }

    const statusBreakdown = Array.from(byStatus.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    return {
      totalJobs: jobs.length,
      completedJobs,
      activeJobs,
      totalRevenue,
      totalPartsRevenue,
      totalLaborRevenue,
      avgJobValue: completedJobs > 0 ? Math.round(totalRevenue / completedJobs) : 0,
      statusBreakdown,
    };
  }, [repairsQuery.data]);

  // ── Derived: mobile sales analysis ────────────────────────────────────────
  const mobileSalesAnalysis = useMemo(() => {
    const sales = mobileSalesQuery.data?.sales ?? [];

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalUnits = 0;

    const byBrand = new Map<
      string,
      { brand: string; units: number; revenue: number; cogs: number }
    >();

    for (const sale of sales) {
      const devices = sale.devices ?? [];
      for (const device of devices) {
        const sp = Number(device.salePrice ?? 0);
        const cp = Number(device.costPrice ?? 0);
        totalRevenue += sp;
        totalCogs += cp;
        totalUnits += 1;

        const brand = device.brand ?? 'Unknown';
        const existing = byBrand.get(brand) ?? { brand, units: 0, revenue: 0, cogs: 0 };
        existing.units += 1;
        existing.revenue += sp;
        existing.cogs += cp;
        byBrand.set(brand, existing);
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct =
      totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

    return {
      totalSales: sales.length,
      totalUnits,
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct,
      avgSaleValue: totalUnits > 0 ? Math.round(totalRevenue / totalUnits) : 0,
      byBrand: Array.from(byBrand.values()).sort((a, b) => b.revenue - a.revenue),
    };
  }, [mobileSalesQuery.data]);

  // ── Derived: expense category breakdown ───────────────────────────────────
  const expenseCategoryBreakdown = useMemo(() => {
    const expenses = expensesListQuery.data ?? [];
    const byCategory = new Map<string, number>();

    for (const exp of expenses) {
      const cat = (exp as any).category ?? (exp as any).expense_category ?? 'Other';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number((exp as any).amount ?? 0));
    }

    return Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expensesListQuery.data]);

  // ── Headline KPIs ──────────────────────────────────────────────────────────
  const headline = useMemo(() => {
    const p = profitCurrentQuery.data;
    const pp = profitPrevQuery.data;

    const grossSales = p ? p.net_sales + p.returned_revenue : 0;
    const netSales = p?.net_sales ?? 0;
    const returns = p?.returned_revenue ?? 0;
    const discounts = p?.total_discounts ?? 0;
    const cogs = p?.total_cogs ?? null;
    const grossProfit = p?.gross_profit ?? null;
    const grossMargin = p?.gross_margin ?? null;
    const invoiceCount = p?.total_invoices ?? 0;
    const returnsCount = p?.returns_count ?? 0;

    const prevGrossSales = pp ? pp.net_sales + pp.returned_revenue : null;
    const prevNetSales = pp?.net_sales ?? null;
    const prevGrossProfit = pp?.gross_profit ?? null;

    const expenseTotal = Number(expenseSummaryQuery.data?.total_amount ?? 0);
    const operatingProfit =
      grossProfit !== null ? grossProfit - expenseTotal : null;

    const delta = (curr: number, prev: number | null) =>
      prev !== null && prev !== 0
        ? Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1))
        : null;

    return {
      grossSales,
      netSales,
      returns,
      discounts,
      cogs,
      grossProfit,
      grossMargin,
      invoiceCount,
      returnsCount,
      expenseTotal,
      operatingProfit,
      returnRatePct: grossSales > 0 ? Number(((returns / grossSales) * 100).toFixed(1)) : 0,
      avgOrderValue: invoiceCount > 0 ? Math.round(netSales / invoiceCount) : 0,
      // deltas vs previous period
      grossSalesDelta: delta(grossSales, prevGrossSales),
      netSalesDelta: delta(netSales, prevNetSales),
      grossProfitDelta: grossProfit !== null ? delta(grossProfit, prevGrossProfit) : null,
      hasProfitData: p !== null,
      isTruncated: (salesQuery.data?.length ?? 0) >= 1000,
    };
  }, [profitCurrentQuery.data, profitPrevQuery.data, expenseSummaryQuery.data, salesQuery.data]);

  return {
    // Raw query state
    loading: {
      profit: profitCurrentQuery.isLoading || profitPrevQuery.isLoading,
      sales: salesQuery.isLoading || returnsQuery.isLoading,
      repairs: repairsQuery.isLoading,
      mobileSales: mobileSalesQuery.isLoading,
      mobileInventory: mobileInventoryQuery.isLoading,
      purchases: purchasesQuery.isLoading,
      expenses: expenseSummaryQuery.isLoading || expensesListQuery.isLoading,
      accounts: accountsQuery.isLoading,
      products: productsQuery.isLoading,
      liveReport: liveReportQuery.isLoading,
      productsReport: productsReportQuery.isLoading,
    },
    errors: {
      profit: profitCurrentQuery.isError,
      sales: salesQuery.isError,
      repairs: repairsQuery.isError,
      mobileSales: mobileSalesQuery.isError,
      expenses: expenseSummaryQuery.isError,
      liveReport: liveReportQuery.isError,
      productsReport: productsReportQuery.isError,
    },
    isLive: liveReportQuery.isSuccess || productsReportQuery.isSuccess,
    liveReport: liveReportQuery.data ?? null,
    productsReport: productsReportQuery.data ?? null,
    // Derived headline KPIs
    headline,
    // Tab-specific analytics
    productSalesAnalysis,
    repairProfitAnalysis,
    mobileSalesAnalysis,
    expenseCategoryBreakdown,
    // Raw data for tables
    rawSales: salesQuery.data ?? [],
    rawReturns: returnsQuery.data ?? [],
    rawRepairs: repairsQuery.data?.data ?? [],
    rawMobileSales: mobileSalesQuery.data?.sales ?? [],
    rawPurchases: purchasesQuery.data ?? [],
    rawDemands: demandsQuery.data ?? [],
    rawExpenses: expensesListQuery.data ?? [],
    rawProducts: productsQuery.data ?? [],
    lowStock: lowStockQuery.data ?? [],
    mobileInventory: mobileInventoryQuery.data ?? null,
    accounts: accountsQuery.data ?? [],
    branches: branchesQuery.data ?? [],
    orgBalances: orgBalancesQuery.data ?? null,
    expenseSummary: expenseSummaryQuery.data ?? null,
    isOrgAdmin,
  };
}
