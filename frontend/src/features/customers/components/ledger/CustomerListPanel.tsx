import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { DBCustomer } from '@/types/db.types';

interface CustomerListPanelProps {
  customers: DBCustomer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string) => void;
}

export const CustomerListPanel = ({ customers, selectedCustomerId, onSelectCustomer }: CustomerListPanelProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.mobile.includes(searchTerm)
  );

  useEffect(() => {
    // Reset focus when search changes
    setFocusedIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have filtered customers
      if (filteredCustomers.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => {
          const nextIndex = prev < filteredCustomers.length - 1 ? prev + 1 : prev;
          onSelectCustomer(filteredCustomers[nextIndex].id);
          return nextIndex;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : prev;
          onSelectCustomer(filteredCustomers[nextIndex].id);
          return nextIndex;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCustomers[focusedIndex];
        if (selected) {
          onSelectCustomer(selected.id);
        }
      }
    };

    // We can add the listener to the window so it works as soon as they type, 
    // but maybe we only want it when the search input or panel is focused.
    // For wholesale speed, global is often preferred, but let's bind it to the panel.
    const panel = listRef.current;
    if (panel) {
      panel.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (panel) panel.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredCustomers, focusedIndex, onSelectCustomer]);

  // Keep focused item in view
  useEffect(() => {
    const focusedElement = document.getElementById(`customer-item-${focusedIndex}`);
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const getStatusColor = (balance: number, limit: number) => {
    if (limit <= 0) return 'bg-gray-400';
    const ratio = balance / limit;
    if (ratio >= 0.9) return '';
    if (ratio >= 0.5) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  return (
    <div 
      className="w-full h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
      ref={listRef}
      tabIndex={-1} // Allow the panel to catch keyboard events
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            autoFocus // Auto focus for keyboard navigation
            className="block w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent text-sm transition-colors"
            placeholder="Search Name/Phone (Use ↑↓ Enter)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
               // Forward keys to the list
               if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                 // Prevent cursor from moving in input
                 if(e.key !== 'Enter') e.preventDefault();
                 
                 const event = new KeyboardEvent('keydown', { key: e.key });
                 listRef.current?.dispatchEvent(event);
               }
            }}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
        {filteredCustomers.map((customer, index) => (
          <button
            key={customer.id}
            id={`customer-item-${index}`}
            onClick={() => {
              setFocusedIndex(index);
              onSelectCustomer(customer.id);
            }}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              selectedCustomerId === customer.id
                ? 'bg-[#006970]/5 border-[#006970]/30 dark:bg-[#00B4BB]/10 dark:border-[#00B4BB]/30'
                : focusedIndex === index
                ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600'
                : 'bg-white border-transparent hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(customer.currentBalance, customer.creditLimit)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {customer.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                  Balance: Rs {customer.currentBalance.toLocaleString()}
                </p>
              </div>
            </div>
          </button>
        ))}
        {filteredCustomers.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            No customers found.
          </div>
        )}
      </div>
    </div>
  );
};
