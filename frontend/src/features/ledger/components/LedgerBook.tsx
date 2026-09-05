import React, { useState } from 'react';
import { useLedger } from '../hooks/useLedger';
import { Download, FileText, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import { SelectedParty } from '../hooks/useLedger';

const highlightText = (text: string | undefined, query: string) => {
  if (!text || !query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() ? <span key={i} className="bg-yellow-200 text-black px-0.5 rounded">{part}</span> : part
  );
};

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
    isLedgerLoading 
  } = useLedger(initialParty);

  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrintReceipt = (e: React.MouseEvent, entry: any) => {
    e.stopPropagation();
    if (!settings || !shopHeader) return;
    const ledgerPayload = {
      ...entry,
      customerId: selectedParty?.type === 'CUSTOMER' ? selectedParty : null,
      supplierId: selectedParty?.type === 'SUPPLIER' ? selectedParty : null,
    };
    const html = printFormatter.formatPaymentReceipt(ledgerPayload, settings, shopHeader);
    openPreview({ html, documentType: 'PaymentReceipt', referenceId: entry.id, title: `Payment Receipt - ${entry.transactionId}` });
  };

  const handlePrintLedger = (full: boolean) => {
    if (!settings || !shopHeader || !selectedParty) return;
  };

  if (!selectedParty) return null;

  const isCredit = selectedParty.balance < 0;
  const balanceStr = Math.abs(selectedParty.balance).toLocaleString();
  const balanceLabel = isCredit ? 'Advance (CR)' : (selectedParty.balance > 0 ? 'Outstanding (DR)' : 'Settled');
  
  const outstandingInvoicesTotal = openInvoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

  return (
    <div className="space-y-6">
      {!readonly && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">{selectedParty.name}</h2>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{selectedParty.type} LEDGER</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-100 dark:border-gray-700 min-w-[140px]">
              <p className="text-xs text-gray-500 font-bold mb-1">Current Balance</p>
              <p className={`text-xl font-black ${isCredit ? 'text-green-600 dark:text-green-400' : selectedParty.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                Rs {balanceStr}
              </p>
              <p className="text-[10px] font-bold text-gray-400">{balanceLabel}</p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-100 dark:border-gray-700 min-w-[140px]">
              <p className="text-xs text-gray-500 font-bold mb-1">Open Invoices Due</p>
              <p className="text-xl font-black text-orange-600 dark:text-orange-400">
                Rs {outstandingInvoicesTotal.toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-gray-400">{openInvoices.length} Active Invoice(s)</p>
            </div>

            <button className="h-full px-6 bg-[#006970] hover:bg-[#005a60] text-white font-bold rounded-lg shadow-md transition-colors flex flex-col items-center justify-center gap-1">
              <span className="text-lg">Record</span>
              <span className="text-sm">Payment</span>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
        
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-1 overflow-x-auto">
            {['all', 'invoices', 'payments'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 text-sm font-bold rounded-lg capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Search reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (!settings || !shopHeader || !selectedParty) return;
                  const html = printFormatter.formatLedgerStatement(selectedParty, timeline, settings, shopHeader, 'Filtered Ledger');
                  openPreview({ html, documentType: 'Generic', referenceId: 'ledger', title: 'Ledger Statement' });
                }}
                className="p-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 active:scale-95 active:bg-blue-600 active:text-white dark:hover:bg-gray-700 dark:active:bg-blue-600 transition-all flex items-center gap-2"
                title="Print Filtered Ledger"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  if (!settings || !shopHeader || !selectedParty) return;
                  const html = printFormatter.formatLedgerStatement(selectedParty, timeline, settings, shopHeader, 'Filtered Ledger');
                  downloadHtmlAsPdf(html, `Ledger_${selectedParty.name.replace(/\s+/g, '_')}_Filtered`);
                }}
                className="p-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 active:scale-95 active:bg-blue-600 active:text-white dark:hover:bg-gray-700 dark:active:bg-blue-600 transition-all flex items-center gap-2"
                title="Export Filtered Ledger PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="w-full relative min-h-[400px] overflow-x-auto lg:overflow-visible">
          {isLedgerLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50">
              <div className="animate-spin w-8 h-8 border-4  border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Reference</th>
                  <th className="px-6 py-3 font-semibold hidden md:table-cell">Details</th>
                  <th className="px-6 py-3 font-semibold text-right">Debit</th>
                  <th className="px-6 py-3 font-semibold text-right">Credit</th>
                  <th className="px-6 py-3 font-semibold text-right">Balance</th>
                  <th className="px-6 py-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {timeline.map((entry) => {
                  const isPayment = entry.type === 'payment';
                  const amount = entry.amount;
                  const bal = entry.runningBalance || 0;
                  const isCustomer = selectedParty.type === 'CUSTOMER';
                  const showDebit = isCustomer ? !isPayment : isPayment;
                  const showCredit = isCustomer ? isPayment : !isPayment;
                  const entryAllocations = isPayment ? allocations.filter(a => a.paymentEntryId === entry.id) : [];

                  return (
                    <React.Fragment key={entry.id}>
                      <tr 
                        className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${isPayment || entry.items?.length > 0 ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (isPayment || entry.items?.length > 0) toggleRow(entry.id);
                        }}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500 flex items-center gap-2">
                          {(isPayment || entry.items?.length > 0) && (
                            <button className="text-gray-400 hover:text-blue-500 focus:outline-none">
                              {expandedRows[entry.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                          {format(new Date(entry.timestamp), 'dd MMM yyyy, hh:mm a')}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {isPayment ? <ArrowDownRight className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4 text-orange-500" />}
                            {highlightText(entry.transactionId, searchQuery)}
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className="text-gray-900 dark:text-gray-200">
                            {highlightText(
                              entry.description?.match(/(credit|cash) (sale|purchase) -/i) 
                                ? (entry.description.toLowerCase().includes('credit') ? 'Credit' : 'Cash') 
                                : entry.description, 
                              searchQuery
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">
                          {showDebit ? `Rs ${amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">
                          {showCredit ? `Rs ${amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-bold ${bal < 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                            {Math.abs(bal).toLocaleString()} {bal < 0 ? 'CR' : 'DR'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isPayment && (
                            <button 
                              onClick={(e) => handlePrintReceipt(e, entry)}
                              className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded tooltip-trigger transition-colors"
                              title="Print Receipt"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {expandedRows[entry.id] && isPayment && entryAllocations.length > 0 && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                          <td colSpan={7} className="px-6 py-4 border-l-4 ">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Settled Invoices</h4>
                            <div className="space-y-2">
                              {entryAllocations.map(alloc => (
                                <div key={alloc._id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700">
                                  <span className="font-medium text-sm text-gray-900 dark:text-white">{alloc.orderNumber}</span>
                                  <span className="text-sm font-bold text-blue-600">Rs {alloc.amountAllocated.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}

                      {expandedRows[entry.id] && !isPayment && entry.items?.length > 0 && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                          <td colSpan={7} className="px-10 py-4 border-l-4 border-orange-500">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Invoice Items</h4>
                            <div className="space-y-1">
                              <div className="font-bold text-gray-500 mb-1 flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1 text-xs">
                                <span>Item</span>
                                <span>Amount</span>
                              </div>
                              {entry.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                  <span>{item.qty || item.quantity}x {item.productId?.name || 'Item'}</span>
                                  <span>Rs {((item.qty || item.quantity) * item.price).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {timeline.length === 0 && !isLedgerLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No transactions found for this party.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
