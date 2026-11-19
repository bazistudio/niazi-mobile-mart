import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useCommandCenterData } from '@/features/organization/hooks/useCommandCenterData';
import {
  getPktTodayDateStr,
  resolveDateRange,
  type DashboardDatePreset,
} from '@/features/organization/utils/dashboardDates';
import { DashboardHeader } from '@/features/organization/components/dashboard/DashboardHeader';
import { ExecutiveOverview } from '@/features/organization/components/dashboard/ExecutiveOverview';
import { BusinessAlertsSection } from '@/features/organization/components/dashboard/BusinessAlertsSection';
import { SalesPerformanceSection } from '@/features/organization/components/dashboard/SalesPerformanceSection';
import { PaymentAnalysisSection } from '@/features/organization/components/dashboard/PaymentAnalysisSection';
import { FinancialPositionSection } from '@/features/organization/components/dashboard/FinancialPositionSection';
import { PurchasesExpensesSection } from '@/features/organization/components/dashboard/PurchasesExpensesSection';
import { InventoryIntelligenceSection } from '@/features/organization/components/dashboard/InventoryIntelligenceSection';
import { BranchComparisonSection } from '@/features/organization/components/dashboard/BranchComparisonSection';
import { OperationalOverviewSection } from '@/features/organization/components/dashboard/OperationalOverviewSection';
import { BusinessModulesGrid } from '@/features/organization/components/dashboard/BusinessModulesGrid';

