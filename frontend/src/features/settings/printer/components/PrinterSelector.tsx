'use client';
import React from 'react';
import { usePrinterStore } from '../store/printer.store';
import { PrinterType } from '../types/printer.types';
import { Printer, FileText } from 'lucide-react';

export const PrinterSelector: React.FC = () => {
  const { settings, updateSettings } = usePrinterStore();

  if (!settings) return null;

  const handleTypeChange = (type: PrinterType) => {
    updateSettings({ printerType: type });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-100 dark:border-neutral-800">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Printer className="w-5 h-5 text-[#006970]" />
        Printer Mode
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: 'THERMAL_80MM', label: '80mm Thermal', desc: 'Standard POS Receipt' },
          { id: 'THERMAL_58MM', label: '58mm Thermal', desc: 'Compact Receipt' },
          { id: 'A4', label: 'A4 / Letter', desc: 'Office Printer' },
          { id: 'PDF_ONLY', label: 'PDF Only', desc: 'Digital Export' }
        ].map(mode => (
          <button
            key={mode.id}
            onClick={() => handleTypeChange(mode.id as PrinterType)}
            className={`flex flex-col items-start p-4 border rounded-lg transition-all ${
              settings.printerType === mode.id
                ? 'border-[#006970] bg-[#006970]/5 dark:bg-[#006970]/20 ring-1 ring-[#006970]'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-[#006970]/50'
            }`}
          >
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{mode.label}</span>
            <span className="text-xs text-neutral-500 mt-1">{mode.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
