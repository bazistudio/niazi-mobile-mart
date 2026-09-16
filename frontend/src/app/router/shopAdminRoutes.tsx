import React from 'react';
import { Route } from 'react-router-dom';
import { PermissionGuard } from '@/app/guards/PermissionGuard';
import { PERMISSIONS } from '@/constants/permissions';
import { ShopAdminDashboard } from '@/features/dashboard/components/shop-admin/ShopAdminDashboard';
import { POSPage } from '@/pages/dashboard/shop-admin/POSPage';
import { ProductsPage } from '@/pages/dashboard/shop-admin/ProductsPage';
import { InventoryWorkspaceLayout } from '@/components/inventory/InventoryWorkspaceLayout';
import { InventoryProductsPage } from '@/pages/dashboard/shop-admin/inventory/InventoryProductsPage';
import { InventoryStockPage } from '@/pages/dashboard/shop-admin/inventory/InventoryStockPage';
import { InventoryImportPage } from '@/pages/dashboard/shop-admin/inventory/InventoryImportPage';
import { StockPage } from '@/pages/dashboard/shop-admin/StockPage';
import { ImportPage } from '@/pages/dashboard/shop-admin/ImportPage';
import { SalesPage } from '@/pages/dashboard/shop-admin/SalesPage';
import { HistoryPage } from '@/pages/dashboard/shop-admin/HistoryPage';
import { CustomersPage } from '@/pages/dashboard/shop-admin/CustomersPage';
import { CustomerDetailPage } from '@/pages/dashboard/shop-admin/CustomerDetailPage';
import { SuppliersPage } from '@/pages/dashboard/shop-admin/SuppliersPage';
import { SupplierDetailPage } from '@/pages/dashboard/shop-admin/SupplierDetailPage';
import { PartiesPage } from '@/pages/dashboard/shop-admin/PartiesPage';
import { PartyDetailPage } from '@/pages/dashboard/shop-admin/PartyDetailPage';
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

export const shopAdminCoreRoutes = (
  <>
    {/* Base Dashboard Overview — Accessible to all authenticated shop staff */}
    <Route index element={<ShopAdminDashboard />} />

    {/* POS Terminal */}
    <Route
      path="pos"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.POS_ACCESS} fallbackPath="/dashboard/shop-admin">
          <POSPage />
        </PermissionGuard>
      }
    />

    {/* Integrated Inventory Workspace (Tabbed) */}
    <Route
      path="inventory"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.INVENTORY_VIEW} fallbackPath="/dashboard/shop-admin">
          <InventoryWorkspaceLayout />
        </PermissionGuard>
      }
    >
      <Route index element={<InventoryProductsPage />} />
      <Route path="stock" element={<InventoryStockPage />} />
      <Route path="import" element={<InventoryImportPage />} />
    </Route>

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
        <PermissionGuard requiredPermission={PERMISSIONS.CUSTOMERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <CustomersPage />
        </PermissionGuard>
      }
    />
    <Route
      path="customers/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.CUSTOMERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <CustomerDetailPage />
        </PermissionGuard>
      }
    />

    {/* Supplier Relationship Management */}
    <Route
      path="suppliers"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SUPPLIERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <SuppliersPage />
        </PermissionGuard>
      }
    />
    <Route
      path="suppliers/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.SUPPLIERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <SupplierDetailPage />
        </PermissionGuard>
      }
    />

    {/* Unified Party Management (Customers + Suppliers) */}
    <Route
      path="parties"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.CUSTOMERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <PartiesPage />
        </PermissionGuard>
      }
    />
    <Route
      path="parties/:id"
      element={
        <PermissionGuard requiredPermission={PERMISSIONS.CUSTOMERS_VIEW} fallbackPath="/dashboard/shop-admin">
          <PartyDetailPage />
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
        <PermissionGuard requiredPermission={PERMISSIONS.CASH_VIEW} fallbackPath="/dashboard/shop-admin">
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
        <PermissionGuard requiredPermission={PERMISSIONS.AUDIT_VIEW} fallbackPath="/dashboard/shop-admin">
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
