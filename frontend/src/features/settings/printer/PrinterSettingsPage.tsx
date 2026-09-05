'use client';
import React, { useEffect } from 'react';
import { usePrinterStore } from './store/printer.store';
import { PrinterSelector } from './components/PrinterSelector';
import { ShopHeaderCardEditor } from './components/ShopHeaderCardEditor';
import { InvoiceTemplateEditor } from './components/InvoiceTemplateEditor';
import { PrintPreview, mockInvoice } from './components/PrintPreview';
import { Save } from 'lucide-react';
import { usePrintStore } from '@/lib/printer/print.store';
import { printFormatter } from './utils/printFormatter';

export const PrinterSettingsPage: React.FC = () => {
  const { fetchSettings, saveSettings, isLoading, settings, shopHeader } = usePrinterStore();
  const { openPreview } = usePrintStore();

  const handlePrintSample = () => {
    if (!settings || !shopHeader) return;
    const previewInvoice = { ...mockInvoice, shop: shopHeader };
    const htmlContent = printFormatter.format(previewInvoice, settings);
    openPreview({
      html: htmlContent,
      documentType: 'Generic',
      referenceId: 'sample',
      title: 'Sample Receipt'
    });
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!settings) {
    return <div className="p-8 text-center text-neutral-500">Loading print engine configuration...</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Print Engine Configuration
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Hardware-agnostic POS Print Layer. Configure thermal or A4 printers here.
          </p>
        </div>
        <button
          onClick={saveSettings}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-[#006970] text-white rounded-lg hover:bg-[#005a60] transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isLoading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          <PrinterSelector />
          <ShopHeaderCardEditor />
          <InvoiceTemplateEditor />
        </div>

        {/* Right Column: Live Preview */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-6 self-start">
          <div className="flex justify-between items-center mb-2 px-1">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Live Simulation</h3>
            <span className="text-xs font-mono bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded text-neutral-600 dark:text-neutral-400">
              {settings.printerType}
            </span>
          </div>
          <PrintPreview />
          
          <div className="mt-4 flex gap-3">
            <button 
              onClick={handlePrintSample}
              className="flex-1 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
              Print Sample
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
