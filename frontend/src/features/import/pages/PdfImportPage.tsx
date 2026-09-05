'use client';

import React, { useState } from 'react';
import { PdfUploader } from '../components/PdfUploader';
import { ImportPreviewTable } from '../components/ImportPreviewTable';
import { ImportActions } from '../components/ImportActions';
import { ManualImportTab } from '../components/ManualImportTab';
import { importApi } from '@/services/import.api';
import { parseInvoiceData, normalizeImportPayload, validateParsedData } from '../utils/importHelpers';
import { ImportState, PriceData, PurchaseOptions, ParsedInvoice } from '../types/import.types';
import { FileText, Keyboard, History, AlertCircle, CheckCircle, Loader2, CreditCard, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';

export const PdfImportPage = () => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'manual' | 'history'>('pdf');
  const [state, setState] = useState<ImportState>({
    file: null,
    rawText: '',
    parsedData: null,
    loading: false,
    error: null,
  });

  const [purchaseType, setPurchaseType] = useState<'cash' | 'credit'>('credit');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceData>>({});

  const handleFileSelect = async (file: File) => {
    setState(prev => ({ ...prev, file, loading: true, error: null }));
    try {
      const resData = await importApi.uploadPDF(file);
      const rawText = resData.rawLines.join('\n');
      const parsedMeta = parseInvoiceData(rawText);
      
      const items = resData.products.map((p: any) => ({
        name: p.name,
        qty: p.quantity || p.qty || 1,
        price: p.price || 0
      }));

      const computedTotal = items.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0);

      const parsedData: ParsedInvoice = {
        customerName: parsedMeta.customerName || 'Unknown Customer',
        phone: parsedMeta.phone || '00000000000',
        totalAmount: computedTotal > 0 ? computedTotal : parsedMeta.totalAmount,
        items,
        date: parsedMeta.date || new Date().toLocaleDateString()
      };
      
      const initialOverrides: Record<string, PriceData> = {};
      parsedData.items.forEach(item => {
        initialOverrides[item.name] = {
          costPrice: item.price,
          salePrice: item.price * 1.20 // V1.1 rule: 20% markup default
        };
      });

      setState(prev => ({ ...prev, rawText, parsedData, loading: false }));
      setPriceOverrides(initialOverrides);
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message || 'Failed to parse PDF' }));
    }
  };

  const handleConfirm = async () => {
    if (!state.parsedData) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const payload = normalizeImportPayload(state.parsedData);
      const options: PurchaseOptions = {
        type: purchaseType,
        supplierId: supplierId || undefined,
        priceOverrides
      };

      await importApi.commitImport({
        customer: payload.customer,
        items: payload.items,
        totalAmount: payload.totalAmount,
        options
      });
      
      toast.success('Successfully imported invoice into inventory and ledger!');
      handleReset();
    } catch (err: any) {
      toast.error(err.message || 'Failed to commit import');
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleReset = () => {
    setState({
      file: null,
      rawText: '',
      parsedData: null,
      loading: false,
      error: null,
    });
    setPriceOverrides({});
    setPurchaseType('credit');
    setSupplierId(null);
  };

  const handlePriceChange = (name: string, type: 'costPrice' | 'salePrice', value: number) => {
    setPriceOverrides(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        [type]: value,
      }
    }));
  };

  const handleDataChange = (field: keyof ParsedInvoice, value: any) => {
    setState(prev => {
      if (!prev.parsedData) return prev;
      return {
        ...prev,
        parsedData: {
          ...prev.parsedData,
          [field]: value
        }
      };
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Universal Import Hub</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload PDF invoices to automatically extract data into inventory and your accounting ledger.
        </p>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl w-full max-w-md">
        <button
          onClick={() => setActiveTab('pdf')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'pdf' 
              ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' 
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" /> PDF Import
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'manual' 
              ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' 
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Keyboard className="w-4 h-4" /> Manual Import
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'history' 
              ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' 
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <History className="w-4 h-4" /> History
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'pdf' && (
        <div className="flex flex-col gap-6">
          {!state.parsedData && !state.loading && !state.error && (
            <PdfUploader 
              selectedFile={state.file}
              onFileSelect={handleFileSelect} 
            />
          )}

          {state.loading && (
            <div className="flex flex-col items-center justify-center py-20 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-sm">
              <Loader2 className="w-10 h-10 animate-spin text-[#006970] mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {state.parsedData ? 'Committing to System...' : 'Extracting data from PDF...'}
              </h3>
              <p className="text-sm text-gray-500 mt-2">Please do not close this window.</p>
            </div>
          )}

          {state.error && (
             <div className="flex flex-col items-center justify-center py-12 border border-red-100 bg-red-50 dark:bg-red-900/10 dark:border-red-800/30 rounded-2xl">
              <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
              <h3 className="text-lg font-medium text-red-800 dark:text-red-400">Processing Failed</h3>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1 mb-4">{state.error}</p>
              <button onClick={handleReset} className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg shadow-sm font-medium hover:bg-gray-50 transition-colors">
                Try Another File
              </button>
            </div>
          )}

          {state.parsedData && !state.loading && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              <ImportPreviewTable 
                data={state.parsedData} 
                errors={validateParsedData(state.parsedData)}
                priceOverrides={priceOverrides}
                onPriceChange={handlePriceChange}
                onDataChange={handleDataChange}
              />

              {/* Purchase Mode Selector */}
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Purchase Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div 
                    onClick={() => setPurchaseType('cash')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      purchaseType === 'cash' 
                        ? 'border-[#006970] bg-[#006970]/5' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-[#006970]/50'
                    }`}
                  >
                    <div className={`p-3 rounded-full ${purchaseType === 'cash' ? 'bg-[#006970] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                      <Banknote className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">Cash Purchase</p>
                      <p className="text-sm text-gray-500">Deduct from cash register instantly.</p>
                    </div>
                  </div>

                  <div 
                    onClick={() => setPurchaseType('credit')}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      purchaseType === 'credit' 
                        ? 'border-[#006970] bg-[#006970]/5' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-[#006970]/50'
                    }`}
                  >
                    <div className={`p-3 rounded-full ${purchaseType === 'credit' ? 'bg-[#006970] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">Credit Purchase</p>
                      <p className="text-sm text-gray-500">Add to supplier payable balance.</p>
                    </div>
                  </div>
                </div>

                {purchaseType === 'credit' && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Supplier:</strong> {state.parsedData.customerName} <br/>
                      <span className="text-gray-500">A new supplier account will be automatically linked or created.</span>
                    </p>
                  </div>
                )}
              </div>

              <ImportActions 
                onConfirm={handleConfirm}
                onReset={handleReset}
                isSaving={state.loading}
                disabled={validateParsedData(state.parsedData).length > 0}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'manual' && (
        <ManualImportTab />
      )}

      {activeTab === 'history' && (
        <div className="py-20 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
          <History className="w-10 h-10 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Import History</h3>
          <p className="text-gray-500 mt-2">This feature is coming soon.</p>
        </div>
      )}
    </div>
  );
};
