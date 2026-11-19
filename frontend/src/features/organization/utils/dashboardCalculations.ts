/**
 * Deterministic financial, inventory, party-balance, and operational aggregations
 * for the Enterprise Command Center Dashboard.
 *
 * Strict accounting conventions enforced across all functions:
 * - Positive customer balance = Customer owes business (Receivable / DR)
 * - Negative customer balance = Customer advance (Liability / CR, never revenue)
 * - Positive supplier balance = Business owes supplier (Payable)
 * - Negative supplier balance = Supplier advance
 * - Returns reduce net revenue at return creation timestamp (PKT), never decremented from order count
 * - Gross profit is NEVER calculated as sales minus purchases
 */

import type {
  Branch,
  CustomerSummaryDto,
  DailyCashSummaryDto,
  DashboardBalancesDto,
  Expense,
  ExpenseSummary,
  LowStockItemDto,
  OrgCashSummaryDto,
  Product,
  Purchase,
  Sale,
  SalesReturn,
  SupplierDemand,
  SupplierSummaryDto,
} from '@/lib/tauri/tauriClient';
import type { BusinessAccount } from '@/services/accounts.api';
import type { BranchInvestmentSummary, MobileOrganizationSummary } from '@/features/mobiles/services/mobile.api';
import type { DailyRegisterResponse } from '@/features/hr/types/hr.types';
import type { RepairJob } from '@/features/repairs/types/repair.types';
import {
  enumeratePktDates,
  enumeratePktMonths,
  formatPkr,
  formatShortPktDate,
  formatShortPktMonth,
  toPktDateKey,
  toPktHour,
  toPktMonthKey,
  type DashboardDateRange,
} from './dashboardDates';

export interface SalesTrendPoint {
  label: string;
  grossSales: number;
  returnsAmount: number;
  netSales: number;
  ordersCount: number;
  returnsCount: number;
}

export interface PaymentSettlementAnalytics {
  totalInvoiced: number;
  settledAmount: number;
  creditExposure: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  settlementRate: number;
  chartData: Array<{ name: string; value: number; color: string }>;
}

export interface ExpenseAnalytics {
  totalAmount: number;
  cashTotal: number;
  nonCashTotal: number;
  totalCount: number;
  cancelledCount: number;
  byCategory: Array<{ name: string; amount: number; count: number }>;
  trendSeries: Array<{ label: string; amount: number; cashAmount: number; count: number }>;
  byPaymentMethod: Array<{ payment_method: string; total_amount: number; count: number }>;
  isListTruncated: boolean;
}

export interface PurchaseAnalytics {
  totalPurchaseValue: number;
  paidAtPurchase: number;
  creditCreated: number;
  invoiceCount: number;
  paidCount: number;
  unpaidOrPartialCount: number;
  activeDemandCount: number;
  activeDemandValue: number;
  topSuppliers: Array<{ name: string; amount: number; count: number }>;
  trendSeries: Array<{ label: string; purchaseValue: number; paidAmount: number; count: number }>;
  isTruncated: boolean;
}

export interface PartyFinancialPosition {
  customerReceivables: number;
  customerAdvances: number;
  customerDebtorCount: number;
  customerAdvanceCount: number;
  netCustomerPosition: number;
  topDebtors: Array<{ id: string; name: string; code: string; phone: string; balance: number }>;
  isCustomerListTruncated: boolean;

  supplierPayables: number;
  supplierAdvances: number;
  supplierCreditorCount: number;
  supplierAdvanceCount: number;
  netSupplierPosition: number;
  topCreditors: Array<{ id: string; name: string; code: string; phone: string; balance: number }>;
  isSupplierListTruncated: boolean;
}

export interface LiquidPositionAnalytics {
  drawerCashTotal: number;
  openSessions: number;
  closedSessions: number;
  noSessionCount: number;
  singleBranchStatus: string | null;
  singleBranchOpeningCash: number;
  bankAndDigitalTotal: number;
  activeAccountCount: number;
  accounts: BusinessAccount[];
  totalLiquidFunds: number;
}

export interface LowStockWatchItem {
  productId: string;
  productName: string;
  sku: string;
  branchName: string;
  currentQuantity: number;
  threshold: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK';
}

export interface InventoryIntelligence {
  totalSkus: number;
  catalogUnits: number;
  catalogCostValuation: number;
  catalogRetailValuation: number;
  estimatedCatalogMargin: number;
  outOfStockCount: number;
  lowStockCount: number;
  mobileInStockCount: number;
  mobileNewCount: number;
  mobileUsedCount: number;
  mobileInspectionCount: number;
  mobileValuation: number;
  combinedCostValuation: number;
  byCategory: Array<{ name: string; costValuation: number; units: number; skuCount: number }>;
  lowStockWatchlist: LowStockWatchItem[];
}

