'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supplierApi } from '@/services/supplier.api';
import { importApi } from '@/services/import.api';
import { Keyboard, Plus, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface GridRow {
  id: string;
  sno: number;
  barcode: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  costPrice: number;
  salePrice: number;
  lowStockAlert: number;
  status: 'new' | 'existing' | 'error' | 'idle';
  errorMsg?: string;
}

const createEmptyRow = (sno: number): GridRow => ({
  id: crypto.randomUUID(),
  sno,
  barcode: '',
  sku: '',
  name: '',
  category: 'Imported',
  unit: 'pcs',
  qty: 1,
  costPrice: 0,
  salePrice: 0,
  lowStockAlert: 5,
  status: 'idle'
});

export const ManualImportTab = () => {
  const [rows, setRows] = useState<GridRow[]>([createEmptyRow(1)]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierApi.getSuppliers(1, 100)
  });
  const suppliers = suppliersData?.data || [];

  // Focus management
  const gridRef = useRef<HTMLTableElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldIndex: number, fieldName: keyof GridRow) => {
    // Arrow keys navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(rowIndex + 1, fieldIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(rowIndex - 1, fieldIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      focusCell(rowIndex + 1, fieldIndex);
    }

    // Tab on last field of last row creates a new row
    if (e.key === 'Tab' && !e.shiftKey) {
      if (rowIndex === rows.length - 1 && fieldName === 'lowStockAlert') {
        e.preventDefault();
        setRows(prev => [...prev, createEmptyRow(prev.length + 1)]);
        setTimeout(() => {
          focusCell(rowIndex + 1, 0); // focus first input of new row
        }, 50);
      }
    }
  };

  const focusCell = (rowIndex: number, fieldIndex: number) => {
    if (!gridRef.current) return;
    const inputs = gridRef.current.querySelectorAll(`tr[data-row="${rowIndex}"] input, tr[data-row="${rowIndex}"] select`);
    if (inputs && inputs[fieldIndex]) {
      (inputs[fieldIndex] as HTMLElement).focus();
    }
  };

  const updateRow = (index: number, field: keyof GridRow, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      
      // Auto-calculate sale price if cost price is entered and sale price is 0
      if (field === 'costPrice' && newRows[index].salePrice === 0) {
        newRows[index].salePrice = Number(value) * 1.20;
      }
      
      return newRows;
    });
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(prev => {
      const newRows = prev.filter((_, i) => i !== index);
      // Re-number
      return newRows.map((r, i) => ({ ...r, sno: i + 1 }));
    });
  };

  // Live calculation stats
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + ((Number(r.costPrice) || 0) * (Number(r.qty) || 0)), 0);
  const validRows = rows.filter(r => r.name.trim() !== '' && r.qty > 0 && r.costPrice >= 0);

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast.error('Please enter at least one valid product with Name and Quantity.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        items: validRows.map(r => ({
          name: r.name,
          sku: r.sku,
          barcode: r.barcode,
          qty: Number(r.qty),
          costPrice: Number(r.costPrice),
          salePrice: Number(r.salePrice),
          lowStockAlert: Number(r.lowStockAlert)
        })),
        options: {
          supplierId: supplierId || undefined,
          invoiceNumber: invoiceNumber || undefined
        }
      };

      const res = await importApi.manualImport(payload);
      toast.success(res.message || 'Import successful!');
      
      // Reset
      setRows([createEmptyRow(1)]);
      setInvoiceNumber('');
      setSupplierId('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Import failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Panel: Summary & Supplier */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Supplier & Options */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">
            Import Details
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier (Optional)</label>
            <select 
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
            >
              <option value="">-- No Supplier (Manual Adjustment) --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {supplierId && <p className="text-xs text-blue-600 mt-1">Will generate a Payable Ledger Entry.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Number</label>
            <input 
              type="text" 
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2023-001"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-[#006970]"
            />
          </div>
        </div>

        {/* Live Summary Stats */}
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center">
            <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Valid Rows</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{validRows.length} <span className="text-sm font-normal text-gray-400">/ {rows.length}</span></span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center">
            <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Quantity</span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalQty}</span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center">
            <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Value</span>
            <span className="text-2xl font-black text-green-600 dark:text-green-400">Rs {totalCost.toLocaleString()}</span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center">
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting || validRows.length === 0}
              className="w-full h-full min-h-[60px] bg-[#006970] hover:bg-[#005a60] text-white rounded-lg font-bold flex flex-col items-center justify-center disabled:opacity-50 transition-colors shadow-md"
            >
              {isSubmitting ? 'Importing...' : (
                <>
                  <Save className="w-5 h-5 mb-1" />
                  Import Stock
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Grid Area */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
        <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Keyboard className="w-5 h-5" />
            <span className="font-semibold text-sm">Keyboard Workflow: Tab to move right, Enter to move down. Press Tab on last cell to add row.</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" ref={gridRef}>
            <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-3 py-3 w-12 text-center">#</th>
                <th className="px-3 py-3 w-32">Barcode</th>
                <th className="px-3 py-3 w-32">SKU</th>
                <th className="px-3 py-3 min-w-[200px]">Product Name <span className="text-red-500">*</span></th>
                <th className="px-3 py-3 w-24">Qty <span className="text-red-500">*</span></th>
                <th className="px-3 py-3 w-32">Cost Price <span className="text-red-500">*</span></th>
                <th className="px-3 py-3 w-32">Sale Price</th>
                <th className="px-3 py-3 w-24">Low Alert</th>
                <th className="px-3 py-3 w-32 text-right">Line Total</th>
                <th className="px-3 py-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row, rowIndex) => (
                <tr key={row.id} data-row={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                  <td className="px-3 py-2 text-center font-medium text-gray-500">
                    {row.sno}
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="text" 
                      value={row.barcode}
                      onChange={e => updateRow(rowIndex, 'barcode', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 0, 'barcode')}
                      placeholder="Scan..."
                      className="w-full px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="text" 
                      value={row.sku}
                      onChange={e => updateRow(rowIndex, 'sku', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 1, 'sku')}
                      placeholder="Auto"
                      className="w-full px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 transition-all outline-none"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="text" 
                      value={row.name}
                      onChange={e => updateRow(rowIndex, 'name', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 2, 'name')}
                      placeholder="Product Name..."
                      className={`w-full px-2 py-1.5 border hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded focus:bg-white dark:focus:bg-gray-900 transition-all outline-none ${!row.name ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800/30' : 'bg-transparent border-transparent'}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="number" 
                      min="1"
                      value={row.qty || ''}
                      onChange={e => updateRow(rowIndex, 'qty', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 3, 'qty')}
                      className={`w-full px-2 py-1.5 border hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-center ${row.qty <= 0 ? 'bg-red-50 border-red-100 dark:bg-red-900/10' : 'bg-transparent border-transparent'}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="number" 
                      min="0" step="0.01"
                      value={row.costPrice || ''}
                      onChange={e => updateRow(rowIndex, 'costPrice', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 4, 'costPrice')}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-right"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="number" 
                      min="0" step="0.01"
                      value={row.salePrice || ''}
                      onChange={e => updateRow(rowIndex, 'salePrice', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 5, 'salePrice')}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-right"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input 
                      type="number" 
                      min="0"
                      value={row.lowStockAlert || ''}
                      onChange={e => updateRow(rowIndex, 'lowStockAlert', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIndex, 6, 'lowStockAlert')}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-gray-300 focus:border-[#006970] focus:ring-1 focus:ring-[#006970] rounded bg-transparent focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-center"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                    {((Number(row.costPrice) || 0) * (Number(row.qty) || 0)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button 
                      onClick={() => removeRow(rowIndex)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                      tabIndex={-1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <button 
            onClick={() => setRows(prev => [...prev, createEmptyRow(prev.length + 1)])}
            className="flex items-center gap-2 text-sm font-semibold text-[#006970] hover:text-[#005a60] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Row Manually
          </button>
        </div>
      </div>
    </div>
  );
};
