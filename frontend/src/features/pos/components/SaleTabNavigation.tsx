'use client';

import React from 'react';
import { usePosStore } from '../store/usePosStore';
import { Plus, X } from 'lucide-react';

export const SaleTabNavigation: React.FC = () => {
  const { saleTabs, activeTabId, switchSaleTab, closeSaleTab, createSaleTab } = usePosStore();

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeSaleTab(tabId);
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0 select-none">
      {saleTabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const itemCount = (tab.cart?.length || 0) + (tab.returnedItems?.length || 0);

        return (
          <div
            key={tab.id}
            onClick={() => switchSaleTab(tab.id)}
            className={`group h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all duration-fast shadow-xs ${
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
            title={`Switch to ${tab.name}`}
          >
            <span className="truncate max-w-[70px]">{tab.name}</span>
            {itemCount > 0 && (
              <span
                className={`text-[10px] font-black px-1.5 py-0.2 rounded-full tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-surface-hover text-text-secondary'
                }`}
              >
                {itemCount}
              </span>
            )}
            {saleTabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => handleCloseTab(e, tab.id)}
                className={`p-0.5 rounded transition-colors ${
                  isActive
                    ? 'text-white/70 hover:text-white hover:bg-white/20'
                    : 'text-text-muted hover:text-danger hover:bg-danger/10'
                }`}
                title={`Close ${tab.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {saleTabs.length < 3 && (
        <button
          type="button"
          onClick={createSaleTab}
          className="h-8 w-8 rounded-lg border border-dashed border-border bg-surface text-text-muted hover:text-primary hover:border-primary/50 hover:bg-surface-hover flex items-center justify-center transition-all duration-fast shadow-xs"
          title="Open New Sale Tab (Max 3)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default SaleTabNavigation;