export interface RepairsOperationalSummary {
  totalTracked: number;
  pendingCount: number;
  readyForPickupCount: number;
  overdueCount: number;
  deliveredInPeriodCount: number;
  periodCollections: number;
  isTruncated: boolean;
}

export interface HrAttendanceOverview {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  halfDay: number;
  holidayOrOff: number;
  notMarked: number;
  checkedInOpen: number;
  chartData: Array<{ name: string; value: number; color: string }>;
}

export interface MobileSalesOperationalSummary {
  invoiceCount: number;
  devicesSold: number;
  totalRevenue: number;
  paidAmount: number;
  isTruncated: boolean;
}

export interface BusinessAlertItem {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
  metric: string;
  href: string;
}

export function buildSalesTrendSeries(
  sales: Sale[],
  returns: SalesReturn[],
  range: DashboardDateRange
): {
  series: SalesTrendPoint[];
  grossSales: number;
  returnsAmount: number;
  netSales: number;
  ordersCount: number;
  returnsCount: number;
} {
  const validSales = sales.filter((s) => s.sale_status !== 'VOIDED');
  const validReturns = returns.filter((r) => r.status === 'COMPLETED');

  interface MutableBucket {
    label: string;
    grossSales: number;
    returnsAmount: number;
    ordersCount: number;
    returnsCount: number;
  }

  const buckets = new Map<string, MutableBucket>();

  if (range.bucketMode === 'hourly') {
    for (let h = 0; h < 24; h++) {
      const key = String(h);
      buckets.set(key, {
        label: `${String(h).padStart(2, '0')}:00`,
        grossSales: 0,
        returnsAmount: 0,
        ordersCount: 0,
        returnsCount: 0,
      });
    }
    for (const s of validSales) {
      const d = toPktDateKey(s.created_at);
      if (d !== range.startDate) continue;
      const h = toPktHour(s.created_at);
      if (h !== null) {
        const b = buckets.get(String(h));
        if (b) {
          b.grossSales += Number(s.total_amount ?? 0);
          b.ordersCount += 1;
        }
      }
    }
    for (const r of validReturns) {
      const d = toPktDateKey(r.created_at);
      if (d !== range.startDate) continue;
      const h = toPktHour(r.created_at);
      if (h !== null) {
        const b = buckets.get(String(h));
        if (b) {
          b.returnsAmount += Number(r.total_amount ?? 0);
          b.returnsCount += 1;
        }
      }
    }
  } else if (range.bucketMode === 'daily') {
    for (const ymd of enumeratePktDates(range.startDate, range.endDate, 95)) {
      buckets.set(ymd, {
        label: formatShortPktDate(ymd),
        grossSales: 0,
        returnsAmount: 0,
        ordersCount: 0,
        returnsCount: 0,
      });
    }
    for (const s of validSales) {
      const ymd = toPktDateKey(s.created_at);
      if (ymd && buckets.has(ymd)) {
        const b = buckets.get(ymd)!;
        b.grossSales += Number(s.total_amount ?? 0);
        b.ordersCount += 1;
      }
    }
    for (const r of validReturns) {
      const ymd = toPktDateKey(r.created_at);
      if (ymd && buckets.has(ymd)) {
        const b = buckets.get(ymd)!;
        b.returnsAmount += Number(r.total_amount ?? 0);
        b.returnsCount += 1;
      }
    }
  } else {
    for (const ym of enumeratePktMonths(range.startDate, range.endDate)) {
      buckets.set(ym, {
        label: formatShortPktMonth(ym),
        grossSales: 0,
        returnsAmount: 0,
        ordersCount: 0,
        returnsCount: 0,
      });
    }
    for (const s of validSales) {
      const ym = toPktMonthKey(s.created_at);
      if (ym && buckets.has(ym)) {
        const b = buckets.get(ym)!;
        b.grossSales += Number(s.total_amount ?? 0);
        b.ordersCount += 1;
      }
    }
    for (const r of validReturns) {
      const ym = toPktMonthKey(r.created_at);
      if (ym && buckets.has(ym)) {
        const b = buckets.get(ym)!;
        b.returnsAmount += Number(r.total_amount ?? 0);
        b.returnsCount += 1;
      }
    }
  }

  let grossSales = 0;
  let returnsAmount = 0;
  let ordersCount = 0;
  let returnsCount = 0;

  const series: SalesTrendPoint[] = Array.from(buckets.values()).map((b) => {
    grossSales += b.grossSales;
    returnsAmount += b.returnsAmount;
    ordersCount += b.ordersCount;
    returnsCount += b.returnsCount;
    return {
      label: b.label,
      grossSales: Math.round(b.grossSales),
      returnsAmount: Math.round(b.returnsAmount),
      netSales: Math.round(b.grossSales - b.returnsAmount),
      ordersCount: b.ordersCount,
      returnsCount: b.returnsCount,
    };
  });

  return {
    series,
    grossSales: Math.round(grossSales),
    returnsAmount: Math.round(returnsAmount),
    netSales: Math.round(grossSales - returnsAmount),
    ordersCount,
    returnsCount,
  };
}

