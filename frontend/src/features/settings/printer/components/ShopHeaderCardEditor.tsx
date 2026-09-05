'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { Store } from 'lucide-react';

export const ShopHeaderCardEditor: React.FC = () => {
  const { shopHeader, updateShopHeader } = usePrinterStore();

  if (!shopHeader) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-100 dark:border-neutral-800">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Store className="w-5 h-5 text-[#006970]" />
        Invoice Header Info
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Shop Name</label>
          <input
            type="text"
            value={shopHeader.name || ''}
            onChange={e => updateShopHeader({ name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700"
            placeholder="e.g. Al-Fatah Store"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Phone</label>
          <input
            type="text"
            value={shopHeader.phone || ''}
            onChange={e => updateShopHeader({ phone: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700"
            placeholder="e.g. 0300 1234567"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Address</label>
          <textarea
            value={shopHeader.address || ''}
            onChange={e => updateShopHeader({ address: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 min-h-[80px]"
            placeholder="e.g. 123 Main St,\nLahore"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tax Number (NTN)</label>
          <input
            type="text"
            value={shopHeader.taxNumber || ''}
            onChange={e => updateShopHeader({ taxNumber: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Logo URL</label>
          <input
            type="text"
            value={shopHeader.logoUrl || ''}
            onChange={e => updateShopHeader({ logoUrl: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700"
            placeholder="https://example.com/logo.png"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Footer Note</label>
          <textarea
            value={shopHeader.footerText || ''}
            onChange={e => updateShopHeader({ footerText: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 min-h-[80px]"
            placeholder="Thank you for your business!"
          />
        </div>
      </div>
    </div>
  );
};
