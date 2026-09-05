import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';

const months = [
  'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 
  'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 
  'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'
];

interface MonthSelectorProps {
  selectedMonth: string;
  onSelect: (month: string) => void;
}

export const MonthSelector = ({ selectedMonth, onSelect }: MonthSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        {selectedMonth}
        <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
          <div className="max-h-60 overflow-y-auto no-scrollbar">
            {months.map((month) => (
              <button
                key={month}
                onClick={() => {
                  onSelect(month);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  selectedMonth === month
                    ? 'bg-[#006970]/10 text-[#006970] dark:bg-[#00B4BB]/20 dark:text-[#00B4BB] font-semibold'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {month}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
