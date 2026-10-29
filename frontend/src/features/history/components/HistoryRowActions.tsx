import React, { useState } from 'react';
import { MoreHorizontal, FileText, Activity, Printer, Download, User, RotateCcw } from 'lucide-react';
import { HistoryItem } from '../types/history.types';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { LedgerTraceModal } from './LedgerTraceModal';
import { SalesReturnModal } from '@/features/returns/SalesReturnModal';
import { PurchaseReturnModal } from '@/features/returns/PurchaseReturnModal';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter, formatExchangeReceipt, ExchangeReceiptData } from '@/features/settings/printer/utils/printFormatter';
import { salesApi } from '@/services/sales.api';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { purchaseApi } from '@/services/purchase.api';
import { toast } from 'react-hot-toast';

interface Props {
  item: HistoryItem;
}

export const HistoryRowActions: React.FC<Props> = ({ item }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [showSalesReturn, setShowSalesReturn] = useState(false);
  const [showPurchaseReturn, setShowPurchaseReturn] = useState(false);

  const { openPreview } = usePrintStore();
  const { settings, shopHeader } = usePrinterStore();

  const handlePrint = async () => {
    setIsOpen(false);
    if (!settings || !shopHeader) return;
    
    let html = '';
    let docType = 'Generic';

    if (item.type === 'sale') {
      // FINDING-03-C: Fail-closed sale reprint.
      // Fetch authoritative persisted order record. If fetch fails or has no usable order,
      // notify user and abort reprint immediately without opening preview.
      let orderSource: any;
      try {
        const result = await salesApi.getOrderById(item.id);
        if (!result || !result.success || !result.order) {
          toast.error('Failed to load sale details for printing. Please try again.');
          return;
        }
        orderSource = result.order;
      } catch {
        toast.error('Failed to load sale details for printing. Please try again.');
        return;
      }
      const hasMobileLines = orderSource.items && orderSource.items.some((i: any) => i.lineType === 'MOBILE' || i.imei);
      if (hasMobileLines) {
        html = printFormatter.formatMobileSaleInvoice(orderSource, settings, shopHeader);
        docType = 'MobileSaleInvoice';
      } else {
        html = printFormatter.formatSaleInvoice(orderSource, settings, shopHeader);
        docType = 'SaleInvoice';
      }
    } else if (item.type === 'purchase') {
      // FINDING-06-A: Fail-closed purchase reprint.
      // Fetch authoritative purchase record and line items. If either request fails,
      // notify user and abort reprint immediately without opening preview.
      let purchaseSource: any;
      try {
        const [purchase, lines] = await Promise.all([
          purchaseApi.getPurchaseById(item.id),
          purchaseApi.getPurchaseLines(item.id),
        ]);
        if (!purchase || !Array.isArray(lines)) {
          toast.error('Failed to load purchase details for printing. Please try again.');
          return;
        }
        purchaseSource = {
          invoiceNumber: purchase.purchase_number || item.referenceId,
          grandTotal: purchase.total_amount ?? item.amount,
          subtotal: purchase.subtotal ?? purchase.total_amount ?? item.amount,
          discount: purchase.discount ?? 0,
          supplierName: item.party?.name || undefined,
          createdAt: purchase.created_at || item.createdAt,
          paymentMethod: purchase.payment_status === 'UNPAID' ? 'credit' : 'cash',
          items: lines.map((l: any) => ({
            name: l.product_name_snapshot || l.name || 'Item',
            quantity: l.quantity,
            price: l.unit_cost,
            total: l.line_total ?? ((l.quantity || 1) * (l.unit_cost || 0)),
          })),
        };
      } catch {
        toast.error('Failed to load purchase details for printing. Please try again.');
        return;
      }
      html = printFormatter.formatPurchaseInvoice(purchaseSource, settings, shopHeader);
      docType = 'PurchaseInvoice';
    } else if (item.type === 'expense') {
      html = printFormatter.formatExpenseVoucher({ ...item, _id: item.id, amount: item.amount, title: item.referenceId }, settings, shopHeader);
      docType = 'ExpenseVoucher';
    } else if (item.type === 'payment') {
      html = printFormatter.formatPaymentReceipt({ ...item, transactionId: item.referenceId, amount: item.amount, debitAccount: 'cash' }, settings, shopHeader);
      docType = 'PaymentReceipt';
    } else if (item.type === 'return') {
      // Task 5.3: fetch the sales return detail and render a dedicated exchange receipt.
      // Falls back to generic receipt if the fetch fails.
      try {
        const detail = await tauriClient.salesReturnGet(item.id);
        const sr = detail.sales_return;
        const exchangeData: ExchangeReceiptData = {
          invoiceNo: sr.return_number || item.referenceId,
          date: new Date(sr.created_at || item.createdAt).toLocaleString(),
          customer: sr.customer_name_snapshot
            ? { name: sr.customer_name_snapshot }
            : item.party?.name ? { name: item.party.name } : undefined,
          shop: shopHeader,
          returnedItems: (detail.lines || []).map((l: any) => ({
            name: l.product_name_snapshot || 'Item',
            qty: l.quantity,
            unitPrice: l.unit_price,
            total: l.return_amount ?? (l.quantity * l.unit_price),
            imei: l.imei_snapshot || undefined,
          })),
          returnedCredit: sr.total_amount ?? item.amount,
          // A pure return has no replacement; replacement fields are left empty.
          replacementItems: [],
          replacementValue: 0,
          // A simple sales return is always a refund (negative collection).
          settlementType: 'NEGATIVE_REFUND',
          cashRefunded: sr.refund_method === 'CREDIT' ? 0 : (sr.total_amount ?? item.amount),
          refundMethod: sr.refund_method || undefined,
          customerBalanceAfter: undefined, // not available in SalesReturnDetailDto
        };
        html = formatExchangeReceipt(exchangeData, settings);
        docType = exchangeData.replacementItems && exchangeData.replacementItems.length > 0
          ? 'ExchangeReceipt'
          : 'ReturnReceipt';
      } catch {
        // Fallback to generic receipt on fetch failure
        html = printFormatter.format({
          invoiceNo: item.referenceId,
          date: new Date(item.createdAt).toLocaleString(),
          customer: { name: item.party.name },
          items: [{ name: 'Return / Exchange', qty: 1, price: item.amount, total: item.amount }],
          subtotal: item.amount, discount: 0, tax: 0, total: item.amount, paymentMethod: 'return', shop: shopHeader
        }, settings);
        docType = 'ReturnReceipt';
      }
    } else {
      html = printFormatter.format({
        invoiceNo: item.referenceId,
        date: new Date(item.createdAt).toLocaleString(),
        customer: { name: item.party.name },
        items: [{ name: item.type, qty: 1, price: item.amount, total: item.amount }],
        subtotal: item.amount, discount: 0, tax: 0, total: item.amount, paymentMethod: 'cash', shop: shopHeader
      }, settings);
    }
    
    openPreview({ html, documentType: docType as any, referenceId: item.id, title: `Print - ${item.referenceId}` });
  };

  return (
    <div className="relative inline-block text-left">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-20 overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="py-1" role="menu">
              <button
                onClick={() => { setIsOpen(false); setShowPreview(true); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 font-medium transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                View Document
              </button>
              <button
                onClick={() => { setIsOpen(false); setShowTrace(true); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 font-medium transition-colors border-b border-gray-100 dark:border-gray-700"
              >
                <Activity className="w-4 h-4 text-emerald-500" />
                Ledger Trace (Audit)
              </button>

              {item.type === 'sale' && (
                <button
                  onClick={() => { setIsOpen(false); setShowSalesReturn(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 flex items-center gap-3 font-medium transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  <RotateCcw className="w-4 h-4 text-[#e76f51]" />
                  Return Sale Items
                </button>
              )}

              {item.type === 'purchase' && (
                <button
                  onClick={() => { setIsOpen(false); setShowPurchaseReturn(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 flex items-center gap-3 font-medium transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  <RotateCcw className="w-4 h-4 text-[#2a9d8f]" />
                  Return to Supplier
                </button>
              )}

              <button
                onClick={handlePrint}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 font-medium transition-colors"
              >
                <Printer className="w-4 h-4 text-gray-400" />
                Print Receipt
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 font-medium transition-colors"
              >
                <Download className="w-4 h-4 text-gray-400" />
                Export JSON
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 font-medium transition-colors border-t border-gray-100 dark:border-gray-700"
              >
                <User className="w-4 h-4 text-purple-500" />
                Open Profile
              </button>
            </div>
          </div>
        </>
      )}

      {showPreview && (
        <InvoicePreviewModal item={item} onClose={() => setShowPreview(false)} />
      )}
      {showTrace && (
        <LedgerTraceModal item={item} onClose={() => setShowTrace(false)} />
      )}
      {showSalesReturn && (
        <SalesReturnModal saleId={item.id} onClose={() => setShowSalesReturn(false)} />
      )}
      {showPurchaseReturn && (
        <PurchaseReturnModal purchaseId={item.id} onClose={() => setShowPurchaseReturn(false)} />
      )}
    </div>
  );
};
