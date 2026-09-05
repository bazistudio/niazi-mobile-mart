import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { DBLedgerEntry } from '@/types/db.types';
import { format } from 'date-fns';

interface LedgerTableProps {
  entries: DBLedgerEntry[];
}

export const LedgerTable = ({ entries }: LedgerTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate Running Balance
  // Assuming opening balance is 0 for now (or handled by an initial entry)
  // Receivable Debit increases balance, Receivable Credit decreases balance
  const ledgerWithBalance = useMemo(() => {
    // 1. Sort chronologically ascending to calculate running balance
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    
    let currentBalance = 0;
    return sorted.map(entry => {
      let debit = null;
      let credit = null;

      // Logic: If we gave them goods (Invoice), it debits their Receivable account.
      // If they gave us money (Payment), it credits their Receivable account.
      if (entry.debitAccount === 'receivable') {
        debit = entry.amount;
        currentBalance += entry.amount;
      } else if (entry.creditAccount === 'receivable') {
        credit = entry.amount;
        currentBalance -= entry.amount;
      }

      return {
        ...entry,
        formattedDate: format(entry.timestamp, 'dd MMM yyyy, hh:mm a'),
        description: entry.description || (entry.type === 'payment' ? 'Payment Received' : `Transaction ${entry.transactionId}`),
        debit,
        credit,
        balance: currentBalance
      };
    });
  }, [entries]);

  // Reverse so newest is on top for display
  const displayEntries = useMemo(() => {
    const reversed = [...ledgerWithBalance].reverse();
    if (!searchTerm) return reversed;

    const lowerSearch = searchTerm.toLowerCase();
    return reversed.filter(e => 
      e.formattedDate.toLowerCase().includes(lowerSearch) ||
      e.description.toLowerCase().includes(lowerSearch) ||
      e.amount.toString().includes(lowerSearch) ||
      (e.transactionId || '').toLowerCase().includes(lowerSearch)
    );
  }, [ledgerWithBalance, searchTerm]);

  return (
    <div id="ledger-print-area" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col flex-1">
      {/* Ledger Search Bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent text-sm transition-colors"
            placeholder="Search Date, Invoice, Description, Amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
              <th scope="col" className="px-6 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              <th scope="col" className="px-6 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-red-600 dark:text-red-400">Debit (You Gave)</th>
              <th scope="col" className="px-6 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-green-600 dark:text-green-400">Credit (You Got)</th>
              <th scope="col" className="px-6 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Balance</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {displayEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-6 py-1.5 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{entry.formattedDate}</td>
                <td className="px-6 py-1.5 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{entry.description}</td>
                <td className="px-6 py-1.5 whitespace-nowrap text-sm text-right text-red-600 dark:text-red-400 font-medium">
                  {entry.debit ? entry.debit.toLocaleString() : '-'}
                </td>
                <td className="px-6 py-1.5 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400 font-medium">
                  {entry.credit ? entry.credit.toLocaleString() : '-'}
                </td>
                <td className="px-6 py-1.5 whitespace-nowrap text-sm text-right font-bold text-gray-900 dark:text-white">
                  {entry.balance.toLocaleString()}
                </td>
              </tr>
            ))}
            {displayEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
                  No ledger entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400 text-center">
        Showing ledger for the selected month. Expand the selector above to view past months.
      </div>
    </div>
  );
};
