'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Receipt, FileText, ArrowUpRight, ArrowDownLeft, Ticket, PackageCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { useLedger } from '@/features/ledger/hooks/useLedger';
import { CustomerSelector } from './CustomerSelector';
import { LedgerSettlementModal } from './modals/LedgerSettlementModal';
import { PosCustomerVoucherModal } from './modals/PosCustomerVoucherModal';
import { PosVoucherDeliveryModal } from './modals/PosVoucherDeliveryModal';
import { InvoicePreviewModal } from '@/features/history/components/InvoicePreviewModal';
import { HistoryItem } from '@/features/history/types/history.types';
import { useNavigate } from 'react-router-dom';
import { httpClient } from '@/lib/http/httpClient';
import toast from 'react-hot-toast';

interface PosCustomerLedgerPanelProps {
  isSaleSuccess?: boolean;
}

export interface CustomerVoucherRow {
  id: string;
  voucher_number: string;
  voucher_type: string;
  product_name: string;
  voucher_qty: number;
  delivered_qty: number;
  remaining_qty: number;
  voucher_sale_price: number;
  paid_amount: number;
  payment_status: string;
  status: string;
  created_at: string;
  branch_id: string;
  customer_name_snapshot?: string;
}

export const PosCustomerLedgerPanel: React.FC<PosCustomerLedgerPanelProps> = ({ isSaleSuccess }) => {
  const navigate = useNavigate();
  const activeSession = usePosStore((s) => s.saleTabs.find(t => t.id === s.activeTabId));

  const setCustomer = usePosStore((s) => s.setCustomer);

  const selectedCustomer = activeSession?.customer && activeSession.customer.id !== 'walk-in'
    ? activeSession.customer
    : null;

  // Ref forwarded into CustomerSelector so the Receive Payment button can focus
  // the search input directly when no customer is selected yet.
  const customerSearchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'LEDGER' | 'PENDING_VOUCHERS'>('LEDGER');
  const [isReceivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [isVoucherOpen, setVoucherOpen] = useState(false);
  const [deliveryTargetVoucher, setDeliveryTargetVoucher] = useState<CustomerVoucherRow | null>(null);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  // Vouchers state
  const [customerVouchers, setCustomerVouchers] = useState<CustomerVoucherRow[]>([]);
  const [isLoadingVouchers, setIsLoadingVouchers] = useState<boolean>(false);

  // Fetch real ledger timeline for selected customer
  const ledgerQueryArg = selectedCustomer
    ? {
        id: selectedCustomer.id,
        type: 'CUSTOMER' as const,
        name: selectedCustomer.name,
        balance: selectedCustomer.currentBalance ?? 0,
        creditLimit: selectedCustomer.creditLimit,
      }
    : null;

  const { timeline, statement, isLedgerLoading, refetchLedger } = useLedger(ledgerQueryArg);

  // Function to load pending vouchers for current customer
  const fetchCustomerVouchers = async () => {
    if (!selectedCustomer?.id) {
      setCustomerVouchers([]);
      return;
    }
    setIsLoadingVouchers(true);
    try {
      const res = await httpClient.get<CustomerVoucherRow[]>(
        `/api/v1/pos/vouchers?customer_id=${encodeURIComponent(selectedCustomer.id)}`
      );
      if (Array.isArray(res)) {
        setCustomerVouchers(res);
      } else {
        setCustomerVouchers([]);
      }
    } catch (err) {
      console.error('[PosCustomerLedgerPanel] Failed to fetch customer vouchers:', err);
    } finally {
      setIsLoadingVouchers(false);
    }
  };

  useEffect(() => {
    if (selectedCustomer?.id) {
      fetchCustomerVouchers();
    } else {
      setCustomerVouchers([]);
    }
  }, [selectedCustomer?.id]);

  // Derive authoritative live balance: only applicable when a real customer is selected
  const authoritativeBalance = selectedCustomer
    ? (selectedCustomer.currentBalance !== undefined
        ? selectedCustomer.currentBalance
        : (typeof statement?.current_balance === 'number' ? statement.current_balance : 0))
    : 0;

  // Synchronize store customer balance if ledger returns authoritative balance and store lacked it
  React.useEffect(() => {
    if (
      selectedCustomer &&
      selectedCustomer.currentBalance === undefined &&
      statement &&
      typeof statement.current_balance === 'number'
    ) {
      setCustomer({
        ...selectedCustomer,
        currentBalance: statement.current_balance,
      });
    }
  }, [selectedCustomer, statement, setCustomer]);

  // Recent 5 entries for mini statement table
  const recentEntries = timeline.slice(0, 5);

  const pendingVouchers = customerVouchers.filter((v) => {
    const remaining = v.remaining_qty > 0 ? v.remaining_qty : (v.voucher_qty - v.delivered_qty);
    return v.status !== 'CANCELLED' && remaining > 0;
  });

  return (
    <div
      className={`flex flex-col h-full min-h-0 bg-surface border border-border rounded-xl shadow-card p-3 gap-3 overflow-hidden transition-all duration-500 ${
        isSaleSuccess ? 'pos-animated-border-green' : 'pos-animated-border-blue'
      }`}
    >
      {/* 1. Header & Customer Search Bar */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-primary" />
            Customer & Ledger Panel
          </span>
        </div>

        {/* Inline Customer / Invoice Selector (replaces CreditCustomerModal) */}
        <CustomerSelector searchOnly inputFocusRef={customerSearchInputRef} />
      </div>

      {/* 2. Customer Details Card */}
      <div className="bg-surface-hover/50 border border-border/80 rounded-xl p-3 shrink-0 flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted block">
              Customer Name
            </span>
            <span className="text-sm font-black text-text-primary block truncate max-w-[180px]">
              {selectedCustomer ? selectedCustomer.name : 'Walk-In Customer'}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted block">
              Phone
            </span>
            <span className="text-xs font-bold text-text-secondary tabular-nums">
              {selectedCustomer?.phone || selectedCustomer?.mobile || '—'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted block">
              Credit Limit
            </span>
            <span className="text-xs font-bold text-text-primary tabular-nums">
              {selectedCustomer?.creditLimit !== undefined
                ? `PKR ${selectedCustomer.creditLimit.toLocaleString()}`
                : '—'}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted block">
              Current Balance
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span
                className={`text-xs font-black tabular-nums ${
                  authoritativeBalance > 0
                    ? 'text-danger'
                    : authoritativeBalance < 0
                    ? 'text-primary'
                    : 'text-emerald-600'
                }`}
              >
                PKR {Math.abs(authoritativeBalance).toLocaleString()}
              </span>
              {authoritativeBalance > 0 ? (
                <span className="px-1 py-0.2 rounded text-[9px] font-black uppercase bg-danger/10 text-danger border border-danger/20">
                  Outstanding
                </span>
              ) : authoritativeBalance < 0 ? (
                <span className="px-1 py-0.2 rounded text-[9px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                  Advance
                </span>
              ) : selectedCustomer ? (
                <span className="px-1 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  Settled
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Tabbed Ledger Statement / Pending Vouchers Panel */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface border border-border/80 rounded-xl overflow-hidden shadow-xs">
        {/* Navigation Tabs */}
        <div className="px-2 pt-1.5 border-b border-border/80 bg-surface-hover/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('LEDGER')}
              className={`px-2.5 py-1 rounded-t-lg text-[10px] font-black uppercase tracking-wider transition-all border-b-2 ${
                activeTab === 'LEDGER'
                  ? 'border-primary text-primary bg-surface'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Ledger Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PENDING_VOUCHERS')}
              className={`px-2.5 py-1 rounded-t-lg text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
                activeTab === 'PENDING_VOUCHERS'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-surface'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              <span>Pending Vouchers</span>
              {pendingVouchers.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-indigo-500 text-white">
                  {pendingVouchers.length}
                </span>
              )}
            </button>
          </div>

          {selectedCustomer && (
            <button
              type="button"
              onClick={() => {
                refetchLedger();
                fetchCustomerVouchers();
              }}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 pb-1"
              title="Refresh Customer Ledger & Vouchers"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Tab 1: Ledger Statement */}
        {activeTab === 'LEDGER' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Ledger Table Header */}
            <div className="grid grid-cols-12 px-2.5 py-1.5 border-b border-border text-[9px] font-black text-text-muted uppercase tracking-wider bg-surface-hover/30 shrink-0">
              <div className="col-span-3">Date</div>
              <div className="col-span-3">Ref #</div>
              <div className="col-span-2 text-right">Debit</div>
              <div className="col-span-2 text-right">Credit</div>
              <div className="col-span-2 text-right">Bal</div>
            </div>

            {/* Ledger Table Rows */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {!selectedCustomer ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <Receipt className="w-8 h-8 opacity-25 mb-1.5" />
                  <p className="text-xs font-semibold text-text-secondary">No Customer Selected</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Press <kbd className="px-1 py-0.2 rounded bg-surface border border-border font-mono text-[9px]">F2</kbd> to pick a customer to view their live ledger.
                  </p>
                </div>
              ) : isLedgerLoading ? (
                <div className="h-full flex items-center justify-center py-6 text-xs text-text-muted">
                  Loading customer ledger...
                </div>
              ) : recentEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <FileText className="w-8 h-8 opacity-25 mb-1.5" />
                  <p className="text-xs font-medium">No previous transactions found</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentEntries.map((row, idx) => {
                    const dateFormatted = new Date(row.timestamp).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    });
                    return (
                      <div
                        key={row.id || `${row.transactionId}-${idx}`}
                        className="grid grid-cols-12 px-2.5 py-1.5 text-[11px] items-center hover:bg-surface-hover/50 transition-colors"
                      >
                        <div className="col-span-3 text-text-muted font-medium">{dateFormatted}</div>
                        <div className="col-span-3 flex items-center gap-1 truncate" title={row.transactionId}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const isSale = row.type !== "payment" && row.debitAccount === "receivable";
                              const currentBal = typeof row.runningBalance === 'number' ? row.runningBalance : 0;
                              const payAmt = row.amount || 0;
                              const prevBal = isSale ? (currentBal - payAmt) : (currentBal + payAmt);
                              setPreviewItem({
                                id: row.reference_id || row.transactionId || row.id,
                                referenceId: row.transactionId || row.id,
                                type: isSale ? "sale" : "payment",
                                party: { id: selectedCustomer?.id || "", name: selectedCustomer?.name || "", type: "customer" },
                                amount: payAmt,
                                status: "paid",
                                source: "pos",
                                branchId: activeSession?.branchId || "",
                                items: [],
                                paymentMethod: "cash",
                                receivedAmount: payAmt,
                                changeAmount: 0,
                                subtotal: payAmt,
                                total: payAmt,
                                previousBalance: prevBal,
                                currentBalance: currentBal,
                                createdAt: new Date(row.timestamp).toISOString(),
                              });
                            }}
                            className="font-mono font-bold text-primary hover:underline hover:text-primary-focus flex items-center gap-0.5 text-[10px]"
                            title="Click for Invoice Details"
                          >
                            <FileText className="w-3 h-3 shrink-0 text-text-muted hover:text-primary" />
                            <span className="truncate">{row.transactionId}</span>
                          </button>
                        </div>
                        <div className="col-span-2 text-right font-semibold text-text-primary tabular-nums">
                          {row.debit > 0 ? row.debit.toLocaleString() : '—'}
                        </div>
                        <div className="col-span-2 text-right font-semibold text-emerald-600 tabular-nums">
                          {row.credit > 0 ? row.credit.toLocaleString() : '—'}
                        </div>
                        <div className="col-span-2 text-right font-black text-text-primary tabular-nums">
                          {row.runningBalance.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Pending Vouchers / Advance Deliveries */}
        {activeTab === 'PENDING_VOUCHERS' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-2.5 py-1.5 border-b border-border text-[9px] font-black text-text-muted uppercase tracking-wider bg-surface-hover/30 shrink-0">
              <div className="col-span-3">Voucher #</div>
              <div className="col-span-4">Product</div>
              <div className="col-span-2 text-center">Remaining</div>
              <div className="col-span-3 text-right">Action</div>
            </div>

            {/* Vouchers List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {!selectedCustomer ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <Ticket className="w-8 h-8 opacity-25 mb-1.5" />
                  <p className="text-xs font-semibold text-text-secondary">No Customer Selected</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Select a customer to view their pending vouchers & bookings.
                  </p>
                </div>
              ) : isLoadingVouchers ? (
                <div className="h-full flex items-center justify-center py-6 text-xs text-text-muted">
                  Loading customer vouchers...
                </div>
              ) : pendingVouchers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center text-text-muted">
                  <PackageCheck className="w-8 h-8 opacity-25 mb-1.5" />
                  <p className="text-xs font-medium">No pending vouchers for this customer</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    All advance bookings have been delivered or settled.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {pendingVouchers.map((v) => {
                    const remaining = v.remaining_qty > 0 ? v.remaining_qty : (v.voucher_qty - v.delivered_qty);
                    return (
                      <div
                        key={v.id}
                        className="grid grid-cols-12 px-2.5 py-2 text-[11px] items-center hover:bg-surface-hover/50 transition-colors"
                      >
                        <div className="col-span-3 font-mono font-bold text-text-primary truncate" title={v.voucher_number}>
                          {v.voucher_number}
                        </div>
                        <div className="col-span-4 truncate">
                          <span className="font-bold text-text-primary block truncate" title={v.product_name}>
                            {v.product_name}
                          </span>
                          <span className="text-[9px] text-text-muted block">
                            Type: {v.voucher_type}
                          </span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="px-1.5 py-0.5 rounded font-black text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 tabular-nums">
                            {remaining} / {v.voucher_qty}
                          </span>
                        </div>
                        <div className="col-span-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDeliveryTargetVoucher(v)}
                            className="px-2 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[10px] font-black transition-colors flex items-center justify-center gap-1 ml-auto shadow-2xs"
                            title="Deliver Booked Units"
                          >
                            <PackageCheck className="w-3 h-3" />
                            <span>Deliver</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {previewItem && (
        <InvoicePreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Delivery Confirmation Modal */}
      {deliveryTargetVoucher && (
        <PosVoucherDeliveryModal
          voucher={deliveryTargetVoucher}
          onClose={() => setDeliveryTargetVoucher(null)}
          onSuccess={() => {
            setDeliveryTargetVoucher(null);
            fetchCustomerVouchers();
            refetchLedger();
          }}
        />
      )}

      {/* 4. Bottom Panel Actions — Receive Payment, Voucher, View Statement */}
      <div className="grid grid-cols-3 gap-1.5 pt-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (!selectedCustomer) {
              customerSearchInputRef.current?.focus();
            } else {
              setReceivePaymentOpen(true);
            }
          }}
          className="h-9 px-2 rounded-xl border border-border bg-surface text-text-primary hover:bg-surface-hover hover:border-primary/50 text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1"
          title="Receive Payment against Customer Khata"
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">Receive Payment</span>
        </button>

        <button
          type="button"
          id="pos-btn-customer-voucher"
          onClick={() => setVoucherOpen(true)}
          className="h-9 px-2 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-[11px] font-black transition-all shadow-xs flex items-center justify-center gap-1"
          title="Issue Advance Deposit or Pre-booking Voucher"
        >
          <Ticket className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">Voucher</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedCustomer) {
              navigate(`/dashboard/shop-admin/customers?search=${encodeURIComponent(selectedCustomer.name)}`);
            } else {
              navigate('/dashboard/shop-admin/customers');
            }
          }}
          className="h-9 px-2 rounded-xl border border-border bg-surface text-text-primary hover:bg-surface-hover hover:border-primary/50 text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1"
          title="View Full Customer Statement & History"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">View Statement</span>
        </button>
      </div>

      {/* Customer Voucher Issuance Modal */}
      {isVoucherOpen && (
        <PosCustomerVoucherModal
          customer={selectedCustomer as any}
          onClose={() => setVoucherOpen(false)}
          onSuccess={() => {
            setVoucherOpen(false);
            fetchCustomerVouchers();
            refetchLedger();
          }}
        />
      )}

      {/* Receive Payment / Settle Balance Modal */}
      {isReceivePaymentOpen && selectedCustomer && (
        <LedgerSettlementModal
          customer={selectedCustomer as any}
          invoiceTotal={0}
          standaloneMode
          onClose={() => setReceivePaymentOpen(false)}
          onSuccess={() => {
            setReceivePaymentOpen(false);
            refetchLedger();
          }}
        />
      )}
    </div>
  );
};
