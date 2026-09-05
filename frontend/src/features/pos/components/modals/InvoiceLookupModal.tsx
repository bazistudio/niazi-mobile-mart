'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Receipt, ArrowRight, Loader2, Calendar, User, ShoppingBag } from 'lucide-react';
import { usePosStore } from '../../store/usePosStore';
import { salesApi } from '@/services/sales.api';

interface InvoiceLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceLookupModal: React.FC<InvoiceLookupModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadInvoice = usePosStore((s) => s.loadInvoice);

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSearchTerm('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch invoices matching query
  useEffect(() => {
    if (!debouncedTerm.trim()) {
      setResults([]);
      return;
    }

    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const response = await salesApi.getOrders({ orderNumber: debouncedTerm.trim(), limit: 10 });
        if (response.success && response.data) {
          setResults(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch invoices', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, [debouncedTerm]);

  if (!isOpen) return null;

  const handleSelectInvoice = (invoice: any) => {
    loadInvoice(invoice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-hover/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Invoice Lookup & Return</h3>
              <p className="text-xs text-text-muted">Search previous sales for return or replacement</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="p-4 border-b border-border bg-surface">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice number (e.g. ORD-10024) or scan receipt barcode..."
              className="w-full pl-10 pr-10 py-2.5 text-sm bg-surface-hover/60 border border-border rounded-xl font-medium text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus-ring"
            />
            {isLoading && (
              <Loader2 className="w-4 h-4 text-primary animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-[220px]">
          {isLoading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-primary" />
              <span className="text-xs">Searching invoices...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted">
              <Receipt className="w-10 h-10 opacity-30 mb-2" />
              <p className="text-xs font-semibold text-text-secondary">
                {searchTerm.trim() ? 'No invoices found matching that query' : 'Type an invoice number to start search'}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Invoices must belong to the current active shop branch.
              </p>
            </div>
          ) : (
            results.map((invoice) => {
              const orderNum = invoice.orderNumber || invoice._id;
              const dateStr = new Date(invoice.createdAt || Date.now()).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const customerName = invoice.customer?.name || invoice.partyId?.name || 'Walk-In Customer';
              const itemCount = invoice.items?.length || 0;
              const totalAmount = invoice.totalAmount || invoice.grandTotal || 0;

              return (
                <div
                  key={invoice._id || orderNum}
                  onClick={() => handleSelectInvoice(invoice)}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface hover:border-primary/50 hover:bg-surface-hover cursor-pointer transition-all duration-fast group"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black font-mono text-primary">{orderNum}</span>
                      <span className="text-[10px] text-text-muted flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {dateStr}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
                        <User className="w-3 h-3 text-text-muted" />
                        {customerName}
                      </span>
                      <span className="text-border">•</span>
                      <span className="flex items-center gap-1 text-text-muted">
                        <ShoppingBag className="w-3 h-3" />
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider block">Total</span>
                      <span className="text-sm font-black text-text-primary tabular-nums">
                        Rs {totalAmount.toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-1 shadow-xs group-hover:bg-primary-hover transition-colors"
                    >
                      <span>Load</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-border bg-surface-hover/40 flex justify-between items-center text-xs text-text-muted">
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono">Esc</kbd> to cancel</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceLookupModal;
