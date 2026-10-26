/**
 * CashVoucherModal — CASH-2
 *
 * Wrapper modal that handles entity search (customer or supplier) before
 * delegating to the existing ReceivePaymentModal / MakeSupplierPaymentModal.
 * Uses two separate voucher types driven by the `voucherType` prop so a
 * single component handles both workflows.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, UserCheck, ShoppingCart, Loader2 } from 'lucide-react';
import { DBCustomer } from '@/types/db.types';
import { customerApi } from '@/services/customer.api';
import { supplierApi, FrontendSupplier } from '@/services/supplier.api';
import { ReceivePaymentModal } from '@/features/customers/components/ledger/ReceivePaymentModal';
import { MakeSupplierPaymentModal } from '@/features/suppliers/components/modals/MakeSupplierPaymentModal';
import { useCashStore } from '../store/cash.store';
import { useOrganizationStore } from '@/store/useOrganizationStore';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CashVoucherType = 'receive_payment' | 'pay_supplier';

interface CashVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucherType: CashVoucherType;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CashVoucherModal: React.FC<CashVoucherModalProps> = ({
  isOpen,
  onClose,
  voucherType,
}) => {
  const activeShopId = useOrganizationStore(
    (s) => s.activeShopId || s.activeShop?._id
  );
  const fetchCurrentState = useCashStore((s) => s.fetchCurrentState);

  // Search state
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [customers, setCustomers] = useState<DBCustomer[]>([]);
  const [suppliers, setSuppliers] = useState<FrontendSupplier[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected entity state
  const [selectedCustomer, setSelectedCustomer] = useState<DBCustomer | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<FrontendSupplier | null>(null);

  // Whether the inner payment modal is open
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCustomer = voucherType === 'receive_payment';

  // ── Reset on open/close/type change ──────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setKeyword('');
      setCustomers([]);
      setSuppliers([]);
      setSelectedCustomer(null);
      setSelectedSupplier(null);
      setIsPaymentModalOpen(false);
      setSearchError(null);
      // Load initial list
      handleSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, voucherType]);

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearch = useCallback(
    async (kw: string) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        if (isCustomer) {
          const res = await customerApi.searchCustomers(kw);
          setCustomers(res.data || []);
        } else {
          const res = await supplierApi.searchSuppliers(kw);
          setSuppliers(res.data || []);
        }
      } catch {
        setSearchError('Search failed. Please try again.');
      } finally {
        setIsSearching(false);
      }
    },
    [isCustomer]
  );

  const onKeywordChange = (value: string) => {
    setKeyword(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => handleSearch(value), 300);
  };

  // ── Entity selection ──────────────────────────────────────────────────────
  const handleSelectCustomer = (c: DBCustomer) => {
    setSelectedCustomer(c);
    setIsPaymentModalOpen(true);
  };

  const handleSelectSupplier = (s: FrontendSupplier) => {
    setSelectedSupplier(s);
    setIsPaymentModalOpen(true);
  };

  // ── Payment success callback ──────────────────────────────────────────────
  const handlePaymentSuccess = useCallback(() => {
    // Refresh active session KPIs (CASH-2 requirement §2.6)
    fetchCurrentState(activeShopId || undefined);
    onClose();
  }, [fetchCurrentState, activeShopId, onClose]);

  // ── Close inner modal (back to search) ───────────────────────────────────
  const handleInnerClose = () => {
    setIsPaymentModalOpen(false);
    setSelectedCustomer(null);
    setSelectedSupplier(null);
  };

  if (!isOpen) return null;

  const title = isCustomer ? 'Receive Customer Payment' : 'Pay Supplier Cash';
  const Icon = isCustomer ? UserCheck : ShoppingCart;
  const placeholder = isCustomer ? 'Search by name or phone…' : 'Search by name or phone…';
  const emptyLabel = isCustomer ? 'No customers found' : 'No suppliers found';

  return (
    <>
      {/* ── Search / select overlay ──────────────────────────────────────── */}
      {!isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search input */}
            <div className="px-6 pt-5 pb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {isCustomer
                  ? 'Select the customer to receive payment from.'
                  : 'Select the supplier to pay.'}
              </p>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={keyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  placeholder={placeholder}
                  className="block w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-colors"
                />
              </div>
              {searchError && (
                <p className="mt-2 text-xs text-red-500">{searchError}</p>
              )}
            </div>

            {/* Results list */}
            <div className="px-6 pb-6 max-h-72 overflow-y-auto mt-2 space-y-1">
              {isCustomer ? (
                customers.length === 0 && !isSearching ? (
                  <p className="text-center text-sm text-gray-400 py-8">{emptyLabel}</p>
                ) : (
                  customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                          {c.name}
                        </p>
                        {c.phone && (
                          <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>
                        )}
                      </div>
                      {c.currentBalance !== undefined && (
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-xs text-gray-400">Outstanding</p>
                          <p className={`text-sm font-bold ${c.currentBalance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            Rs {Math.abs(c.currentBalance).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </button>
                  ))
                )
              ) : (
                suppliers.length === 0 && !isSearching ? (
                  <p className="text-center text-sm text-gray-400 py-8">{emptyLabel}</p>
                ) : (
                  suppliers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSupplier(s)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-left transition-colors border border-transparent hover:border-orange-200 dark:hover:border-orange-800 group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-orange-700 dark:group-hover:text-orange-400">
                          {s.name}
                        </p>
                        {s.phone && (
                          <p className="text-xs text-gray-400 mt-0.5">{s.phone}</p>
                        )}
                      </div>
                      {s.currentBalance !== undefined && (
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-xs text-gray-400">Payable</p>
                          <p className={`text-sm font-bold ${s.currentBalance > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                            Rs {Math.abs(s.currentBalance).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </button>
                  ))
                )
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Delegated payment modals ─────────────────────────────────────── */}
      {isCustomer && (
        <ReceivePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={handleInnerClose}
          customer={selectedCustomer}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {!isCustomer && (
        <MakeSupplierPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={handleInnerClose}
          supplier={selectedSupplier}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
};
