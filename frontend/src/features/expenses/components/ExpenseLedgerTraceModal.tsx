import React, { useEffect, useState } from 'react';
import { X, Receipt, Activity, Wallet, ArrowRight, FileText } from 'lucide-react';
import { expensesApi } from '../services/expenses.api';
import { ExpenseItem } from '../types/expenses.types';

interface ExpenseLedgerTraceModalProps {
  expenseId: string;
  onClose: () => void;
}

export const ExpenseLedgerTraceModal: React.FC<ExpenseLedgerTraceModalProps> = ({ expenseId, onClose }) => {
  const [traceData, setTraceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'raw'>('timeline');

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        setIsLoading(true);
        const data = await expensesApi.getTrace(expenseId);
        setTraceData(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load trace data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrace();
  }, [expenseId]);

  if (!expenseId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-800">
        
        {/* Header Section */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Ledger Trace
            </h2>
            <p className="text-sm text-neutral-500 mt-1">Trace financial impact across the ERP engine</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
              <button 
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                Timeline
              </button>
              <button 
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'raw' ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                Raw Data
              </button>
            </div>
            <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col gap-8 animate-pulse p-4">
               <div className="h-20 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-full"></div>
               <div className="h-40 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-full"></div>
               <div className="h-24 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-full"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-center border border-red-100">
              {error}
            </div>
          ) : viewMode === 'raw' ? (
            <pre className="bg-neutral-950 text-green-400 p-4 rounded-xl text-xs overflow-x-auto">
              {JSON.stringify(traceData, null, 2)}
            </pre>
          ) : (
            <div className="space-y-8">
              
              {/* 1. Header Info */}
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-full uppercase tracking-wider">
                      {traceData.expense.category}
                    </span>
                    <span className="px-2.5 py-1 text-xs font-medium bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300 rounded-full uppercase tracking-wider">
                      {traceData.expense.paymentMethod}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white">{traceData.expense.title}</h3>
                  <p className="text-sm text-neutral-500 mt-1">{new Date(traceData.expense.date).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Amount</p>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-500">Rs {traceData.expense.amount.toLocaleString()}</p>
                </div>
              </div>

              {/* 2. Ledger Timeline */}
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neutral-400" />
                  Financial Flow
                </h4>
                
                <div className="relative pl-6 space-y-8 border-l-2 border-neutral-200 dark:border-neutral-800 ml-3">
                  
                  {/* Step 1: Expense */}
                  <div className="relative">
                    <div className="absolute -left-[31px] bg-orange-500 w-4 h-4 rounded-full border-4 border-white dark:border-neutral-900"></div>
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white mb-2">
                        <Receipt className="w-4 h-4 text-orange-500" />
                        Source Event Created
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">Expense record was securely committed to the database.</p>
                      <div className="mt-3 text-xs font-mono text-neutral-500 bg-neutral-50 dark:bg-neutral-950 p-2 rounded">
                        ID: {traceData.expense._id}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Ledger Entries */}
                  {traceData.ledgerEntries.map((entry: any, i: number) => (
                    <div key={entry._id} className="relative">
                      <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-4 border-white dark:border-neutral-900 ${entry.status === 'active' ? 'bg-blue-500' : 'bg-neutral-400'}`}></div>
                      <div className={`bg-white dark:bg-neutral-900 border ${entry.status === 'active' ? 'border-blue-100 dark:border-blue-900/30' : 'border-neutral-200 dark:border-neutral-800 border-dashed opacity-75'} rounded-xl p-4 shadow-sm`}>
                        <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white mb-2">
                          <Activity className={`w-4 h-4 ${entry.status === 'active' ? 'text-blue-500' : 'text-neutral-400'}`} />
                          {entry.status === 'active' ? 'Double-Entry Ledger Sync' : 'Ledger Reversal'}
                        </div>
                        <div className="flex items-center gap-4 my-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-xs text-neutral-500 uppercase font-medium mb-1">Debit</p>
                            <p className="text-sm font-bold capitalize text-neutral-900 dark:text-white">{entry.debitAccount}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-neutral-400" />
                          <div className="flex-1 text-right">
                            <p className="text-xs text-neutral-500 uppercase font-medium mb-1">Credit</p>
                            <p className="text-sm font-bold capitalize text-neutral-900 dark:text-white">{entry.creditAccount}</p>
                          </div>
                        </div>
                        <div className="text-xs font-mono text-neutral-500 bg-neutral-50 dark:bg-neutral-950 p-2 rounded flex justify-between">
                          <span>TXN: {entry.transactionId}</span>
                          <span>Rs {entry.amount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Step 3: Audit */}
                  {traceData.auditLogs.map((log: any) => (
                    <div key={log._id} className="relative">
                      <div className="absolute -left-[31px] bg-neutral-500 w-4 h-4 rounded-full border-4 border-white dark:border-neutral-900"></div>
                      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white mb-2">
                          <FileText className="w-4 h-4 text-neutral-500" />
                          Audit Log Written
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">Action: <span className="font-mono text-xs">{log.action}</span></p>
                      </div>
                    </div>
                  ))}

                </div>
              </div>

              {/* 3. Cash Impact Panel */}
              <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-5 border border-green-100 dark:border-green-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-100 dark:bg-green-500/20 rounded-lg">
                    <Wallet className="w-5 h-5 text-green-600 dark:text-green-500" />
                  </div>
                  <h4 className="font-bold text-green-900 dark:text-green-400">Physical Cash Impact</h4>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    {traceData.expense.paymentMethod === 'cash' 
                      ? 'Immediate deduction from shop physical cash reserves.' 
                      : 'No immediate physical cash deduction (Bank/Payable).'}
                  </p>
                  <p className={`text-xl font-bold ${traceData.cashImpact < 0 ? 'text-red-600 dark:text-red-500' : 'text-neutral-500'}`}>
                    {traceData.cashImpact < 0 ? '-' : ''}Rs {Math.abs(traceData.cashImpact).toLocaleString()}
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