export function buildPaymentSettlementSummary(sales: Sale[]): PaymentSettlementAnalytics {
  const validSales = sales.filter((s) => s.sale_status !== 'VOIDED');
  let totalInvoiced = 0;
  let settledAmount = 0;
  let creditExposure = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const s of validSales) {
    const total = Math.max(0, Number(s.total_amount ?? 0));
    const paid = Math.max(0, Number(s.paid_amount ?? 0));
    const settled = Math.min(total, paid);
    const credit = Math.max(0, total - paid);

    totalInvoiced += total;
    settledAmount += settled;
    creditExposure += credit;

    if (s.payment_status === 'PAID' || credit === 0) paidCount++;
    else if (settled > 0) partialCount++;
    else unpaidCount++;
  }

  const invoiceCount = validSales.length;
  const averageInvoiceValue = invoiceCount > 0 ? Math.round(totalInvoiced / invoiceCount) : 0;
  const settlementRate = totalInvoiced > 0 ? Number(((settledAmount / totalInvoiced) * 100).toFixed(1)) : 0;

  const chartData = [
    { name: 'Settled on Invoice', value: Math.round(settledAmount), color: '#006970' },
    { name: 'Credit / Receivable', value: Math.round(creditExposure), color: '#d97706' },
  ].filter((d) => d.value > 0);

  return {
    totalInvoiced: Math.round(totalInvoiced),
    settledAmount: Math.round(settledAmount),
    creditExposure: Math.round(creditExposure),
    invoiceCount,
    averageInvoiceValue,
    paidCount,
    partialCount,
    unpaidCount,
    settlementRate,
    chartData,
  };
}

export function buildExpenseAnalytics(
  expenses: Expense[],
  summary: ExpenseSummary | null,
  range: DashboardDateRange
): ExpenseAnalytics {
  const completed = expenses.filter((e) => e.status === 'COMPLETED');

  const categoryMap = new Map<string, { amount: number; count: number }>();
  for (const e of completed) {
    const cat = e.category_name?.trim() || 'Uncategorized';
    const prev = categoryMap.get(cat) ?? { amount: 0, count: 0 };
    prev.amount += Number(e.amount ?? 0);
    prev.count += 1;
    categoryMap.set(cat, prev);
  }

  const sortedCategories = Array.from(categoryMap.entries())
    .map(([name, val]) => ({ name, amount: Math.round(val.amount), count: val.count }))
    .sort((a, b) => b.amount - a.amount);

  const byCategory =
    sortedCategories.length > 6
      ? [
          ...sortedCategories.slice(0, 6),
          sortedCategories.slice(6).reduce(
            (acc, item) => ({
              name: 'Other Categories',
              amount: acc.amount + item.amount,
              count: acc.count + item.count,
            }),
            { name: 'Other Categories', amount: 0, count: 0 }
          ),
        ]
      : sortedCategories;

  let trendSeries: Array<{ label: string; amount: number; cashAmount: number; count: number }> = [];
  if (range.bucketMode === 'daily') {
    const dayMap = new Map<string, { label: string; amount: number; cashAmount: number; count: number }>();
    for (const ymd of enumeratePktDates(range.startDate, range.endDate, 95)) {
      dayMap.set(ymd, { label: formatShortPktDate(ymd), amount: 0, cashAmount: 0, count: 0 });
    }
    for (const e of completed) {
      const ymd = toPktDateKey(e.expense_date || e.created_at);
      if (ymd && dayMap.has(ymd)) {
        const b = dayMap.get(ymd)!;
        const amt = Number(e.amount ?? 0);
        b.amount += amt;
        if (String(e.payment_method).toUpperCase() === 'CASH') b.cashAmount += amt;
        b.count += 1;
      }
    }
    trendSeries = Array.from(dayMap.values());
  } else if (range.bucketMode === 'monthly') {
    const monthMap = new Map<string, { label: string; amount: number; cashAmount: number; count: number }>();
    for (const ym of enumeratePktMonths(range.startDate, range.endDate)) {
      monthMap.set(ym, { label: formatShortPktMonth(ym), amount: 0, cashAmount: 0, count: 0 });
    }
    for (const e of completed) {
      const ym = toPktMonthKey(e.expense_date || e.created_at);
      if (ym && monthMap.has(ym)) {
        const b = monthMap.get(ym)!;
        const amt = Number(e.amount ?? 0);
        b.amount += amt;
        if (String(e.payment_method).toUpperCase() === 'CASH') b.cashAmount += amt;
        b.count += 1;
      }
    }
    trendSeries = Array.from(monthMap.values());
  } else {
    trendSeries = byCategory.map((c) => ({
      label: c.name,
      amount: c.amount,
      cashAmount: 0,
      count: c.count,
    }));
  }

  return {
    totalAmount: Math.round(Number(summary?.total_amount ?? 0)),
    cashTotal: Math.round(Number(summary?.cash_total ?? 0)),
    nonCashTotal: Math.round(Number(summary?.non_cash_total ?? 0)),
    totalCount: Number(summary?.total_count ?? 0),
    cancelledCount: Number(summary?.cancelled_count ?? 0),
    byCategory,
    trendSeries,
    byPaymentMethod: summary?.by_payment_method ?? [],
    isListTruncated: expenses.length >= 500,
  };
}

