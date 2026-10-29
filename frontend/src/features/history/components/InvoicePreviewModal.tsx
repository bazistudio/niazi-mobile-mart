import React, { useEffect, useState } from 'react';
import { HistoryItem } from '../types/history.types';
import { X, Printer, Download, AlertCircle } from 'lucide-react';

import { useOrganizationStore } from '@/store/useOrganizationStore';
import { salesApi } from '@/services/sales.api';
import { purchaseApi } from '@/services/purchase.api';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { toast } from 'react-hot-toast';

interface Props {
  item: HistoryItem;
  onClose: () => void;
}

interface DocumentLineItem {
  id: string;
  name: string;
  specs?: string;
  imei?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export const InvoicePreviewModal: React.FC<Props> = ({ item, onClose }) => {
  const activeShop = useOrganizationStore((state) => state.activeShop);
  const { openPreview } = usePrintStore();
  const { settings, shopHeader } = usePrinterStore();

  const [lines, setLines] = useState<DocumentLineItem[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedOrderSource, setFetchedOrderSource] = useState<any | null>(null);
  const [fetchedPurchaseSource, setFetchedPurchaseSource] = useState<any | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadDetails = async () => {
      if (item.type === 'sale') {
        setIsLoadingLines(true);
        setLoadError(null);
        try {
          const res = await salesApi.getOrderById(item.id);
          if (isCancelled) return;
          if (res?.success && res.order) {
            setFetchedOrderSource(res.order);
            const rawItems = res.order.items || [];
            const mappedLines: DocumentLineItem[] = rawItems.map((i: any, idx: number) => ({
              id: i.id || String(idx),
              name: i.productName || i.name || 'Mobile Device / Item',
              specs: i.specs,
              imei: i.imei,
              quantity: Number(i.quantity ?? 1),
              unitPrice: Number(i.salePrice ?? i.price ?? i.unitPrice ?? 0),
              lineTotal: Number(i.subtotal ?? i.lineTotal ?? (Number(i.quantity ?? 1) * Number(i.salePrice ?? i.price ?? 0))),
            }));
            setLines(mappedLines);
          } else {
            setLoadError('Failed to load itemized sale lines.');
          }
        } catch (err: any) {
          if (!isCancelled) {
            setLoadError(err?.message || 'Error loading sale lines.');
          }
        } finally {
          if (!isCancelled) setIsLoadingLines(false);
        }
      } else if (item.type === 'purchase') {
        setIsLoadingLines(true);
        setLoadError(null);
        try {
          const [purchase, purchaseLines] = await Promise.all([
            purchaseApi.getPurchaseById(item.id),
            purchaseApi.getPurchaseLines(item.id),
          ]);
          if (isCancelled) return;
          if (purchase && Array.isArray(purchaseLines)) {
            const mappedPurchaseSource = {
              invoiceNumber: purchase.purchase_number || item.referenceId,
              grandTotal: purchase.total_amount ?? item.amount,
              subtotal: purchase.subtotal ?? purchase.total_amount ?? item.amount,
              discount: purchase.discount ?? 0,
              supplierName: item.party?.name || undefined,
              createdAt: purchase.created_at || item.createdAt,
              paymentMethod: purchase.payment_status === 'UNPAID' ? 'credit' : 'cash',
              items: purchaseLines.map((l: any) => ({
                name: l.product_name_snapshot || l.name || 'Item',
                quantity: l.quantity,
                price: l.unit_cost,
                total: l.line_total ?? ((l.quantity || 1) * (l.unit_cost || 0)),
              })),
            };
            setFetchedPurchaseSource(mappedPurchaseSource);

            const mappedLines: DocumentLineItem[] = purchaseLines.map((l: any, idx: number) => ({
              id: l.id || String(idx),
              name: l.product_name_snapshot || l.name || 'Purchase Item',
              quantity: Number(l.quantity ?? 1),
              unitPrice: Number(l.unit_cost ?? 0),
              lineTotal: Number(l.line_total ?? ((l.quantity || 1) * (l.unit_cost || 0))),
            }));
            setLines(mappedLines);
          } else {
            setLoadError('Failed to load purchase lines.');
          }
        } catch (err: any) {
          if (!isCancelled) {
            setLoadError(err?.message || 'Error loading purchase lines.');
          }
        } finally {
          if (!isCancelled) setIsLoadingLines(false);
        }
      }
    };

    loadDetails();

    return () => {
      isCancelled = true;
    };
  }, [item.id, item.type, item.referenceId, item.amount, item.party?.name, item.createdAt]);

  const handlePrint = async () => {
    if (!settings || !shopHeader) {
      toast.error('Printer settings or shop header not configured.');
      return;
    }

    let html = '';
    let docType: any = 'Generic';

    if (item.type === 'sale') {
      let orderSource = fetchedOrderSource;
      if (!orderSource) {
        try {
          const res = await salesApi.getOrderById(item.id);
          if (res?.success && res.order) {
            orderSource = res.order;
          }
        } catch {
          // handled below
        }
      }

      if (!orderSource) {
        toast.error('Failed to load sale details for printing.');
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
      let purchaseSource = fetchedPurchaseSource;
      if (!purchaseSource) {
        try {
          const [purchase, purchaseLines] = await Promise.all([
            purchaseApi.getPurchaseById(item.id),
            purchaseApi.getPurchaseLines(item.id),
          ]);
          if (purchase && Array.isArray(purchaseLines)) {
            purchaseSource = {
              invoiceNumber: purchase.purchase_number || item.referenceId,
              grandTotal: purchase.total_amount ?? item.amount,
              subtotal: purchase.subtotal ?? purchase.total_amount ?? item.amount,
              discount: purchase.discount ?? 0,
              supplierName: item.party?.name || undefined,
              createdAt: purchase.created_at || item.createdAt,
              paymentMethod: purchase.payment_status === 'UNPAID' ? 'credit' : 'cash',
              items: purchaseLines.map((l: any) => ({
                name: l.product_name_snapshot || l.name || 'Item',
                quantity: l.quantity,
                price: l.unit_cost,
                total: l.line_total ?? ((l.quantity || 1) * (l.unit_cost || 0)),
              })),
            };
          }
        } catch {
          // handled below
        }
      }

      if (!purchaseSource) {
        toast.error('Failed to load purchase details for printing.');
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
    }

    if (html) {
      openPreview({
        html,
        documentType: docType,
        referenceId: item.referenceId,
        title: `${item.type.toUpperCase()} - ${item.referenceId}`,
      });
    }
  };

  const handleExportJson = () => {
    const payload = {
      historyItem: item,
      shop: activeShop,
      lines: lines.length > 0 ? lines : null,
      orderSource: fetchedOrderSource || fetchedPurchaseSource || null,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${item.referenceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasLines = lines.length > 0;
  const computedSubtotal = hasLines
    ? lines.reduce((acc, l) => acc + l.lineTotal, 0)
    : item.amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Document Preview
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold uppercase">{item.type}</span>
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{item.referenceId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print Document"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={handleExportJson}
              title="Export JSON"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded-lg transition-colors ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 overflow-y-auto bg-gray-100 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mx-auto max-w-2xl min-h-[500px]">
            <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-6 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white uppercase tracking-wider">INVOICE</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono"># {item.referenceId}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900 dark:text-white">{activeShop?.name || 'Niazi Mobile Mart'}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{activeShop?.address || 'Main Branch'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Billed To</p>
                <p className="font-bold text-gray-900 dark:text-white">{item.party.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{item.party.type || 'Walk-in'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Date</p>
                <p className="font-medium text-gray-900 dark:text-white">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Error or Loading Notice */}
            {isLoadingLines && (
              <div className="text-center py-4 text-xs text-gray-500 dark:text-gray-400 italic">
                Loading line item details...
              </div>
            )}
            {loadError && !isLoadingLines && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loadError} (Displaying summary overview below)</span>
              </div>
            )}

            {/* Invoice Line Items Table */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300">Item Description</th>
                    <th className="px-3 py-3 font-semibold text-gray-900 dark:text-gray-300 text-center">Qty</th>
                    <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300 text-right">Price</th>
                    <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {hasLines ? (
                    lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {line.name}
                          </div>
                          {line.specs && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {line.specs}
                            </div>
                          )}
                          {line.imei && (
                            <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                              IMEI: {line.imei}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-700 dark:text-gray-300">
                          {line.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                          Rs {line.unitPrice.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          Rs {line.lineTotal.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                        <div className="font-medium text-gray-900 dark:text-white capitalize">
                          {item.type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Ref: {item.referenceId} &bull; Source: {item.source.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center text-gray-700 dark:text-gray-300">1</td>
                      <td className="px-4 py-4 text-right text-gray-700 dark:text-gray-300">Rs {item.amount.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-medium text-gray-900 dark:text-white">Rs {item.amount.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Invoice Totals Summary */}
            <div className="flex justify-end mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>Rs {computedSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax (0%)</span>
                  <span>Rs 0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total</span>
                  <span>Rs {(hasLines ? computedSubtotal : item.amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-12 text-center text-sm text-gray-400 italic">
              System generated document.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
