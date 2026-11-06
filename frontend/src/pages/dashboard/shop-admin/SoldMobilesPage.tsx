import React from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { SoldMobilesTab } from '@/features/mobiles/components/SoldMobilesTab';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { Smartphone, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SoldMobilesPage: React.FC = () => {
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopName = activeShop?.name || 'Main Branch';

  return (
    <DashboardShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Link to="/dashboard/shop-admin/mobiles" className="hover:text-text-primary transition-colors">
              Mobile Inventory
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-text-primary font-medium">Sold Mobiles Ledger</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                  <Smartphone className="w-6 h-6" />
                </div>
                <span>Sold Mobiles</span>
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Authoritative audit ledger of all serialized mobile handsets sold in{' '}
                <span className="font-semibold text-text-primary">{activeShopName}</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Sold Mobiles Content */}
        <SoldMobilesTab />
      </div>
    </DashboardShell>
  );
};

export default SoldMobilesPage;

