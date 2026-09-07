import {
  LayoutDashboard,
  MonitorPlay,
  Tags,
  Layers,
  Truck,
  Users,
  Wrench,
  History,
  Receipt,
  Settings,
  BarChart3,
  FileUp,
  Bug,
  BookOpen,
  ChefHat,
  Megaphone,
  Coins,
  Building2,
} from 'lucide-react';
import { NavigationGroup } from '../../types/navigation';
import { PERMISSIONS } from '../permissions';

export const shopAdminNavigation: NavigationGroup[] = [
  {
    items: [
      { name: 'Dashboard', href: '/dashboard/shop-admin', icon: LayoutDashboard },
      { name: 'Organization Control (17 Pages)', href: '/dashboard/organization', icon: Building2 },
    ],
  },
  {
    label: 'Sales',
    items: [
      { name: 'POS', href: '/dashboard/shop-admin/pos', icon: MonitorPlay, permission: PERMISSIONS.POS_USE },
      { name: 'Sales Analytics', href: '/dashboard/shop-admin/sales', icon: BarChart3, permission: PERMISSIONS.SALES_VIEW },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { name: 'Products & Stock', href: '/dashboard/shop-admin/inventory', icon: Tags, permission: PERMISSIONS.PRODUCTS_VIEW },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Cash Management', href: '/dashboard/shop-admin/cash', icon: Coins, permission: PERMISSIONS.FINANCE_VIEW },
      { name: 'Expenses', href: '/dashboard/shop-admin/expenses', icon: Receipt, permission: PERMISSIONS.EXPENSES_VIEW },
      { name: 'Kitchen Display (KDS)', href: '/dashboard/shop-admin/kds', icon: ChefHat, permission: PERMISSIONS.POS_USE },
      { name: 'Marketing & Broadcasts', href: '/dashboard/shop-admin/marketing', icon: Megaphone, permission: PERMISSIONS.REPORTS_VIEW },
      { name: 'Repairs', href: '/dashboard/shop-admin/repairs', icon: Wrench, permission: PERMISSIONS.REPAIRS_VIEW },
    ],
  },
  {
    label: 'Ledger',
    items: [
      { name: 'Customers', href: '/dashboard/shop-admin/customers', icon: Users, permission: PERMISSIONS.PARTIES_VIEW },
      { name: 'Suppliers', href: '/dashboard/shop-admin/suppliers', icon: Truck, permission: PERMISSIONS.PARTIES_VIEW },
      { name: 'Parties', href: '/dashboard/shop-admin/parties', icon: Users, permission: PERMISSIONS.PARTIES_VIEW },
      { name: 'Business Ledger', href: '/dashboard/shop-admin/business-ledger', icon: BookOpen, permission: PERMISSIONS.FINANCE_VIEW },
    ],
  },
  {
    label: 'Reports',
    items: [
      { name: 'History', href: '/dashboard/shop-admin/history', icon: History, permission: PERMISSIONS.REPORTS_VIEW },
    ],
  },
  {
    items: [
      { name: 'Settings', href: '/dashboard/shop-admin/settings', icon: Settings, permission: PERMISSIONS.SETTINGS_VIEW },
    ],
  },
  // Dev-only — not rendered in production
  ...(import.meta.env.DEV ? [{
    label: 'Developer',
    items: [
      { name: 'Audit Panel', href: '/dashboard/shop-admin/audit', icon: Bug },
    ],
  }] : []),
];
