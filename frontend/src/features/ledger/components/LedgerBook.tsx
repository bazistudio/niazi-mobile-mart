import React, { useState } from 'react';
import { useLedger } from '../hooks/useLedger';
import {
  Download, FileText, ArrowDownRight, ArrowUpRight,
  Printer, ChevronDown, ChevronUp, CreditCard, TrendingUp,
  TrendingDown, AlertCircle, Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import { SelectedParty } from '../hooks/useLedger';
import { ReceivePaymentModal } from '@/features/customers/components/ledger/ReceivePaymentModal';
import { MakeSupplierPaymentModal } from '@/features/suppliers/components/modals/MakeSupplierPaymentModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const highlightText = (text: string | undefined, query: string) => {
  if (!text || !query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={i} className="bg-yellow-200 text-black px-0.5 rounded">{part}</span>
      : part
  );
};

const formatRs = (n: number) => `Rs ${Math.abs(n).toLocaleString()}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryTileProps {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}
const SummaryTile: React.FC<SummaryTileProps> = ({ label, value, sub, colorClass = 'text-gray-900 dark:text-white' }) => (
  <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-100 dark:border-gray-700 min-w-[150px] flex-1">
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{label}</p>
    <p className={`text-2xl font-black leading-tight ${colorClass}`}>{value}</p>
    {sub && <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

// ─── Entry type badge ─────────────────────────────────────────────────────────
const EntryTypeBadge: React.FC<{ entryType: string }> = ({ entryType }) => {
  const map: Record<string, { label: string; cls: string }> = {
    SALE:        { label: 'Sale',        cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    PAYMENT:     { label: 'Payment',     cls: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300'  },
    PURCHASE:    { label: 'Purchase',    cls: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300'   },
    ADJUSTMENT:  { label: 'Adjust',      cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    CREDIT_NOTE: { label: 'Credit',      cls: 'bg-teal-100   text-teal-700   dark:bg-teal-900/30   dark:text-teal-300'   },
  };
  const badge = map[entryType] ?? { label: entryType, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${badge.cls}`}>
      {badge.label}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface LedgerBookProps {
  initialParty?: SelectedParty | null;
  readonly?: boolean;
}

