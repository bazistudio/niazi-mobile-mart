'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, Banknote, Printer, Tag, Sparkles } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { DocumentService } from '../services/document/document.service';
import toast from 'react-hot-toast';
import { CreditCustomerModal } from './modals/CreditCustomerModal';
import { LedgerSettlementModal } from './modals/LedgerSettlementModal';
import { MultiPaymentModal } from './MultiPaymentModal';
import { DiscountModal } from './DiscountModal';
import { DBCustomer } from '@/types/db.types';
import { CustomerSelector } from './CustomerSelector';
import { customerApi } from '@/services/customer.api';
import { CreditLimitWarningModal } from './modals/CreditLimitWarningModal';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { GlobalLoadingOverlay } from '@/components/ui/GlobalLoadingOverlay';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { CashSessionOpenModal } from '@/features/cash';
import { ExchangeSettlementModal } from './modals/ExchangeSettlementModal';
import { ExchangeResultSummaryModal } from './modals/ExchangeResultSummaryModal';

export const CartSummary: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isCashOpenModalOpen, setCashOpenModalOpen] = useState(false);

  const clearCart = usePosStore((s) => s.clearCart);
  const activeSession = usePosStore((s) => s.saleTabs.find(t => t.id === s.activeTabId));
  const setSessionMode = usePosStore((s) => s.setSessionMode);
  const setInvoiceDiscount = usePosStore((s) => s.setInvoiceDiscount);
  const completeTransaction = usePosStore((s) => s.completeTransaction);
  const setCheckoutIdempotencyKey = usePosStore((s) => s.setCheckoutIdempotencyKey);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const processCashReturn = usePosStore((s) => s.processCashReturn);

  const { settings, shopHeader, fetchSettings } = usePrinterStore();

  useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [isLedgerModalOpen, setLedgerModalOpen] = useState(false);
  const [isMultiPaymentOpen, setMultiPaymentOpen] = useState(false);
  const [isDiscountModalOpen, setDiscountModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'sale' | 'print' | null>(null);

  // GAP-03: Exchange settlement modal state
  const [isExchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [pendingExchangeShouldPrint, setPendingExchangeShouldPrint] = useState(false);
  
  const selectedCustomer = activeSession?.customer && activeSession.customer.id !== 'walk-in'
    ? activeSession.customer
    : null;

  const [pendingTransaction, setPendingTransaction] = useState<{
    paymentBreakdown: { method: string; amount: number }[];
    customerObj: { id: string; name: string } | null;
    shouldPrint: boolean;
    projectedBalance: number;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  // Editable Total Due States
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [editedTotal, setEditedTotal] = useState('');

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Delete : Clear Cart
      if (e.ctrlKey && e.key === 'Delete') {
        e.preventDefault();
        handleClearCart();
      }
      // Ctrl + S : Cash Sale
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleCashSale();
      }
      // Ctrl + P or F12 : Pay & Print
      if ((e.ctrlKey && e.key.toLowerCase() === 'p') || e.key === 'F12') {
        e.preventDefault();
        handlePayAndPrint();
      }
      // Ctrl + L : Handled globally by lock terminal
      // F2 : Customer Search
      if (e.key === 'F2') {
        e.preventDefault();
        setCustomerModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSession?.cart?.length, activeSession?.returnedItems?.length]);

  if (!activeSession) return null;

  const cart = activeSession.cart ?? [];
  const returnedItems = activeSession.returnedItems ?? [];
  const isCartEmpty = cart.length === 0 && returnedItems.length === 0;

  // Render-time display calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const returnTotal = returnedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const preDiscountTotal = subtotal - returnTotal;
  let invoiceDiscountAmount = 0;
  if (activeSession.invoiceDiscountType === 'percentage') {
    invoiceDiscountAmount = Math.max(0, preDiscountTotal) * ((activeSession.invoiceDiscountValue || 0) / 100);
  } else {
    invoiceDiscountAmount = activeSession.invoiceDiscountValue || 0;
  }
  const grandTotal = preDiscountTotal - invoiceDiscountAmount;

  // GAP-02: If no linked invoice, open InvoiceLookupModal so the cashier can select
  // the original sale. If an invoice is already linked, proceed directly with cash return.
  const handleCashReturn = async () => {
    if (!activeSession) return;
    if (!activeSession.linkedInvoiceId) {
      // No invoice linked — guide the cashier to select one first.
      window.dispatchEvent(new CustomEvent('pos:open-invoice-lookup', { detail: { heading: 'Select Sale Invoice for Cash Return' } }));
      toast('Select the original sale invoice to proceed with Cash Return.', { icon: '🔍' });
      return;
    }
    if (activeSession.cart.length === 0 && (!activeSession.returnedItems || activeSession.returnedItems.length === 0)) {
      toast.error('Add items to return before processing a Cash Return.');
      return;
    }
    try {
      await processCashReturn();
    } catch {
      // processCashReturn already toasts on error
    }
  };

  const handleClearCart = () => {
    if (isCartEmpty) return;
    if (window.confirm('Are you sure you want to clear the current sale tab?')) {
      clearCart();
      toast.success('Cart cleared');
    }
  };

  // GAP-03: In replace mode with returned items, always show exchange settlement first.
  const handleCashSale = () => {
    if (isCartEmpty) {
      toast.error('Cart is empty');
      return;
    }

    if (activeSession.mode === 'replace' && returnedItems.length > 0) {
      setPendingExchangeShouldPrint(false);
      setExchangeModalOpen(true);
      return;
    }

    if (selectedCustomer) {
      setPendingAction('sale');
      setLedgerModalOpen(true);
      return;
    }

    setPendingAction('sale');
    setMultiPaymentOpen(true);
  };

  // GAP-03: Same interception for Pay & Print.
  const handlePayAndPrint = () => {
    if (isCartEmpty) {
      toast.error('Cart is empty');
      return;
    }

    if (activeSession.mode === 'replace' && returnedItems.length > 0) {
      setPendingExchangeShouldPrint(true);
      setExchangeModalOpen(true);
      return;
    }

    if (selectedCustomer) {
      setPendingAction('print');
      setLedgerModalOpen(true);
      return;
    }

    setPendingAction('print');
    setMultiPaymentOpen(true);
  };

  const triggerReceiptPrint = async (orderData: any, targetCustomer: { id: string; name: string } | null) => {
    if (!orderData) return;
    try {
      const activeShop = useOrganizationStore.getState().activeShop;
      const realShopProfile = {
        name: shopHeader?.name || activeShop?.name || 'Niazi Mobile Mart',
        address: shopHeader?.address || (activeShop as any)?.address || 'Main Branch',
        phone1: shopHeader?.phone || (activeShop as any)?.phone || '',
      };
      const authUser = useAuthStore.getState().user;
      const invoiceExtras = {
        customer: targetCustomer ?? null,
        cashier: authUser?.name ?? null,
      };
      const mappedTransaction: any = {
        transactionId: orderData.orderNumber || orderData.transactionId || orderData._id || `TXN-${Date.now()}`,
        items:
          orderData.items?.map((i: any) => ({
            productName: i.name || i.productName || 'Item',
            quantity: i.quantity || 1,
            unitPrice: i.price || i.unitPrice || 0,
            discount: i.discount || 0,
            subtotal: (i.price || i.unitPrice || 0) * (i.quantity || 1),
          })) || [],
        subtotal: orderData.subtotal || 0,
        discountTotal: orderData.discountAmount || orderData.discountTotal || 0,
        grandTotal: orderData.totalAmount || orderData.grandTotal || 0,
        totalPaid: orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || orderData.grandTotal || 0),
        remainingDue: orderData.creditAmount ?? Math.max((orderData.totalAmount || 0) - (orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || 0)), 0),
        changeReturned: orderData.changeAmount ?? 0,
        paymentBreakdown: (orderData.payments && orderData.payments.length > 0)
          ? orderData.payments.map((p: any) => ({ method: p.payment_method || p.method || 'cash', amount: p.amount || 0 }))
          : [{ method: orderData.paymentMethod || 'cash', amount: orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || orderData.grandTotal || 0) }],
        createdAt: orderData.createdAt || Date.now(),
      };
      const invoice = DocumentService.buildInvoice(mappedTransaction as any, realShopProfile as any, invoiceExtras);
      usePosStore.getState().setLastInvoice(invoice);
      await DocumentService.logPrint(invoice.invoiceId, 'PRINT');
    } catch (printErr) {
      console.error('Failed to trigger receipt print:', printErr);
    }
  };

  // GAP-03: Called by ExchangeSettlementModal onConfirm.
  // Routes to atomic exchange backend endpoint (returns + replacement sale in 1 transaction)
  const processExchange = usePosStore((s) => s.processExchange);
  // F-04: server-authoritative exchange result
  const lastExchangeResult = usePosStore((s) => s.lastExchangeResult);
  const clearLastExchangeResult = usePosStore((s) => s.clearLastExchangeResult);
  const handleExchangeConfirm = async (options?: { refundMethod?: 'CASH' | 'CREDIT' }) => {
    setExchangeModalOpen(false);

    // If customer owes positive difference, collect payment via MultiPaymentModal if not already paid
    if (grandTotal > 0) {
      setPendingAction(pendingExchangeShouldPrint ? 'print' : 'sale');
      setMultiPaymentOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await processExchange({
        refundMethod: options?.refundMethod,
      });
      toast.success('Exchange processed successfully.');
      window.dispatchEvent(new CustomEvent('pos:sale-completed'));
      if (pendingExchangeShouldPrint && res?.order) {
        await triggerReceiptPrint(res.order, selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null);
      }
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('cash session') || msg.includes('open a cash session') || msg.includes('till')) {
        setCashOpenModalOpen(true);
      } else {
        toast.error(error?.message || 'Exchange failed to process');
      }
    } finally {
      setIsProcessing(false);
      setPendingExchangeShouldPrint(false);
    }
  };

  const handleMultiPaymentConfirm = async (
    paymentBreakdown: { method: string; amount: number }[],
    shouldPrint: boolean = false
  ) => {
    setMultiPaymentOpen(false);

    if (activeSession.mode === 'replace' && (activeSession.returnedItems?.length ?? 0) > 0) {
      setIsProcessing(true);
      try {
        const res = await processExchange({
          paymentBreakdown,
        });
        toast.success('Exchange processed successfully.');
        window.dispatchEvent(new CustomEvent('pos:sale-completed'));
        if (shouldPrint || pendingAction === 'print') {
          if (res?.order) {
            await triggerReceiptPrint(res.order, selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null);
          }
        }
      } catch (error: any) {
        const msg = (error?.message || '').toLowerCase();
        if (msg.includes('cash session') || msg.includes('open a cash session') || msg.includes('till')) {
          setCashOpenModalOpen(true);
        } else {
          toast.error(error?.message || 'Exchange failed to process');
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    await processTransaction(paymentBreakdown, null, shouldPrint || pendingAction === 'print');
  };

  const handleLedgerSuccess = (receivedAmount: number) => {
    setLedgerModalOpen(false);
    const payments = receivedAmount > 0 ? [{ method: 'cash', amount: receivedAmount }] : [];
    processTransaction(
      payments,
      { id: selectedCustomer!.id, name: selectedCustomer!.name },
      pendingAction === 'print'
    );
  };

  const processTransaction = async (
    paymentBreakdown: { method: string; amount: number }[] = [],
    customerObj: { id: string; name: string } | null = null,
    shouldPrint: boolean = false
  ) => {
    if (!activeSession) return;

    const targetCustomer =
      customerObj || (selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null);

    // Credit limit warning verification
    if (selectedCustomer) {
      const { currentBalance = 0, creditLimit = 0 } = selectedCustomer;
      const totalPaid = paymentBreakdown.reduce((sum, p) => sum + p.amount, 0);
      const dueAmount = grandTotal - totalPaid;

      // Warn if increasing debt and exceeding limit
      if (dueAmount > 0) {
        const projectedBalance = currentBalance + dueAmount;
        if (projectedBalance > creditLimit) {
          setPendingTransaction({ paymentBreakdown, customerObj: targetCustomer, shouldPrint, projectedBalance });
          return;
        }
      }
    }

    executeTransaction(paymentBreakdown, targetCustomer, shouldPrint);
  };

  const executeTransaction = async (
    paymentBreakdown: { method: string; amount: number }[],
    targetCustomer: { id: string; name: string } | null,
    shouldPrint: boolean
  ) => {
    const isRefund = grandTotal < 0;
    setIsProcessing(true);

    // P0 fix: reuse the persisted idempotency key for retries of the same checkout.
    // Generate a fresh key only on the first call; clearCart() resets it for a new sale.
    let idempotencyKey = activeSession.checkoutIdempotencyKey ?? null;
    if (!idempotencyKey) {
      idempotencyKey = `pos_txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setCheckoutIdempotencyKey(idempotencyKey);
    }

    try {
      const result = await completeTransaction(paymentBreakdown, targetCustomer, idempotencyKey);
      if (result && (result.transaction || result.order)) {
        const orderData = result.transaction || result.order;

        const activeShop = useOrganizationStore.getState().activeShop;
        const realShopProfile = {
          name: shopHeader?.name || activeShop?.name || 'Niazi Mobile Mart',
          address: shopHeader?.address || (activeShop as any)?.address || 'Main Branch',
          phone1: shopHeader?.phone || (activeShop as any)?.phone || '',
        };

        const mappedTransaction: any = {
          transactionId: orderData.orderNumber || orderData.transactionId || orderData._id || `TXN-${Date.now()}`,
          items:
            orderData.items?.map((i: any) => ({
              productName: i.name || i.productName || 'Item',
              quantity: i.quantity || 1,
              unitPrice: i.price || i.unitPrice || 0,
              discount: i.discount || 0,
              subtotal: (i.price || i.unitPrice || 0) * (i.quantity || 1),
            })) || [],
          subtotal: orderData.subtotal || 0,
          discountTotal: orderData.discountAmount || orderData.discountTotal || 0,
          grandTotal: orderData.totalAmount || orderData.grandTotal || 0,
          // DEF-SALE-01 fix: use actual paid/credit amounts from the committed sale record.
          // orderData.paidAmount / totalPaid = amount actually received (set from sale.paid_amount).
          // orderData.creditAmount = outstanding balance owed (set from saleResult.credit_amount).
          totalPaid: orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || orderData.grandTotal || 0),
          remainingDue: orderData.creditAmount ?? Math.max((orderData.totalAmount || 0) - (orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || 0)), 0),
          changeReturned: orderData.changeAmount ?? 0,
          paymentBreakdown: (orderData.payments && orderData.payments.length > 0)
            ? orderData.payments.map((p: any) => ({ method: p.payment_method || p.method || 'cash', amount: p.amount || 0 }))
            : [{ method: orderData.paymentMethod || 'cash', amount: orderData.paidAmount ?? orderData.totalPaid ?? (orderData.totalAmount || orderData.grandTotal || 0) }],
          createdAt: orderData.createdAt || Date.now(),
        };

        if (shouldPrint) {
          // DEF-SALE-06: pass real customer and cashier to receipt
          const authUser = useAuthStore.getState().user;
          const invoiceExtras = {
            customer: targetCustomer ?? null,
            cashier: authUser?.name ?? null,
          };
          const invoice = DocumentService.buildInvoice(mappedTransaction as any, realShopProfile as any, invoiceExtras);
          // Set in store to trigger unified thermal printing in InvoiceReceipt.tsx
          usePosStore.getState().setLastInvoice(invoice);
          await DocumentService.logPrint(invoice.invoiceId, 'PRINT');
        }

        toast.success(isRefund ? `Refund Processed. Paid: Rs ${Math.abs(grandTotal).toLocaleString()}` : 'Sale completed successfully');

        // Dispatch sale completed event to trigger rotating green border effect
        window.dispatchEvent(new CustomEvent('pos:sale-completed'));

        // Reset customer selection
        setCustomer(null);
      }
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('cash session') || msg.includes('open a cash session') || msg.includes('till')) {
        setCashOpenModalOpen(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col w-full bg-surface border border-border rounded-xl shadow-card p-3 gap-2.5 shrink-0 select-none">
      {/* Exchange Mode Return Banner */}
      {activeSession.mode === 'replace' && returnTotal > 0 && (
        <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-xs">
          <span className="text-warning font-bold uppercase tracking-wider text-[10px]">Returned Value</span>
          <span className="font-black text-warning tabular-nums">- Rs {returnTotal.toLocaleString()}</span>
        </div>
      )}

      {/* Subtotal & Payment Method Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-1 border-t border-border/70">
        {/* Payment Methods Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs cursor-default">
            Cash
          </span>
          <button
            type="button"
            onClick={() => setMultiPaymentOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border text-text-secondary transition-colors"
          >
            Bank
          </button>
          <button
            type="button"
            onClick={() => setMultiPaymentOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border text-text-secondary transition-colors"
          >
            EasyPaisa
          </button>
          <button
            type="button"
            onClick={() => setMultiPaymentOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border text-text-secondary transition-colors"
          >
            JazzCash
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedCustomer) {
                setLedgerModalOpen(true);
              } else {
                setCustomerModalOpen(true);
              }
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border text-text-secondary transition-colors"
          >
            Khata
          </button>
        </div>

        {/* Subtotal */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted shrink-0 self-end sm:self-center">
          <span className="text-[10px] uppercase font-bold tracking-wider">Subtotal:</span>
          <span className="font-bold text-text-primary tabular-nums">Rs {subtotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Total Due Row: High Visual Dominance */}
      <div className="flex justify-between items-center pt-0.5">
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
            {grandTotal < 0 ? 'Refund Due' : 'Total Due'}
          </span>
          <span className="text-[10px] text-text-muted font-medium">
            {isEditingTotal ? 'Type adjusted total & Enter' : 'Tap to adjust total'}
          </span>
        </div>

        <div className={`flex items-baseline ${grandTotal < 0 ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}>
          <span className="text-sm mr-1 text-text-muted font-bold">Rs</span>
          {isEditingTotal ? (
            <input
              ref={(input) => {
                if (input) input.select();
              }}
              type="number"
              value={editedTotal}
              onChange={(e) => setEditedTotal(e.target.value)}
              onBlur={() => {
                setIsEditingTotal(false);
                if (editedTotal !== '') {
                  const newTotal = parseFloat(editedTotal) || 0;
                  const discount = Math.abs(preDiscountTotal) - newTotal;
                  setInvoiceDiscount('fixed', discount > 0 ? discount : 0);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="text-2xl font-black tabular-nums tracking-tight bg-transparent focus:outline-none w-32 text-right no-spinners border-b-2 border-primary"
            />
          ) : (
            <span
              onClick={() => {
                setEditedTotal(Math.abs(grandTotal).toString());
                setIsEditingTotal(true);
              }}
              title="Click to edit total due (auto-calculates discount)"
              className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight cursor-pointer hover:opacity-85 transition-opacity border-b-2 border-dashed border-transparent hover:border-primary/50"
            >
              {Math.abs(grandTotal).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Primary Checkout Actions Footer */}
      <div className="grid grid-cols-12 gap-2 pt-1">
        {/* Clear Cart Button */}
        <button
          type="button"
          onClick={handleClearCart}
          disabled={isCartEmpty || isProcessing}
          title="Clear Cart (Ctrl+Delete)"
          className="col-span-3 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all disabled:opacity-disabled shadow-xs"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-bold hidden sm:inline">Clear Cart</span>
        </button>

        {/* Quick Cash Sale Button */}
        <button
          type="button"
          onClick={handleCashSale}
          disabled={isCartEmpty || isProcessing}
          title="Quick Cash Sale (Ctrl+S)"
          className="col-span-4 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-xs disabled:opacity-disabled"
        >
          <Banknote className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wider">SALE</span>
        </button>

        {/* Pay & Print Button */}
        <button
          type="button"
          onClick={handlePayAndPrint}
          disabled={isCartEmpty || isProcessing}
          title="Pay & Print / Split Tender (Ctrl+P)"
          className="col-span-5 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all shadow-sm hover:shadow disabled:opacity-disabled font-black"
        >
          <Printer className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wider">PAY & PRINT (F12)</span>
        </button>
      </div>

      {/* Extra Action Buttons Row (Directly below SALE / PAY & PRINT) */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/60">
        {/* 1. Cash Return */}
        <button
          type="button"
          onClick={handleCashReturn}
          className="h-9 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
          title="Cash Return / Refund"
        >
          <Banknote className="h-3.5 w-3.5" />
          <span className="truncate">Cash Return</span>
        </button>

        {/* 2. Product Replace */}
        <button
          type="button"
          onClick={() => {
            setSessionMode(activeSession.mode === 'replace' ? 'sale' : 'replace');
            toast.success(
              activeSession.mode === 'replace' ? 'Standard Sale Mode' : 'Product Replace Mode Active',
              { icon: '🔁' }
            );
          }}
          className={`h-9 px-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 ${
            activeSession.mode === 'replace'
              ? 'bg-indigo-700 text-white ring-2 ring-indigo-400'
              : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'
          }`}
          title="Exchange / Replace Product"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="truncate">Product Replace</span>
        </button>

        {/* 3. Return by Invoice */}
        <button
          type="button"
          onClick={() => {
            const ev = new CustomEvent('pos:open-invoice-lookup');
            window.dispatchEvent(ev);
          }}
          className="h-9 px-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
          title="Lookup Past Invoice for Return"
        >
          <Tag className="h-3.5 w-3.5" />
          <span className="truncate">Return by Invoice</span>
        </button>
      </div>

      {/* Credit Customer Modal (for F2 / MultiPayment credit pick) */}
      {isCustomerModalOpen && (
        <CreditCustomerModal
          onClose={() => setCustomerModalOpen(false)}
          onSelect={(customer) => {
            if (customer) {
              setCustomer({
                id: customer.id || (customer as any)._id,
                name: customer.name,
                phone: customer.phone || customer.mobile,
                mobile: customer.mobile || customer.phone,
                currentBalance: customer.currentBalance ?? 0,
                creditLimit: customer.creditLimit ?? 0,
              });
            } else {
              setCustomer(null);
            }
            setCustomerModalOpen(false);
            setLedgerModalOpen(true);
          }}
        />
      )}

      {/* Ledger Settlement Modal */}
      {isLedgerModalOpen && selectedCustomer && (
        <LedgerSettlementModal
          customer={selectedCustomer as any}
          invoiceTotal={grandTotal}
          onClose={() => setLedgerModalOpen(false)}
          onSuccess={handleLedgerSuccess}
        />
      )}

      {/* Preset Discounts Modal */}
      {isDiscountModalOpen && (
        <DiscountModal isOpen={isDiscountModalOpen} onClose={() => setDiscountModalOpen(false)} />
      )}

      {/* Multi-Payment / Split Tender Modal */}
      {isMultiPaymentOpen && (
        <MultiPaymentModal
          isOpen={isMultiPaymentOpen}
          grandTotal={grandTotal}
          isProcessing={isProcessing}
          onClose={() => setMultiPaymentOpen(false)}
          onConfirm={handleMultiPaymentConfirm}
          onCreditSelect={() => {
            setMultiPaymentOpen(false);
            setCustomerModalOpen(true);
          }}
        />
      )}

      {/* Credit Limit Warning Modal — WIRED UP TO PREVENT CHECKOUT FREEZES */}
      {pendingTransaction && selectedCustomer && (
        <CreditLimitWarningModal
          customer={selectedCustomer as any}
          projectedBalance={pendingTransaction.projectedBalance}
          onProceed={() => {
            const { paymentBreakdown, customerObj, shouldPrint } = pendingTransaction;
            setPendingTransaction(null);
            executeTransaction(paymentBreakdown, customerObj, shouldPrint);
          }}
          onCancel={() => {
            setPendingTransaction(null);
          }}
          onLimitUpdated={(updatedCustomer) => {
            setCustomer(updatedCustomer);
          }}
        />
      )}

      {/* Cash Session Open Modal if drawer is closed during checkout */}
      <CashSessionOpenModal
        isOpen={isCashOpenModalOpen}
        onClose={() => setCashOpenModalOpen(false)}
      />

      {/* GAP-03: Exchange Settlement Modal — shown when replace mode checkout is initiated */}
      {isExchangeModalOpen && (
        <ExchangeSettlementModal
          summary={{
            returnedValue: returnTotal,
            replacementValue: subtotal,
            exchangeDifference: grandTotal,
            hasLinkedInvoice: !!activeSession.linkedInvoiceId,
            linkedInvoiceId: activeSession.linkedInvoiceId,
          }}
          isProcessing={isProcessing}
          hasCustomerAccount={!!selectedCustomer && selectedCustomer.id !== 'walk-in'}
          onConfirm={handleExchangeConfirm}
          onCancel={() => setExchangeModalOpen(false)}
          onSelectInvoice={() => {
            setExchangeModalOpen(false);
            window.dispatchEvent(new CustomEvent('pos:open-invoice-lookup', { detail: { heading: 'Select Original Invoice for Exchange' } }));
          }}
        />
      )}

      {/* F-04: Show server-confirmed exchange result after successful exchange */}
      {lastExchangeResult && (
        <ExchangeResultSummaryModal
          result={lastExchangeResult}
          onClose={clearLastExchangeResult}
        />
      )}

      <GlobalLoadingOverlay isOpen={isProcessing} message="Processing Transaction..." />
    </div>
  );
};

export default CartSummary;
