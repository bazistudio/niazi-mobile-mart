'use client';
import React, { useState } from 'react';
import { usePrinterStore, InvoiceTemplateKey } from '../store/printer.store';
import {
  FileText,
  Smartphone,
  Truck,
  CreditCard,
  CheckCircle2,
  Eye,
  Sliders,
  Layers,
  Info,
} from 'lucide-react';

interface TemplateOption {
  key: InvoiceTemplateKey;
  title: string;
  docType: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  supportedFormats: string[];
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    key: 'SaleInvoice',
    title: 'Product Sale Invoice',
    docType: 'SaleInvoice (Type 1)',
    description: 'Standard Point of Sale retail invoice for accessories, spare parts, and general inventory items with itemized catalog specs.',
    icon: FileText,
    accent: 'emerald',
    supportedFormats: ['80mm Thermal', 'A4'],
  },
  {
    key: 'MobileSaleInvoice',
    title: 'Mobile Inventory Sale Invoice',
    docType: 'MobileSaleInvoice (Type 2)',
    description: 'Specialized mobile terminal invoice with dual IMEI tracking, hardware specs, cashier accountability, and check warranty terms.',
    icon: Smartphone,
    accent: 'cyan',
    supportedFormats: ['80mm Thermal', 'A4'],
  },
  {
    key: 'PurchaseInvoice',
    title: 'Purchase Order / Supplier Invoice',
    docType: 'PurchaseInvoice',
    description: 'Wholesale inventory intake documentation featuring supplier trade profile, itemized purchase rates, and total payable.',
    icon: Truck,
    accent: 'amber',
    supportedFormats: ['80mm Thermal', 'A4'],
  },
  {
    key: 'PaymentReceipt',
    title: 'Customer / Supplier Payment Receipt',
    docType: 'PaymentReceipt',
    description: 'Official ledger transaction voucher documenting debit/credit settlements, payment accounts, and current party balance.',
    icon: CreditCard,
    accent: 'indigo',
    supportedFormats: ['80mm Thermal', 'A4'],
  },
];

export const InvoiceTemplateEditor: React.FC = () => {
  const {
    settings,
    updateSettings,
    activeTemplate,
    setActiveTemplate,
  } = usePrinterStore();

  const [activeTab, setActiveTab] = useState<'gallery' | 'elements'>('gallery');

  if (!settings) return null;

  const toggleInvoiceSetting = (key: keyof typeof settings.invoice) => {
    updateSettings({
      invoice: {
        ...settings.invoice,
        [key]: !settings.invoice[key],
      },
    });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-800 space-y-6">
      {/* Header (Duplicate branch selector removed per user request; single authoritative selector is in Section 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
            <Layers className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
            Invoice Templates & Previews
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Select an invoice type to preview layout, hardware toggles, and branch business identity.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('gallery')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeTab === 'gallery'
              ? 'bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] border border-[#006970]/30'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Template Gallery ({TEMPLATE_OPTIONS.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('elements')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeTab === 'elements'
              ? 'bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] border border-[#006970]/30'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Display Elements & Toggles
        </button>
      </div>

      {/* Tab 1: Template Gallery */}
      {activeTab === 'gallery' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEMPLATE_OPTIONS.map((tmpl) => {
            const Icon = tmpl.icon;
            const isSelected = activeTemplate === tmpl.key;

            return (
              <div
                key={tmpl.key}
                onClick={() => setActiveTemplate(tmpl.key)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-[#006970] dark:border-[#00B4BB] bg-[#006970]/5 dark:bg-[#00B4BB]/5 ring-1 ring-[#006970] dark:ring-[#00B4BB]'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSelected
                            ? 'bg-[#006970] text-white dark:bg-[#00B4BB] dark:text-neutral-950'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          {tmpl.title}
                        </h4>
                        <span className="text-[10px] font-mono font-medium text-neutral-500">
                          {tmpl.docType}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-[#006970] dark:text-[#00B4BB] shrink-0" />
                    )}
                  </div>

                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2.5 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-neutral-500 font-mono">
                    <span>Formats:</span>
                    {tmpl.supportedFormats.map((fmt) => (
                      <span
                        key={fmt}
                        className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTemplate(tmpl.key);
                    }}
                    className={`text-xs font-bold transition-colors ${
                      isSelected
                        ? 'text-[#006970] dark:text-[#00B4BB]'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                    }`}
                  >
                    {isSelected ? 'Active Preview' : 'Select Preview →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Display Elements & Toggles */}
      {activeTab === 'elements' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400">
            <Info className="w-4 h-4 text-[#006970] dark:text-[#00B4BB] shrink-0 mt-0.5" />
            <span>
              These display toggles govern receipt printing for the current branch. Toggles apply across supported 80mm thermal and A4 printStrategy renderers.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: 'showLogo', label: 'Show Shop Logo' },
              { key: 'showShopInfo', label: 'Show Shop Info (Name, Address)' },
              { key: 'showTax', label: 'Show Tax / NTN Breakdown' },
              { key: 'showDiscount', label: 'Show Discount Breakdown' },
              { key: 'showBarcode', label: 'Show Invoice Barcode (Code128)' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center space-x-3 cursor-pointer p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 text-[#006970] rounded border-neutral-300 focus:ring-[#006970]"
                  checked={settings.invoice[item.key as keyof typeof settings.invoice]}
                  onChange={() => toggleInvoiceSetting(item.key as keyof typeof settings.invoice)}
                />
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
