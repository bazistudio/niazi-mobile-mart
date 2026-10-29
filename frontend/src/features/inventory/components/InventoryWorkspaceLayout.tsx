import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { InventoryFilterProvider, useInventoryFilters } from './InventoryFilterContext';
import { InventoryFilterBar } from './InventoryFilterBar';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMISSIONS } from '@/constants/permissions';
import { useProducts } from '@/features/inventory/hooks/useProducts';

function WorkspaceHeaderActions({
  isOrgAdmin,
  canViewInvestVolume,
  canViewStock,
  isProducts,
  isStock,
  isImport,
}: {
  isOrgAdmin: boolean;
  canViewInvestVolume: boolean;
  canViewStock: boolean;
  isProducts: boolean;
  isStock: boolean;
  isImport: boolean;
}) {
  const [formatInMillions, setFormatInMillions] = useState(false);
  const { setAddProductOpen } = useInventoryUIStore();
  const { filters } = useInventoryFilters();

  // Query products reflecting active filters (Category, Brand, Company, Color, Quality, Search)
  const { products: filteredProducts } = useProducts({
    page: 1,
    limit: 50,
    search: filters.search,
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    companyId: filters.companyId,
    colorId: filters.colorId,
    qualityId: filters.qualityId,
  });

  // Calculate live volume of the currently filtered products
  const filteredVolume = filteredProducts.reduce(
    (sum, p) => sum + ((p.stock || 0) * (p.purchasePrice || 0)),
    0
  );

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.categoryId ||
    filters.brandId ||
    filters.companyId ||
    filters.colorId ||
    filters.qualityId
  );

  const formatCurrency = (value: number) => {
    if (formatInMillions) {
      return `Rs. ${(value / 1000000).toFixed(3)}M`;
    }
    return `Rs. ${value.toLocaleString()}`;
  };

  return (
    <div className="px-4 flex items-end justify-between h-14 border-b border-gray-100 dark:border-gray-700/50">
      <nav className="flex space-x-1" aria-label="Tabs">
        <Link
          to="/dashboard/shop-admin/inventory"
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            isProducts
              ? 'border-[#006970] text-[#006970] dark:border-[#00B4BB] dark:text-[#00B4BB]'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Products
        </Link>

        {canViewStock && (
          <Link
            to="/dashboard/shop-admin/inventory/stock"
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              isStock
                ? 'border-[#006970] text-[#006970] dark:border-[#00B4BB] dark:text-[#00B4BB]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Stock
          </Link>
        )}

        {isOrgAdmin && (
          <Link
            to="/dashboard/shop-admin/inventory/import"
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              isImport
                ? 'border-[#006970] text-[#006970] dark:border-[#00B4BB] dark:text-[#00B4BB]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Import
          </Link>
        )}
      </nav>

      {/* Right Side Actions: Filtered Volume and Add Product */}
      <div className="flex items-center gap-3 pb-1.5">
        {isOrgAdmin && (
          <button
            onClick={() => setAddProductOpen(true)}
            className="px-3 py-1.5 bg-[#006970] hover:bg-[#005a60] text-white text-sm font-medium rounded shadow-sm transition-colors cursor-pointer"
          >
            + Add Product
          </button>
        )}

        {canViewInvestVolume && (
          <button
            onClick={() => setFormatInMillions(!formatInMillions)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            title="Click to toggle millions format"
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {hasActiveFilters ? 'Filtered Invest Volume:' : 'Total Invest Volume:'}
            </span>
            <span className="text-sm font-bold text-[#006970] dark:text-[#00B4BB]">
              {formatCurrency(filteredVolume)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function InventoryWorkspaceLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const { role, hasPermission } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const canViewStock = hasPermission(PERMISSIONS.INVENTORY_VIEW);
  const normalizedRole = (role || '').toUpperCase();
  const canViewInvestVolume = isOrgAdmin || (!['SALESMAN', 'CASHIER'].includes(normalizedRole) && (hasPermission(PERMISSIONS.INVENTORY_VIEW) || hasPermission(PERMISSIONS.PURCHASES_VIEW)));

  // Basic check for which tab is active based on the URL path
  const isProducts = pathname === '/dashboard/shop-admin/inventory';
  const isStock = pathname.includes('/dashboard/shop-admin/inventory/stock');
  const isImport = pathname.includes('/dashboard/shop-admin/inventory/import');

  return (
    <InventoryFilterProvider>
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* Compact Workspace Header (Max ~100px height) */}
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-20">
          <WorkspaceHeaderActions
            isOrgAdmin={isOrgAdmin}
            canViewInvestVolume={canViewInvestVolume}
            canViewStock={canViewStock}
            isProducts={isProducts}
            isStock={isStock}
            isImport={isImport}
          />

          {/* Bottom Row: Integrated Filter Bar */}
          <div className="px-4 h-12 flex items-center">
            <InventoryFilterBar />
          </div>
        </header>

        {/* Main Content Area (Maximized for Data) */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {children || <Outlet />}
        </main>
      </div>
    </InventoryFilterProvider>
  );
}
