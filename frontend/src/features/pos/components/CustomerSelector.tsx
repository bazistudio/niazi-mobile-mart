'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, UserCircle2, X, FileText, ArrowDownToLine } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { salesApi } from '@/services/sales.api';
import { usePosStore, SaleCustomer } from '../store/usePosStore';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';
import { DBCustomer } from '@/types/db.types';

export const CustomerSelector: React.FC = () => {
  const [searchMode, setSearchMode] = useState<'customer' | 'invoice'>('customer');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSession = usePosStore((s) => s.getActiveSession());
  const setCustomer = usePosStore((s) => s.setCustomer);
  const loadInvoice = usePosStore((s) => s.loadInvoice);

  const activeCustomer = activeSession?.customer && activeSession.customer.id !== 'walk-in'
    ? activeSession.customer
    : null;

  const keys = useTenantQueryKeys();

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Customer Search Query
  // ──────────────────────────────────────────────────────────────────────────
  const { data: customerResponse, isLoading: isCustomersLoading } = useQuery({
    queryKey: keys.customerSearch(searchTerm),
    queryFn: () => customerApi.searchCustomers(searchTerm),
    enabled: searchMode === 'customer' && searchTerm.trim().length > 0,
    staleTime: 60000,
  });

  const customerResults: DBCustomer[] = customerResponse?.data || [];

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Invoice Search Query (for Return/Replace lookup)
  // ──────────────────────────────────────────────────────────────────────────
  const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false);

  useEffect(() => {
    if (searchMode !== 'invoice' || !searchTerm.trim()) {
      setInvoiceResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsInvoicesLoading(true);
      try {
        const res = await salesApi.getOrders({ orderNumber: searchTerm.trim(), limit: 8 });
        if (res.success && res.data) {
          setInvoiceResults(res.data);
        }
      } catch (err) {
        console.error('Failed to search invoices', err);
      } finally {
        setIsInvoicesLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchMode, searchTerm]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut F2 to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        inputRef.current?.focus();
        setDropdownOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectCustomer = (customer: DBCustomer) => {
    const saleCust: SaleCustomer = {
      id: customer.id || (customer as any)._id,
      name: customer.name,
      phone: customer.phone || customer.mobile,
      mobile: customer.mobile || customer.phone,
      currentBalance: customer.currentBalance ?? 0,
      creditLimit: customer.creditLimit ?? 0,
    };
    setCustomer(saleCust);
    setSearchTerm('');
    setDropdownOpen(false);
    setSelectedIndex(0);
  };

  const handleSelectInvoice = (order: any) => {
    loadInvoice(order);
    setSearchTerm('');
    setDropdownOpen(false);
    setSelectedIndex(0);
  };

  const handleClearCustomer = () => {
    setCustomer(null);
    setSearchTerm('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const currentResultsCount = searchMode === 'customer' ? customerResults.length : invoiceResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || currentResultsCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < currentResultsCount - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchMode === 'customer' && customerResults[selectedIndex]) {
        handleSelectCustomer(customerResults[selectedIndex]);
      } else if (searchMode === 'invoice' && invoiceResults[selectedIndex]) {
        handleSelectInvoice(invoiceResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // A. Selected Customer Card View
  // ──────────────────────────────────────────────────────────────────────────
  if (activeCustomer) {
    const currentBalance = activeCustomer.currentBalance ?? 0;
    const creditLimit = activeCustomer.creditLimit ?? 0;
    const availableCredit = creditLimit - currentBalance;
    const usagePercentage = creditLimit > 0 ? (currentBalance / creditLimit) * 100 : 0;

    let statusColor = 'text-success bg-success/10 border-success/20';
    let dotColor = 'bg-success';
    let statusText = 'Safe';
    let isWarning = false;

    if (usagePercentage > 100) {
      statusColor = 'text-danger bg-danger/10 border-danger/20';
      dotColor = 'bg-danger';
      statusText = 'Over Limit';
      isWarning = true;
    } else if (usagePercentage > 80) {
      statusColor = 'text-warning bg-warning/10 border-warning/20';
      dotColor = 'bg-warning';
      statusText = 'Near Limit';
      isWarning = true;
    }

    return (
      <div className="border border-border rounded-xl p-2.5 bg-surface shadow-xs relative select-none">
        <button
          type="button"
          onClick={handleClearCustomer}
          className="absolute top-2 right-2 text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-surface-hover transition-colors"
          title="Clear Customer (Reset to Walk-in)"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-2 mb-1.5 pr-6">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UserCircle2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-xs text-text-primary truncate">{activeCustomer.name}</span>
          <div className={`px-2 py-0.2 rounded-full text-[9px] font-black border flex items-center gap-1 ${statusColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {statusText}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-border/60">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Balance</span>
            <span className="font-black text-text-primary tabular-nums text-xs">
              Rs {currentBalance.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Limit</span>
            <span className="font-bold text-text-secondary tabular-nums text-xs">
              Rs {creditLimit.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Available</span>
            <span className={`font-black tabular-nums text-xs ${isWarning ? 'text-danger' : 'text-success'}`}>
              Rs {availableCredit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // B. Unified Customer / Invoice Search Surface
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative select-none" ref={dropdownRef}>
      {/* Mode Switcher Pills */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-0.5 bg-surface-hover/80 p-0.5 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => {
              setSearchMode('customer');
              setSearchTerm('');
              setSelectedIndex(0);
              inputRef.current?.focus();
            }}
            className={`px-2.5 py-0.5 rounded-md text-[10px] font-black transition-all ${
              searchMode === 'customer'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchMode('invoice');
              setSearchTerm('');
              setSelectedIndex(0);
              inputRef.current?.focus();
            }}
            className={`px-2.5 py-0.5 rounded-md text-[10px] font-black transition-all ${
              searchMode === 'invoice'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Invoice
          </button>
        </div>

        <span className="text-[10px] text-text-muted font-medium">
          {searchMode === 'customer' ? 'F2 to focus' : 'Load for Return'}
        </span>
      </div>

      {/* Input Field */}
      <div className="relative">
        <Search className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-9 pr-3 py-2 text-xs border border-border rounded-xl bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus-ring transition-all"
          placeholder={
            searchMode === 'customer'
              ? 'Search customer (Name, Phone, Khata)...'
              : 'Search invoice (INV-..., Order #)...'
          }
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setDropdownOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => {
            if (searchTerm.trim().length > 0) setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Dropdown Results */}
      {isDropdownOpen && searchTerm.trim().length > 0 && (
        <div className="absolute z-50 mt-1.5 w-full bg-surface border border-border rounded-xl shadow-modal max-h-60 overflow-y-auto custom-scrollbar p-1">
          {/* Customer Results */}
          {searchMode === 'customer' && (
            <>
              {isCustomersLoading ? (
                <div className="p-3 text-xs text-text-muted text-center">Searching customers...</div>
              ) : customerResults.length > 0 ? (
                <ul className="space-y-0.5">
                  {customerResults.map((cust, index) => (
                    <li
                      key={cust.id || (cust as any)._id}
                      className={`px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                        index === selectedIndex
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'hover:bg-surface-hover text-text-primary'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCustomer(cust);
                      }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold truncate">{cust.name}</span>
                        <span className="text-[10px] text-text-muted">
                          {cust.phone || cust.mobile || 'No phone'}
                        </span>
                      </div>
                      <div className="text-xs font-black tabular-nums text-text-secondary shrink-0">
                        Rs {(cust.currentBalance || 0).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 text-xs text-text-muted text-center">No customers found</div>
              )}
            </>
          )}

          {/* Invoice Results */}
          {searchMode === 'invoice' && (
            <>
              {isInvoicesLoading ? (
                <div className="p-3 text-xs text-text-muted text-center">Searching previous invoices...</div>
              ) : invoiceResults.length > 0 ? (
                <ul className="space-y-0.5">
                  {invoiceResults.map((order, index) => {
                    const orderId = order.orderNumber || order._id;
                    const itemsCount = order.items?.length || 0;
                    const total = order.totalAmount || order.grandTotal || 0;
                    const customerName = order.customer?.name || order.partyId?.name || 'Walk-In';
                    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '';

                    return (
                      <li
                        key={order._id || orderId}
                        className={`px-3 py-2 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                          index === selectedIndex
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'hover:bg-surface-hover text-text-primary'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectInvoice(order);
                        }}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-xs font-bold truncate">{orderId}</span>
                            <span className="text-[10px] text-text-muted">({dateStr})</span>
                          </div>
                          <span className="text-[10px] text-text-muted truncate">
                            {customerName} • {itemsCount} items
                          </span>
                        </div>
                        <div className="text-xs font-black tabular-nums text-primary shrink-0">
                          Rs {total.toLocaleString()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-3 text-xs text-text-muted text-center">No invoices found for "{searchTerm}"</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;
