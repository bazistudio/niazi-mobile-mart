'use client';

import React, { useState } from 'react';
import { ProductSearch } from './ProductSearch';
import { SaleTabNavigation } from './SaleTabNavigation';
import { PosActionsDropdown } from './PosActionsDropdown';
import { InvoiceLookupModal } from './modals/InvoiceLookupModal';
import { ShopSwitcher } from '@/components/layout/ShopSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { useTerminalStore } from '@/store/useTerminalStore';
import { Lock } from 'lucide-react';

export const PosHeader: React.FC = () => {
  const [isInvoiceLookupOpen, setInvoiceLookupOpen] = useState(false);
  const lockTerminal = useTerminalStore((s) => s.lockTerminal);

  return (
    <>
      <header className="h-[52px] min-h-[52px] px-3 sm:px-4 border-b border-border bg-surface flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-40 select-none shadow-xs">
        {/* Left Section: Brand Badge & Shop Switcher */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center font-black text-xs shadow-xs">
              N
            </span>
            <span className="hidden md:inline font-bold text-xs tracking-tight text-text-primary">
              Niazi<span className="text-primary font-black">POS</span>
            </span>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Active Shop Context */}
          <div className="shrink-0">
            <ShopSwitcher />
          </div>
        </div>

        {/* Center Section: Primary Product / Barcode Omnibox */}
        <div className="flex-1 max-w-xl min-w-0">
          <ProductSearch />
        </div>

        {/* Right-Center: Multi-Sale Tabs */}
        <div className="hidden lg:flex items-center shrink-0">
          <SaleTabNavigation />
        </div>

        {/* Right Section: Actions Dropdown, Lock Terminal, Cashier Profile */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Real Return / Exchange Actions Dropdown */}
          <PosActionsDropdown onOpenInvoiceLookup={() => setInvoiceLookupOpen(true)} />

          {/* Lock Terminal Button (Ctrl+L) */}
          <button
            type="button"
            onClick={() => lockTerminal()}
            className="h-9 w-9 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover flex items-center justify-center transition-colors shadow-xs"
            title="Lock Terminal (Ctrl+L)"
            aria-label="Lock terminal"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>

          {/* Cashier / User Profile Menu */}
          <UserMenu />
        </div>
      </header>

      {/* On-Demand Return by Invoice Lookup Modal */}
      <InvoiceLookupModal
        isOpen={isInvoiceLookupOpen}
        onClose={() => setInvoiceLookupOpen(false)}
      />
    </>
  );
};

export default PosHeader;