export function buildPurchaseAnalytics(
  purchases: Array<Purchase & { supplier_name?: string }>,
  demands: SupplierDemand[],
  range: DashboardDateRange
): PurchaseAnalytics {
  const activeInPeriod = purchases.filter((p) => {
    if (p.status === 'CANCELLED') return false;
    const d = toPktDateKey(p.created_at);
    return d !== null && d >= range.startDate && d <= range.endDate;
  });

  let totalPurchaseValue = 0;
  let paidAtPurchase = 0;
  let creditCreated = 0;
  let paidCount = 0;
  let unpaidOrPartialCount = 0;

  const supplierMap = new Map<string, { amount: number; count: number }>();

  for (const p of activeInPeriod) {
    const total = Number(p.total_amount ?? 0);
    const paid = Number(p.paid_amount ?? 0);
    const credit = Number(p.credit_amount ?? Math.max(0, total - paid));

    totalPurchaseValue += total;
    paidAtPurchase += paid;
    creditCreated += credit;

    if (p.payment_status === 'PAID') paidCount++;
    else unpaidOrPartialCount++;

    const supName = p.supplier_name?.trim() || 'Supplier';
    const prev = supplierMap.get(supName) ?? { amount: 0, count: 0 };
    prev.amount += total;
    prev.count += 1;
    supplierMap.set(supName, prev);
  }

  const topSuppliers = Array.from(supplierMap.entries())
    .map(([name, v]) => ({ name, amount: Math.round(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  let trendSeries: Array<{ label: string; purchaseValue: number; paidAmount: number; count: number }> = [];
  if (range.bucketMode === 'monthly') {
    const mMap = new Map<string, { label: string; purchaseValue: number; paidAmount: number; count: number }>();
    for (const ym of enumeratePktMonths(range.startDate, range.endDate)) {
      mMap.set(ym, { label: formatShortPktMonth(ym), purchaseValue: 0, paidAmount: 0, count: 0 });
    }
    for (const p of activeInPeriod) {
      const ym = toPktMonthKey(p.created_at);
      if (ym && mMap.has(ym)) {
        const b = mMap.get(ym)!;
        b.purchaseValue += Number(p.total_amount ?? 0);
        b.paidAmount += Number(p.paid_amount ?? 0);
        b.count += 1;
      }
    }
    trendSeries = Array.from(mMap.values());
  } else {
    const dMap = new Map<string, { label: string; purchaseValue: number; paidAmount: number; count: number }>();
    for (const ymd of enumeratePktDates(range.startDate, range.endDate, 95)) {
      dMap.set(ymd, { label: formatShortPktDate(ymd), purchaseValue: 0, paidAmount: 0, count: 0 });
    }
    for (const p of activeInPeriod) {
      const ymd = toPktDateKey(p.created_at);
      if (ymd && dMap.has(ymd)) {
        const b = dMap.get(ymd)!;
        b.purchaseValue += Number(p.total_amount ?? 0);
        b.paidAmount += Number(p.paid_amount ?? 0);
        b.count += 1;
      }
    }
    trendSeries = Array.from(dMap.values());
  }

  const openDemands = demands.filter(
    (d) => d.status === 'DRAFT' || d.status === 'ORDERED' || d.status === 'PARTIALLY_RECEIVED'
  );
  const activeDemandValue = openDemands.reduce((sum, d) => sum + Number(d.total_estimated_amount ?? 0), 0);

  return {
    totalPurchaseValue: Math.round(totalPurchaseValue),
    paidAtPurchase: Math.round(paidAtPurchase),
    creditCreated: Math.round(creditCreated),
    invoiceCount: activeInPeriod.length,
    paidCount,
    unpaidOrPartialCount,
    activeDemandCount: openDemands.length,
    activeDemandValue: Math.round(activeDemandValue),
    topSuppliers,
    trendSeries,
    isTruncated: purchases.length >= 200,
  };
}

export function buildPartyFinancialPosition(
  customers: CustomerSummaryDto[],
  suppliers: SupplierSummaryDto[],
  orgBalances: DashboardBalancesDto | null
): PartyFinancialPosition {
  let customerReceivables = 0;
  let customerAdvances = 0;
  let customerDebtorCount = 0;
  let customerAdvanceCount = 0;
  const debtors: Array<{ id: string; name: string; code: string; phone: string; balance: number }> = [];

  for (const c of customers) {
    const bal = Number(c.outstanding_balance ?? 0);
    if (bal > 0) {
      customerReceivables += bal;
      customerDebtorCount += 1;
      debtors.push({ id: c.id, name: c.name, code: c.customer_code, phone: c.phone, balance: bal });
    } else if (bal < 0) {
      customerAdvances += Math.abs(bal);
      customerAdvanceCount += 1;
    }
  }
  debtors.sort((a, b) => b.balance - a.balance);

  let supplierPayables = 0;
  let supplierAdvances = 0;
  let supplierCreditorCount = 0;
  let supplierAdvanceCount = 0;
  const creditors: Array<{ id: string; name: string; code: string; phone: string; balance: number }> = [];

  for (const s of suppliers) {
    const bal = Number(s.outstanding_balance ?? 0);
    if (bal > 0) {
      supplierPayables += bal;
      supplierCreditorCount += 1;
      creditors.push({ id: s.id, name: s.name, code: s.supplier_code, phone: s.phone, balance: bal });
    } else if (bal < 0) {
      supplierAdvances += Math.abs(bal);
      supplierAdvanceCount += 1;
    }
  }
  creditors.sort((a, b) => b.balance - a.balance);

  const isCustomerListTruncated = customers.length >= 500;
  const isSupplierListTruncated = suppliers.length >= 500;

  // When orgBalances is available and party list hit limit, trust authoritative SQL SUM(debit)-SUM(credit) for net position
  const netCustomerPosition =
    customers.length === 0 && orgBalances
      ? Number(orgBalances.customer_receivables ?? 0)
      : Math.round(customerReceivables - customerAdvances);

  const netSupplierPosition =
    suppliers.length === 0 && orgBalances
      ? Number(orgBalances.supplier_payables ?? 0)
      : Math.round(supplierPayables - supplierAdvances);

  return {
    customerReceivables: Math.round(
      customers.length === 0 && orgBalances ? Math.max(0, orgBalances.customer_receivables ?? 0) : customerReceivables
    ),
    customerAdvances: Math.round(customerAdvances),
    customerDebtorCount,
    customerAdvanceCount,
    netCustomerPosition,
    topDebtors: debtors.slice(0, 5),
    isCustomerListTruncated,

    supplierPayables: Math.round(
      suppliers.length === 0 && orgBalances ? Math.max(0, orgBalances.supplier_payables ?? 0) : supplierPayables
    ),
    supplierAdvances: Math.round(supplierAdvances),
    supplierCreditorCount,
    supplierAdvanceCount,
    netSupplierPosition,
    topCreditors: creditors.slice(0, 5),
    isSupplierListTruncated,
  };
}

export function buildLiquidPositionAnalytics(
  orgCash: OrgCashSummaryDto | null,
  branchCash: DailyCashSummaryDto | null,
  accounts: BusinessAccount[],
  selectedBranchId: string | null
): LiquidPositionAnalytics {
  let drawerCashTotal = 0;
  let openSessions = 0;
  let closedSessions = 0;
  let noSessionCount = 0;
  let singleBranchStatus: string | null = null;
  let singleBranchOpeningCash = 0;

  if (orgCash) {
    if (selectedBranchId) {
      const b = orgCash.branches.find((row) => row.branch_id === selectedBranchId);
      if (b) {
        drawerCashTotal = Number(b.expected_closing_cash ?? 0);
        singleBranchStatus = b.session_status;
        singleBranchOpeningCash = Number(b.opening_cash ?? 0);
        if (b.session_status === 'OPEN') openSessions = 1;
        else if (b.session_status === 'CLOSED') closedSessions = 1;
        else noSessionCount = 1;
      }
    } else {
      drawerCashTotal = Number(orgCash.org_totals.total_expected_cash ?? 0);
      openSessions = Number(orgCash.org_totals.open_session_count ?? 0);
      closedSessions = Number(orgCash.org_totals.closed_session_count ?? 0);
      noSessionCount = Number(orgCash.org_totals.no_session_count ?? 0);
    }
  } else if (branchCash) {
    drawerCashTotal = Number(branchCash.expected_closing_cash ?? 0);
    singleBranchStatus = branchCash.session_status;
    singleBranchOpeningCash = Number(branchCash.opening_cash ?? 0);
    if (branchCash.session_status === 'OPEN') openSessions = 1;
    else if (branchCash.session_status === 'CLOSED') closedSessions = 1;
    else noSessionCount = 1;
  }

  const activeAccounts = accounts.filter((a) => a.is_active);
  const bankAndDigitalTotal = activeAccounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance ?? 0),
    0
  );

  return {
    drawerCashTotal: Math.round(drawerCashTotal),
    openSessions,
    closedSessions,
    noSessionCount,
    singleBranchStatus,
    singleBranchOpeningCash: Math.round(singleBranchOpeningCash),
    bankAndDigitalTotal: Math.round(bankAndDigitalTotal),
    activeAccountCount: activeAccounts.length,
    accounts: activeAccounts,
    totalLiquidFunds: Math.round(drawerCashTotal + bankAndDigitalTotal),
  };
}

export function buildInventoryIntelligence(
  products: Product[],
  lowStockRows: LowStockItemDto[],
  mobileOrgSummary: MobileOrganizationSummary | null,
  branchMobileSummary: BranchInvestmentSummary | null,
  selectedBranchId: string | null
): InventoryIntelligence {
  let catalogUnits = 0;
  let catalogCostValuation = 0;
  let catalogRetailValuation = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  const catMap = new Map<string, { costValuation: number; units: number; skuCount: number }>();
  const productAlerts: LowStockWatchItem[] = [];

  for (const p of products) {
    if (!p.is_active) continue;
    const qty = Math.max(0, Number(p.quantity ?? 0));
    const unitCost = Number(p.average_cost > 0 ? p.average_cost : p.purchase_price ?? 0);
    const salePrice = Number(p.sale_price ?? 0);
    const threshold = Number(p.low_stock_threshold ?? 5);

    catalogUnits += qty;
    catalogCostValuation += qty * unitCost;
    catalogRetailValuation += qty * salePrice;

    const catName = p.category_name?.trim() || 'Uncategorized';
    const prev = catMap.get(catName) ?? { costValuation: 0, units: 0, skuCount: 0 };
    prev.costValuation += qty * unitCost;
    prev.units += qty;
    prev.skuCount += 1;
    catMap.set(catName, prev);

    if (qty <= 0) {
      outOfStockCount += 1;
      productAlerts.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        branchName: selectedBranchId ? 'Selected Branch' : 'Consolidated',
        currentQuantity: qty,
        threshold,
        status: 'OUT_OF_STOCK',
      });
    } else if (qty <= threshold) {
      lowStockCount += 1;
      productAlerts.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        branchName: selectedBranchId ? 'Selected Branch' : 'Consolidated',
        currentQuantity: qty,
        threshold,
        status: 'LOW_STOCK',
      });
    }
  }

  let lowStockWatchlist: LowStockWatchItem[];
  if (lowStockRows.length > 0 && selectedBranchId) {
    lowStockWatchlist = lowStockRows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      branchName: row.branch_name,
      currentQuantity: Number(row.current_quantity ?? 0),
      threshold: Number(row.low_stock_threshold ?? 5),
      status: Number(row.current_quantity ?? 0) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
    }));
    outOfStockCount = lowStockWatchlist.filter((i) => i.status === 'OUT_OF_STOCK').length;
    lowStockCount = lowStockWatchlist.filter((i) => i.status === 'LOW_STOCK').length;
  } else {
    lowStockWatchlist = productAlerts;
  }

  lowStockWatchlist.sort((a, b) => a.currentQuantity - b.currentQuantity || a.productName.localeCompare(b.productName));

  // Mobile asset summary
  let mobileInStockCount = 0;
  let mobileNewCount = 0;
  let mobileUsedCount = 0;
  let mobileInspectionCount = 0;
  let mobileValuation = 0;

  if (selectedBranchId && mobileOrgSummary) {
    const branchRow = mobileOrgSummary.branches.find((b) => b.branch_id === selectedBranchId);
    if (branchRow) {
      mobileInStockCount = branchRow.in_stock_count;
      mobileNewCount = branchRow.new_count;
      mobileUsedCount = branchRow.used_count;
      mobileInspectionCount = branchRow.inspection_count;
      mobileValuation = branchRow.total_valuation;
    } else if (branchMobileSummary) {
      mobileInStockCount = branchMobileSummary.total_in_stock;
      mobileNewCount = branchMobileSummary.new_in_stock;
      mobileUsedCount = branchMobileSummary.used_in_stock;
      mobileValuation = branchMobileSummary.total_investment;
    }
  } else if (mobileOrgSummary && !selectedBranchId) {
    mobileInStockCount = mobileOrgSummary.in_stock_count;
    mobileNewCount = mobileOrgSummary.new_count;
    mobileUsedCount = mobileOrgSummary.used_count;
    mobileInspectionCount = mobileOrgSummary.inspection_count;
    mobileValuation = mobileOrgSummary.total_valuation;
  } else if (branchMobileSummary) {
    mobileInStockCount = branchMobileSummary.total_in_stock;
    mobileNewCount = branchMobileSummary.new_in_stock;
    mobileUsedCount = branchMobileSummary.used_in_stock;
    mobileValuation = branchMobileSummary.total_investment;
  }

  const byCategory = Array.from(catMap.entries())
    .map(([name, val]) => ({
      name,
      costValuation: Math.round(val.costValuation),
      units: val.units,
      skuCount: val.skuCount,
    }))
    .sort((a, b) => b.costValuation - a.costValuation)
    .slice(0, 8);

  return {
    totalSkus: products.filter((p) => p.is_active).length,
    catalogUnits,
    catalogCostValuation: Math.round(catalogCostValuation),
    catalogRetailValuation: Math.round(catalogRetailValuation),
    estimatedCatalogMargin: Math.round(catalogRetailValuation - catalogCostValuation),
    outOfStockCount,
    lowStockCount,
    mobileInStockCount,
    mobileNewCount,
    mobileUsedCount,
    mobileInspectionCount,
    mobileValuation: Math.round(mobileValuation),
    combinedCostValuation: Math.round(catalogCostValuation + mobileValuation),
    byCategory,
    lowStockWatchlist: lowStockWatchlist.slice(0, 12),
  };
}

