'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { PlusCircle, ShoppingCart, Package, Receipt, Wrench, UserPlus, ChevronDown } from 'lucide-react';
import { useInventoryUIStore } from '@/features/inventory/store/inventory-ui.store';

export const QuickActions = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden sm:flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring transition-colors"
      >
        <PlusCircle className="h-4 w-4" />
        Quick Actions
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[var(--z-dropdown)] mt-2 w-56 origin-top-right rounded-md bg-surface py-2 shadow-dropdown border border-border focus:outline-none">
          <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
            Create New
          </div>

          <button
            className="w-full text-left group flex items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            onClick={() => {
              setIsOpen(false);
              useInventoryUIStore.getState().setAddProductOpen(true);
            }}
          >
            <Package className="mr-3 h-4 w-4 text-text-muted group-hover:text-primary" />
            Add Product
          </button>
          <Link
            href="/dashboard/shop-admin/expenses/new"
            className="group flex items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <Receipt className="mr-3 h-4 w-4 text-text-muted group-hover:text-primary" />
            Add Expense
          </Link>
          <Link
            href="/dashboard/shop-admin/repairs/new"
            className="group flex items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <Wrench className="mr-3 h-4 w-4 text-text-muted group-hover:text-primary" />
            Create Repair Job
          </Link>
          <Link
            href="/dashboard/shop-admin/customers/new"
            className="group flex items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <UserPlus className="mr-3 h-4 w-4 text-text-muted group-hover:text-primary" />
            Add Customer
          </Link>
        </div>
      )}
    </div>
  );
};

export default QuickActions;
