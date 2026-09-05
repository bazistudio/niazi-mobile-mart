import React, { useState } from 'react';
import { useHistoryStore } from '../store/history.store';
import { HistoryRowActions } from './HistoryRowActions';
import Link from 'next/link';

export const HistoryTable: React.FC = () => {
  const { items, isLoading, error } = useHistoryStore();

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'sale': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs font-bold">SALE</span>;
      case 'purchase': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-bold">PURCHASE</span>;
      case 'payment': return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-bold">PAYMENT</span>;
      case 'expense': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs font-bold">EXPENSE</span>;
      case 'import': return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold">IMPORT</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-bold">{type.toUpperCase()}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <span className="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-xs font-semibold">Paid</span>;
      case 'pending': return <span className="px-2 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-full text-xs font-semibold">Pending</span>;
      case 'partial': return <span className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-xs font-semibold">Partial</span>;
      default: return null;
    }
  };

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center text-gray-500">Loading history...</div>;
  }

  if (error) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-red-500 bg-red-50 rounded-xl">
        <p className="font-semibold mb-2">Failed to load history</p>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
            <tr>
              <th className="px-6 py-4 font-semibold">Date</th>
              <th className="px-6 py-4 font-semibold">Type</th>
              <th className="px-6 py-4 font-semibold">Reference</th>
              <th className="px-6 py-4 font-semibold">Party</th>
              <th className="px-6 py-4 font-semibold text-right">Amount</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-center">Source</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {new Date(item.createdAt).toLocaleDateString()}
                  <div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(item.type)}</td>
                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{item.referenceId}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.party.id && (item.party.type === 'customer' || item.party.type === 'supplier') ? (
                    <Link 
                      href={`/dashboard/shop-admin/${item.party.type === 'supplier' ? 'suppliers' : 'customers'}/${item.party.id}`}
                      className="font-medium text-[#006970] hover:text-[#00585e] hover:underline"
                    >
                      {item.party.name}
                    </Link>
                  ) : (
                    <div className="font-medium text-gray-900 dark:text-white">{item.party.name}</div>
                  )}
                  {item.party.type && <div className="text-xs text-gray-500 capitalize">{item.party.type}</div>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                  Rs {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">{getStatusBadge(item.status)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{item.source}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <HistoryRowActions item={item} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No history records found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
