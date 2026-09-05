'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, Bell, ShoppingCart, Plus, ReceiptText, RefreshCw, Lock } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { SearchInput } from '../common/SearchInput';
import { DesktopAppButton } from './DesktopAppButton';
import { ThemeToggle } from './ThemeToggle';
import { ShopSwitcher } from './ShopSwitcher';
import { selectForceSync, selectStatus } from '@/features/inventory/core/inventory.selectors';
import { useExpensesStore } from '@/features/expenses';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';
import { useTerminalStore } from '@/store/useTerminalStore';

interface TopbarProps {
  setMobileMenuOpen: (isOpen: boolean) => void;
}

/** Shared icon-button style for topbar action buttons */
const topbarIconBtn =
  'hidden md:inline-flex items-center justify-center w-9 h-9 rounded-md border border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

export const Topbar = ({ setMobileMenuOpen }: TopbarProps) => {
  const forceSync = selectForceSync();
  const inventoryStatus = selectStatus();
  const isSyncing = inventoryStatus === 'loading';
  const lockTerminal = useTerminalStore((s) => s.lockTerminal);

  return (
    <header className="sticky top-0 z-[var(--z-fixed)] flex h-12 flex-shrink-0 bg-surface/90 backdrop-blur-md border-b border-border transition-colors duration-fast">
      {/* Mobile menu toggle */}
      <button
        type="button"
        className="border-r border-border px-4 text-text-muted hover:text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring lg:hidden transition-colors duration-fast"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="flex flex-1 items-center justify-between px-3 sm:px-4 lg:px-6 gap-3 min-w-0">
        {/* Left: Search + ShopSwitcher */}
        <div className="flex flex-1 min-w-0 max-w-2xl items-center gap-3">
          <SearchInput placeholder="Search products, customers, invoices…" />
          <div className="hidden md:block">
            <ShopSwitcher />
          </div>
        </div>

        {/* Right: Action cluster */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* New Sale CTA */}
          <Link
            href="/dashboard/shop-admin/pos"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 transition-all duration-fast"
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">New Sale</span>
          </Link>

          {/* Add Product */}
          <button
            type="button"
            onClick={() => useInventoryUIStore.getState().setAddProductOpen(true)}
            title="Add Product"
            aria-label="Add product"
            className={topbarIconBtn}
          >
            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
          </button>

          {/* Sync Inventory */}
          <button
            type="button"
            onClick={() => forceSync()}
            disabled={isSyncing}
            title={isSyncing ? 'Syncing...' : 'Sync Inventory'}
            aria-label="Sync inventory"
            className={`${topbarIconBtn} disabled:opacity-disabled`}
          >
            <RefreshCw
              className={`h-4 w-4 text-info ${isSyncing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>

          {/* Add Expense */}
          <button
            type="button"
            onClick={() => useExpensesStore.getState().setGlobalModalOpen(true)}
            title="Add Expense"
            aria-label="Add expense"
            className={topbarIconBtn}
          >
            <ReceiptText className="h-4 w-4 text-danger" aria-hidden="true" />
          </button>

          {/* Lock Terminal (Ctrl+L) */}
          <button
            type="button"
            onClick={() => lockTerminal()}
            title="Lock Terminal (Ctrl+L)"
            aria-label="Lock terminal"
            className={topbarIconBtn}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Desktop App */}
          <DesktopAppButton />

          {/* Notifications */}
          <button
            type="button"
            aria-label="View notifications"
            className="relative hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {/* Notification dot */}
            <span
              className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full ring-2 ring-surface bg-danger"
              aria-hidden="true"
            />
          </button>

          {/* Theme & User */}
          <div className="flex items-center gap-1 border-l border-border pl-1.5 ml-0.5">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
