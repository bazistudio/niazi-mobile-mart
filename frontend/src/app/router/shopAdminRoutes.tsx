import React from 'react';
import { Route, Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PermissionGuard } from '@/app/guards/PermissionGuard';
import { PERMISSIONS } from '@/constants/permissions';
import { ShopAdminDashboard } from '@/features/dashboard/components/shop-admin/ShopAdminDashboard';
import { POSPage } from '@/pages/dashboard/shop-admin/POSPage';
import { ProductsPage } from '@/pages/dashboard/shop-admin/ProductsPage';
import { InventoryWorkspaceLayout } from '@/features/inventory/components/InventoryWorkspaceLayout';
import { InventoryProductsPage } from '@/pages/dashboard/shop-admin/inventory/InventoryProductsPage';
import { InventoryStockPage } from '@/pages/dashboard/shop-admin/inventory/InventoryStockPage';
import { InventoryImportPage } from '@/pages/dashboard/shop-admin/inventory/InventoryImportPage';
import { MobileInventoryPage } from '@/pages/dashboard/shop-admin/MobileInventoryPage';
import { AddMobilePage } from '@/pages/dashboard/shop-admin/AddMobilePage';
import { MobileSalePage } from '@/pages/dashboard/shop-admin/MobileSalePage';
import { MobileSaleHistoryPage } from '@/pages/dashboard/shop-admin/MobileSaleHistoryPage';
import { StockPage } from '@/pages/dashboard/shop-admin/StockPage';
import { ImportPage } from '@/pages/dashboard/shop-admin/ImportPage';
import { SalesPage } from '@/pages/dashboard/shop-admin/SalesPage';
import { HistoryPage } from '@/pages/dashboard/shop-admin/HistoryPage';
import { CustomersPage } from '@/pages/dashboard/shop-admin/CustomersPage';
import { CustomerDetailPage } from '@/pages/dashboard/shop-admin/CustomerDetailPage';
import { SuppliersPage } from '@/pages/dashboard/shop-admin/SuppliersPage';
import { SupplierDetailPage } from '@/pages/dashboard/shop-admin/SupplierDetailPage';
import { RepairsPage } from '@/pages/dashboard/shop-admin/RepairsPage';
import { RepairDetailPage } from '@/pages/dashboard/shop-admin/RepairDetailPage';
import { ExpensesPage } from '@/pages/dashboard/shop-admin/ExpensesPage';
import { CashManagementPage } from '@/pages/dashboard/shop-admin/CashManagementPage';
import { BusinessLedgerPage } from '@/pages/dashboard/shop-admin/BusinessLedgerPage';
import { MarketingPage } from '@/pages/dashboard/shop-admin/MarketingPage';
import { ProfilePage } from '@/pages/dashboard/shop-admin/ProfilePage';
import { AuditPage } from '@/pages/dashboard/shop-admin/AuditPage';
import { SettingsLayout } from '@/pages/dashboard/shop-admin/settings/SettingsLayout';
import { GeneralSettingsPage } from '@/pages/dashboard/shop-admin/settings/GeneralSettingsPage';
import { ShopAppearanceNoticePage } from '@/pages/dashboard/shop-admin/settings/ShopAppearanceNoticePage';
import { ShopBackupNoticePage } from '@/pages/dashboard/shop-admin/settings/ShopBackupNoticePage';
import { PrinterPage } from '@/pages/dashboard/shop-admin/settings/PrinterPage';
import { RolesSettingsPage } from '@/pages/dashboard/shop-admin/settings/RolesSettingsPage';
import { WorkforcePage } from '@/pages/dashboard/shop-admin/settings/WorkforcePage';

// Dedicated route-level guard allowing entry to inventory layout when user has either PRODUCTS_VIEW or INVENTORY_VIEW
const InventoryWorkspaceRouteGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { hasPermission } = usePermissions();
  const permitted = hasPermission(PERMISSIONS.PRODUCTS_VIEW) || hasPermission(PERMISSIONS.INVENTORY_VIEW);
  if (!permitted) {
    return <Navigate to="/dashboard/shop-admin" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
};

