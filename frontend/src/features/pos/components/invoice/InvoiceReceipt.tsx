
import React, { useEffect } from 'react';
import { usePosStore } from '../../store/usePosStore';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { UnifiedInvoice, PrinterSettings, ShopHeader } from '@/features/settings/printer/types/printer.types';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';

export const InvoiceReceipt: React.FC = () => {
  const invoice = usePosStore(state => state.lastInvoice);
  const setLastInvoice = usePosStore(state => state.setLastInvoice);

  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();

  useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  useEffect(() => {
    if (invoice) {
      const inventoryProducts = useInventoryStore.getState().products;

      const effectiveShop: ShopHeader = shopHeader || {
        name: invoice.shop?.name || 'Niazi Mobile Mart POS',
        address: invoice.shop?.address || '',
        phone: invoice.shop?.phone || '',
        email: '',
        taxNumber: '',
        footerText: 'Thank you for your business!'
      };

      const effectiveSettings: PrinterSettings = settings || {
        enabled: true,
        printerType: 'THERMAL_80MM',
        connectionType: 'BROWSER_PRINT',
        paperSize: { width: '80mm' },
        layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
        font: { size: 12, family: 'monospace' },
        invoice: {
          showLogo: false,
          showShopInfo: true,
          showBarcode: true,
          showQR: false,
          showTax: false,
          showDiscount: true
        },
        autoPrint: false,
        printCopyCount: 1
      };

      const unified: UnifiedInvoice = {
        invoiceNo: invoice.invoiceId,
        date: new Date(invoice.createdAt || Date.now()).toLocaleString(),
        // DEF-SALE-06: use real customer/cashier from InvoiceDocument (set during sale)
        customer: invoice.customer ? { name: invoice.customer.name } : undefined,
        cashier: invoice.cashier || 'Cashier',
        items: invoice.items.map(i => {
          let specs: string | undefined;
          try {
            const rawItem = i as any;
            const targetId = rawItem.productId || rawItem.id;
            let matchedProduct: any = null;

            if (targetId) {
              matchedProduct = inventoryProducts.find(p => (p.id || (p as any)._id) === targetId);
            }

            if (!matchedProduct && i.name) {
              const exactMatches = inventoryProducts.filter(p => p.name && p.name.trim().toLowerCase() === i.name.trim().toLowerCase());
              if (exactMatches.length === 1) {
                matchedProduct = exactMatches[0];
              }
            }

            if (matchedProduct) {
              const specList: string[] = [];
              if (matchedProduct.category && matchedProduct.category !== '-' && matchedProduct.category.trim().length > 0 && matchedProduct.category.toLowerCase() !== 'uncategorized') {
                specList.push(matchedProduct.category);
              }
              if (matchedProduct.quality && matchedProduct.quality !== '-' && matchedProduct.quality.trim().length > 0) {
                specList.push(matchedProduct.quality);
              }
              if (matchedProduct.color && matchedProduct.color !== '-' && matchedProduct.color.trim().length > 0) {
                specList.push(matchedProduct.color);
              }
              if (matchedProduct.brand && matchedProduct.brand !== '-' && matchedProduct.brand.trim().length > 0) {
                specList.push(matchedProduct.brand);
              }
              if (matchedProduct.company && matchedProduct.company !== '-' && matchedProduct.company.trim().length > 0) {
                specList.push(matchedProduct.company);
              }
              if (specList.length > 0) {
                specs = specList.join(' • ');
              }
            }
          } catch (lookupErr) {
            console.warn('Failed to resolve specs for invoice item:', lookupErr);
          }

          return {
            name: i.name,
            qty: i.qty,
            price: i.price,
            total: i.subtotal,
            specs,
          };
        }),
        subtotal: invoice.summary.subtotal,
        discount: invoice.summary.discountTotal,
        tax: 0,
        total: invoice.summary.total,
        paymentMethod: invoice.paymentBreakdown?.[0]?.method || 'cash',
        tendered: invoice.summary.paid,
        change: invoice.summary.change,
        // FINDING-02: pass outstanding balance so thermal formatter can print it
        due: invoice.summary.due,
        shop: effectiveShop,
        returnPolicy: 'Goods once sold can only be returned or exchanged within 3 days with original receipt.'
      };

      const html = printFormatter.format(unified, effectiveSettings);
      openPreview({
        html,
        documentType: 'SaleInvoice',
        referenceId: invoice.transactionId,
        title: `Sale Receipt - ${invoice.invoiceId}`
      });

      setLastInvoice(null);
    }
  }, [invoice, settings, shopHeader, openPreview, setLastInvoice]);

  return null;
};

export default InvoiceReceipt;
