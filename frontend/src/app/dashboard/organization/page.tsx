'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { getOrganizationDashboard, DashboardData } from '@/lib/api/organization.api';
import { CreateShopWizard } from '@/features/organization/components/onboarding/CreateShopWizard';
import { SubscriptionCard } from '@/features/organization/components/dashboard/SubscriptionCard';
import { ShopUsageCard } from '@/features/organization/components/dashboard/ShopUsageCard';
import { SalesSummaryCard } from '@/features/organization/components/dashboard/SalesSummaryCard';
import { InventoryAlertCard, RecentActivity } from '@/features/organization/components/dashboard/OverviewCards';
import { Loader2 } from 'lucide-react';

export default function OrganizationDashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      // Ensure user has organizationId which is the organization ID for Organization Owners
      if (!user?.organizationId) throw new Error('Organization ID not found in session');
      
      const dashboardData = await getOrganizationDashboard(user.organizationId);
      setData(dashboardData);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  if (!data) return null;

  // Onboarding Flow Check
  if (data.shops.current === 0) {
    return (
      <div className="p-4 lg:p-8 bg-gray-50 min-h-full">
        <CreateShopWizard 
          organizationId={user!.organizationId!} 
          onSuccess={() => {
            // After creating the shop, the user's view should be redirected to Shop Selector 
            // Since we haven't built Shop Selector yet, we can reload dashboard to show KPI 
            // Or send them to the shop app. I will just reload the dashboard.
            fetchDashboard();
          }} 
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 bg-gray-50/50 dark:bg-gray-950/50 min-h-full">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Welcome, {data.organization.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Organization Owner Dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all">
            Manage Organization
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SubscriptionCard />
        <ShopUsageCard shops={data.shops} employees={data.employees} />
        <SalesSummaryCard sales={data.sales} />
        <InventoryAlertCard inventory={data.inventory} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          {/* We can place some charts here later */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100 h-96 flex items-center justify-center">
            <p className="text-gray-400">Revenue Chart (Coming Soon)</p>
          </div>
        </div>
        <div className="lg:col-span-1">
          <RecentActivity activity={data.recentActivity} />
        </div>
      </div>
    </div>
  );
}
