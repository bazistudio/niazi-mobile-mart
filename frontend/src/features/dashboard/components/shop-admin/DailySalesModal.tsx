import React, { useState, useMemo, useEffect } from 'react';
import { X, ReceiptText, Clock, User, CreditCard, Banknote, AlertCircle, ChevronDown, ChevronUp, Printer, Search, Copy, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { salesApi, type MappedSaleOrder } from '@/services/sales.api';
import { returnsApi } from '@/services/returns.api';
import type { SalesReturn } from '@/lib/tauri/tauriClient';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { queryKeys } from '@/lib/react-query/queryKeys';
import toast from 'react-hot-toast';

import { useOrganizationStore } from '@/store/useOrganizationStore';

interface DailySalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId?: string | null;
}

// Unified type-safe row types for the merged sales + returns table (no any bypass)
export type SaleRow = { kind: 'sale'; data: MappedSaleOrder };
export type ReturnRow = { kind: 'return'; data: SalesReturn };
export type TableRow = SaleRow | ReturnRow;

export const DailySalesModal = ({ isOpen, onClose, branchId: propBranchId }: DailySalesModalProps) => {
  // Use prop if supplied, else fallback to store activeShopId
  const storeBranchId = useOrganizationStore((s) => s.activeShopId || s.activeShop?._id || null);
  const effectiveBranchId = propBranchId !== undefined ? propBranchId : storeBranchId;

  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month'>('today');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [orderDetailsMap, setOrderDetailsMap] = useState<Record<string, any>>({});
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [orderErrorMap, setOrderErrorMap] = useState<Record<string, string>>({});
  
  const [searchParams] = useSearchParams();
  const searchInvoice = searchParams.get('invoice');

  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings, isHydrated } = usePrinterStore();

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen, fetchSettings]);

  const fetchOrderDetails = async (orderId: string): Promise<any | null> => {
    if (orderDetailsMap[orderId]) return orderDetailsMap[orderId];
    try {
      setLoadingOrderId(orderId);
      setOrderErrorMap(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      const res = await salesApi.getOrderById(orderId);
      if (res?.success && res.order) {
        setOrderDetailsMap(prev => ({ ...prev, [orderId]: res.order }));
        return res.order;
      } else {
        setOrderErrorMap(prev => ({ ...prev, [orderId]: 'Failed to load line items.' }));
        return null;
      }
    } catch (err: any) {
      setOrderErrorMap(prev => ({ ...prev, [orderId]: err?.message || 'Error loading invoice lines.' }));
      return null;
    } finally {
      setLoadingOrderId(null);
    }
  };

  const toggleExpandOrder = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    if (!orderDetailsMap[orderId]) {
      await fetchOrderDetails(orderId);
    }
  };

  const handleReprint = async (order: any) => {
    if (!isHydrated) {
      toast.error('Printer settings not ready. Please wait and try again.');
      return;
    }
    let orderToPrint = orderDetailsMap[order._id || order.id];
    if (!orderToPrint || !orderToPrint.items || orderToPrint.items.length === 0) {
      toast.loading('Fetching invoice lines for reprint...', { id: 'reprint-load' });
      orderToPrint = await fetchOrderDetails(order._id || order.id);
      toast.dismiss('reprint-load');
      if (!orderToPrint) {
        toast.error('Could not load complete invoice for reprint.');
        return;
      }
    }

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

    const hasMobileLines = orderToPrint.items && orderToPrint.items.some((i: any) => i.lineType === 'MOBILE' || i.imei);
    const html = hasMobileLines
      ? printFormatter.formatMobileSaleInvoice(orderToPrint, defaultSettings, defaultHeader)
      : printFormatter.formatSaleInvoice(orderToPrint, defaultSettings, defaultHeader);
    const docType = hasMobileLines ? 'MobileSaleInvoice' : 'SaleInvoice';
    openPreview({ html, documentType: docType as any, referenceId: orderToPrint._id || orderToPrint.id, title: `Invoice - ${orderToPrint.orderNumber || orderToPrint.displayNumber}` });
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
    let start = new Date(now);
    if (dateFilter === 'week') start = startOfWeek(now, { weekStartsOn: 1 });
    if (dateFilter === 'month') start = startOfMonth(now);

    const toLocalDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      startDate: toLocalDateStr(start),
      endDate: toLocalDateStr(now),
    };
  };

  const { startDate, endDate } = getDates();

  const { data: salesResponse, isLoading, error } = useQuery({
    queryKey: queryKeys.sales(effectiveBranchId, dateFilter, startDate, endDate, debouncedSearch),
    queryFn: () => {
      const cleanSearch = debouncedSearch.trim();
      return salesApi.getOrders({
        startDate,
        endDate,
        orderNumber: cleanSearch || undefined,
        limit: 500,
        branchId: effectiveBranchId || undefined,
      });
    },
    enabled: isOpen,
    staleTime: 0,
  });

  // DASHBOARD-KPI-PHASE3: Fetch completed cash returns for the same date range
  // so they appear as distinct negative entries in the Daily Sales Summary.
  const { data: returnsResponse, isLoading: isLoadingReturns } = useQuery({
    queryKey: ['daily-sales-modal-returns', effectiveBranchId, dateFilter, startDate, endDate],
    queryFn: () =>
      returnsApi.listSalesReturns({
        start_date: startDate,
        end_date: endDate,
        branch_id: effectiveBranchId || undefined,
        status: 'COMPLETED',
        limit: 500,
      }),
    enabled: isOpen,
    staleTime: 0,
  });

  const rawOrders = salesResponse?.data || [];

  const orders = useMemo<MappedSaleOrder[]>(() => {
    if (!rawOrders || rawOrders.length === 0) return [];
    if (debouncedSearch.trim()) return rawOrders;
    return (rawOrders as MappedSaleOrder[]).filter((o) => {
      if (!o.createdAt) return true;
      const d = new Date(o.createdAt);
      const orderDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return orderDateStr >= startDate && orderDateStr <= endDate;
    });
  }, [rawOrders, startDate, endDate, debouncedSearch]);

  // DASHBOARD-KPI-PHASE3: completed returns in the period (no search filter —
  // return numbers use a different prefix pattern than ORD- orders)
  const returns = useMemo<SalesReturn[]>(() => {
    if (!returnsResponse || !Array.isArray(returnsResponse)) return [];
    return (returnsResponse as SalesReturn[]).filter((r) => r.status === 'COMPLETED');
  }, [returnsResponse]);

  // Merge sales and returns into a single chronological list (most-recent first)
  // Hook declared unconditionally before any early returns to satisfy React Rules of Hooks
  const allRows: TableRow[] = useMemo(() => {
    const rows: TableRow[] = [
      ...orders.map((o): SaleRow => ({ kind: 'sale', data: o })),
      ...returns.map((r): ReturnRow => ({ kind: 'return', data: r })),
    ];
    rows.sort((a, b) => {
      const aTime = new Date(a.kind === 'sale' ? a.data.createdAt : a.data.created_at).getTime();
      const bTime = new Date(b.kind === 'sale' ? b.data.createdAt : b.data.created_at).getTime();
      return bTime - aTime; // descending
    });
    return rows;
  }, [orders, returns]);

  if (!isOpen) return null;

  const totalSalesAmount = orders.reduce((sum: number, order: MappedSaleOrder) => sum + (order.grandTotal || order.totalAmount || 0), 0);
  const totalReturnedAmount = returns.reduce((sum: number, r: SalesReturn) => sum + (r.total_amount || 0), 0);
  const netTotal = totalSalesAmount - totalReturnedAmount;

  const isAnyLoading = isLoading || isLoadingReturns;

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
            {/* DASHBOARD-KPI-PHASE3: subtitle shows sales, returns, and net total */}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {orders.length} {orders.length === 1 ? 'sale' : 'sales'}
              {returns.length > 0 && (
                <> • <span className="text-red-500 dark:text-red-400">{returns.length} {returns.length === 1 ? 'return' : 'returns'}</span></>
              )}
              {' '}• Rs.{' '}
              <span className={netTotal < totalSalesAmount ? 'text-amber-600 dark:text-amber-400' : ''}>
                {netTotal.toLocaleString()}
              </span>{' '}net
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
          {isAnyLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006970] dark:border-[#00B4BB] mb-4"></div>
              Loading sales data...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-500">
              <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
              Failed to load daily sales
            </div>
          ) : allRows.length === 0 ? (
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
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {allRows.map((row: TableRow) => {
                    // ── RETURN ROW ────────────────────────────────────────────
                    if (row.kind === 'return') {
                      const r = row.data;
                      const rowKey = `ret-${r.id}`;
                      const origOrder = orders.find((o) => (o.id || o._id) === r.sale_id);
                      const origInvoiceNumber = origOrder?.orderNumber || origOrder?.invoiceNumber || origOrder?.displayNumber;
                      return (
                        <tr
                          key={rowKey}
                          className="bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-1.5">
                              <RotateCcw className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0" />
                              <div>
                                <span className="font-medium text-red-700 dark:text-red-400 block">
                                  {r.return_number || r.id?.slice(0, 8)}
                                </span>
                                {origInvoiceNumber && (
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                                    inv: {origInvoiceNumber.replace(/^ORD-/i, '')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 opacity-70" />
                              {r.created_at ? format(new Date(r.created_at), 'hh:mm a') : '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 opacity-50" />
                              {r.customer_name_snapshot || 'Walk-in Customer'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-1.5">
                              <RotateCcw className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                              <span className="text-red-600 dark:text-red-400">Cash Return</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-red-600 dark:text-red-400 text-right">
                            −Rs. {(r.total_amount || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                              Returned
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-300 dark:text-gray-700">
                            {/* Returns have no expandable detail panel */}
                            —
                          </td>
                        </tr>
                      );
                    }

                    // ── SALE ROW ──────────────────────────────────────────────
                    const order = row.data;
                    const isCredit =
                      order.paymentMethod === 'credit' ||
                      order.paymentMethod === 'CREDIT' ||
                      order.paymentMethod === 'debit' ||
                      order.paymentMethod === 'debt' ||
                      order.paymentStatus === 'UNPAID' ||
                      order.paymentStatus === 'PARTIALLY_PAID' ||
                      (order.paidAmount !== undefined && order.paidAmount < (order.grandTotal || order.totalAmount || 0));
                    const isCancelled = order.status === 'cancelled' || order.status === 'Cancelled';
                    
                    const isExpanded = expandedOrderId === order._id;
                    
                    return (
                      <React.Fragment key={order._id}>
                        <tr 
                          onClick={() => toggleExpandOrder(order._id || order.id)}
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
                              {order.partyId?.companyName || order.partyId?.name || order.partyId?.contactPerson || (typeof order.customerId === 'object' ? order.customerId?.name : null) || order.customerName || order.customer_name_snapshot || 'Walk-in Customer'}
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
                        
                        {isExpanded && (() => {
                          const oid = order._id || order.id;
                          const detail = orderDetailsMap[oid];
                          const isLoadingDetail = loadingOrderId === oid;
                          const errorDetail = orderErrorMap[oid];
                          const items = detail?.items || [];

                          return (
                          <tr className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                  Invoice Details {detail?.orderNumber ? `(${detail.orderNumber})` : ''}
                                </h4>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReprint(order);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
                                >
                                  <Printer className="w-4 h-4" />
                                  Reprint Invoice
                                </button>
                              </div>

                              {isLoadingDetail && (
                                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 italic bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                                  Loading complete invoice lines...
                                </div>
                              )}

                              {errorDetail && !isLoadingDetail && (
                                <div className="flex items-center gap-2 p-3 mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs border border-amber-200 dark:border-amber-900">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>{errorDetail}</span>
                                </div>
                              )}

                              {!isLoadingDetail && !errorDetail && items.length === 0 && (
                                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                                  No line items found for this invoice.
                                </div>
                              )}

                              {!isLoadingDetail && items.length > 0 && (
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
                                      {items.map((item: any, idx: number) => {
                                        const qty = item.quantity || item.qty || 1;
                                        const price = item.salePrice ?? item.price ?? item.unitPrice ?? 0;
                                        const lineTotal = item.subtotal ?? item.lineTotal ?? (qty * price);
                                        return (
                                          <tr key={item.id || idx}>
                                            <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                              <div className="font-semibold">{item.productName || item.name || 'Mobile Handset / Item'}</div>
                                              {item.specs && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{item.specs}</div>
                                              )}
                                              {item.imei && (
                                                <div className="text-xs font-mono text-gray-500 dark:text-gray-400">IMEI: {item.imei}</div>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">{qty}</td>
                                            <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">Rs. {price.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">Rs. {lineTotal.toLocaleString()}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })()}
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