export function OrganizationDashboardPage() {
  const navigate = useNavigate();
  const activeOrganization = useOrganizationStore((s) => s.activeOrganization);
  const viewMode = useOrganizationStore((s) => s.viewMode);
  const setActiveContext = useOrganizationStore((s) => s.setActiveContext);
  const setActiveShop = useOrganizationStore((s) => s.setActiveShop);

  // Default to Consolidated (All Branches) on fresh org landing even if store defaults viewMode='shop'
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Reset inline selector to consolidated whenever topbar ShopSwitcher enters 'organization' mode
  useEffect(() => {
    if (viewMode === 'organization') {
      setSelectedBranchId(null);
    }
  }, [viewMode]);

  const initialToday = useMemo(() => getPktTodayDateStr(), []);
  const [preset, setPreset] = useState<DashboardDatePreset>('today');
  const [customStart, setCustomStart] = useState<string>(initialToday);
  const [customEnd, setCustomEnd] = useState<string>(initialToday);

  const dateRange = useMemo(
    () => resolveDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const cc = useCommandCenterData({
    mode: 'organization',
    branchId: selectedBranchId,
    dateRange,
  });

  const selectedBranch = useMemo(
    () => cc.retailBranches.find((b) => b.id === selectedBranchId) ?? null,
    [cc.retailBranches, selectedBranchId]
  );

  const scopeName = selectedBranch
    ? `${selectedBranch.name} (${selectedBranch.code})`
    : `All Branches (${cc.retailBranches.length || 1} Active)`;

  // Navigate to module details cleanly; sync selected branch if drilling into a branch route
  const handleNavigate = useCallback(
    (href: string) => {
      if (href.startsWith('/dashboard/shop-admin') && selectedBranch) {
        setActiveContext(selectedBranch.organization_id, selectedBranch.id);
        setActiveShop({
          _id: selectedBranch.id,
          name: selectedBranch.name,
          branch_name: selectedBranch.name,
          code: selectedBranch.code,
          organizationId: selectedBranch.organization_id,
          status: selectedBranch.is_active ? 'active' : 'inactive',
        });
      }
      navigate(href);
    },
    [navigate, selectedBranch, setActiveContext, setActiveShop]
  );

  // Resolve drawer cash today metrics for Payment section supplement
  const drawerSupplement = useMemo(() => {
    if (!cc.orgCash) return { sales: 0, collections: 0, show: false };
    if (selectedBranchId) {
      const row = cc.orgCash.branches.find((b) => b.branch_id === selectedBranchId);
      return {
        sales: Number(row?.cash_sales ?? 0),
        collections: Number(row?.customer_payments ?? 0),
        show: Boolean(row),
      };
    }
    return {
      sales: Number(cc.orgCash.org_totals.total_cash_sales ?? 0),
      collections: Number(cc.orgCash.org_totals.total_customer_payments ?? 0),
      show: true,
    };
  }, [cc.orgCash, selectedBranchId]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 text-text-primary min-h-full">
      {/* Section A: Enterprise Command Bar Header */}
      <DashboardHeader
        mode="organization"
        organizationName={activeOrganization?.name || 'Niazi Mobile Mart'}
        scopeName={scopeName}
        dateRange={dateRange}
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPresetChange={setPreset}
        onCustomDatesChange={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setPreset('custom');
        }}
        branches={cc.retailBranches}
        selectedBranchId={selectedBranchId}
        onBranchSelect={setSelectedBranchId}
        onRefresh={cc.refreshAll}
        isRefreshing={cc.isRefreshing}
        canAccessPos={cc.perms.canViewPos}
        canAccessExpenses={cc.perms.canViewExpenses}
        onNavigate={handleNavigate}
        extraAction={
          cc.perms.canViewSettings ? (
            <button
              type="button"
              onClick={() => handleNavigate('/dashboard/organization/settings?tab=profile')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Org Settings</span>
            </button>
          ) : undefined
        }
      />

      {/* Section B: Executive Business Overview KPI Grid */}
      <ExecutiveOverview
        mode="organization"
        dateRange={dateRange}
        perms={cc.perms}
        headline={cc.headline}
        expenseCount={cc.expenseAnalytics.totalCount}
        partyPosition={cc.partyPosition}
        inventoryIntel={cc.inventoryIntel}
        liquidPosition={cc.liquidPosition}
        repairsSummary={cc.repairsSummary}
        loading={{
          executive: cc.loading.executive,
          parties: cc.loading.parties,
          inventory: cc.loading.inventory,
          liquid: cc.loading.liquid,
          repairs: cc.loading.repairs,
        }}
        onNavigate={handleNavigate}
      />

      {/* Section K: Action Center & Deterministic Operational Alerts */}
      <BusinessAlertsSection alerts={cc.alerts} onNavigate={handleNavigate} />

      {/* Sections C & D: Sales Performance Trend + Payment Settlement */}
      {cc.perms.canViewSales && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-8 min-w-0">
            <SalesPerformanceSection
              mode="organization"
              dateRange={dateRange}
              series={cc.salesTrend.series}
              grossSales={cc.headline.grossSales}
              returnsAmount={cc.headline.returnsAmount}
              netSales={cc.headline.netSales}
              invoiceCount={cc.headline.invoiceCount}
              averageInvoiceValue={cc.paymentSettlement.averageInvoiceValue}
              isTruncated={cc.headline.isSalesListTruncated}
              isLoading={cc.loading.sales}
              isError={cc.errors.sales}
              onRetry={cc.refetchSales}
              onViewDetails={() => handleNavigate('/dashboard/organization/history')}
            />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <PaymentAnalysisSection
              settlement={cc.paymentSettlement}
              todayCashSales={drawerSupplement.sales}
              todayCustomerCollections={drawerSupplement.collections}
              showCashTodaySupplement={drawerSupplement.show}
              isLoading={cc.loading.sales}
              onViewCash={() => handleNavigate('/dashboard/organization/cash')}
            />
          </div>
        </div>
      )}

      {/* Section G: Financial Position (Customers, Suppliers, Cash & Bank Accounts) */}
      <FinancialPositionSection
        mode="organization"
        canViewParties={cc.perms.canViewParties}
        canViewPurchases={cc.perms.canViewPurchases}
        canViewCash={cc.perms.canViewCash}
        canViewAccounts={cc.perms.canViewAccounts}
        partyPosition={cc.partyPosition}
        liquidPosition={cc.liquidPosition}
        partiesLoading={cc.loading.parties}
        liquidLoading={cc.loading.liquid}
        onNavigate={handleNavigate}
      />

      {/* Sections E & F: Procurement & Operating Expenses */}
      <PurchasesExpensesSection
        mode="organization"
        dateRange={dateRange}
        canViewPurchases={cc.perms.canViewPurchases}
        canViewExpenses={cc.perms.canViewExpenses}
        purchaseAnalytics={cc.purchaseAnalytics}
        expenseAnalytics={cc.expenseAnalytics}
        purchasesLoading={cc.loading.purchases}
        expensesLoading={cc.loading.expenses}
        purchasesError={cc.errors.purchases}
        expensesError={cc.errors.expenses}
        onNavigate={handleNavigate}
      />

      {/* Section H: Inventory & Mobile Asset Intelligence */}
      {cc.perms.canViewInventory && (
        <InventoryIntelligenceSection
          mode="organization"
          inventory={cc.inventoryIntel}
          isLoading={cc.loading.inventory}
          isError={cc.errors.inventory}
          onNavigate={handleNavigate}
        />
      )}

      {/* Section I: Multi-Branch Comparison (Consolidated Organization Mode Only) */}
      {!selectedBranchId && cc.perms.isOrgAdmin && (
        <BranchComparisonSection
          dateRange={dateRange}
          branchMetrics={cc.branchComparison}
          expenseSummary={cc.expenseSummaryRaw}
          orgCash={cc.orgCash}
          mobileOrgSummary={cc.mobileOrgSummary}
          isLoading={cc.loading.branchComparison}
          isError={cc.errors.branchComparison}
          onSelectBranch={(bId) => setSelectedBranchId(bId)}
        />
      )}

      {/* Section J: Operational Overview (Repairs, HR Attendance, Mobile Sales, Recent Activity) */}
      <OperationalOverviewSection
        mode="organization"
        dateRange={dateRange}
        canViewRepairs={cc.perms.canViewRepairs}
        canViewHr={cc.perms.canViewHr}
        canViewSales={cc.perms.canViewSales}
        canViewInventory={cc.perms.canViewInventory}
        repairs={cc.repairsSummary}
        hrAttendance={cc.hrAttendance}
        mobileSales={cc.mobileSalesSummary}
        recentHistory={cc.recentHistory}
        loadingRepairs={cc.loading.repairs}
        loadingHr={cc.loading.hr}
        loadingMobileSales={cc.loading.mobileSales}
        loadingHistory={cc.loading.history}
        onNavigate={handleNavigate}
      />

      {/* Section L: Complete Application Capabilities & Module Shortcuts */}
      <BusinessModulesGrid
        mode="organization"
        perms={cc.perms}
        counts={{
          skus: cc.inventoryIntel.totalSkus,
          mobiles: cc.inventoryIntel.mobileInStockCount,
          demands: cc.purchaseAnalytics.activeDemandCount,
          repairsPending: cc.repairsSummary.pendingCount,
          staff: cc.hrAttendance?.totalEmployees ?? 0,
        }}
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default OrganizationDashboardPage;
