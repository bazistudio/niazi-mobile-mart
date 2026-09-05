import React, { useState, useMemo, useEffect } from 'react';
import { X, ReceiptText, Clock, User, CreditCard, Banknote, AlertCircle, ChevronDown, ChevronUp, Printer, Search, Copy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/services/sales.api';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';
import toast from 'react-hot-toast';

interface DailySalesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DailySalesModal = ({ isOpen, onClose }: DailySalesModalProps) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month'>('today');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const keys = useTenantQueryKeys();
  
  const searchParams = useSearchParams();
  const searchInvoice = searchParams.get('invoice');

  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();

  useEffect(() => {
    if (isOpen && !settings) {
      fetchSettings();
    }
  }, [isOpen, settings, fetchSettings]);

  const handleReprint = (order: any) => {
    const defaultSettings: any = settings || {
      enabled: true,
      printerType: 'THERMAL_80MM',
      paperSize: { width: '80mm' },
      layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
      font: { size: 12, family: 'monospace' },
      invoice: {
        showLogo: false,
        showShopInfo: true,
        showBarcode: true,
        showTax: true,
        showDiscount: true
      }
    };
    const defaultHeader: any = shopHeader || {
      name: 'Receipt',
      address: '',
      phone: '',
      footerText: 'Thank you!'
    };

    const html = printFormatter.formatSaleInvoice(order, defaultSettings, defaultHeader);
    openPreview({ html, documentType: 'SaleInvoice', referenceId: order._id, title: `Invoice - ${order.orderNumber || order.displayNumber}` });
  };

  useEffect(() => {
    if (searchInvoice && isOpen) {
      setSearchQuery(searchInvoice);
    }
  }, [searchInvoice, isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getDates = () => {
    const now = new Date();
    let start = now;
    if (dateFilter === 'week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (dateFilter === 'month') start = startOfMonth(now);
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  };

  const { startDate, endDate } = getDates();

  const { data: salesResponse, isLoading, error } = useQuery({
    queryKey: keys.sales(dateFilter, startDate, endDate, debouncedSearch),
    queryFn: () => {
      const cleanSearch = debouncedSearch.trim().toUpperCase().replace(/^ORD-/, '');
      const queryOrderNumber = cleanSearch ? `ORD-${cleanSearch}` : undefined;
      
      return salesApi.getOrders({ 
        startDate: queryOrderNumber ? undefined : startDate, 
        endDate: queryOrderNumber ? undefined : endDate,
        orderNumber: queryOrderNumber,
        limit: 500 
      });
    },
    enabled: isOpen,
    staleTime: 60000,
  });

  if (!isOpen) return null;

  const orders = salesResponse?.data || [];
  
  // We no longer filter on frontend since backend handles global search
  const totalSalesAmount = orders.reduce((sum: number, order: any) => sum + (order.grandTotal || order.totalAmount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
              Sales Report
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {orders.length} orders • Rs. {totalSalesAmount.toLocaleString()} total
            </p>
          </div>
          
          <div className="flex-1 flex justify-center">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden focus-within:ring-2 focus-within:ring-[#006970] dark:focus-within:ring-[#00B4BB] transition-shadow">
              <span className="pl-3 pr-1 text-sm font-medium text-gray-400 dark:text-gray-500 select-none">ORD-</span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="000027"
                className="py-1.5 pr-3 text-sm w-24 focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-700"
              />
              <div className="pr-3 text-gray-400">
                <Search className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-end gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#006970] dark:focus:ring-[#00B4BB] outline-none"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006970] dark:border-[#00B4BB] mb-4"></div>
              Loading sales data...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-500">
              <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
              Failed to load daily sales
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <ReceiptText className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">{searchQuery ? 'No matching invoices found' : 'No sales yet today'}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invoice #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {orders.map((order: any) => {
                    const isCredit = order.paymentMethod === 'credit';
                    const isCancelled = order.status === 'cancelled' || order.status === 'Cancelled';
                    
                    const isExpanded = expandedOrderId === order._id;
                    
                    return (
                      <React.Fragment key={order._id}>
                        <tr 
                          onClick={() => setExpandedOrderId(isExpanded ? null : order._id)}
                          className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                const inv = order.displayNumber || order.orderNumber;
                                const invToCopy = inv.replace(/^ORD-/i, '');
                                navigator.clipboard.writeText(invToCopy);
                                toast.success(`Copied ${invToCopy} to clipboard`);
                              }}
                              className="font-medium text-gray-900 dark:text-white hover:text-[#006970] dark:hover:text-[#00B4BB] transition-colors cursor-copy group flex items-center gap-1.5"
                              title="Click to copy"
                            >
                              {order.displayNumber || order.orderNumber}
                              <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 opacity-70" />
                              {format(new Date(order.createdAt), 'hh:mm a')}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 opacity-50" />
                              {order.partyId?.companyName || order.partyId?.name || order.partyId?.contactPerson || order.customerId?.name || 'Walk-in Customer'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-1.5">
                              {isCredit ? (
                                <CreditCard className="w-3.5 h-3.5 text-orange-500" />
                              ) : (
                                <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              <span className={isCredit ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                {isCredit ? 'Credit' : 'Cash'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white text-right">
                            Rs. {(order.grandTotal || order.totalAmount || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              isCancelled 
                                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            }`}>
                              {isCancelled ? 'Cancelled' : 'Completed'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            {isExpanded ? <ChevronUp className="w-5 h-5 mx-auto" /> : <ChevronDown className="w-5 h-5 mx-auto" />}
                          </td>
                        </tr>
                        
                        {isExpanded && (
                          <tr className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice Details</h4>
                                <button 
                                  onClick={() => handleReprint(order)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
                                >
                                  <Printer className="w-4 h-4" />
                                  Reprint Invoice
                                </button>
                              </div>
                              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Item</th>
                                      <th className="px-4 py-2 text-center font-medium text-gray-500 dark:text-gray-400">Qty</th>
                                      <th className="px-4 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Price</th>
                                      <th className="px-4 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {order.items?.map((item: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{item.productName || item.name}</td>
                                        <td className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">{item.quantity}</td>
                                        <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">Rs. {(item.salePrice || item.price || 0).toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">Rs. {(item.quantity * (item.salePrice || item.price || 0)).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
