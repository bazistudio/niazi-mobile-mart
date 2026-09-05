import React from 'react';
import { Phone, MessageCircle, Printer, CreditCard, Receipt } from 'lucide-react';
import { DBCustomer } from '@/types/db.types';
import { DocumentService } from '@/features/pos/services/document/document.service';
import { normalizePakPhone } from '@/utils/phoneUtils';

interface CustomerDetailPanelProps {
  customer: DBCustomer | null;
  totalInvoices: number;
  lastPayment: string;
  lastInvoice: string;
  onReceivePayment: () => void;
}

export const CustomerDetailPanel = ({ 
  customer, 
  totalInvoices, 
  lastPayment, 
  lastInvoice, 
  onReceivePayment 
}: CustomerDetailPanelProps) => {
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8 text-center bg-white dark:bg-gray-900">
        <CreditCard className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Customer Selected</h3>
        <p className="text-sm mt-1">Select a customer from the list to view their ledger details.</p>
      </div>
    );
  }

  const handleWhatsApp = () => {
    const phoneWithCode = normalizePakPhone(customer.mobile);
    const message = encodeURIComponent(
      `Assalam-o-Alaikum ${customer.name},\n\nYour current outstanding balance is Rs ${customer.currentBalance.toLocaleString()}.\nPlease clear your dues at your earliest convenience.\n\nThank you.`
    );
    window.open(`https://wa.me/${phoneWithCode}?text=${message}`, '_blank');
  };

  const handleExportPDF = async () => {
    try {
      // Reusing DocumentService html2canvas logic for the LedgerTable specifically
      await DocumentService.generateLedgerPDF('ledger-print-area', customer.name);
    } catch (err) {
      console.error('Failed to export PDF', err);
      alert('Failed to export PDF');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Phone className="w-4 h-4" />
            {customer.mobile}
          </div>
          
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Receipt className="w-3.5 h-3.5" /> Total Invoices
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">{totalInvoices}</p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <CreditCard className="w-3.5 h-3.5" /> Last Payment
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">{lastPayment}</p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Printer className="w-3.5 h-3.5" /> Last Invoice
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">{lastInvoice}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-4 shrink-0">
          <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 rounded-lg border border-gray-100 dark:border-gray-700 w-full md:w-auto text-left md:text-right">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Due</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
              Rs {customer.currentBalance.toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
            <button 
              onClick={onReceivePayment}
              className="flex items-center justify-center gap-2 bg-[#006970] hover:bg-[#00585e] text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              <CreditCard className="w-4 h-4" />
              Receive Payment
            </button>
            <button 
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              <Printer className="w-4 h-4" />
              <span className="sr-only sm:not-sr-only">Export PDF</span>
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
};
