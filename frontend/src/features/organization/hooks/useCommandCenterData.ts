/**
 * Role-aware, parallel React Query orchestrator for the Enterprise Command Center
 * (both Organization Admin and Branch Admin dashboards).
 *
 * Enforces permission-aware fetching, independent error isolation, and zero
 * cross-branch/org-admin leaks for branch-scoped roles.
 */

import { useMemo, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePermissions, PERMISSIONS } from '@/lib/auth/usePermissions';
import { tauriClient, type Branch } from '@/lib/tauri/tauriClient';
import { cashApi } from '@/services/cash.api';
import { expensesApi } from '@/services/expenses.api';
import { purchaseApi } from '@/services/purchase.api';
import { accountsApi } from '@/services/accounts.api';
import { mobileApi } from '@/features/mobiles/services/mobile.api';
import { repairApi } from '@/features/repairs/services/repair.api';
import { getDailyAttendanceRegister } from '@/features/hr/services/hr.api';
import { historyApi } from '@/features/history/services/history.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { commandCenterApi } from '../services/commandCenter.api';
import {
  computePercentDelta,
  getPktTodayDateStr,
  type DashboardDateRange,
} from '../utils/dashboardDates';
import {
  buildBusinessAlerts,
  buildExpenseAnalytics,
  buildHrAttendanceOverview,
  buildInventoryIntelligence,
  buildLiquidPositionAnalytics,
  buildMobileSalesOperationalSummary,
  buildPartyFinancialPosition,
  buildPaymentSettlementSummary,
  buildPurchaseAnalytics,
  buildRepairsOperationalSummary,
  buildSalesTrendSeries,
} from '../utils/dashboardCalculations';

const CENTRAL_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000003';
const ORG_ADMIN_ROLES = new Set(['ADMIN', 'OWNER', 'SUPER_ADMIN', 'MULTI_ADMIN']);

export interface UseCommandCenterParams {
  mode: 'organization' | 'branch';
  branchId: string | null;
  dateRange: DashboardDateRange;
}