export const LedgerBook: React.FC<LedgerBookProps> = ({ initialParty, readonly }) => {
  const {
    selectedParty,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    timeline,
    openInvoices,
    allocations,
    isLedgerLoading,
    refetchLedger,
  } = useLedger(initialParty);

  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const [expandedRows, setExpandedRows]       = useState<Record<string, boolean>>({});
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  React.useEffect(() => {
    if (!settings || !shopHeader) fetchSettings();
  }, [settings, shopHeader, fetchSettings]);

  if (!selectedParty) return null;

  const isCustomer    = selectedParty.type === 'CUSTOMER';
  const balance       = selectedParty.balance ?? 0;
  const absBalance    = Math.abs(balance);
  const balanceLabel  = balance < 0 ? 'Advance (CR)' : balance > 0 ? 'Outstanding (DR)' : 'Settled';
  const balanceColor  = balance < 0 ? 'text-green-600 dark:text-green-400' : balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
  const openDue       = openInvoices.reduce((s: number, inv: any) => s + (inv.remainingAmount ?? 0), 0);

  const toggleRow = (id: string) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const handlePrintReceipt = (e: React.MouseEvent, entry: any) => {
    e.stopPropagation();
    if (!settings || !shopHeader) return;
    const payload = {
      ...entry,
      customerId: isCustomer ? selectedParty : null,
      supplierId: !isCustomer ? selectedParty : null,
    };
    const html = printFormatter.formatPaymentReceipt(payload, settings, shopHeader);
    openPreview({ html, documentType: 'PaymentReceipt', referenceId: entry.id, title: `Payment Receipt – ${entry.transactionId}` });
  };

  const handlePrintLedger = () => {
    if (!settings || !shopHeader || !selectedParty) return;
    const html = printFormatter.formatLedgerStatement(selectedParty, timeline, settings, shopHeader, 'Full Ledger');
    openPreview({ html, documentType: 'Generic', referenceId: 'ledger', title: 'Ledger Statement' });
  };

  const handleExportPdf = () => {
    if (!settings || !shopHeader || !selectedParty) return;
    const html = printFormatter.formatLedgerStatement(selectedParty, timeline, settings, shopHeader, 'Full Ledger');
    downloadHtmlAsPdf(html, `Ledger_${selectedParty.name.replace(/\s+/g, '_')}`);
  };

  // Build a minimal "customer" / "supplier" object for payment modals
  const partyForModal: any = {
    id:          selectedParty.id,
    name:        selectedParty.name,
    balance:     selectedParty.balance,
    credit_limit: selectedParty.creditLimit ?? 0,
  };

  const onPaymentSuccess = () => {
    setPaymentModalOpen(false);
    refetchLedger();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Header / summary card ── */}
      {!readonly && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Party name + type */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {isCustomer
                  ? <TrendingUp className="w-5 h-5 text-orange-500" />
                  : <TrendingDown className="w-5 h-5 text-blue-500" />}
                <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                  {selectedParty.name}
                </h2>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                {isCustomer ? 'Customer — Receivables Ledger' : 'Supplier — Payables Ledger'}
              </p>
            </div>

            {/* Record Payment CTA */}
            <button
              onClick={() => setPaymentModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-[#006970] hover:bg-[#005a60] text-white font-black rounded-xl shadow-md transition-all active:scale-95 whitespace-nowrap"
            >
              {isCustomer
                ? <><Receipt className="w-4 h-4" /> Receive Payment</>
                : <><CreditCard className="w-4 h-4" /> Pay Supplier</>}
            </button>
          </div>

          {/* Summary tiles */}
          <div className="flex flex-wrap gap-3">
            <SummaryTile
              label="Current Balance"
              value={`Rs ${absBalance.toLocaleString()}`}
              sub={balanceLabel}
              colorClass={balanceColor}
            />
            <SummaryTile
              label={isCustomer ? 'Open Invoices Due' : 'Pending Purchases'}
              value={`Rs ${openDue.toLocaleString()}`}
              sub={`${openInvoices.length} active`}
              colorClass="text-orange-600 dark:text-orange-400"
            />
            <SummaryTile
              label="Total Transactions"
              value={String(timeline.length)}
              sub="entries in view"
            />
            {selectedParty.creditLimit != null && selectedParty.creditLimit > 0 && (
              <SummaryTile
                label={isCustomer ? 'Credit Limit' : 'Credit Extended'}
                value={`Rs ${selectedParty.creditLimit.toLocaleString()}`}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Transaction table card ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          {/* Tabs */}
          <div className="flex gap-1">
            {(['all', 'invoices', 'payments'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-sm font-bold rounded-lg capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-[#006970] text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search + actions */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search reference or description…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] w-52 sm:w-64"
            />
            <button
              onClick={handlePrintLedger}
              title="Print Ledger"
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportPdf}
              title="Export PDF"
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[320px]">
          {isLedgerLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-[#006970] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm font-bold">No transactions found</p>
              <p className="text-xs mt-1">
                {searchQuery ? 'Try a different search term' : 'No entries recorded yet'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 dark:bg-gray-900 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-3 w-6" />
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 hidden md:table-cell">Description</th>
                  <th className="px-5 py-3 text-right">
                    {isCustomer ? 'Debit (Dr)' : 'Debit (Dr)'}
                  </th>
                  <th className="px-5 py-3 text-right">
                    {isCustomer ? 'Credit (Cr)' : 'Credit (Cr)'}
                  </th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3 text-center w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {timeline.map((entry: any) => {
                  const isPayment        = entry.type === 'payment';
                  const entryType        = entry.entry_type as string ?? (isPayment ? 'PAYMENT' : 'SALE');
                  const debitAmt         = typeof entry.debit  === 'number' ? entry.debit  : (isCustomer && !isPayment ? entry.amount : 0);
                  const creditAmt        = typeof entry.credit === 'number' ? entry.credit : (isPayment ? entry.amount : 0);
                  const bal              = typeof entry.runningBalance === 'number' ? entry.runningBalance : 0;
                  const entryAllocations = isPayment ? allocations.filter((a: any) => a.paymentEntryId === entry.id) : [];
                  const hasDetails       = isPayment ? entryAllocations.length > 0 : (entry.items?.length ?? 0) > 0;
                  const isExpanded       = expandedRows[entry.id] ?? false;

                  const rowIcon = isPayment
                    ? <ArrowDownRight className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />;

                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className={`group transition-colors ${hasDetails ? 'cursor-pointer' : ''} hover:bg-blue-50/60 dark:hover:bg-blue-900/10`}
                        onClick={() => hasDetails && toggleRow(entry.id)}
                      >
                        {/* Expand toggle */}
                        <td className="px-3 py-4 text-center">
                          {hasDetails && (
                            <button
                              className="text-gray-400 group-hover:text-blue-500 transition-colors"
                              onClick={e => { e.stopPropagation(); toggleRow(entry.id); }}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-5 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs font-semibold">
                          {format(new Date(entry.timestamp), 'dd MMM yyyy')}<br />
                          <span className="text-[10px] opacity-70">{format(new Date(entry.timestamp), 'hh:mm a')}</span>
                        </td>

                        {/* Reference */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            {rowIcon}
                            <span className="font-black text-gray-900 dark:text-white text-sm">
                              {highlightText(entry.transactionId, searchQuery)}
                            </span>
                          </div>
                        </td>

                        {/* Type badge */}
                        <td className="px-5 py-4">
                          <EntryTypeBadge entryType={entryType} />
                        </td>

                        {/* Description */}
                        <td className="px-5 py-4 hidden md:table-cell text-gray-600 dark:text-gray-300 max-w-[220px] truncate">
                          {highlightText(entry.description, searchQuery)}
                        </td>

                        {/* Debit */}
                        <td className="px-5 py-4 text-right">
                          {debitAmt > 0 ? (
                            <span className="font-black text-red-600 dark:text-red-400">
                              {formatRs(debitAmt)}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs font-semibold">—</span>
                          )}
                        </td>

                        {/* Credit */}
                        <td className="px-5 py-4 text-right">
                          {creditAmt > 0 ? (
                            <span className="font-black text-green-600 dark:text-green-400">
                              {formatRs(creditAmt)}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs font-semibold">—</span>
                          )}
                        </td>

                        {/* Running balance */}
                        <td className="px-5 py-4 text-right">
                          <span className={`font-black ${bal < 0 ? 'text-green-600 dark:text-green-400' : bal > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                            {formatRs(bal)}
                          </span>
                          <span className={`ml-1 text-[10px] font-black ${bal < 0 ? 'text-green-500' : bal > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {bal < 0 ? 'CR' : bal > 0 ? 'DR' : ''}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-4 text-center">
                          {isPayment && (
                            <button
                              onClick={e => handlePrintReceipt(e, entry)}
                              title="Print receipt"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* ── Expanded: payment allocations ── */}
                      {isExpanded && isPayment && entryAllocations.length > 0 && (
                        <tr className="bg-green-50/40 dark:bg-green-900/10">
                          <td colSpan={9} className="px-10 py-4 border-l-4 border-green-400">
                            <p className="text-[11px] font-black uppercase tracking-widest text-green-600 dark:text-green-400 mb-2">
                              Settled Against Invoices
                            </p>
                            <div className="space-y-1.5">
                              {entryAllocations.map((alloc: any) => (
                                <div key={alloc._id} className="flex justify-between items-center bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-green-100 dark:border-green-900">
                                  <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{alloc.orderNumber}</span>
                                  <span className="font-black text-sm text-green-700 dark:text-green-400">Rs {alloc.amountAllocated.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* ── Expanded: invoice line items ── */}
                      {isExpanded && !isPayment && (entry.items?.length ?? 0) > 0 && (
                        <tr className="bg-orange-50/40 dark:bg-orange-900/10">
                          <td colSpan={9} className="px-10 py-4 border-l-4 border-orange-400">
                            <p className="text-[11px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400 mb-2">
                              Invoice Line Items
                            </p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 font-bold border-b border-orange-100 dark:border-orange-900">
                                  <th className="text-left pb-1">Item</th>
                                  <th className="text-right pb-1">Qty</th>
                                  <th className="text-right pb-1">Unit Price</th>
                                  <th className="text-right pb-1">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.items.map((item: any, idx: number) => {
                                  const qty = item.qty ?? item.quantity ?? 0;
                                  const price = item.price ?? 0;
                                  return (
                                    <tr key={idx} className="text-gray-700 dark:text-gray-300">
                                      <td className="py-1 font-semibold">{item.productId?.name ?? item.name ?? 'Item'}</td>
                                      <td className="py-1 text-right">{qty}</td>
                                      <td className="py-1 text-right">Rs {price.toLocaleString()}</td>
                                      <td className="py-1 text-right font-bold">Rs {(qty * price).toLocaleString()}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Payment modals ── */}
      {isCustomer && (
        <ReceivePaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          customer={partyForModal}
          onPaymentSuccess={onPaymentSuccess}
        />
      )}
      {!isCustomer && (
        <MakeSupplierPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          supplier={partyForModal}
          onPaymentSuccess={onPaymentSuccess}
        />
      )}
    </div>
  );
};
