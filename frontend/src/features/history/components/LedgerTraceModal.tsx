import React, { useEffect, useState } from 'react';
import { HistoryItem, LedgerTraceItem } from '../types/history.types';
import { historyApi } from '../services/history.api';
import { X, CheckCircle2, Circle, ArrowDown } from 'lucide-react';

interface Props {
  item: HistoryItem;
  onClose: () => void;
}

export const LedgerTraceModal: React.FC<Props> = ({ item, onClose }) => {
  const [trace, setTrace] = useState<LedgerTraceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTrace = async () => {
      try {
        const data = await historyApi.getLedgerTrace(item.id);
        setTrace(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTrace();
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ledger Trace (Audit)</h2>
            <p className="text-sm text-gray-500">Transaction ID: {item.referenceId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-48 text-gray-500">Tracing transaction...</div>
          ) : (
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
              {trace.map((step, idx) => (
                <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-gray-800 bg-emerald-100 text-emerald-600 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between space-x-2 mb-1">
                      <div className="font-bold text-gray-900 dark:text-white">{step.step}</div>
                      <time className="font-mono text-xs text-gray-500">{new Date(step.timestamp).toLocaleTimeString()}</time>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{step.description}</div>
                    {step.amount && (
                      <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 inline-block px-2 py-1 rounded">
                        Rs {step.amount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};
