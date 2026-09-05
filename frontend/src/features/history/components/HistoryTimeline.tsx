import React from 'react';
import { useHistoryStore } from '../store/history.store';
import { HistoryRowActions } from './HistoryRowActions';

export const HistoryTimeline: React.FC = () => {
  const { items, isLoading } = useHistoryStore();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center text-gray-500">Loading timeline...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
      <div className="max-w-3xl mx-auto space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
        {items.map((item) => (
          <div key={item.id} className="relative flex items-start gap-6 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-gray-800 bg-[#006970]/10 text-[#006970] shrink-0 z-10 shadow-sm">
              <span className="text-xs font-bold">{item.type.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 dark:text-white">{item.referenceId}</span>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                    {item.source.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-900 dark:text-white">Rs {item.amount.toLocaleString()}</span>
                  <HistoryRowActions item={item} />
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-gray-200">{item.party.name}</span> • {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
