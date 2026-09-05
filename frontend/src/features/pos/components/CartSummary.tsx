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

export const CartSummary: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const clearCart = usePosStore((s) => s.clearCart);
  const activeSession = usePosStore((s) => s.getActiveSession());
  const setSessionMode = usePosStore((s) => s.setSessionMode);
  const setInvoiceDiscount = usePosStore((s) => s.setInvoiceDiscount);
  const completeTransaction = usePosStore((s) => s.completeTransaction);
  const setCustomer = usePosStore((s) => s.setCustomer);

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
      // Ctrl + P : Pay & Print
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
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

  const handleClearCart = () => {
    if (isCartEmpty) return;
    if (window.confirm('Are you sure you want to clear the current sale tab?')) {
      clearCart();
      toast.success('Cart cleared');
    }
  };

  const handleCashSale = () => {
    if (isCartEmpty) {
      toast.error('Cart is empty');
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

  const handlePayAndPrint = () => {
    if (isCartEmpty) {
      toast.error('Cart is empty');
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

  const handleMultiPaymentConfirm = async (
    paymentBreakdown: { method: string; amount: number }[],
    shouldPrint: boolean = false
  ) => {
    setMultiPaymentOpen(false);
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

    const idempotencyKey = `pos_txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const result = await completeTransaction(paymentBreakdown, targetCustomer, idempotencyKey);
      if (result && (result.transaction || result.order)) {
        const orderData = result.transaction || result.order;

        const activeShop = useOrganizationStore.getState().activeShop;
        const realShopProfile = {
          name: shopHeader?.name || activeShop?.name || 'TijaratPro Store',
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
          totalPaid: orderData.totalAmount || orderData.grandTotal || 0,
          remainingDue: 0,
          changeReturned: 0,
          paymentBreakdown: [
            { method: orderData.paymentMethod || 'cash', amount: orderData.totalAmount || orderData.grandTotal || 0 },
          ],
          createdAt: orderData.createdAt || Date.now(),
        };

        if (shouldPrint) {
          const invoice = DocumentService.buildInvoice(mappedTransaction as any, realShopProfile as any);
          // Set in store to trigger unified thermal printing in InvoiceReceipt.tsx
          usePosStore.getState().setLastInvoice(invoice);
          await DocumentService.logPrint(invoice.invoiceId, 'PRINT');
        }

        toast.success(isRefund ? `Refund Processed. Paid: Rs ${Math.abs(grandTotal).toLocaleString()}` : 'Sale completed successfully');

        // Reset customer selection
        setCustomer(null);
      }
    } catch (error) {
      // Error handled by store
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

      {/* Subtotal Row */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-text-muted font-bold uppercase tracking-wider text-[10px]">Subtotal</span>
        <span className="font-black text-text-primary tabular-nums">Rs {subtotal.toLocaleString()}</span>
      </div>

      {/* Invoice Discount Row */}
      <div className="flex justify-between items-center py-1.5 border-y border-border/70">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Discount</span>
          <button
            type="button"
            onClick={() => setDiscountModalOpen(true)}
            title="Open Discount Presets"
            className="px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-[10px] font-bold flex items-center gap-1 shadow-xs"
          >
            <Tag className="h-3 w-3" />
            <span>Presets</span>
          </button>
        </div>

        <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden bg-surface-hover/60">
          <input
            type="number"
            value={activeSession.invoiceDiscountValue || ''}
            placeholder="0"
            onChange={(e) => setInvoiceDiscount(activeSession.invoiceDiscountType, parseFloat(e.target.value) || 0)}
            className="w-14 text-xs font-black text-center py-1 bg-transparent text-text-primary focus:outline-none focus:bg-surface no-spinners transition-colors"
          />
          <button
            type="button"
            onClick={() =>
              setInvoiceDiscount(
                activeSession.invoiceDiscountType === 'percentage' ? 'fixed' : 'percentage',
                activeSession.invoiceDiscountValue
              )
            }
            className="px-2 py-1 text-[10px] font-black bg-border/60 text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
          >
            {activeSession.invoiceDiscountType === 'percentage' ? '%' : 'Rs'}
          </button>
        </div>
      </div>

      {/* Applied Discount Indicator */}
      {invoiceDiscountAmount > 0 && (
        <div className="flex justify-between items-center text-xs font-bold text-danger tabular-nums">
          <span className="text-[10px] uppercase tracking-wider">Discount Deducted</span>
          <span>- Rs {invoiceDiscountAmount.toLocaleString()}</span>
        </div>
      )}

      {/* Total Due Row: High Visual Dominance */}
      <div className="flex justify-between items-center pt-1">
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
            {grandTotal < 0 ? 'Refund Due' : 'Total Due'}
          </span>
          <span className="text-[10px] text-text-muted font-medium">
            {isEditingTotal ? 'Type adjusted total & Enter' : 'Tap to adjust total'}
          </span>
        </div>

        <div className={`flex items-baseline ${grandTotal < 0 ? 'text-danger' : 'text-primary'}`}>
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
          className="col-span-3 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-hover/60 text-danger hover:bg-danger/10 hover:border-danger/30 transition-all disabled:opacity-disabled shadow-xs"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-bold hidden sm:inline">Clear</span>
        </button>

        {/* Quick Cash Sale Button */}
        <button
          type="button"
          onClick={handleCashSale}
          disabled={isCartEmpty || isProcessing}
          title="Quick Cash Sale (Ctrl+S)"
          className="col-span-4 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all shadow-xs disabled:opacity-disabled"
        >
          <Banknote className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wider">Sale</span>
        </button>

        {/* Pay & Print Button */}
        <button
          type="button"
          onClick={handlePayAndPrint}
          disabled={isCartEmpty || isProcessing}
          title="Pay & Print / Split Tender (Ctrl+P)"
          className="col-span-5 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-white hover:bg-primary-hover active:bg-primary-active transition-all shadow-sm hover:shadow disabled:opacity-disabled"
        >
          <Printer className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-wider">Pay & Print</span>
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

      <GlobalLoadingOverlay isOpen={isProcessing} message="Processing Transaction..." />
    </div>
  );
};

export default CartSummary;
