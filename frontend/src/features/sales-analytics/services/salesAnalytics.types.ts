/**
 * Live Sales Analytics Adapter & Contracts
 * Phase 2 — Real API Data Binding
 * Zero mock data, zero fabricated numbers.
 */

import type { SaFullReport, SaProductRow, SaRepairSummary, SaMobileSummary, SaAnomaly, SaException } from '../services/salesAnalytics.api';
import type { DashboardDateRange } from '@/features/organization/utils/dashboardDates';

export type TabId = 'overview' | 'products' | 'repairs' | 'mobiles' | 'inventory' | 'reconciliation';
export type TrendPeriod = 'daily' | 'weekly' | 'monthly';

export interface LiveKpiSet {
  totalRevenue: number;
  netSales: number;
  grossProfit: number;
  operatingProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  totalTransactions: number;
  averageTransactionValue: number;
  totalDiscounts: number;
  totalReturns: number;
  cogs: number;
  revenueChange: number | null;
  grossProfitChange: number | null;
  operatingProfitChange: number | null;
  transactionsChange: number | null;
}

export interface LiveProfitBreakdown {
  label: string;
  value: number;
  color: string;
}

export interface LiveTrendPoint {
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
}

export interface LiveExpenseCategory {
  label: string;
  amount: number;
  pct: number;
  color: string;
}

export interface LiveBranchPerformance {
  branchId: string;
  branchName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  operatingProfit: number;
  marginPct: number;
  transactions: number;
  changeRevPct: number | null;
}

export interface LiveTransaction {
  id: string;
  date: string;
  time: string;
  type: string;
  reference: string;
  branchId: string;
  branchName: string;
  party: string;
  revenue: number;
  cost: number;
  profit: number;
  status: string;
}

export interface LiveInsight {
  id: string;
  type: 'positive' | 'warning' | 'info';
  title: string;
  body: string;
}

export interface LiveProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitCost: number;
  sellingPrice: number;
  qtySold: number;
  grossRevenue: number;
  discount: number;
  netRevenue: number;
  totalCogs: number;
  grossProfit: number;
  marginPct: number;
  returnCount: number;
  returnValue: number;
}

export interface LiveProductTransaction {
  id: string;
  productId: string;
  date: string;
  invoiceNo: string;
  branchId: string;
  branchName: string;
  qty: number;
  sellingPrice: number;
  discount: number;
  costSnapshot: number;
  netRevenue: number;
  profit: number;
  status: string;
}

export interface LiveRepairJob {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  customer: string;
  deviceModel: string;
  deviceType: string;
  technicianId: string;
  technicianName: string;
  status: string;
  partsRevenue: number;
  labourRevenue: number;
  partsCost: number;
  labourCost: number;
  otherCost: number;
  totalBilled: number;
  grossProfit: number;
  marginPct: number;
  parts: {
    id: string;
    name: string;
    stage: string;
    qty: number;
    unitCost: number;
    unitSalePrice: number;
    totalCost: number;
    totalSalePrice: number;
  }[];
  notes: string;
}

export interface LiveRepairSummary {
  totalJobs: number;
  completedJobs: number;
  activeJobs: number;
  cancelledJobs: number;
  totalBilled: number;
  totalRevenue: number;
  partsRevenue: number;
  labourRevenue: number;
  partsCost: number;
  totalProfit: number;
  grossProfit: number;
  avgProfit: number;
  marginPct: number;
  partsUsageCount: number;
  avgJobValue: number;
  outstandingBalance: number;
  totalCollected: number;
}

export interface LiveMobileDevice {
  id: string;
  model: string;
  brand: string;
  imei: string;
  color: string;
  storage: string;
  status: string;
  branchId: string;
  branchName: string;
  purchaseDate: string;
  purchaseCost: number;
  supplierRef: string;
  saleDate: string | null;
  salePrice: number | null;
  invoiceNo: string | null;
  customer: string | null;
  grossProfit: number | null;
  marginPct: number | null;
}

export interface LiveMobileSummary {
  totalDevicesPurchased: number;
  totalPurchased: number;
  totalSold: number;
  devicesSold: number;
  devicesInStock: number;
  devicesWrittenOff: number;
  stockValue: number;
  totalSoldCost: number;
  totalSaleRevenue: number;
  saleRevenue: number;
  cogs: number;
  totalGrossProfit: number;
  grossProfit: number;
  grossMarginPct: number;
  marginPct: number;
  avgTurnoverDays: number;
  totalDevices: number;
}

export interface LiveLossEvent {
  id: string;
  date: string;
  product: string;
  category: string;
  branchId: string;
  branchName: string;
  qtyAffected: number;
  unitCost: number;
  estimatedValue: number;
  reason: string;
  status: string;
  supplierClaimId: string | null;
}

export interface LiveSupplierClaim {
  id: string;
  claimRef: string;
  branchId: string;
  branchName: string;
  supplier: string;
  product: string;
  claimType: 'warranty' | 'rtv' | 'damage';
  claimedAmount: number;
  acceptedAmount: number;
  recoveredAmount: number;
  pendingAmount: number;
  status: string;
  date: string;
  notes: string;
  history: { date: string; event: string; amount?: number }[];
}

export interface LiveLossSummary {
  damageEvents: number;
  totalLossEvents: number;
  totalQtyAffected: number;
  totalEstimatedLoss: number;
  confirmedWriteOff: number;
  totalClaims: number;
  totalClaimsSubmitted: number;
  openClaims: number;
  totalClaimValue: number;
  recoveredValue: number;
  totalRecovered: number;
  pendingRecovery: number;
  recoveryRatePct: number;
  unrecoverableLoss: number;
}

export interface LiveFinancialSummary {
  cashOnHand: number;
  bankBalance: number;
  customerReceivables: number;
  supplierPayables: number;
  customerAdvances: number;
  netPosition: number;
  pendingClaims: number;
}

export interface LiveLedgerEntry {
  id: string;
  date: string;
  parentAccount: string;
  childLedger: string;
  source: string;
  invoiceRef: string;
  debit: number;
  credit: number;
  runningBalance: number;
  branchId: string;
  branchName: string;
}

export interface LiveReconciliationRow {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  txRef: string;
  sourceModule: string;
  invoiceRef: string;
  revenue: number;
  paymentReceived: number;
  outstanding: number;
  debit: number;
  credit: number;
  status: string;
  notes: string;
}

export interface AnalyticsViewData {
  branchId: string;
  dateRange: {
    startDate: string;
    endDate: string;
    label: string;
  };
  kpis: LiveKpiSet;
  profitBreakdown: LiveProfitBreakdown[];
  trendDaily: LiveTrendPoint[];
  trendWeekly: LiveTrendPoint[];
  trendMonthly: LiveTrendPoint[];
  expenses: LiveExpenseCategory[];
  branchPerf: LiveBranchPerformance[];
  transactions: LiveTransaction[];
  insights: LiveInsight[];
  products: LiveProduct[];
  productTransactions: LiveProductTransaction[];
  repairJobs: LiveRepairJob[];
  repairSummary: LiveRepairSummary;
  mobileDevices: LiveMobileDevice[];
  mobileSummary: LiveMobileSummary;
  lossEvents: LiveLossEvent[];
  supplierClaims: LiveSupplierClaim[];
  lossSummary: LiveLossSummary;
  financialSummary: LiveFinancialSummary;
  ledgerEntries: LiveLedgerEntry[];
  reconRows: LiveReconciliationRow[];
}
