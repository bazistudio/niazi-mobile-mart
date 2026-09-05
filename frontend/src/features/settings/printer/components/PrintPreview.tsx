'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { printFormatter } from '../utils/printFormatter';
import { UnifiedInvoice } from '../types/printer.types';

// Mock invoice data for preview
export const mockInvoice: UnifiedInvoice = {
  invoiceNo: 'INV-100293',
  date: new Date().toLocaleString(),
  customer: { name: 'Ali Khan', phone: '0300 0000000' },
  items: [
    { name: 'Wireless Mouse', qty: 2, price: 1500, total: 3000 },
    { name: 'USB-C Cable', qty: 1, price: 500, total: 500 },
    { name: 'Keyboard 60%', qty: 1, price: 4500, total: 4500 }
  ],
  subtotal: 8000,
  discount: 500,
  tax: 1200,
  total: 8700,
  paymentMethod: 'Cash',
  // Note: shop header will be injected when formatting
  shop: { name: '', address: '', phone: '', email: '', taxNumber: '', footerText: '' }
};

export const PrintPreview: React.FC = () => {
  const { settings, shopHeader } = usePrinterStore();

  if (!settings || !shopHeader) return null;

  const previewInvoice = { ...mockInvoice, shop: shopHeader };
  const htmlContent = printFormatter.format(previewInvoice, settings);

  // For visual distinction, apply a dark mode overlay background if the user is in dark mode,
  // but keep the receipt itself looking like paper.
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-6 flex justify-center overflow-auto min-h-[500px] border border-neutral-200 dark:border-neutral-700">
      <div className="bg-white shadow-lg relative" style={{ color: '#000' }}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  );
};
