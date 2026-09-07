import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  BarChart3, 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  Users, 
  Store, 
  UserCheck, 
  Truck, 
  Receipt,
  FileBarChart2
} from 'lucide-react';

export function OrganizationReportsPage() {
  const reportCategories = [
    {
      title: 'Sales Reports',
      description: 'Consolidated sales volumes, invoice aggregates, and revenue trends across all branches.',
      icon: BarChart3,
    },
    {
      title: 'Purchase Reports',
      description: 'Centralized purchase orders, vendor invoices, and procurement summaries.',
      icon: ShoppingCart,
    },
    {
      title: 'Inventory Reports',
      description: 'Total stock valuations, slow-moving items, and stock distribution per branch.',
      icon: Package,
    },
    {
      title: 'Profitability Reports',
      description: 'Gross margin, operating net profit, and cost-of-goods breakdown across branches.',
      icon: TrendingUp,
    },
    {
      title: 'Employee Reports',
      description: 'Staff productivity, cashier shift closings, and performance metrics.',
      icon: Users,
    },
    {
      title: 'Branch Reports',
      description: 'Branch-by-branch operational comparison and branch revenue contributions.',
      icon: Store,
    },
    {
      title: 'Customer Reports',
      description: 'Customer purchase histories, top revenue accounts, and credit aging.',
      icon: UserCheck,
    },
    {
      title: 'Supplier Reports',
      description: 'Supplier fulfillment rates, return histories, and payment disbursements.',
      icon: Truck,
    },
    {
      title: 'Financial Reports',
      description: 'Consolidated balance sheets, profit & loss statements, and tax breakdowns.',
      icon: Receipt,
    },
  ];

  return (
    <OrganizationPageShell
      title="Organization Reports"
      description="Central organization-wide reporting center and consolidated financial statements across all branches."
      badge="Reporting Hub"
    >
      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {reportCategories.map((report) => {
          const Icon = report.icon;
          return (
            <div
              key={report.title}
              className="bg-white dark:bg-gray-800/90 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {report.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {report.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className="text-primary font-medium">Pending Data Sync</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State Banner */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-8 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-3">
          <FileBarChart2 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Consolidated Organization Reports
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto mt-1 leading-relaxed">
          Consolidated organization-wide report generation will be available once the central reporting pipeline and branch synchronization are linked.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationReportsPage;
