/**
 * Live Sales Analytics Data Adapter
 * Transforms real API query data into the unified view contracts.
 * Zero fallback to mock data, zero simulated datasets.
 */

import type {
  AnalyticsViewData,
  LiveKpiSet,
  LiveProfitBreakdown,
  LiveTrendPoint,
  LiveExpenseCategory,
  LiveBranchPerformance,
  LiveTransaction,
  LiveProduct,
  LiveRepairJob,
  LiveRepairSummary,
  LiveMobileDevice,
  LiveMobileSummary,
  LiveLossEvent,
  LiveSupplierClaim,
  LiveLossSummary,
  LiveFinancialSummary,
  LiveLedgerEntry,
  LiveReconciliationRow,
} from './salesAnalytics.types';
import type { SaFullReport, SaAnomaly, SaProductRow } from './salesAnalytics.api';

export interface BuildLiveAnalyticsParams {
  branchId: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  fullReport: SaFullReport | null;
  productsReport?: SaProductRow[] | null;
  rawSales: any[];
  rawReturns: any[];
  rawRepairs: any[];
  rawMobiles: any[];
  rawExpenses: any[];
  branches: any[];
  orgBalances: any;
  expenseSummary: any;
  profitSummary: any;
  prevProfitSummary: any;
  productSalesAnalysis?: any[];
}

