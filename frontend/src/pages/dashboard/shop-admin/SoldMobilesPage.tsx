import React from 'react';
import { SoldMobilesTab } from '@/features/mobiles/components/SoldMobilesTab';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { Smartphone } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const MOBILE_NAV_TABS = [
  { label: 'Inventory', href: '/dashboard/shop-admin/mobiles' },
  { label: 'Sold Mobiles', href: '/dashboard/shop-admin/mobiles/sold' },
  { label: 'Mobile Sale', href: '/dashboard/shop-admin/mobiles/sale' },
  { label: 'Sale History', href: '/dashboard/shop-admin/mobiles/sale-history' },
] as const;

export const SoldMobilesPage: React.FC = () => {
  const { pathname } = useLocation();
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopName = activeShop?.name || 'Main Branch';

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-16 px-4 sm:px-6">
      {/* Mobile module sub-nav */}
      <div className="flex items-center gap-1 pt-4 border-b border-border pb-0 overflow-x-auto">
        {MOBILE_NAV_TABS.map((tab) => {
          const isActive =
            tab.href === '/dashboard/shop-admin/mobiles'
              ? pathname === '/dashboard/shop-admin/mobiles'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Sold Mobiles
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Authoritative audit ledger of all serialized mobile handsets sold in{' '}
              <span className="font-semibold text-text-primary">{activeShopName}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Sold Mobiles Content */}
      <SoldMobilesTab />
    </div>
  );
};

export default SoldMobilesPage;

