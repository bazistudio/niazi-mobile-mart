'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Repeat, Undo2, HandCoins, Check, ShieldAlert } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import toast from 'react-hot-toast';

interface PosActionsDropdownProps {
  onOpenInvoiceLookup: () => void;
}

export const PosActionsDropdown: React.FC<PosActionsDropdownProps> = ({ onOpenInvoiceLookup }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSession = usePosStore((s) => s.getActiveSession());
  const prepareReplaceExchange = usePosStore((s) => s.prepareReplaceExchange);
  const processCashReturn = usePosStore((s) => s.processCashReturn);

  const isReplaceMode = activeSession?.mode === 'replace';

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggleReplace = () => {
    prepareReplaceExchange();
    setIsOpen(false);
    toast.success(
      isReplaceMode ? 'Switched to Normal Sale Mode' : 'Exchange Mode Active: Add returns and new items',
      { icon: '🔄' }
    );
  };

  const handleCashReturn = async () => {
    setIsOpen(false);
    await processCashReturn();
  };

  const handleInvoiceReturnClick = () => {
    setIsOpen(false);
    onOpenInvoiceLookup();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all select-none shadow-xs ${
          isReplaceMode
            ? 'bg-warning/10 border-warning text-warning'
            : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
        title="POS Actions & Returns"
      >
        <Repeat className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isReplaceMode ? 'Exchange Mode' : 'Actions'}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-surface border border-border shadow-modal p-1.5 z-50 animate-in fade-in zoom-in-95 duration-fast">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border/60">
            Sale & Return Workflows
          </div>

          <div className="py-1 space-y-0.5">
            {/* Toggle Replace / Exchange */}
            <button
              type="button"
              onClick={handleToggleReplace}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                isReplaceMode
                  ? 'bg-warning/15 text-warning font-bold'
                  : 'text-text-primary hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-warning" />
                <div>
                  <div>Replace / Exchange</div>
                  <div className="text-[10px] text-text-muted font-normal">Swap returned item with new</div>
                </div>
              </div>
              {isReplaceMode && <Check className="w-4 h-4 text-warning" />}
            </button>

            {/* Return by Invoice */}
            <button
              type="button"
              onClick={handleInvoiceReturnClick}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-surface-hover text-left transition-colors"
            >
              <Undo2 className="w-4 h-4 text-danger" />
              <div>
                <div>Return by Invoice</div>
                <div className="text-[10px] text-text-muted font-normal">Lookup previous receipt to refund</div>
              </div>
            </button>

            {/* Walk-in Cash Return */}
            <button
              type="button"
              onClick={handleCashReturn}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-surface-hover text-left transition-colors"
            >
              <HandCoins className="w-4 h-4 text-secondary" />
              <div>
                <div>Walk-in Cash Return</div>
                <div className="text-[10px] text-text-muted font-normal">Refund cash for items in cart</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PosActionsDropdown;
