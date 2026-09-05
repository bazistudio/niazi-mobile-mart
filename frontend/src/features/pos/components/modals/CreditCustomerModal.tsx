'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { DBCustomer } from '@/types/db.types';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';

interface Props {
  onClose: () => void;
  onSelect: (customer: DBCustomer) => void;
}

export const CreditCustomerModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const keys = useTenantQueryKeys();

  const { data: customerResponse, isLoading } = useQuery({
    queryKey: keys.customers,
    queryFn: () => customerApi.getCustomers(),
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const customers = customerResponse?.data || [];

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.mobile || '').includes(searchTerm) ||
    (c.accountCode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < filtered.length ? prev + 1 : prev));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex]);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
        
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Credit Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by Name / Mobile / Account Code..."
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Loading customers...
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((customer, idx) => (
              <div 
                key={customer.id || customer._id}
                onClick={() => onSelect(customer)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${idx === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 border' : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{customer.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{customer.accountCode || 'NO-CODE'} • {customer.mobile}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Balance</p>
                  <p className="font-bold text-red-600 dark:text-red-400 tabular-nums">Rs {customer.currentBalance.toLocaleString()}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">
              No customers found.
            </div>
          )}
        </div>

        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs text-gray-500">
          <span>Use <kbd className="border rounded px-1">↑</kbd> <kbd className="border rounded px-1">↓</kbd> to navigate</span>
          <span>Press <kbd className="border rounded px-1 font-bold">ENTER</kbd> to select</span>
        </div>
      </div>
    </div>
  );
};