export function buildRepairsOperationalSummary(
  repairs: RepairJob[],
  totalCount: number,
  range: DashboardDateRange,
  todayPkt: string
): RepairsOperationalSummary {
  const TERMINAL = new Set(['Delivered', 'Cancelled', 'Rejected']);
  let pendingCount = 0;
  let readyForPickupCount = 0;
  let overdueCount = 0;
  let deliveredInPeriodCount = 0;
  let periodCollections = 0;

  for (const job of repairs) {
    if (!TERMINAL.has(job.status)) {
      pendingCount += 1;
      if (job.status === 'Ready for Pickup') {
        readyForPickupCount += 1;
      }
      const exp = toPktDateKey(job.expectedDeliveryDate);
      if (exp && exp < todayPkt) {
        overdueCount += 1;
      }
    }
    if (job.status === 'Delivered') {
      const delDate = toPktDateKey(job.deliveredAt || job.updatedAt);
      if (delDate && delDate >= range.startDate && delDate <= range.endDate) {
        deliveredInPeriodCount += 1;
      }
    }
    if (Array.isArray(job.payments)) {
      for (const p of job.payments) {
        const payDate = toPktDateKey(p.timestamp);
        if (payDate && payDate >= range.startDate && payDate <= range.endDate) {
          periodCollections += Number(p.amount ?? 0);
        }
      }
    }
  }

  return {
    totalTracked: totalCount,
    pendingCount,
    readyForPickupCount,
    overdueCount,
    deliveredInPeriodCount,
    periodCollections: Math.round(periodCollections),
    isTruncated: repairs.length < totalCount,
  };
}

