'use client';

import React from 'react';
import { CustomerSelector } from './CustomerSelector';
import { CartTable } from './CartTable';
import { CartSummary } from './CartSummary';

export const CartPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full min-h-0 bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      {/* 1. Customer & Invoice Selector at the Top */}
      <div className="p-2 border-b border-border/70 shrink-0 bg-surface-hover/20">
        <CustomerSelector />
      </div>

      {/* 2. Cart Items Table in the Middle */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CartTable />
      </div>

      {/* 3. Financial Summary & Checkout Footer at the Bottom */}
      <div className="shrink-0 border-t border-border/70">
        <CartSummary />
      </div>
    </div>
  );
};

export default CartPanel;
