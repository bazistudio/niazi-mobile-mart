import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Briefcase, 
  Store, 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  Receipt, 
  DollarSign, 
  LineChart 
} from 'lucide-react';

export function OrganizationBusinessPage() {
  const businessSections = [
    { title: 'Business Overview', icon: Briefcase, desc: 'Central organization business summary and enterprise key performance indicators.' },
    { title: 'Branch Performance', icon: Store, desc: 'Comparative branch benchmarking and store efficiency rankings.' },
    { title: 'Sales Performance', icon: TrendingUp, desc: 'Gross volume, transaction sizes, and peak checkout volume patterns.' },
    { title: 'Purchase Performance', icon: ShoppingCart, desc: 'Procurement turnover rates, bulk order savings, and supplier cycle times.' },
    { title: 'Inventory Position', icon: Package, desc: 'Enterprise inventory turnover, asset valuation, and dead-stock status.' },
    { title: 'Expenses', icon: Receipt, desc: 'Centralized operational expenses, branch utilities, and cost allocations.' },
    { title: 'Profitability', icon: DollarSign, desc: 'Net margin, gross profit margin, and contribution by business unit.' },
    { title: 'Business Trends', icon: LineChart, desc: 'Quarterly projections, category velocity, and market trajectory.' },
  ];

  return (
    <OrganizationPageShell
      title="Business Overview & Operations"
      description="Organization-level business position, consolidated performance, and operational health across all branches."
      badge="Enterprise Health"
    >
      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {businessSections.map((sec) => {
          const Icon = sec.icon;
          return (
            <div
              key={sec.title}
              className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {sec.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {sec.desc}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700/60">
                <span className="text-xs text-gray-400">Data status: </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unconnected</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Empty State Banner */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-10 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-3">
          <Briefcase className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Enterprise Business Operations
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mt-1 leading-relaxed">
          Consolidated business performance indicators will appear here once operational data is synchronized across all active branches.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationBusinessPage;
