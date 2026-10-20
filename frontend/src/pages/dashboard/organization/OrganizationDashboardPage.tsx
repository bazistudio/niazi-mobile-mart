import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { tauriClient, OrganizationDashboardStats, DashboardBalancesDto } from '@/lib/tauri/tauriClient';
import { dashboardApi } from '@/services/dashboard.api';
import { historyApi } from '@/features/history/services/history.api';
import { SubscriptionCard } from '@/features/organization/components/dashboard/SubscriptionCard';
import { ShopUsageCard } from '@/features/organization/components/dashboard/ShopUsageCard';
import { SalesSummaryCard } from '@/features/organization/components/dashboard/SalesSummaryCard';
import { InventoryAlertCard, RecentActivity } from '@/features/organization/components/dashboard/OverviewCards';
import { ReceivablesCard, PayablesCard, CashDrawerCard } from '@/features/organization/components/dashboard/FinancialCards';
import { MobileInventoryCard } from '@/features/organization/components/dashboard/MobileInventoryCard';
import { mobileApi, type MobileOrganizationSummary } from '@/features/mobiles/services/mobile.api';
import { httpClient } from '@/lib/http/httpClient';
import { Loader2, Store } from 'lucide-react';

interface DailyCashSummary {
  expected_closing_cash: number;
  opening_cash: number;
  session_status: string;
}

export function OrganizationDashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShop?._id ?? null);

  const [stats, setStats] = useState<OrganizationDashboardStats | null>(null);
  const [balances, setBalances] = useState<DashboardBalancesDto | null>(null);
  const [profitSummary, setProfitSummary] = useState<any>(null);
  const [mobileSummary, setMobileSummary] = useState<MobileOrganizationSummary | null>(null);
  const [cashSummary, setCashSummary] = useState<DailyCashSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      // Branch-scoped queries when a specific branch is selected; org-wide when null
      const [dashboardStats, dashboardBalances, profitData, historyResult, mobileData] = await Promise.all([
        tauriClient.organizationGetDashboardStats().catch(() => null),
        tauriClient.organizationGetDashboardBalances().catch(() => null),
        tauriClient.profitGetDashboardSummary(activeShopId).catch(() => null),
        historyApi.getHistory({ branch_id: activeShopId, page: 1, limit: 5 }).catch(() => ({ data: [], total: 0 })),
        mobileApi.getOrganizationSummary().then((r) => r.summary).catch(() => null),
      ]);

      setStats(dashboardStats);
      setBalances(dashboardBalances);
      setProfitSummary(profitData);
      setMobileSummary(mobileData);

      // Transform history items into RecentActivity format
      const recent = (historyResult?.data || []).map((h) => ({
        action: `${h.type.toUpperCase()}: ${h.referenceId}`,
        details: `${h.party.name ? h.party.name + ' — ' : ''}Rs ${h.amount.toLocaleString('en-PK')} (${h.status})`,
        date: h.createdAt,
      }));
      setRecentActivity(recent);

      // Fetch Cash Summary if a branch is selected
      if (activeShopId) {
        try {
          const cash = await httpClient.get<DailyCashSummary>(`/api/cash/summary?branch_id=${encodeURIComponent(activeShopId)}`);
          setCashSummary(cash);
        } catch {
          setCashSummary(null);
        }
      } else {
        // When viewing all branches, calculate cash from active sessions if available or null
        setCashSummary(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [activeShopId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#006970]" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  const scopeLabel = activeShop ? `Scope: ${activeShop.name}` : 'Consolidated (All Branches)';

  const data = {
    organization: {
      name: 'Niazi Mobile Mart',
      code: 'MAIN',
      owner: user?.name || 'Administrator',
    },
    shops: {
      current: stats?.active_branch_count || 1,
      limit: 'Unlimited' as const,
    },
    employees: {
      total: stats?.active_staff_count || 1,
    },
    sales: {
      today: profitSummary?.today?.net_revenue || 0,
      month: profitSummary?.this_month?.net_revenue || 0,
      total: profitSummary?.total?.net_revenue || 0,
    },
    inventory: {
      lowStockProducts: stats?.low_stock_count || 0,
    },
    balances: {
      customer_receivables: balances?.customer_receivables || 0,
      supplier_payables: balances?.supplier_payables || 0,
    },
    cash: {
      expected: cashSummary?.expected_closing_cash || 0,
      opening: cashSummary?.opening_cash || 0,
      status: cashSummary?.session_status || 'NONE',
    },
    recentActivity,
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 bg-gray-50/50 dark:bg-gray-950/50 min-h-full">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Welcome, {data.organization.name}
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB]">
              <Store className="w-3 h-3" />
              {scopeLabel}
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Organization Owner Dashboard — Multi-Branch Control Center
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/dashboard/organization/settings?tab=profile')}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all cursor-pointer"
          >
            Manage Organization
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SubscriptionCard />
        <ShopUsageCard shops={data.shops} employees={data.employees} />
        <SalesSummaryCard sales={data.sales} />
        <MobileInventoryCard summary={mobileSummary} loading={loading} />
        <InventoryAlertCard inventory={data.inventory} />
        <ReceivablesCard amount={data.balances.customer_receivables} scopeLabel="Global Organization Receivables" />
        <PayablesCard amount={data.balances.supplier_payables} scopeLabel="Global Organization Payables" />
        {cashSummary && (
          <CashDrawerCard 
            expectedCash={data.cash.expected} 
            openingCash={data.cash.opening} 
            sessionStatus={data.cash.status} 
            scopeLabel={`Cash Drawer (${activeShop?.name})`}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-800 h-96 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Branch Operations</h3>
              <span className="text-xs font-medium text-gray-400">Current Scope: {activeShop ? activeShop.name : 'All Shops'}</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                Branch-Specific Sales: Rs {data.sales.today.toLocaleString('en-PK')} Today
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Use the topbar switcher to navigate between physical branches. Live revenue, inventory alerts, and transaction records react dynamically.
              </p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <RecentActivity activity={data.recentActivity} />
        </div>
      </div>
    </div>
  );
}

export default OrganizationDashboardPage;
