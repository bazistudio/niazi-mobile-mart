'use client';

import React from 'react';
import { CustomerSelector } from './CustomerSelector';
import { CartTable } from './CartTable';
import { CartSummary } from './CartSummary';

interface CartPanelProps {
  isSaleSuccess?: boolean;
}

export const CartPanel: React.FC<CartPanelProps> = ({ isSaleSuccess }) => {
  return (
    <div
      className={`flex flex-col h-full min-h-0 bg-surface border border-border rounded-xl shadow-card overflow-hidden transition-all duration-500 ${
        isSaleSuccess ? 'pos-animated-border-green' : 'pos-animated-border-blue'
      }`}
    >
      {/* 1. Header Bar: POS Cart */}
      <div className="px-4 py-2 border-b border-border bg-surface-hover/60 flex items-center justify-between shrink-0">
        <span className="text-sm font-black text-text-primary uppercase tracking-wider">
          POS Cart
        </span>
      </div>

      {/* 2. Cart Items Table */}
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