export const shopAdminCoreRoutes = (
  <>
    {/* Base Dashboard Overview — Accessible to all authenticated shop staff */}
    <Route index element={<ShopAdminDashboard />} />

    {/* POS Terminal */}
    <Route
      path="pos"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.POS_USE} fallbackPath="/dashboard/shop-admin">
          <POSPage />
        </PermissionGuard>
      }
    />

    {/* Integrated Inventory Workspace (Tabbed) */}
    <Route
      path="inventory"
      element={
        <InventoryWorkspaceRouteGuard>
          <InventoryWorkspaceLayout />
        </InventoryWorkspaceRouteGuard>
      }
    >
      <Route index element={<InventoryProductsPage />} />
      <Route
        path="stock"
        element={
          <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin/inventory">
            <InventoryStockPage />
          </PermissionGuard>
        }
      />
      <Route path="import" element={<InventoryImportPage />} />
    </Route>

    {/* Dedicated Mobile Inventory & Serialized Asset Management */}
    <Route
      path="mobiles"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <MobileInventoryPage />
        </PermissionGuard>
      }
    />
    <Route
      path="mobiles/add"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <AddMobilePage />
        </PermissionGuard>
      }
    />

    {/* Mobile Sale Workspace — Frontend Preview (no real sale submission) */}
    <Route
      path="mobiles/sale"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <MobileSalePage />
        </PermissionGuard>
      }
    />

    {/* Mobile Sale History — Frontend Preview (typed sample adapter) */}
    <Route
      path="mobiles/sale-history"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <MobileSaleHistoryPage />
        </PermissionGuard>
      }
    />

    {/* Standalone Inventory Legacy Route Wrappers */}
    <Route
      path="products"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <ProductsPage />
        </PermissionGuard>
      }
    />
    <Route
      path="stock"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <StockPage />
        </PermissionGuard>
      }
    />
    <Route
      path="import"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <ImportPage />
        </PermissionGuard>
      }
    />

    {/* Sales & Orders */}
    <Route
      path="sales"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SALES_VIEW} fallbackPath="/dashboard/shop-admin">
          <SalesPage />
        </PermissionGuard>
      }
    />
    <Route
      path="history"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SALES_VIEW} fallbackPath="/dashboard/shop-admin">
          <HistoryPage />
        </PermissionGuard>
      }
    />

    {/* Customer Relationship Management */}
    <Route
      path="customers"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.PARTIES_VIEW} fallbackPath="/dashboard/shop-admin">
          <CustomersPage />
        </PermissionGuard>
      }
    />
    <Route
      path="customers/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.PARTIES_VIEW} fallbackPath="/dashboard/shop-admin">
          <CustomerDetailPage />
        </PermissionGuard>
      }
    />

    {/* Supplier Relationship Management */}
    <Route
      path="suppliers"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.PURCHASES_VIEW} fallbackPath="/dashboard/shop-admin">
          <SuppliersPage />
        </PermissionGuard>
      }
    />
    <Route
      path="suppliers/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.PURCHASES_VIEW} fallbackPath="/dashboard/shop-admin">
          <SupplierDetailPage />
        </PermissionGuard>
      }
    />


    {/* Repair Service Ticketing */}
    <Route
      path="repairs"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.REPAIRS_VIEW} fallbackPath="/dashboard/shop-admin">
          <RepairsPage />
        </PermissionGuard>
      }
    />
    <Route
      path="repairs/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.REPAIRS_VIEW} fallbackPath="/dashboard/shop-admin">
          <RepairDetailPage />
        </PermissionGuard>
      }
    />

    {/* Operational Expenses */}
    <Route
      path="expenses"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.EXPENSES_VIEW} fallbackPath="/dashboard/shop-admin">
          <ExpensesPage />
        </PermissionGuard>
      }
    />

    {/* Till / Drawer Cash Register */}
    <Route
      path="cash"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.FINANCE_VIEW} fallbackPath="/dashboard/shop-admin">
          <CashManagementPage />
        </PermissionGuard>
      }
    />

    {/* Shop Accounting & Ledger Book */}
    <Route
      path="ledger"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.REPORTS_VIEW} fallbackPath="/dashboard/shop-admin">
          <BusinessLedgerPage />
        </PermissionGuard>
      }
    />

    {/* Marketing & SMS Notifications */}
    <Route
      path="marketing"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SETTINGS_VIEW} fallbackPath="/dashboard/shop-admin">
          <MarketingPage />
        </PermissionGuard>
      }
    />

    {/* User Staff Profile */}
    <Route path="profile" element={<ProfilePage />} />

    {/* Shop Operational Audit Log */}
    <Route
      path="audit-logs"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.REPORTS_VIEW} fallbackPath="/dashboard/shop-admin">
          <AuditPage />
        </PermissionGuard>
      }
    />

    {/* Settings Hierarchy */}
    <Route
      path="settings"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SETTINGS_VIEW} fallbackPath="/dashboard/shop-admin">
          <SettingsLayout />
        </PermissionGuard>
      }
    >
      <Route index element={<GeneralSettingsPage />} />
      <Route path="appearance" element={<ShopAppearanceNoticePage />} />
      <Route path="backup" element={<ShopBackupNoticePage />} />
      <Route path="printer" element={<PrinterPage />} />
      <Route path="roles" element={<RolesSettingsPage />} />
      <Route path="workforce" element={<WorkforcePage />} />
    </Route>
  </>
);

export default shopAdminCoreRoutes;