export function useCommandCenterData({ mode, branchId, dateRange }: UseCommandCenterParams) {
  const user = useAuthStore((s) => s.user);
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const userRole = String(user?.role || '').toUpperCase().trim();
  const userIsOrgAdmin = ORG_ADMIN_ROLES.has(userRole);
  const isOrgContext = mode === 'organization' && userIsOrgAdmin;
  const isBranchAdminOrHigher = userIsOrgAdmin || userRole === 'SHOP_ADMIN' || userRole === 'MANAGER';

  const perms = useMemo(
    () => ({
      isOrgAdmin: isOrgContext,
      userIsOrgAdmin,
      isBranchAdminOrHigher,
      canViewProfit: isBranchAdminOrHigher,
      canViewSales: hasPermission(PERMISSIONS.SALES_VIEW) || hasPermission(PERMISSIONS.POS_USE),
      canViewExpenses: hasPermission(PERMISSIONS.EXPENSES_VIEW),
      canViewPurchases: hasPermission(PERMISSIONS.PURCHASES_VIEW),
      canViewParties: hasPermission(PERMISSIONS.PARTIES_VIEW),
      canViewInventory:
        hasPermission(PERMISSIONS.INVENTORY_VIEW) || hasPermission(PERMISSIONS.PRODUCTS_VIEW),
      canViewCash: hasPermission(PERMISSIONS.FINANCE_VIEW) || hasPermission(PERMISSIONS.POS_USE),
      canViewAccounts: isOrgContext, // /api/accounts is strictly Org Admin only
      canViewRepairs: hasPermission(PERMISSIONS.REPAIRS_VIEW),
      canViewHr: isBranchAdminOrHigher,
      canViewPos: hasPermission(PERMISSIONS.POS_USE),
      canViewReports: hasPermission(PERMISSIONS.REPORTS_VIEW) || hasPermission(PERMISSIONS.REPORTS_VIEW_ALL),
      canViewSettings: hasPermission(PERMISSIONS.SETTINGS_VIEW),
      canViewUsers: hasPermission(PERMISSIONS.USERS_VIEW),
    }),
    [isOrgContext, userIsOrgAdmin, isBranchAdminOrHigher, hasPermission]
  );

  const effectiveBranchId = isOrgContext ? branchId : branchId || (user as any)?.branch_id || (user as any)?.shopId || null;
  const todayPkt = useMemo(() => getPktTodayDateStr(), []);

  // 1. Branches List (Active retail branches, excluding Central Warehouse)
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches.all,
    queryFn: () => tauriClient.branchList(),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const retailBranches: Branch[] = useMemo(() => {
    const raw = branchesQuery.data ?? [];
    return raw.filter(
      (b) => b.is_active && b.is_warehouse !== 1 && b.id !== CENTRAL_WAREHOUSE_ID
    );
  }, [branchesQuery.data]);

  // 2. Authoritative Profit & Return-Deducted Sales Summary (Current & Previous Period)
  const currentProfitQuery = useQuery({
    queryKey: ['cc-profit', effectiveBranchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      commandCenterApi.getProfitSummaryForPeriod({
        startIso: dateRange.startIso,
        endIso: dateRange.endIso,
        branchId: effectiveBranchId,
      }),
    enabled: perms.canViewProfit,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const prevProfitQuery = useQuery({
    queryKey: ['cc-profit-prev', effectiveBranchId ?? 'ALL', dateRange.prevStartIso, dateRange.prevEndIso],
    queryFn: () =>
      commandCenterApi.getProfitSummaryForPeriod({
        startIso: dateRange.prevStartIso,
        endIso: dateRange.prevEndIso,
        branchId: effectiveBranchId,
      }),
    enabled: perms.canViewProfit,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 3. Raw Sales & Completed Returns (for trend series, invoice count, avg invoice, settled vs credit)
  const salesQuery = useQuery({
    queryKey: ['cc-sales', effectiveBranchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      tauriClient.saleList({
        branch_id: effectiveBranchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
        limit: 1000,
      }),
    enabled: perms.canViewSales,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const returnsQuery = useQuery({
    queryKey: ['cc-returns', effectiveBranchId ?? 'ALL', dateRange.startIso, dateRange.endIso],
    queryFn: () =>
      tauriClient.salesReturnList({
        branch_id: effectiveBranchId,
        start_date: dateRange.startIso,
        end_date: dateRange.endIso,
        status: 'COMPLETED',
        limit: 1000,
      }),
    enabled: perms.canViewSales,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 4. Expenses (Summary + Prior Summary + List for category & daily trend)
  const expenseSummaryQuery = useQuery({
    queryKey: ['cc-expense-summary', effectiveBranchId ?? 'ALL', dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      expensesApi.getExpenseSummary({
        branch_id: effectiveBranchId,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      }),
    enabled: perms.canViewExpenses,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const prevExpenseSummaryQuery = useQuery({
    queryKey: ['cc-expense-summary-prev', effectiveBranchId ?? 'ALL', dateRange.prevStartDate, dateRange.prevEndDate],
    queryFn: () =>
      expensesApi.getExpenseSummary({
        branch_id: effectiveBranchId,
        start_date: dateRange.prevStartDate,
        end_date: dateRange.prevEndDate,
      }),
    enabled: perms.canViewExpenses,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const expensesListQuery = useQuery({
    queryKey: ['cc-expenses-list', effectiveBranchId ?? 'ALL', dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      expensesApi.getExpenses({
        branch_id: effectiveBranchId,
        status: 'COMPLETED',
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        limit: 500,
      }),
    enabled: perms.canViewExpenses,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 5. Purchases & Supplier Demands
  const purchasesQuery = useQuery({
    queryKey: ['cc-purchases', effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      purchaseApi.getPurchases({
        branch_id: effectiveBranchId,
        limit: 200,
      }),
    enabled: perms.canViewPurchases,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const demandsQuery = useQuery({
    queryKey: ['cc-demands', effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      purchaseApi.listDemands({
        branch_id: effectiveBranchId,
        limit: 100,
      }),
    enabled: perms.canViewPurchases,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 6. Cash Position & Business Bank Accounts
  const orgCashQuery = useQuery({
    queryKey: queryKeys.cash.orgSummary,
    queryFn: () => cashApi.getOrganizationSummary(),
    enabled: perms.isOrgAdmin,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const branchCashQuery = useQuery({
    queryKey: ['cc-branch-cash', effectiveBranchId],
    queryFn: () => cashApi.getDailySummary(effectiveBranchId ?? undefined),
    enabled: !perms.isOrgAdmin && perms.canViewCash && Boolean(effectiveBranchId),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: () => accountsApi.listAccounts(),
    enabled: perms.canViewAccounts,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 7. Customer & Supplier Ledger Position
  const orgBalancesQuery = useQuery({
    queryKey: ['cc-org-balances'],
    queryFn: () => tauriClient.organizationGetDashboardBalances(),
    enabled: perms.isOrgAdmin,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const customersQuery = useQuery({
    queryKey: ['cc-customers'],
    queryFn: () => tauriClient.customerList({ is_active: true, limit: 500 }),
    enabled: perms.canViewParties,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const suppliersQuery = useQuery({
    queryKey: ['cc-suppliers'],
    queryFn: () => tauriClient.supplierList({ is_active: true, limit: 500 }),
    enabled: perms.canViewPurchases,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 8. Inventory & Mobile Assets
  const productsQuery = useQuery({
    queryKey: ['cc-products', effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      tauriClient.productList({
        is_active: true,
        branch_id: effectiveBranchId,
      }),
    enabled: perms.canViewInventory,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const lowStockQuery = useQuery({
    queryKey: ['cc-low-stock', effectiveBranchId],
    queryFn: () => tauriClient.inventoryGetLowStock(effectiveBranchId!),
    enabled: perms.canViewInventory && Boolean(effectiveBranchId),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const mobileOrgQuery = useQuery({
    queryKey: ['cc-mobile-org-summary'],
    queryFn: () => mobileApi.getOrganizationSummary().then((r) => r.summary),
    enabled: perms.isOrgAdmin && perms.canViewInventory,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const mobileBranchQuery = useQuery({
    queryKey: ['cc-mobile-branch-summary', effectiveBranchId],
    queryFn: () => mobileApi.getBranchInvestmentSummary(effectiveBranchId!).then((r) => r.summary),
    enabled: !perms.isOrgAdmin && perms.canViewInventory && Boolean(effectiveBranchId),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Note: /api/mobiles/sales requires branch_id for Org Admin (HTTP 400 if omitted)
  const mobileSalesQuery = useQuery({
    queryKey: ['cc-mobile-sales', effectiveBranchId ?? 'ALL', retailBranches.map((b) => b.id).join(',')],
    queryFn: async () => {
      if (effectiveBranchId) {
        return mobileApi.getMobileSalesHistory({ branch_id: effectiveBranchId, limit: 100 });
      }
      if (retailBranches.length === 0) {
        return { sales: [], total: 0, page: 1, limit: 100 };
      }
      const resList = await Promise.allSettled(
        retailBranches.slice(0, 10).map((b) =>
          mobileApi.getMobileSalesHistory({ branch_id: b.id, limit: 100 })
        )
      );
      const sales: Array<any> = [];
      let total = 0;
      for (const res of resList) {
        if (res.status === 'fulfilled') {
          sales.push(...(res.value.sales ?? []));
          total += Number(res.value.total ?? 0);
        }
      }
      return { sales, total, page: 1, limit: 100 };
    },
    enabled: perms.canViewInventory && (Boolean(effectiveBranchId) || retailBranches.length > 0),
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 9. Operational Overview: Repairs, HR Attendance Today, Recent Activity
  const repairsQuery = useQuery({
    queryKey: ['cc-repairs', effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      repairApi.getRepairJobs({
        branch_id: effectiveBranchId ?? undefined,
        limit: 100,
      }),
    enabled: perms.canViewRepairs,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const attendanceQuery = useQuery({
    queryKey: ['cc-attendance-register', todayPkt, effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      getDailyAttendanceRegister({
        date: todayPkt,
        branchId: effectiveBranchId,
      }),
    enabled: perms.canViewHr,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const historyQuery = useQuery({
    queryKey: ['cc-recent-history', effectiveBranchId ?? 'ALL'],
    queryFn: () =>
      historyApi.getHistory({
        branch_id: effectiveBranchId,
        page: 1,
        limit: 6,
      }),
    enabled: perms.canViewSales,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 10. Multi-Branch Comparison (Org Admin consolidated view only)
  const branchComparisonQuery = useQuery({
    queryKey: ['cc-branch-comparison', dateRange.startIso, dateRange.endIso, retailBranches.map((b) => b.id).join(',')],
    queryFn: () =>
      commandCenterApi.getBranchComparisonMetrics({
        branches: retailBranches,
        startIso: dateRange.startIso,
        endIso: dateRange.endIso,
      }),
    enabled: perms.isOrgAdmin && !effectiveBranchId && retailBranches.length > 0,
    staleTime: 45_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Derived Analytics (Memoized Pure Aggregations)
  const salesTrend = useMemo(
    () => buildSalesTrendSeries(salesQuery.data ?? [], returnsQuery.data ?? [], dateRange),
    [salesQuery.data, returnsQuery.data, dateRange]
  );

  const paymentSettlement = useMemo(
    () => buildPaymentSettlementSummary(salesQuery.data ?? []),
    [salesQuery.data]
  );

  const expenseAnalytics = useMemo(
    () => buildExpenseAnalytics(expensesListQuery.data ?? [], expenseSummaryQuery.data ?? null, dateRange),
    [expensesListQuery.data, expenseSummaryQuery.data, dateRange]
  );

  const purchaseAnalytics = useMemo(
    () => buildPurchaseAnalytics(purchasesQuery.data ?? [], demandsQuery.data ?? [], dateRange),
    [purchasesQuery.data, demandsQuery.data, dateRange]
  );

  const partyPosition = useMemo(
    () =>
      buildPartyFinancialPosition(
        customersQuery.data ?? [],
        suppliersQuery.data ?? [],
        orgBalancesQuery.data ?? null
      ),
    [customersQuery.data, suppliersQuery.data, orgBalancesQuery.data]
  );

  const liquidPosition = useMemo(
    () =>
      buildLiquidPositionAnalytics(
        orgCashQuery.data ?? null,
        branchCashQuery.data ?? null,
        accountsQuery.data ?? [],
        effectiveBranchId
      ),
    [orgCashQuery.data, branchCashQuery.data, accountsQuery.data, effectiveBranchId]
  );

  const inventoryIntel = useMemo(
    () =>
      buildInventoryIntelligence(
        productsQuery.data ?? [],
        lowStockQuery.data ?? [],
        mobileOrgQuery.data ?? null,
        mobileBranchQuery.data ?? null,
        effectiveBranchId
      ),
    [productsQuery.data, lowStockQuery.data, mobileOrgQuery.data, mobileBranchQuery.data, effectiveBranchId]
  );

  const repairsSummary = useMemo(
    () =>
      buildRepairsOperationalSummary(
        repairsQuery.data?.data ?? [],
        repairsQuery.data?.total ?? 0,
        dateRange,
        todayPkt
      ),
    [repairsQuery.data, dateRange, todayPkt]
  );

  const hrAttendance = useMemo(
    () => buildHrAttendanceOverview(attendanceQuery.data ?? null),
    [attendanceQuery.data]
  );

  const mobileSalesSummary = useMemo(
    () =>
      buildMobileSalesOperationalSummary(
        mobileSalesQuery.data?.sales ?? [],
        mobileSalesQuery.data?.total ?? 0,
        dateRange
      ),
    [mobileSalesQuery.data, dateRange]
  );

  // Authoritative Headline Totals (using Profit API when permitted, fallback to Sales List)
  const headline = useMemo(() => {
    const pCurr = currentProfitQuery.data;
    const pPrev = prevProfitQuery.data;
    const expCurr = expenseSummaryQuery.data?.total_amount ?? 0;
    const expPrev = prevExpenseSummaryQuery.data?.total_amount ?? 0;

    const netSales = pCurr ? pCurr.net_sales : salesTrend.netSales;
    const returnsAmount = pCurr ? pCurr.returned_revenue : salesTrend.returnsAmount;
    const grossSales = pCurr ? pCurr.net_sales + pCurr.returned_revenue : salesTrend.grossSales;
    const returnsCount = pCurr ? pCurr.returns_count : salesTrend.returnsCount;
    const invoiceCount = pCurr ? pCurr.total_invoices : salesTrend.ordersCount;
    const discounts = pCurr ? pCurr.total_discounts : 0;
    const grossProfit = pCurr ? pCurr.gross_profit : null;
    const grossMargin = pCurr ? pCurr.gross_margin : null;
    const cogs = pCurr ? pCurr.total_cogs : null;

    const prevNetSales = pPrev ? pPrev.net_sales : null;
    const prevReturnsAmount = pPrev ? pPrev.returned_revenue : null;
    const prevGrossSales = pPrev ? pPrev.net_sales + pPrev.returned_revenue : null;
    const prevGrossProfit = pPrev ? pPrev.gross_profit : null;

    return {
      grossSales,
      returnsAmount,
      netSales,
      discounts,
      invoiceCount,
      returnsCount,
      cogs,
      grossProfit,
      grossMargin,
      operatingExpenses: expCurr,
      grossSalesDelta: prevGrossSales !== null ? computePercentDelta(grossSales, prevGrossSales) : null,
      returnsDelta: prevReturnsAmount !== null ? computePercentDelta(returnsAmount, prevReturnsAmount) : null,
      netSalesDelta: prevNetSales !== null ? computePercentDelta(netSales, prevNetSales) : null,
      grossProfitDelta:
        grossProfit !== null && prevGrossProfit !== null
          ? computePercentDelta(grossProfit, prevGrossProfit)
          : null,
      expensesDelta: computePercentDelta(expCurr, expPrev),
      returnRatePct: grossSales > 0 ? Number(((returnsAmount / grossSales) * 100).toFixed(1)) : 0,
      isSalesListTruncated: (salesQuery.data?.length ?? 0) >= 1000,
    };
  }, [
    currentProfitQuery.data,
    prevProfitQuery.data,
    expenseSummaryQuery.data,
    prevExpenseSummaryQuery.data,
    salesTrend,
    salesQuery.data,
  ]);

  const alerts = useMemo(
    () =>
      buildBusinessAlerts({
        mode,
        inventory: perms.canViewInventory ? inventoryIntel : null,
        grossSales: headline.grossSales,
        returnsAmount: headline.returnsAmount,
        repairs: perms.canViewRepairs ? repairsSummary : null,
        liquid: perms.canViewCash ? liquidPosition : null,
        purchases: perms.canViewPurchases ? purchaseAnalytics : null,
        attendance: perms.canViewHr ? hrAttendance : null,
        branches: retailBranches,
      }),
    [
      mode,
      perms,
      inventoryIntel,
      headline.grossSales,
      headline.returnsAmount,
      repairsSummary,
      liquidPosition,
      purchaseAnalytics,
      hrAttendance,
      retailBranches,
    ]
  );

  const refreshAll = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const first = String(q.queryKey[0] ?? '');
          return (
            first.startsWith('cc-') ||
            first === 'cash' ||
            first === 'accounts' ||
            first === 'branches'
          );
        },
      });
    } finally {
      setIsManualRefreshing(false);
    }
  }, [queryClient]);

  const isExecutiveLoading =
    currentProfitQuery.isLoading ||
    salesQuery.isLoading ||
    expenseSummaryQuery.isLoading;

  return {
    perms,
    todayPkt,
    effectiveBranchId,
    retailBranches,
    branchesLoading: branchesQuery.isLoading,
    headline,
    salesTrend,
    paymentSettlement,
    expenseAnalytics,
    purchaseAnalytics,
    partyPosition,
    liquidPosition,
    inventoryIntel,
    repairsSummary,
    hrAttendance,
    mobileSalesSummary,
    recentHistory: historyQuery.data?.data ?? [],
    branchComparison: branchComparisonQuery.data ?? [],
    orgCash: orgCashQuery.data ?? null,
    branchCash: branchCashQuery.data ?? null,
    expenseSummaryRaw: expenseSummaryQuery.data ?? null,
    mobileOrgSummary: mobileOrgQuery.data ?? null,
    alerts,
    loading: {
      executive: isExecutiveLoading,
      sales: salesQuery.isLoading || returnsQuery.isLoading || currentProfitQuery.isLoading,
      expenses: expenseSummaryQuery.isLoading || expensesListQuery.isLoading,
      purchases: purchasesQuery.isLoading || demandsQuery.isLoading,
      parties: customersQuery.isLoading || suppliersQuery.isLoading || orgBalancesQuery.isLoading,
      liquid: orgCashQuery.isLoading || branchCashQuery.isLoading || accountsQuery.isLoading,
      inventory: productsQuery.isLoading || lowStockQuery.isLoading || mobileOrgQuery.isLoading || mobileBranchQuery.isLoading,
      branchComparison: branchComparisonQuery.isLoading || orgCashQuery.isLoading,
      repairs: repairsQuery.isLoading,
      hr: attendanceQuery.isLoading,
      mobileSales: mobileSalesQuery.isLoading,
      history: historyQuery.isLoading,
    },
    errors: {
      sales: salesQuery.isError || currentProfitQuery.isError,
      expenses: expenseSummaryQuery.isError,
      purchases: purchasesQuery.isError,
      parties: customersQuery.isError || suppliersQuery.isError,
      liquid: orgCashQuery.isError || branchCashQuery.isError || accountsQuery.isError,
      inventory: productsQuery.isError,
      branchComparison: branchComparisonQuery.isError,
      repairs: repairsQuery.isError,
      hr: attendanceQuery.isError,
    },
    refetchSales: () => {
      salesQuery.refetch();
      returnsQuery.refetch();
      currentProfitQuery.refetch();
    },
    refreshAll,
    isRefreshing: isManualRefreshing || branchesQuery.isFetching || currentProfitQuery.isFetching,
  };
}