export function buildHrAttendanceOverview(register: DailyRegisterResponse | null): HrAttendanceOverview | null {
  if (!register?.summary) return null;
  const s = register.summary;
  const chartData = [
    { name: 'Present', value: s.present, color: '#16a34a' },
    { name: 'Late', value: s.late, color: '#d97706' },
    { name: 'Absent', value: s.absent, color: '#dc2626' },
    { name: 'Leave / Half Day', value: s.on_leave + s.half_day, color: '#2563eb' },
    { name: 'Not Marked', value: s.not_marked, color: '#94a3b8' },
  ].filter((d) => d.value > 0);

  return {
    totalEmployees: s.total_employees,
    present: s.present,
    late: s.late,
    absent: s.absent,
    onLeave: s.on_leave,
    halfDay: s.half_day,
    holidayOrOff: s.holiday_or_off,
    notMarked: s.not_marked,
    checkedInOpen: s.checked_in_open,
    chartData,
  };
}

export function buildMobileSalesOperationalSummary(
  sales: Array<{
    totalAmount: number;
    paidAmount: number;
    created_at: string;
    devices?: Array<unknown>;
  }>,
  totalAcrossBackend: number,
  range: DashboardDateRange
): MobileSalesOperationalSummary {
  let invoiceCount = 0;
  let devicesSold = 0;
  let totalRevenue = 0;
  let paidAmount = 0;

  for (const s of sales) {
    const d = toPktDateKey(s.created_at);
    if (!d || d < range.startDate || d > range.endDate) continue;
    invoiceCount += 1;
    devicesSold += Array.isArray(s.devices) ? s.devices.length : 1;
    totalRevenue += Number(s.totalAmount ?? 0);
    paidAmount += Number(s.paidAmount ?? 0);
  }

  return {
    invoiceCount,
    devicesSold,
    totalRevenue: Math.round(totalRevenue),
    paidAmount: Math.round(paidAmount),
    isTruncated: sales.length < totalAcrossBackend,
  };
}

