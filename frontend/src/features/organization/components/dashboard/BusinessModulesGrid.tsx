import React from 'react';
import {
  ShoppingCart,
  BarChart3,
  History,
  Boxes,
  Smartphone,
  ShoppingBag,
  Truck,
  Users,
  ReceiptText,
  Coins,
  BookOpen,
  Wrench,
  UserCog,
  TrendingUp,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { DashboardSectionHeader } from './DashboardSectionHeader';

interface ModuleTile {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  visible: boolean;
}

interface BusinessModulesGridProps {
  mode: 'organization' | 'branch';
  perms: {
    canViewPos: boolean;
    canViewSales: boolean;
    canViewInventory: boolean;
    canViewPurchases: boolean;
    canViewParties: boolean;
    canViewExpenses: boolean;
    canViewCash: boolean;
    canViewReports: boolean;
    canViewRepairs: boolean;
    canViewHr: boolean;
    canViewUsers: boolean;
    canViewSettings: boolean;
  };
  counts: {
    skus: number;
    mobiles: number;
    demands: number;
    repairsPending: number;
    staff: number;
  };
  onNavigate: (href: string) => void;
}

export const BusinessModulesGrid: React.FC<BusinessModulesGridProps> = ({
  mode,
  perms,
  counts,
  onNavigate,
}) => {
  const isOrg = mode === 'organization';

  const tiles: ModuleTile[] = [
    {
      id: 'pos',
      title: 'POS Terminal',
      description: 'Process counter sales, barcode checkout, and split tenders.',
      href: '/dashboard/shop-admin/pos',
      icon: <ShoppingCart className="w-4 h-4" />,
      visible: perms.canViewPos,
    },
    {
      id: 'sales',
      title: 'Sales & History',
      description: 'Inspect invoices, reprints, sales returns, and exchanges.',
      href: isOrg ? '/dashboard/organization/history' : '/dashboard/shop-admin/sales',
      icon: <BarChart3 className="w-4 h-4" />,
      visible: perms.canViewSales,
    },
    {
      id: 'products',
      title: 'Products & Stock',
      description: 'Track catalog SKUs, WAC costs, stock levels, and transfers.',
      href: isOrg ? '/dashboard/organization/products' : '/dashboard/shop-admin/inventory',
      icon: <Boxes className="w-4 h-4" />,
      badge: `${counts.skus} SKUs`,
      visible: perms.canViewInventory,
    },
    {
      id: 'mobiles',
      title: 'Mobile Inventory',
      description: 'IMEI-tracked new and used handsets, paperwork, and resale.',
      href: isOrg ? '/dashboard/organization/mobile-inventory' : '/dashboard/shop-admin/mobiles',
      icon: <Smartphone className="w-4 h-4" />,
      badge: `${counts.mobiles} In Stock`,
      visible: perms.canViewInventory,
    },
    {
      id: 'purchases',
      title: 'Purchases & Demand',
      description: 'Supplier procurement invoices, WAC receiving, and demands.',
      href: '/dashboard/shop-admin/inventory/purchases',
      icon: <ShoppingBag className="w-4 h-4" />,
      badge: counts.demands > 0 ? `${counts.demands} Demands` : undefined,
      visible: perms.canViewPurchases,
    },
    {
      id: 'suppliers',
      title: 'Suppliers',
      description: 'Vendor directory, payable balances, and payment settlements.',
      href: '/dashboard/shop-admin/suppliers',
      icon: <Truck className="w-4 h-4" />,
      visible: perms.canViewPurchases,
    },
    {
      id: 'customers',
      title: 'Customers & Credit',
      description: 'Customer ledger balances, credit limits, and receipts.',
      href: isOrg ? '/dashboard/organization/customers' : '/dashboard/shop-admin/customers',
      icon: <Users className="w-4 h-4" />,
      visible: perms.canViewParties,
    },
    {
      id: 'expenses',
      title: 'Operating Expenses',
      description: 'Record shop expenses, categories, and reversals.',
      href: '/dashboard/shop-admin/expenses',
      icon: <ReceiptText className="w-4 h-4" />,
      visible: perms.canViewExpenses,
    },
    {
      id: 'cash',
      title: isOrg ? 'Cash & Bank Accounts' : 'Cash Register',
      description: isOrg
        ? 'Branch drawer sessions plus JazzCash, EasyPaisa, and bank balances.'
        : 'Open/close daily cash register sessions and track drawer cash.',
      href: isOrg ? '/dashboard/organization/cash' : '/dashboard/shop-admin/cash',
      icon: <Coins className="w-4 h-4" />,
      visible: perms.canViewCash,
    },
    {
      id: 'ledger',
      title: 'Business Ledger',
      description: 'Consolidated accounting statements and balance summaries.',
      href: isOrg ? '/dashboard/organization/ledger' : '/dashboard/shop-admin/ledger',
      icon: <BookOpen className="w-4 h-4" />,
      visible: perms.canViewReports || perms.canViewCash,
    },
    {
      id: 'returns',
      title: 'Returns & Logs',
      description: 'Review completed sales returns, purchase returns, and history.',
      href: isOrg ? '/dashboard/organization/history' : '/dashboard/shop-admin/history',
      icon: <History className="w-4 h-4" />,
      visible: perms.canViewSales,
    },
    {
      id: 'repairs',
      title: 'Repairs & Service',
      description: 'Manage repair tickets, spare parts, technician commissions.',
      href: isOrg ? '/dashboard/organization/repairs' : '/dashboard/shop-admin/repairs',
      icon: <Wrench className="w-4 h-4" />,
      badge: counts.repairsPending > 0 ? `${counts.repairsPending} Active` : undefined,
      visible: perms.canViewRepairs,
    },
    {
      id: 'hr',
      title: isOrg ? 'HR, Attendance & Payroll' : 'Workforce & Shifts',
      description: isOrg
        ? 'Daily register, salary configurations, advances, payroll, and policies.'
        : 'View branch staff directory and shift status.',
      href: isOrg ? '/dashboard/organization/hr' : '/dashboard/shop-admin/settings/workforce',
      icon: <UserCog className="w-4 h-4" />,
      badge: counts.staff > 0 ? `${counts.staff} Staff` : undefined,
      visible: perms.canViewHr,
    },
    {
      id: 'progress',
      title: 'Staff Progress',
      description: 'Staff activity metrics across sales, collections, and repairs.',
      href: '/dashboard/organization/progress-report',
      icon: <TrendingUp className="w-4 h-4" />,
      visible: isOrg && perms.canViewHr,
    },
    {
      id: 'settings',
      title: isOrg ? 'Branches, Roles & Settings' : 'Shop Settings',
      description: isOrg
        ? 'Manage branches, role permission matrix, and organization settings.'
        : 'Thermal printer, roles, and branch preferences.',
      href: isOrg ? '/dashboard/organization/settings' : '/dashboard/shop-admin/settings',
      icon: <Settings className="w-4 h-4" />,
      visible: perms.canViewSettings || perms.canViewUsers,
    },
  ].filter((t) => t.visible);

  return (
    <section aria-labelledby="modules-grid-heading" className="space-y-3">
      <DashboardSectionHeader
        headingId="modules-grid-heading"
        title="Business Modules & Quick Access"
        subtitle="Complete Niazi Mobile Mart ERP directory — only authorized modules are displayed"
        badge={`${tiles.length} Available Modules`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onNavigate(tile.href)}
            className="group bg-surface rounded-lg border border-border p-3 text-left shadow-xs hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {tile.icon}
                  </span>
                  <h3 className="text-xs font-bold text-text-primary truncate">{tile.title}</h3>
                </div>
                {tile.badge && (
                  <span className="px-1.5 py-0.5 rounded bg-surface-hover border border-border text-[10px] font-semibold text-text-secondary tabular-nums shrink-0">
                    {tile.badge}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted leading-snug line-clamp-2">
                {tile.description}
              </p>
            </div>

            <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px] font-semibold text-primary">
              <span>Open Module</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
