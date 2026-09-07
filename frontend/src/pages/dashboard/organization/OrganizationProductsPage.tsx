import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Package, 
  Tags, 
  CheckCircle2, 
  Store, 
  Boxes, 
  TrendingUp,
  Search,
  Plus
} from 'lucide-react';

export function OrganizationProductsPage() {
  const [activeTab, setActiveTab] = useState('catalog');

  const productSections = [
    { id: 'catalog', label: 'Product Catalog', icon: Package, desc: 'Master product master list, global barcodes, and organization SKUs.' },
    { id: 'categories', label: 'Categories', icon: Tags, desc: 'Enterprise category hierarchies and department classifications.' },
    { id: 'availability', label: 'Product Availability', icon: CheckCircle2, desc: 'Cross-branch availability status and active product catalogs.' },
    { id: 'distribution', label: 'Branch Distribution', icon: Store, desc: 'Product allocation and stock counts across individual branches.' },
    { id: 'stock', label: 'Stock Overview', icon: Boxes, desc: 'Aggregated organization-wide stock valuations and low-threshold alerts.' },
    { id: 'performance', label: 'Product Performance', icon: TrendingUp, desc: 'Fastest-moving items and high-margin product insights across branches.' },
  ];

  const currentSection = productSections.find((s) => s.id === activeTab) || productSections[0];

  return (
    <OrganizationPageShell
      title="Organization Products"
      description="Master product catalog and organization-wide distribution overview (branch/shop stock remains branch-specific)."
      badge="Master Catalog"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-3.5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Master SKU</span>
        </button>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {productSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${currentSection.label.toLowerCase()}...`}
              disabled
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-md">Catalog Scope: Global</span>
        </div>
      </div>

      {/* Main Empty State View */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <Package className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {currentSection.label}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          {currentSection.desc}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 italic">
          Master organization catalog will appear here. Branch-level inventory allocation will be visible once synchronized.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationProductsPage;
