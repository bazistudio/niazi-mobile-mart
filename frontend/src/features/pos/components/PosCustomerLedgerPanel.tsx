'use client';

import React, { useState } from 'react';
import { Search, UserPlus, Phone, CreditCard, Receipt, FileText, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { useLedger } from '@/features/ledger/hooks/useLedger';
import { CreditCustomerModal } from './modals/CreditCustomerModal';
import { LedgerSettlementModal } from './modals/LedgerSettlementModal';
import { CustomerFormDrawer } from '@/features/customers/components/modals/AddCustomerDrawer';
import { useNavigate } from 'react-router-dom';

interface PosCustomerLedgerPanelProps {
  isSaleSuccess?: boolean;
}

export const PosCustomerLedgerPanel: React.FC<PosCustomerLedgerPanelProps> = ({ isSaleSuccess }) => {
  const navigate = useNavigate();
  const activeSession = usePosStore((s) => s.getActiveSession());
  const setCustomer = usePosStore((s) => s.setCustomer);

  const selectedCustomer = activeSession?.customer && activeSession.customer.id !== 'walk-in'
    ? activeSession.customer
    : null;

  const [isSearchModalOpen, setSearchModalOpen] = useState(false);
  const [isNewCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [isReceivePaymentOpen, setReceivePaymentOpen] = useState(false);

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

  const { timeline, isLedgerLoading, refetchLedger } = useLedger(ledgerQueryArg);

  // Recent 5 entries for mini statement table
  const recentEntries = timeline.slice(0, 5);

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
          <button
            type="button"
            onClick={() => setNewCustomerModalOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New Customer</span>
          </button>
        </div>

        {/* Search Customer Bar (F2) */}
        <div
          onClick={() => setSearchModalOpen(true)}
          className="relative flex items-center w-full px-3 py-2 bg-surface-hover/80 hover:bg-surface-hover border border-border hover:border-primary/50 rounded-xl cursor-pointer transition-all shadow-xs group"
        >
          <Search className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
          <span className="ml-2.5 text-xs text-text-muted font-medium truncate flex-1">
            {selectedCustomer ? (
              <span className="text-text-primary font-bold">{selectedCustomer.name}</span>
            ) : (
              'Search Customer (Name, Phone, Khata)... (F2)'
            )}
          </span>
          <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-text-muted">
            F2
          </kbd>
        </div>
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
            <span className="text-xs font-bold text-text-secondary tabular-nums">
              Rs {(selectedCustomer?.creditLimit ?? 0).toLocaleString()}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted block">
              Current Balance
            </span>
            <div className="flex items-center justify-end gap-1">
              <span
                className={`text-xs font-black tabular-nums ${
                  (selectedCustomer?.currentBalance ?? 0) > 0 ? 'text-danger' : 'text-emerald-600'
                }`}
              >
                Rs {Math.abs(selectedCustomer?.currentBalance ?? 0).toLocaleString()}{' '}
                {(selectedCustomer?.currentBalance ?? 0) > 0 ? 'Dr' : ''}
              </span>
              {(selectedCustomer?.currentBalance ?? 0) > 0 && (
                <span className="px-1 py-0.2 rounded text-[9px] font-black uppercase bg-danger/10 text-danger border border-danger/20">
                  Outstanding
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Customer Ledger Statement / Mini Timeline */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface border border-border/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-3 py-1.5 border-b border-border/80 bg-surface-hover/60 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
            Customer Ledger Statement
          </span>
          {selectedCustomer && (
            <button
              type="button"
              onClick={() => refetchLedger()}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              Refresh
            </button>
          )}
        </div>

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
                const dateFormatted = new Date(row.date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                });
                return (
                  <div
                    key={row.id || `${row.transactionId}-${idx}`}
                    className="grid grid-cols-12 px-2.5 py-1.5 text-[11px] items-center hover:bg-surface-hover/50 transition-colors"
                  >
                    <div className="col-span-3 text-text-muted font-medium">{dateFormatted}</div>
                    <div className="col-span-3 font-mono font-bold text-primary truncate" title={row.transactionId}>
                      {row.transactionId}
                    </div>
                    <div className="col-span-2 text-right font-semibold text-text-primary tabular-nums">
                      {row.debit > 0 ? row.debit.toLocaleString() : '—'}
                    </div>
                    <div className="col-span-2 text-right font-semibold text-emerald-600 tabular-nums">
                      {row.credit > 0 ? row.credit.toLocaleString() : '—'}
                    </div>
                    <div className="col-span-2 text-right font-black text-text-primary tabular-nums">
                      {row.balance.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Bottom Panel Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (!selectedCustomer) {
              setSearchModalOpen(true);
            } else {
              setReceivePaymentOpen(true);
            }
          }}
          className="h-9 px-3 rounded-xl border border-border bg-surface text-text-primary hover:bg-surface-hover hover:border-primary/50 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
          <span>Receive Payment</span>
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
          className="h-9 px-3 rounded-xl border border-border bg-surface text-text-primary hover:bg-surface-hover hover:border-primary/50 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
          <span>View Full Statement</span>
        </button>
      </div>

      {/* Customer Search & Pick Modal (F2) */}
      {isSearchModalOpen && (
        <CreditCustomerModal
          onClose={() => setSearchModalOpen(false)}
          onSelect={(cust) => {
            if (cust) {
              setCustomer({
                id: cust.id || (cust as any)._id,
                name: cust.name,
                phone: cust.phone || cust.mobile,
                mobile: cust.mobile || cust.phone,
                currentBalance: cust.currentBalance ?? 0,
                creditLimit: cust.creditLimit ?? 0,
              });
            } else {
              setCustomer(null);
            }
            setSearchModalOpen(false);
          }}
        />
      )}

      {/* Create New Customer Drawer */}
      {isNewCustomerModalOpen && (
        <CustomerFormDrawer
          isOpen={isNewCustomerModalOpen}
          onClose={() => setNewCustomerModalOpen(false)}
          customers={[]}
        />
      )}

      {/* Receive Payment / Settle Balance Modal */}
      {isReceivePaymentOpen && selectedCustomer && (
        <LedgerSettlementModal
          customer={selectedCustomer as any}
          invoiceTotal={0}
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