export function buildBusinessAlerts(params: {
  mode: 'organization' | 'branch';
  inventory: InventoryIntelligence | null;
  grossSales: number;
  returnsAmount: number;
  repairs: RepairsOperationalSummary | null;
  liquid: LiquidPositionAnalytics | null;
  purchases: PurchaseAnalytics | null;
  attendance: HrAttendanceOverview | null;
  branches: Branch[];
}): BusinessAlertItem[] {
  const alerts: BusinessAlertItem[] = [];
  const base = params.mode === 'organization' ? '/dashboard/organization' : '/dashboard/shop-admin';
  const lowStockHref =
    params.mode === 'organization' ? '/dashboard/organization/products' : '/dashboard/shop-admin/inventory/low-stock';

  if (params.inventory && params.inventory.outOfStockCount > 0) {
    alerts.push({
      id: 'out-of-stock',
      severity: 'danger',
      title: 'Out-of-Stock Products Detected',
      description: `${params.inventory.outOfStockCount} active SKU(s) currently have zero stock on hand.`,
      metric: `${params.inventory.outOfStockCount} SKUs`,
      href: lowStockHref,
    });
  }

  if (params.inventory && params.inventory.lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'warning',
      title: 'Low-Stock Reorder Attention',
      description: `${params.inventory.lowStockCount} SKU(s) are at or below minimum threshold.`,
      metric: `${params.inventory.lowStockCount} SKUs`,
      href: lowStockHref,
    });
  }

  if (params.grossSales > 0 && params.returnsAmount > 0) {
    const ratio = (params.returnsAmount / params.grossSales) * 100;
    if (ratio >= 10) {
      alerts.push({
        id: 'high-returns',
        severity: 'warning',
        title: 'Elevated Sales Return Ratio',
        description: `Completed returns represent ${ratio.toFixed(1)}% of gross sales for the selected period.`,
        metric: formatPkr(params.returnsAmount),
        href: params.mode === 'organization' ? '/dashboard/organization/history' : '/dashboard/shop-admin/history',
      });
    }
  }

  if (params.repairs && params.repairs.overdueCount > 0) {
    alerts.push({
      id: 'overdue-repairs',
      severity: 'danger',
      title: 'Overdue Repair Jobs',
      description: `${params.repairs.overdueCount} active repair job(s) passed expected delivery date.`,
      metric: `${params.repairs.overdueCount} jobs`,
      href: `${base}/repairs`,
    });
  }

  if (params.liquid && params.liquid.noSessionCount > 0) {
    const label =
      params.mode === 'organization' && params.branches.length > 1
        ? `${params.liquid.noSessionCount} branch(es) have no open/closed cash register session today.`
        : 'Current branch does not have an active cash register session opened today.';
    alerts.push({
      id: 'no-cash-session',
      severity: 'info',
      title: 'Cash Register Session Pending',
      description: label,
      metric: `${params.liquid.noSessionCount} Pending`,
      href: `${base}/cash`,
    });
  }

  if (params.purchases && params.purchases.activeDemandCount > 0) {
    alerts.push({
      id: 'pending-demands',
      severity: 'info',
      title: 'Open Supplier Demand Orders',
      description: `${params.purchases.activeDemandCount} procurement demand order(s) awaiting receipt or ordering.`,
      metric: formatPkr(params.purchases.activeDemandValue),
      href: '/dashboard/shop-admin/inventory/demand',
    });
  }

  if (params.attendance && params.attendance.absent > 0) {
    alerts.push({
      id: 'staff-absences',
      severity: 'warning',
      title: 'Staff Absences Today',
      description: `${params.attendance.absent} employee(s) recorded as absent today in PKT register.`,
      metric: `${params.attendance.absent} absent`,
      href: params.mode === 'organization' ? '/dashboard/organization/hr' : '/dashboard/shop-admin/settings/workforce',
    });
  }

  return alerts;
}
