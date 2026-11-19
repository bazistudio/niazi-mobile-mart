'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { DailySalesModal } from './DailySalesModal';
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
import { OperationalOverviewSection } from '@/features/organization/components/dashboard/OperationalOverviewSection';
import { BusinessModulesGrid } from '@/features/organization/components/dashboard/BusinessModulesGrid';

export const ShopAdminDashboard = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchInvoice = searchParams.get('invoice');

  const [isDailySalesModalOpen, setIsDailySalesModalOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const activeOrganization = useOrganizationStore((s) => s.activeOrganization);
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore(
    (s) => s.activeShopId || s.activeShop?._id || (user as any)?.branch_id || (user as any)?.shopId || null
  );

  useEffect(() => {
    if (searchInvoice) {
      setIsDailySalesModalOpen(true);
    }
  }, [searchInvoice]);

  const handleCloseModal = useCallback(() => {
    setIsDailySalesModalOpen(false);
    if (searchInvoice) {
      navigate(location.pathname, { replace: true });
    }
  }, [searchInvoice, navigate, location.pathname]);

  const initialToday = useMemo(() => getPktTodayDateStr(), []);
  const [preset, setPreset] = useState<DashboardDatePreset>('today');
  const [customStart, setCustomStart] = useState<string>(initialToday);
  const [customEnd, setCustomEnd] = useState<string>(initialToday);

  const dateRange = useMemo(
    () => resolveDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const cc = useCommandCenterData({
    mode: 'branch',
    branchId: activeShopId,
    dateRange,
  });

  const scopeName = activeShop?.name
    ? `${activeShop.name}${activeShop.code ? ` (${activeShop.code})` : ''}`
    : 'Assigned Branch';

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 text-text-primary min-h-full">
      {/* Header Locked to Branch Scope */}
      <DashboardHeader
        mode="branch"
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
        branches={[]}
        selectedBranchId={activeShopId}
        onRefresh={cc.refreshAll}
        isRefreshing={cc.isRefreshing}
        canAccessPos={cc.perms.canViewPos}
        canAccessExpenses={cc.perms.canViewExpenses}
        onNavigate={(href) => navigate(href)}
        extraAction={
          cc.perms.canViewSales ? (
            <button
              type="button"
              onClick={() => setIsDailySalesModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5 text-primary" />
              <span>Daily Invoices</span>
            </button>
          ) : undefined
        }
      />

      {/* Executive Overview (Branch-Scoped & Permission-Filtered) */}
      <ExecutiveOverview
        mode="branch"
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
        onNavigate={(href) => navigate(href)}
      />

      {/* Operational Alerts */}
      <BusinessAlertsSection alerts={cc.alerts} onNavigate={(href) => navigate(href)} />

      {/* Sales Performance & Payment Settlement */}
      {cc.perms.canViewSales && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-8 min-w-0">
            <SalesPerformanceSection
              mode="branch"
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
              onViewDetails={() => setIsDailySalesModalOpen(true)}
            />
          </div>
          <div className="lg:col-span-4 min-w-0">
            <PaymentAnalysisSection
              settlement={cc.paymentSettlement}
              todayCashSales={Number(cc.branchCash?.cash_sales ?? 0)}
              todayCustomerCollections={Number(cc.branchCash?.customer_payments ?? 0)}
              showCashTodaySupplement={Boolean(cc.branchCash)}
              isLoading={cc.loading.sales}
              onViewCash={() => navigate('/dashboard/shop-admin/cash')}
            />
          </div>
        </div>
      )}

      {/* Financial Position (Branch Cash + Customer/Supplier Exposure where permitted; no Org Bank Accounts) */}
      <FinancialPositionSection
        mode="branch"
        canViewParties={cc.perms.canViewParties}
        canViewPurchases={cc.perms.canViewPurchases}
        canViewCash={cc.perms.canViewCash}
        canViewAccounts={false}
        partyPosition={cc.partyPosition}
        liquidPosition={cc.liquidPosition}
        partiesLoading={cc.loading.parties}
        liquidLoading={cc.loading.liquid}
        onNavigate={(href) => navigate(href)}
      />

      {/* Procurement & Expenses */}
      <PurchasesExpensesSection
        mode="branch"
        dateRange={dateRange}
        canViewPurchases={cc.perms.canViewPurchases}
        canViewExpenses={cc.perms.canViewExpenses}
        purchaseAnalytics={cc.purchaseAnalytics}
        expenseAnalytics={cc.expenseAnalytics}
        purchasesLoading={cc.loading.purchases}
        expensesLoading={cc.loading.expenses}
        purchasesError={cc.errors.purchases}
        expensesError={cc.errors.expenses}
        onNavigate={(href) => navigate(href)}
      />

      {/* Branch Inventory Intelligence */}
      {cc.perms.canViewInventory && (
        <InventoryIntelligenceSection
          mode="branch"
          inventory={cc.inventoryIntel}
          isLoading={cc.loading.inventory}
          isError={cc.errors.inventory}
          onNavigate={(href) => navigate(href)}
        />
      )}

      {/* Branch Operational Summary */}
      <OperationalOverviewSection
        mode="branch"
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
        onNavigate={(href) => navigate(href)}
      />

      {/* Branch Module Directory */}
      <BusinessModulesGrid
        mode="branch"
        perms={cc.perms}
        counts={{
          skus: cc.inventoryIntel.totalSkus,
          mobiles: cc.inventoryIntel.mobileInStockCount,
          demands: cc.purchaseAnalytics.activeDemandCount,
          repairsPending: cc.repairsSummary.pendingCount,
          staff: cc.hrAttendance?.totalEmployees ?? 0,
        }}
        onNavigate={(href) => navigate(href)}
      />

      {/* Preserved Daily Sales & Receipt Reprint Modal */}
      <DailySalesModal
        isOpen={isDailySalesModalOpen}
        onClose={handleCloseModal}
        branchId={activeShopId}
      />
    </div>
  );
};

export default ShopAdminDashboard;
