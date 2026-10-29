'use client';
import React, { useEffect } from 'react';
import { usePrinterStore } from './store/printer.store';
import { PrinterSelector } from './components/PrinterSelector';
import { ShopHeaderCardEditor } from './components/ShopHeaderCardEditor';
import { InvoiceTemplateEditor } from './components/InvoiceTemplateEditor';
import {
  PrintPreview,
  mockSaleInvoice,
  mockMobileOrder,
  mockPurchaseOrder,
  mockPaymentRecord,
} from './components/PrintPreview';
import { Save, Printer, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { usePrintStore } from '@/lib/printer/print.store';
import { printFormatter } from './utils/printFormatter';
import { ShopHeader, UnifiedInvoice } from './types/printer.types';

export const PrinterSettingsPage: React.FC = () => {
  const { fetchSettings, saveSettings, isLoading, settings, shopHeader, activeTemplate, selectedBranchId } =
    usePrinterStore();
  const { openPreview } = usePrintStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handlePrintSample = () => {
    if (!settings || !shopHeader) return;

    const effectiveShop: ShopHeader = {
      ...shopHeader,
      returnPolicy: shopHeader.returnPolicy || mockSaleInvoice.shop.returnPolicy,
      warrantyInstructions: shopHeader.warrantyInstructions || mockSaleInvoice.shop.warrantyInstructions,
      footerText: shopHeader.footerText || mockSaleInvoice.shop.footerText,
    };

    let htmlContent = '';
    let title = 'Sample Thermal Receipt';
    let docType: any = 'Generic';

    switch (activeTemplate) {
      case 'MobileSaleInvoice':
        htmlContent = printFormatter.formatMobileSaleInvoice(mockMobileOrder, settings, effectiveShop);
        title = 'Sample Mobile Sale Receipt (80mm)';
        docType = 'MobileSaleInvoice';
        break;

      case 'PurchaseInvoice':
        htmlContent = printFormatter.formatPurchaseInvoice(mockPurchaseOrder, settings, effectiveShop);
        title = 'Sample Purchase Invoice';
        docType = 'PurchaseInvoice';
        break;

      case 'PaymentReceipt':
        htmlContent = printFormatter.formatPaymentReceipt(mockPaymentRecord, settings, effectiveShop);
        title = 'Sample Payment Receipt';
        docType = 'PaymentReceipt';
        break;

      case 'SaleInvoice':
      default: {
        const previewInvoice: UnifiedInvoice = {
          ...mockSaleInvoice,
          shop: effectiveShop,
        };
        htmlContent = printFormatter.formatSaleInvoice(previewInvoice, settings, effectiveShop);
        title = 'Sample Product Sale Receipt (80mm)';
        docType = 'SaleInvoice';
        break;
      }
    }

    openPreview({
      html: htmlContent,
      documentType: docType,
      referenceId: 'sample-test-print',
      title,
    });
  };

  const handleSave = async () => {
    await saveSettings();
  };

  if (!settings || !shopHeader) {
    return (
      <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 flex flex-col items-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#006970] dark:text-[#00B4BB]" />
        <span className="text-sm font-medium">Loading invoice configuration and PostgreSQL settings...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16">
      {/* Header Banner (Action button removed from top, Test Print preserved) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-neutral-900 via-neutral-800 to-[#004D54] text-white p-6 rounded-2xl shadow-lg border border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#00B4BB]/20 text-[#00B4BB] border border-[#00B4BB]/30">
              Admin & POS Settings
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              Branch: {shopHeader.branchName || 'Main Branch'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1 tracking-tight">
            Invoice Templates & Branch Settings
          </h1>
          <p className="mt-1 text-sm text-neutral-300 max-w-2xl">
            Configure shop identity, branch address, contact details, return policies, and 80mm thermal receipt formats. Settings persist centrally per branch across all POS terminals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrintSample}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all backdrop-blur-sm border border-white/10"
          >
            <Printer className="w-4 h-4 text-[#00B4BB]" />
            Test Print Active Template
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Sections */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          <InvoiceTemplateEditor />
          <ShopHeaderCardEditor />
          <PrinterSelector />

          {/* Full Bottom Save Action Bar */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] flex items-center justify-center shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Save All Configuration Changes
                </h4>
                <p className="text-xs text-neutral-500">
                  Applies branch identity, template display toggles, and printer settings to PostgreSQL for {shopHeader.branchName || 'current branch'}.
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-6 py-3 bg-[#006970] hover:bg-[#005157] text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Saving Changes...' : 'Save All Settings (PostgreSQL)'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Sticky Live Simulation */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-6 self-start flex flex-col gap-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" />
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Live Receipt Simulation
              </h3>
            </div>
            <span className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md text-neutral-600 dark:text-neutral-300 font-semibold border border-neutral-200 dark:border-neutral-700">
              {activeTemplate} • {settings.paperSize?.width || '80mm'}
            </span>
          </div>

          <PrintPreview />

          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-col gap-3">
            <div className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Sample preview and test prints do <strong>NOT</strong> create real sales or consume invoice counter sequences. Real sales retain backend financial authority.
              </span>
            </div>

            <button
              onClick={handlePrintSample}
              className="w-full py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Sample ({activeTemplate})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
