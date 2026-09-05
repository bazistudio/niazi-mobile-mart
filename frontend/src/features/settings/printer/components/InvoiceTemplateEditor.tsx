'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { FileEdit } from 'lucide-react';

export const InvoiceTemplateEditor: React.FC = () => {
  const { settings, updateSettings } = usePrinterStore();

  if (!settings) return null;

  const toggleInvoiceSetting = (key: keyof typeof settings.invoice) => {
    updateSettings({
      invoice: {
        ...settings.invoice,
        [key]: !settings.invoice[key]
      }
    });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-100 dark:border-neutral-800">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <FileEdit className="w-5 h-5 text-[#006970]" />
        Invoice Elements
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { key: 'showLogo', label: 'Show Shop Logo' },
          { key: 'showShopInfo', label: 'Show Shop Info (Name, Address)' },
          { key: 'showTax', label: 'Show Tax Breakdown' },
          { key: 'showDiscount', label: 'Show Discount Breakdown' },
          { key: 'showBarcode', label: 'Show Invoice Barcode' },
        ].map(item => (
          <label key={item.key} className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-md">
            <input
              type="checkbox"
              className="w-4 h-4 text-[#006970] rounded border-neutral-300 focus:ring-[#006970]"
              checked={settings.invoice[item.key as keyof typeof settings.invoice]}
              onChange={() => toggleInvoiceSetting(item.key as keyof typeof settings.invoice)}
            />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
