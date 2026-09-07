import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  LineChart, 
  Store, 
  Package, 
  Users, 
  Truck, 
  TrendingUp, 
  Flame 
} from 'lucide-react';

export function OrganizationAnalyticsPage() {
  const analyticsModules = [
    { title: 'Sales Analytics', icon: LineChart, desc: 'Enterprise revenue velocity, hourly sales distribution, and basket size metrics.' },
    { title: 'Branch Analytics', icon: Store, desc: 'Branch-level sales comparative index and geographic demand patterns.' },
    { title: 'Product Analytics', icon: Package, desc: 'High-performing SKU velocity, return ratios, and category sales splits.' },
    { title: 'Customer Analytics', icon: Users, desc: 'Customer retention rates, average order frequencies, and lifetime value curves.' },
    { title: 'Supplier Analytics', icon: Truck, desc: 'Supplier order fulfillment accuracy and price volatility tracking.' },
    { title: 'Profit Analytics', icon: TrendingUp, desc: 'Margin sensitivity, operational cost impacts, and net profitability.' },
    { title: 'Growth Trends', icon: Flame, desc: 'Quarter-over-quarter expansion trajectories and multi-branch forecasts.' },
  ];

  return (
    <OrganizationPageShell
      title="Organization Analytics"
      description="Cross-branch intelligence, growth trajectories, and organization-level trends."
      badge="Predictive Intelligence"
    >
      {/* Analytics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {analyticsModules.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {item.desc}
                </p>
              </div>

              {/* Placeholder Empty Chart Area */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/60">
                <div className="h-28 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-center p-3">
                  <LineChart className="w-5 h-5 text-gray-400 mb-1" />
                  <span className="text-xs text-gray-400">Chart data awaiting sync</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Empty State Banner */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-10 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-3">
          <LineChart className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          No analytics data available yet
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mt-1 leading-relaxed">
          Organization-wide analytics and predictive trends will appear here once analytics aggregation services are connected.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationAnalyticsPage;
