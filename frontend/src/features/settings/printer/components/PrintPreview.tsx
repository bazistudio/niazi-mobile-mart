'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { printFormatter } from '../utils/printFormatter';
import { UnifiedInvoice } from '../types/printer.types';

// Realistic sample invoice data for 80mm preview (matches active BRANCH-USER-YYYYMM-000001 format)
export const mockInvoice: UnifiedInvoice = {
  invoiceNo: 'MAIN-U01-202610-000001',
  date: new Date().toLocaleString(),
  customer: { name: 'Ali Raza', phone: '0301-5551234' },
  cashier: 'U01 (Cashier)',
  items: [
    { name: 'Samsung Galaxy A15 6GB/128GB Black', qty: 1, price: 42500, total: 42500, imei: '352849102938475' },
    { name: 'Baseus 20W Fast Charger Cable', qty: 1, price: 1800, total: 1800 },
    { name: '9D Full Curved Tempered Glass', qty: 1, price: 700, total: 700 },
  ],
  subtotal: 45000,
  discount: 1000,
  tax: 0,
  total: 44000,
  paymentMethod: 'Cash',
  tendered: 45000,
  change: 1000,
  shop: {
    name: 'Niazi Mobile Mart',
    branchName: 'Main Branch',
    address: 'Shop #12, Mobile Market, Main Blvd, Lahore',
    phone: '0300-1234567',
    secondaryPhone: '0321-7654321',
    whatsapp: '0300-1234567',
    email: 'info@niazimobile.com',
    taxNumber: 'NTN-9876543-2',
    returnPolicy: 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
    warrantyInstructions: 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
    footerText: 'Thank you for shopping with us!',
  },
};

export const PrintPreview: React.FC = () => {
  const { settings, shopHeader } = usePrinterStore();

  if (!settings || !shopHeader) return null;

  const previewInvoice: UnifiedInvoice = {
    ...mockInvoice,
    shop: shopHeader,
    returnPolicy: shopHeader.returnPolicy || mockInvoice.returnPolicy,
    warrantyInstructions: shopHeader.warrantyInstructions || mockInvoice.warrantyInstructions,
  };

  const htmlContent = printFormatter.format(previewInvoice, settings);

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-6 flex justify-center overflow-auto min-h-[500px] border border-neutral-200 dark:border-neutral-700">
      <div className="bg-white shadow-xl relative my-2 border border-neutral-200" style={{ color: '#000' }}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  );
};