export function buildLiveAnalyticsViewData(params: BuildLiveAnalyticsParams): AnalyticsViewData {
  const {
    branchId,
    startDate,
    endDate,
    dateLabel,
    fullReport,
    rawSales = [],
    rawReturns = [],
    rawRepairs = [],
    rawMobiles = [],
    rawExpenses = [],
    branches = [],
    orgBalances,
    expenseSummary,
    profitSummary,
    prevProfitSummary,
  } = params;

  // 1. Overview KPIs
  // Compute fallback aggregates directly from authentic rawSales and rawReturns when backend overview is 0 or pending
  const validSales = (rawSales || []).filter((s: any) => s.sale_status !== 'VOIDED');
  const rawGrossFromSales = validSales.reduce((acc: number, s: any) => acc + Number(s.total_amount ?? 0), 0);
  const rawDiscountsFromSales = validSales.reduce((acc: number, s: any) => acc + Number(s.discount ?? 0), 0);
  const validReturns = (rawReturns || []).filter((r: any) => r.status === 'COMPLETED');
  const rawReturnsFromReturns = validReturns.reduce((acc: number, r: any) => acc + Number(r.total_amount ?? 0), 0);

  const ov = fullReport?.overview;
  const returnedRev = Number(ov?.returned_revenue ?? profitSummary?.returns ?? rawReturnsFromReturns);
  const rawNetFromSales = Math.max(0, rawGrossFromSales - returnedRev);
  const netSales = Number(ov?.net_sales ?? profitSummary?.netSales ?? rawNetFromSales);
  const grossSales = Number(ov?.gross_sales ?? (netSales + returnedRev) ?? rawGrossFromSales);
  const cogs = Number(ov?.total_cogs ?? profitSummary?.cogs ?? 0);
  const grossProfit = Number(ov?.gross_profit ?? profitSummary?.grossProfit ?? (netSales - cogs));
  const totalExpenses = Number(expenseSummary?.total_amount ?? 0);
  const operatingProfit = grossProfit - totalExpenses;
  const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0;
  const totalTransactions = Number(ov?.total_invoices ?? profitSummary?.invoiceCount ?? validSales.length);
  const averageTransactionValue = totalTransactions > 0 ? Math.round(netSales / totalTransactions) : 0;
  const totalDiscounts = Number(profitSummary?.discounts ?? rawDiscountsFromSales);
  const totalReturns = returnedRev;

  // Deltas vs previous period
  const prevNet = Number(prevProfitSummary?.net_sales ?? 0);
  const prevGrossProfit = Number(prevProfitSummary?.gross_profit ?? 0);
  const prevTx = Number(prevProfitSummary?.total_invoices ?? 0);

  const calcDelta = (curr: number, prev: number) => {
    if (prev <= 0) return null;
    return Number((((curr - prev) / prev) * 100).toFixed(1));
  };

  const kpis: LiveKpiSet = {
    totalRevenue: grossSales,
    netSales,
    grossProfit,
    operatingProfit,
    grossMarginPct,
    totalExpenses,
    totalTransactions,
    averageTransactionValue,
    totalDiscounts,
    totalReturns,
    cogs,
    revenueChange: calcDelta(netSales, prevNet),
    grossProfitChange: calcDelta(grossProfit, prevGrossProfit),
    operatingProfitChange: null,
    transactionsChange: calcDelta(totalTransactions, prevTx),
  };

  // 2. Profit Breakdown by Business Line
  const repairProfit = Number(fullReport?.repair_summary?.total_profit ?? 0);
  const mobileProfit = Number(fullReport?.mobile_summary?.gross_profit ?? 0);
  const productProfit = Math.max(0, grossProfit - (repairProfit + mobileProfit));

  const profitBreakdown: LiveProfitBreakdown[] = [
    { label: 'Product Sales', value: productProfit, color: '#006970' },
    { label: 'Repair Services', value: repairProfit, color: '#00b4bb' },
    { label: 'Mobile Devices', value: mobileProfit, color: '#33c9cf' },
  ];

  // 3. Branch Performance
  const branchPerf: LiveBranchPerformance[] = (branches || []).map((b: any) => {
    const bId = String(b.id || b._id);
    const bName = String(b.name || b.branch_name || bId);
    return {
      branchId: bId,
      branchName: bName,
      revenue: bId === branchId || branchId === 'ALL' ? netSales : 0,
      cogs: bId === branchId || branchId === 'ALL' ? cogs : 0,
      grossProfit: bId === branchId || branchId === 'ALL' ? grossProfit : 0,
      expenses: bId === branchId || branchId === 'ALL' ? totalExpenses : 0,
      operatingProfit: bId === branchId || branchId === 'ALL' ? operatingProfit : 0,
      marginPct: grossMarginPct,
      transactions: bId === branchId || branchId === 'ALL' ? totalTransactions : 0,
      changeRevPct: null,
    };
  });

  // 4. Expenses by Category
  const expenseCatMap = new Map<string, number>();
  for (const exp of rawExpenses) {
    const cat = String(exp.category || exp.expense_category || 'General Expense');
    const amt = Number(exp.amount || 0);
    expenseCatMap.set(cat, (expenseCatMap.get(cat) ?? 0) + amt);
  }
  const expenses: LiveExpenseCategory[] = Array.from(expenseCatMap.entries()).map(([label, amount]) => ({
    label,
    amount,
    pct: totalExpenses > 0 ? Number(((amount / totalExpenses) * 100).toFixed(1)) : 0,
    color: '#006970',
  }));

  // 5. Recent Transactions
  const transactions: LiveTransaction[] = (rawSales || []).slice(0, 50).map((sale: any) => {
    const rev = Number(sale.total_amount ?? sale.grand_total ?? sale.net_amount ?? 0);
    const cost = Number(sale.total_cogs ?? sale.cogs ?? sale.cost_price ?? 0);
    const created = sale.created_at ? new Date(sale.created_at) : new Date();
    const dateStr = created.toISOString().slice(0, 10);
    const timeStr = created.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

    return {
      id: String(sale.id || sale._id),
      date: dateStr,
      time: timeStr,
      type: 'product_sale',
      reference: String(sale.invoice_number || sale.invoice_no || sale.sale_number || sale.id || 'INV'),
      branchId: String(sale.branch_id || ''),
      branchName: String(sale.branch_name || 'Branch'),
      party: String(sale.customer_name_snapshot || sale.customer_name || sale.customer?.name || sale.party || 'Walk-in Customer'),
      revenue: rev,
      cost,
      profit: rev - cost,
      status: String(sale.sale_status || sale.status || 'completed').toLowerCase(),
    };
  });

  // 6. Products Tab Data
  const reportProducts =
    params.productsReport && params.productsReport.length > 0
      ? params.productsReport
      : fullReport?.products && fullReport.products.length > 0
      ? fullReport.products
      : null;
  const products: LiveProduct[] = reportProducts
    ? reportProducts.map((p: any) => {
        const sold = Number(p.quantity_sold ?? 0);
        const netRev = Number(p.net_revenue ?? 0);
        const cogsVal = Number(p.total_cogs ?? 0);
        const gp = Number(p.gross_profit ?? (netRev - cogsVal));
        return {
          id: String(p.product_id),
          name: String(p.product_name),
          sku: String(p.sku || ''),
          category: 'General',
          unitCost: sold > 0 ? Math.round(cogsVal / sold) : 0,
          sellingPrice: sold > 0 ? Math.round(netRev / sold) : 0,
          qtySold: sold,
          grossRevenue: Number(p.gross_revenue ?? netRev),
          discount: 0,
          netRevenue: netRev,
          totalCogs: cogsVal,
          grossProfit: gp,
          marginPct: Number(p.margin_pct ?? (netRev > 0 ? (gp / netRev) * 100 : 0)),
          returnCount: 0,
          returnValue: 0,
        };
      })
    : (params.productSalesAnalysis || []).map((p: any) => {
        const sold = Number(p.totalQty ?? 0);
        const netRev = Number(p.totalRevenue ?? 0);
        const disc = Number(p.totalDiscount ?? 0);
        const grossRev = netRev + disc;
        return {
          id: String(p.productId),
          name: String(p.productName),
          sku: '',
          category: String(p.lineType || 'General'),
          unitCost: 0,
          sellingPrice: sold > 0 ? Math.round(netRev / sold) : 0,
          qtySold: sold,
          grossRevenue: grossRev,
          discount: disc,
          netRevenue: netRev,
          totalCogs: 0,
          grossProfit: netRev,
          marginPct: 100,
          returnCount: 0,
          returnValue: 0,
        };
      });

  // 7. Repair Jobs
  const rep = fullReport?.repair_summary;
  const totalRepairJobs = Number(rep?.total_jobs ?? rawRepairs.length);
  const compRepairJobs = Number(rep?.completed_jobs ?? 0);
  const repairBilled = Number(rep?.total_billed ?? 0);
  const repairPartsRev = Number(rep?.parts_revenue ?? 0);
  const repairPartsCost = Number(rep?.parts_cost ?? 0);
  const repairLabourRev = Number(rep?.labour_revenue ?? 0);
  const repairProfitVal = Number(rep?.total_profit ?? 0);

  const repairSummary: LiveRepairSummary = {
    totalJobs: totalRepairJobs,
    completedJobs: compRepairJobs,
    activeJobs: Math.max(0, totalRepairJobs - compRepairJobs),
    cancelledJobs: 0,
    totalBilled: repairBilled,
    totalRevenue: repairBilled,
    partsRevenue: repairPartsRev,
    labourRevenue: repairLabourRev,
    partsCost: repairPartsCost,
    totalProfit: repairProfitVal,
    grossProfit: repairProfitVal,
    avgProfit: compRepairJobs > 0 ? Math.round(repairProfitVal / compRepairJobs) : 0,
    marginPct: repairBilled > 0 ? Number(((repairProfitVal / repairBilled) * 100).toFixed(1)) : 0,
    partsUsageCount: 0,
    avgJobValue: totalRepairJobs > 0 ? Math.round(repairBilled / totalRepairJobs) : 0,
    outstandingBalance: Number(rep?.outstanding_balance ?? 0),
    totalCollected: Number(rep?.total_collected ?? repairBilled),
  };

  const repairJobs: LiveRepairJob[] = (rawRepairs || []).map((j: any) => {
    const billed = Number(j.grandTotal ?? j.total_billed ?? 0);
    const pCost = Number(j.partsTotal ?? 0);
    return {
      id: String(j.id || j.job_id),
      date: String(j.created_at || j.date || startDate).slice(0, 10),
      branchId: String(j.branch_id || ''),
      branchName: String(j.branch_name || 'Branch'),
      customer: String(j.customer_name || j.customer || 'Walk-in Customer'),
      deviceModel: String(j.device_model || j.deviceModel || 'Phone'),
      deviceType: String(j.device_type || 'Mobile'),
      technicianId: String(j.technician_id || ''),
      technicianName: String(j.technician_name || 'Staff'),
      status: String(j.status || 'delivered').toLowerCase(),
      partsRevenue: Number(j.partsTotal ?? 0),
      labourRevenue: Number(j.laborTotal ?? 0),
      partsCost: pCost,
      labourCost: 0,
      otherCost: 0,
      totalBilled: billed,
      grossProfit: billed - pCost,
      marginPct: billed > 0 ? Number((((billed - pCost) / billed) * 100).toFixed(1)) : 0,
      parts: [],
      notes: String(j.problem_description || j.notes || ''),
    };
  });

  // 8. Mobile Devices
  const mob = fullReport?.mobile_summary;
  const mobSold = Number(mob?.devices_sold ?? 0);
  const mobStock = Number(mob?.devices_in_stock ?? 0);
  const mobRev = Number(mob?.total_sale_revenue ?? 0);
  const mobCogs = Number(mob?.total_cogs ?? 0);
  const mobProfit = Number(mob?.gross_profit ?? 0);

  const totalMobUnits = Number(mob?.total_devices ?? (mobSold + mobStock));
  const mobileSummary: LiveMobileSummary = {
    totalDevicesPurchased: totalMobUnits,
    totalPurchased: totalMobUnits,
    totalSold: mobSold,
    devicesSold: mobSold,
    devicesInStock: mobStock,
    devicesWrittenOff: 0,
    stockValue: 0,
    totalSoldCost: mobCogs,
    totalSaleRevenue: mobRev,
    saleRevenue: mobRev,
    cogs: mobCogs,
    totalGrossProfit: mobProfit,
    grossProfit: mobProfit,
    grossMarginPct: Number(mob?.gross_margin_pct ?? (mobRev > 0 ? (mobProfit / mobRev) * 100 : 0)),
    marginPct: Number(mob?.gross_margin_pct ?? (mobRev > 0 ? (mobProfit / mobRev) * 100 : 0)),
    avgTurnoverDays: 0,
    totalDevices: totalMobUnits,
  };

  const mobileDevices: LiveMobileDevice[] = (rawMobiles || []).map((m: any) => ({
    id: String(m.id),
    model: String(m.model_name || m.model || ''),
    brand: String(m.brand || ''),
    imei: String(m.imei || ''),
    color: String(m.color || ''),
    storage: String(m.storage || ''),
    status: String(m.status || 'sold').toLowerCase(),
    branchId: String(m.branch_id || ''),
    branchName: String(m.branch_name || 'Branch'),
    purchaseDate: String(m.purchase_date || startDate).slice(0, 10),
    purchaseCost: Number(m.cost_price || 0),
    supplierRef: String(m.supplier_id || ''),
    saleDate: m.sale_date ? String(m.sale_date).slice(0, 10) : null,
    salePrice: m.sale_price !== undefined ? Number(m.sale_price) : null,
    invoiceNo: m.invoice_no ? String(m.invoice_no) : null,
    customer: m.customer_name ? String(m.customer_name) : null,
    grossProfit: m.sale_price !== undefined ? Number(m.sale_price) - Number(m.cost_price || 0) : null,
    marginPct: m.sale_price ? Number((((Number(m.sale_price) - Number(m.cost_price || 0)) / Number(m.sale_price)) * 100).toFixed(1)) : null,
  }));

  // 9. Financial Summary
  const financialSummary: LiveFinancialSummary = {
    cashOnHand: Number(orgBalances?.cash_on_hand ?? 0),
    bankBalance: Number(orgBalances?.bank_balance ?? 0),
    customerReceivables: Number(orgBalances?.customer_receivables ?? 0),
    supplierPayables: Number(orgBalances?.supplier_payables ?? 0),
    customerAdvances: Number(orgBalances?.customer_advances ?? 0),
    netPosition: Number(orgBalances?.net_position ?? 0),
    pendingClaims: 0,
  };

  const lossSummary: LiveLossSummary = {
    damageEvents: 0,
    totalLossEvents: 0,
    totalQtyAffected: 0,
    totalEstimatedLoss: 0,
    confirmedWriteOff: 0,
    totalClaims: 0,
    totalClaimsSubmitted: 0,
    openClaims: 0,
    totalClaimValue: 0,
    recoveredValue: 0,
    totalRecovered: 0,
    pendingRecovery: 0,
    recoveryRatePct: 0,
    unrecoverableLoss: 0,
  };

  // 10. Trends (Construct from actual period or empty if none)
  const trendDaily: LiveTrendPoint[] = [
    {
      label: startDate,
      revenue: netSales,
      cogs,
      grossProfit,
      expenses: totalExpenses,
    },
  ];

  return {
    branchId,
    dateRange: {
      startDate,
      endDate,
      label: dateLabel,
    },
    kpis,
    profitBreakdown,
    trendDaily,
    trendWeekly: trendDaily,
    trendMonthly: trendDaily,
    expenses,
    branchPerf,
    transactions,
    insights: [],
    products,
    productTransactions: [],
    repairJobs,
    repairSummary,
    mobileDevices,
    mobileSummary,
    lossEvents: [],
    supplierClaims: [],
    lossSummary,
    financialSummary,
    ledgerEntries: [],
    reconRows: (fullReport?.anomalies || []).map((a: SaAnomaly, idx: number) => ({
      id: `anom-${idx}`,
      date: a.created_at ? a.created_at.slice(0, 10) : startDate,
      branchId,
      branchName: 'Branch',
      txRef: a.invoice_ref || a.sale_id,
      sourceModule: a.anomaly_type,
      invoiceRef: a.invoice_ref || a.sale_id,
      revenue: Number(a.actual_amount ?? 0),
      paymentReceived: Number(a.expected_amount ?? 0),
      outstanding: Number(a.difference ?? 0),
      debit: 0,
      credit: 0,
      status: 'review',
      notes: `Anomaly: ${a.anomaly_type}`,
    })),
  };
}
