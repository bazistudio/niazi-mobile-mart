import React from 'react';
import {
  TrendingUp,
  RotateCcw,
  DollarSign,
  BarChart3,
  ReceiptText,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Wallet,
  Landmark,
  Wrench,
} from 'lucide-react';
import { ExecutiveKpiCard } from './ExecutiveKpiCard';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { formatPkr, type DashboardDateRange } from '../../utils/dashboardDates';
import type {
  InventoryIntelligence,
  LiquidPositionAnalytics,
  PartyFinancialPosition,
  RepairsOperationalSummary,
} from '../../utils/dashboardCalculations';

interface ExecutiveOverviewProps {
  mode: 'organization' | 'branch';
  dateRange: DashboardDateRange;
  perms: {
    canViewProfit: boolean;
    canViewSales: boolean;
    canViewExpenses: boolean;
    canViewParties: boolean;
    canViewPurchases: boolean;
    canViewInventory: boolean;
    canViewCash: boolean;
    canViewAccounts: boolean;
    canViewRepairs: boolean;
  };
  headline: {
    grossSales: number;
    returnsAmount: number;
    netSales: number;
    discounts: number;
    invoiceCount: number;
    returnsCount: number;
    grossProfit: number | null;
    grossMargin: number | null;
    operatingExpenses: number;
    grossSalesDelta: number | null;
    returnsDelta: number | null;
    netSalesDelta: number | null;
    grossProfitDelta: number | null;
    expensesDelta: number | null;
    returnRatePct: number;
  };
  expenseCount: number;
  partyPosition: PartyFinancialPosition;
  inventoryIntel: InventoryIntelligence;
  liquidPosition: LiquidPositionAnalytics;
  repairsSummary: RepairsOperationalSummary;
  loading: {
    executive: boolean;
    parties: boolean;
    inventory: boolean;
    liquid: boolean;
    repairs: boolean;
  };
  onNavigate: (href: string) => void;
}

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({
  mode,
  dateRange,
  perms,
  headline,
  expenseCount,
  partyPosition,
  inventoryIntel,
  liquidPosition,
  repairsSummary,
  loading,
  onNavigate,
}) => {
  const base = mode === 'organization' ? '/dashboard/organization' : '/dashboard/shop-admin';
  const salesDest = mode === 'organization' ? '/dashboard/organization/history' : '/dashboard/shop-admin/sales';
  const cashDest = `${base}/cash`;
  const inventoryDest = mode === 'organization' ? '/dashboard/organization/products' : '/dashboard/shop-admin/inventory';

  return (
    <section aria-labelledby="exec-overview-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="exec-overview-heading"
        title="Executive Business Overview"
        subtitle="Real-time financial, sales, credit exposure, inventory asset, and liquidity summary"
        badge={dateRange.label}
      />

      {/* Row 1: Revenue, Returns, Profitability & Expenses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {perms.canViewSales && (
          <ExecutiveKpiCard
            title="Invoiced Sales"
            value={formatPkr(headline.grossSales)}
            subtitle={
              headline.discounts > 0
                ? `${headline.invoiceCount} invoices • Disc ${formatPkr(headline.discounts)}`
                : `${headline.invoiceCount} completed invoice(s)`
            }
            icon={<DollarSign className="w-4 h-4" />}
            accentColor="teal"
            deltaPct={headline.grossSalesDelta}
            deltaLabel={dateRange.comparisonLabel}
            isLoading={loading.executive}
            onClick={() => onNavigate(salesDest)}
          />
        )}

        {perms.canViewSales && (
          <ExecutiveKpiCard
            title="Sales Returns"
            value={formatPkr(headline.returnsAmount)}
            subtitle={`${headline.returnsCount} return(s) • ${headline.returnRatePct}% of sales`}
            icon={<RotateCcw className="w-4 h-4" />}
            accentColor="amber"
            deltaPct={headline.returnsDelta}
            invertDeltaColors
            deltaLabel={dateRange.comparisonLabel}
            isLoading={loading.executive}
            onClick={() =>
              onNavigate(
                mode === 'organization'
                  ? '/dashboard/organization/history'
                  : '/dashboard/shop-admin/history'
              )
            }
          />
        )}

        {perms.canViewSales && (
          <ExecutiveKpiCard
            title="Net Sales Revenue"
            value={formatPkr(headline.netSales)}
            subtitle="After completed returns (excl. voided)"
            icon={<TrendingUp className="w-4 h-4" />}
            accentColor="emerald"
            deltaPct={headline.netSalesDelta}
            deltaLabel={dateRange.comparisonLabel}
            isLoading={loading.executive}
            onClick={() => onNavigate(salesDest)}
          />
        )}

        {perms.canViewProfit && headline.grossProfit !== null && (
          <ExecutiveKpiCard
            title="Gross Profit"
            value={formatPkr(headline.grossProfit)}
            subtitle={`Margin: ${(headline.grossMargin ?? 0).toFixed(1)}% (Net Sales − COGS)`}
            icon={<BarChart3 className="w-4 h-4" />}
            accentColor="blue"
            deltaPct={headline.grossProfitDelta}
            deltaLabel={dateRange.comparisonLabel}
            isLoading={loading.executive}
            onClick={() => onNavigate(salesDest)}
          />
        )}

        {perms.canViewExpenses && (
          <ExecutiveKpiCard
            title="Operating Expenses"
            value={formatPkr(headline.operatingExpenses)}
            subtitle={`${expenseCount} completed expense entry(s)`}
            icon={<ReceiptText className="w-4 h-4" />}
            accentColor="rose"
            deltaPct={headline.expensesDelta}
            invertDeltaColors
            deltaLabel={dateRange.comparisonLabel}
            isLoading={loading.executive}
            onClick={() => onNavigate('/dashboard/shop-admin/expenses')}
          />
        )}
      </div>

      {/* Row 2: Balance Sheet Exposure, Inventory Valuation & Liquidity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {perms.canViewParties && (
          <ExecutiveKpiCard
            title="Customer Receivables"
            value={formatPkr(partyPosition.customerReceivables)}
            subtitle={
              partyPosition.customerAdvances > 0
                ? `${partyPosition.customerDebtorCount} debtor(s) • Adv ${formatPkr(partyPosition.customerAdvances)}`
                : `${partyPosition.customerDebtorCount} account(s) owing (DR)`
            }
            icon={<ArrowDownToLine className="w-4 h-4" />}
            accentColor="blue"
            isLoading={loading.parties}
            onClick={() => onNavigate(`${base}/customers`)}
          />
        )}

        {perms.canViewPurchases && (
          <ExecutiveKpiCard
            title="Supplier Payables"
            value={formatPkr(partyPosition.supplierPayables)}
            subtitle={
              partyPosition.supplierAdvances > 0
                ? `${partyPosition.supplierCreditorCount} vendor(s) • Adv ${formatPkr(partyPosition.supplierAdvances)}`
                : `${partyPosition.supplierCreditorCount} supplier(s) owed`
            }
            icon={<ArrowUpFromLine className="w-4 h-4" />}
            accentColor="rose"
            isLoading={loading.parties}
            onClick={() =>
              onNavigate(
                mode === 'organization'
                  ? '/dashboard/organization/ledger'
                  : '/dashboard/shop-admin/suppliers'
              )
            }
          />
        )}

        {perms.canViewInventory && (
          <ExecutiveKpiCard
            title="Inventory Valuation (WAC)"
            value={formatPkr(inventoryIntel.combinedCostValuation)}
            subtitle={`Catalog ${formatPkr(inventoryIntel.catalogCostValuation)} + Mobiles ${formatPkr(inventoryIntel.mobileValuation)}`}
            icon={<Boxes className="w-4 h-4" />}
            accentColor="teal"
            isLoading={loading.inventory}
            onClick={() => onNavigate(inventoryDest)}
          />
        )}

        {perms.canViewCash && (
          <ExecutiveKpiCard
            title="Cash in Drawers"
            value={formatPkr(liquidPosition.drawerCashTotal)}
            subtitle={
              liquidPosition.singleBranchStatus
                ? `Register status: ${liquidPosition.singleBranchStatus}`
                : `${liquidPosition.openSessions} open / ${liquidPosition.closedSessions} closed session(s)`
            }
            icon={<Wallet className="w-4 h-4" />}
            accentColor="emerald"
            isLoading={loading.liquid}
            onClick={() => onNavigate(cashDest)}
          />
        )}

        {perms.canViewAccounts ? (
          <ExecutiveKpiCard
            title="Business Bank & Digital"
            value={formatPkr(liquidPosition.bankAndDigitalTotal)}
            subtitle={`${liquidPosition.activeAccountCount} account(s) • Liquid ${formatPkr(liquidPosition.totalLiquidFunds)}`}
            icon={<Landmark className="w-4 h-4" />}
            accentColor="slate"
            isLoading={loading.liquid}
            onClick={() => onNavigate('/dashboard/organization/cash')}
          />
        ) : perms.canViewProfit && headline.grossProfit !== null && perms.canViewExpenses ? (
          <ExecutiveKpiCard
            title="Gross Profit − OPEX"
            value={formatPkr(headline.grossProfit - headline.operatingExpenses)}
            subtitle="Operating contribution (before salaries/other)"
            icon={<BarChart3 className="w-4 h-4" />}
            accentColor={headline.grossProfit - headline.operatingExpenses >= 0 ? 'emerald' : 'rose'}
            isLoading={loading.executive}
            onClick={() => onNavigate('/dashboard/shop-admin/ledger')}
          />
        ) : perms.canViewRepairs ? (
          <ExecutiveKpiCard
            title="Active Repairs"
            value={`${repairsSummary.pendingCount} Jobs`}
            subtitle={`${repairsSummary.readyForPickupCount} ready • ${repairsSummary.overdueCount} overdue`}
            icon={<Wrench className="w-4 h-4" />}
            accentColor="slate"
            isLoading={loading.repairs}
            onClick={() => onNavigate(`${base}/repairs`)}
          />
        ) : null}
      </div>
    </section>
  );
};
