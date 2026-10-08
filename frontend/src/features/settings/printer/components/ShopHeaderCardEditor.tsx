'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { Store, Phone, MapPin, FileText, ShieldAlert, Image, MessageSquare } from 'lucide-react';

export const ShopHeaderCardEditor: React.FC = () => {
  const { shopHeader, updateShopHeader } = usePrinterStore();

  if (!shopHeader) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-800 space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
          <Store className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
          1. Shop & Branch Identity
        </h3>
        <span className="text-xs text-neutral-500 font-mono">PostgreSQL Synced</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Shop Name</label>
          <input
            type="text"
            value={shopHeader.name || ''}
            onChange={e => updateShopHeader({ name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. Niazi Mobile Mart"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Branch Name</label>
          <input
            type="text"
            value={shopHeader.branchName || ''}
            onChange={e => updateShopHeader({ branchName: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. Main Branch / Saddar Branch"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Shop Address</label>
          <textarea
            value={shopHeader.address || ''}
            onChange={e => updateShopHeader({ address: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. Shop #12, Mobile Market, Main Blvd, Lahore"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Primary Phone</label>
          <input
            type="text"
            value={shopHeader.phone || ''}
            onChange={e => updateShopHeader({ phone: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0300-1234567"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Secondary Phone (Optional)</label>
          <input
            type="text"
            value={shopHeader.secondaryPhone || ''}
            onChange={e => updateShopHeader({ secondaryPhone: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0321-7654321"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">WhatsApp Number</label>
          <input
            type="text"
            value={shopHeader.whatsapp || ''}
            onChange={e => updateShopHeader({ whatsapp: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0300-1234567"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tax Number (NTN / STRN)</label>
          <input
            type="text"
            value={shopHeader.taxNumber || ''}
            onChange={e => updateShopHeader({ taxNumber: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. NTN-9876543-2"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Logo Image URL</label>
          <input
            type="text"
            value={shopHeader.logoUrl || ''}
            onChange={e => updateShopHeader({ logoUrl: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="https://example.com/logo.png or base64 image data"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 pt-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
          <FileText className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
          2. Instructions & Policy Messages
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Return & Exchange Policy</label>
          <textarea
            value={shopHeader.returnPolicy || ''}
            onChange={e => updateShopHeader({ returnPolicy: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Goods once sold can only be returned/exchanged within 3 days with original receipt."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Warranty Instructions & Disclaimer</label>
          <textarea
            value={shopHeader.warrantyInstructions || ''}
            onChange={e => updateShopHeader({ warrantyInstructions: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Warranty claims require original invoice. Physical or liquid damage voids warranty."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Footer Greeting</label>
          <textarea
            value={shopHeader.footerText || ''}
            onChange={e => updateShopHeader({ footerText: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[50px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Thank you for shopping with us!"
          />
        </div>
      </div>
    </div>
  );
};
