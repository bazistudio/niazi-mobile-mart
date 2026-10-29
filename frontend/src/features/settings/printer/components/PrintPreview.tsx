'use client';
import React, { useMemo } from 'react';
import { usePrinterStore } from '../store/printer.store';
import { printFormatter } from '../utils/printFormatter';
import { UnifiedInvoice, ShopHeader } from '../types/printer.types';

// 1. Realistic Sample Data for Standard Product/Accessories Sale Invoice (Type 1)
export const mockSaleInvoice: UnifiedInvoice = {
  invoiceNo: 'MAIN-POS-202610-001082',
  date: new Date().toLocaleString(),
  customer: { name: 'Muhammad Usman', phone: '0301-5551234' },
  cashier: 'Cashier (Sales Counter A)',
  items: [
    { name: 'Samsung 25W Super Fast Type-C Charger', qty: 1, price: 3200, total: 3200, specs: 'Original • 25W • White' },
    { name: 'Baseus Silky Silicone iPhone 15 Pro Case', qty: 1, price: 1500, total: 1500, specs: 'Matte Black' },
    { name: 'Remax 9D Tempered Privacy Glass', qty: 2, price: 650, total: 1300 },
  ],
  subtotal: 6000,
  discount: 300,
  tax: 0,
  total: 5700,
  paymentMethod: 'Cash',
  tendered: 6000,
  change: 300,
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
    warrantyInstructions: 'Accessories carry 7 days replacement warranty with intact packaging.',
    footerText: 'Thank you for shopping with us!',
  },
};

// 2. Realistic Sample Data for Serialized Mobile Device Invoice (Type 2)
export const mockMobileOrder = {
  invoiceNumber: 'MOB-MAIN-202610-000491',
  createdAt: new Date().toISOString(),
  customer: { name: 'Tariq Mehmood', phone: '0322-8877665' },
  cashier: 'Admin (SHOP_ADMIN)',
  items: [
    {
      name: 'Xiaomi Redmi Note 13',
      qty: 1,
      salePrice: 48500,
      subtotal: 48500,
      imei: '864209061234567',
      specs: '256GB • 8GB RAM • Midnight Black',
    },
    {
      name: 'Infinix Hot 40 Pro',
      qty: 1,
      salePrice: 38000,
      subtotal: 38000,
      imei: '358912117654321',
      specs: '128GB • 8GB RAM • Palm Blue',
    },
  ],
  subtotal: 86500,
  discount: 1500,
  totalAmount: 85000,
  payments: [
    { method: 'CASH', amount: 50000 },
    { method: 'JAZZCASH', amount: 35000, reference: 'TXN-9812401' },
  ],
  paidAmount: 85000,
  changeAmount: 0,
  creditAmount: 0,
};

// 3. Realistic Sample Data for Purchase Invoice (Supplier Purchase)
export const mockPurchaseOrder = {
  invoiceNumber: 'PO-NMM-202610-0082',
  issuedAt: new Date().toISOString(),
  supplierName: 'Al-Madina Mobile Wholesale Traders',
  items: [
    { name: 'Samsung Galaxy A15 128GB Box Pack', quantity: 5, price: 38500, total: 192500 },
    { name: 'Vivo Y17s 6GB/128GB Box Pack', quantity: 3, price: 32000, total: 96000 },
    { name: 'Anker PowerBank 20,000mAh', quantity: 10, price: 5200, total: 52000 },
  ],
  subtotal: 340500,
  discount: 3500,
  tax: 0,
  grandTotal: 337000,
  paymentMethod: 'Bank Transfer',
};

// 4. Realistic Sample Data for Ledger Payment Receipt
export const mockPaymentRecord = {
  transactionId: 'RCP-202610-00318',
  createdAt: new Date().toISOString(),
  customerName: 'Kashif Electronics & Khata',
  description: 'Weekly Ledger Settlement (Partial Khata Clearance)',
  amount: 25000,
  debitAccount: 'Cash Counter 1',
};

// Backwards-compatible alias for existing mockInvoice exports
export const mockInvoice = mockSaleInvoice;

export const PrintPreview: React.FC = () => {
  const { settings, shopHeader, activeTemplate } = usePrinterStore();

  const previewHtml = useMemo(() => {
    if (!settings || !shopHeader) return '';

    const effectiveShop: ShopHeader = {
      ...shopHeader,
      returnPolicy: shopHeader.returnPolicy || mockSaleInvoice.shop.returnPolicy,
      warrantyInstructions: shopHeader.warrantyInstructions || mockSaleInvoice.shop.warrantyInstructions,
      footerText: shopHeader.footerText || mockSaleInvoice.shop.footerText,
    };

    switch (activeTemplate) {
      case 'MobileSaleInvoice':
        return printFormatter.formatMobileSaleInvoice(mockMobileOrder, settings, effectiveShop);

      case 'PurchaseInvoice':
        return printFormatter.formatPurchaseInvoice(mockPurchaseOrder, settings, effectiveShop);

      case 'PaymentReceipt':
        return printFormatter.formatPaymentReceipt(mockPaymentRecord, settings, effectiveShop);

      case 'SaleInvoice':
      default: {
        const previewInvoice: UnifiedInvoice = {
          ...mockSaleInvoice,
          shop: effectiveShop,
        };
        return printFormatter.formatSaleInvoice(previewInvoice, settings, effectiveShop);
      }
    }
  }, [settings, shopHeader, activeTemplate]);

  if (!settings || !shopHeader) return null;

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-6 flex justify-center overflow-auto min-h-[500px] border border-neutral-200 dark:border-neutral-700">
      <div className="bg-white shadow-xl relative my-2 border border-neutral-200" style={{ color: '#000' }}>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
};
