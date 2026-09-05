import React, { useEffect } from 'react';
import { usePosStore } from '../../store/usePosStore';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { UnifiedInvoice, PrinterSettings, ShopHeader } from '@/features/settings/printer/types/printer.types';

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
      const effectiveShop: ShopHeader = shopHeader || {
        name: invoice.shop?.name || 'TijaratPro POS',
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
        customer: undefined,
        cashier: 'Cashier',
        items: invoice.items.map(i => ({ 
          name: i.name, 
          qty: i.qty, 
          price: i.price, 
          total: i.subtotal 
        })),
        subtotal: invoice.summary.subtotal,
        discount: invoice.summary.discountTotal,
        tax: 0,
        total: invoice.summary.total,
        paymentMethod: invoice.paymentBreakdown?.[0]?.method || 'cash',
        tendered: invoice.summary.paid,
        change: invoice.summary.change,
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
