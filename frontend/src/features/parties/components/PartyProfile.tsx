"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { partyApi } from '@/services/party.api';
import { ArrowLeft, BookOpen, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

interface PartyProfileProps {
  partyId: string;
}

export const PartyProfile: React.FC<PartyProfileProps> = ({ partyId }) => {
  const router = useRouter();

  const { data: response, isLoading } = useQuery({
    queryKey: ['partyLedger', partyId],
    queryFn: () => partyApi.getPartyLedger(partyId),
  });

  const party = response?.data?.party;
  const ledger = response?.data?.ledger || [];
  const currentBalance = response?.data?.currentBalance || 0;

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading party profile...</div>;
  }

  if (!party) {
    return <div className="p-8 text-center text-red-500">Party not found.</div>;
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      
      {/* Header & Back Button */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.back()}
          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          {party.contactPerson}
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Profile Details Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#006970]"></div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-[#006970]/10 text-[#006970] flex items-center justify-center font-bold text-2xl">
                {(party.contactPerson || 'P').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{party.contactPerson}</h3>
                <p className="text-sm text-gray-500">{party.partyCode}</p>
              </div>
            </div>

            <div className="space-y-4">
              {party.companyName && (
                <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <Building2 className="w-5 h-5 text-gray-400 shrink-0" />
                  <span>{party.companyName}</span>
                </div>
              )}
              {party.phone && (
                <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <Phone className="w-5 h-5 text-gray-400 shrink-0" />
                  <span>{party.phone}</span>
                </div>
              )}
              {party.email && (
                <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                  <span>{party.email}</span>
                </div>
              )}
              {party.address && (
                <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
                  <span>{party.address}</span>
                </div>
              )}
            </div>

            <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current Balance</p>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-black ${currentBalance > 0 ? 'text-blue-600 dark:text-blue-400' : currentBalance < 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
                  Rs {Math.abs(currentBalance).toLocaleString()}
                </span>
                <span className="text-sm font-bold text-gray-500 mb-1">
                  {currentBalance > 0 ? 'Receivable (They owe us)' : currentBalance < 0 ? 'Payable (We owe them)' : 'Settled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Ledger Section */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-gray-400" />
                <h3 className="font-bold text-gray-900 dark:text-white">Unified Ledger</h3>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50/80 dark:bg-gray-800/80 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Date</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Type</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Debit (+)</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Credit (-)</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Balance</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800/50">
                  {ledger.map((entry: any, idx: number) => (
                    <tr key={entry._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(entry.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {entry.referenceType.replace(/_/g, ' ')}
                        </span>
                        {entry.notes && <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {entry.type === 'DR' ? (
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            {entry.amount.toLocaleString()}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {entry.type === 'CR' ? (
                          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                            {entry.amount.toLocaleString()}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-bold ${entry.runningBalance > 0 ? 'text-blue-600' : entry.runningBalance < 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                          {Math.abs(entry.runningBalance).toLocaleString()} {entry.runningBalance > 0 ? 'Dr' : entry.runningBalance < 0 ? 'Cr' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
