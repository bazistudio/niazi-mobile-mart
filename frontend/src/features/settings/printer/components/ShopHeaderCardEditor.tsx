'use client';
import React, { useEffect, useState, useRef } from 'react';
import { usePrinterStore } from '../store/printer.store';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';
import {
  Store,
  Phone,
  MapPin,
  FileText,
  Building2,
  Search,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  PlusCircle,
} from 'lucide-react';

interface BranchItem {
  id: string;
  name: string;
  code?: string;
  address?: string;
}

export const ShopHeaderCardEditor: React.FC = () => {
  const { shopHeader, updateShopHeader, selectedBranchId, fetchSettings, isLoading } = usePrinterStore();
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load available branches for the search & selector dropdown
  useEffect(() => {
    let cancelled = false;

    async function loadBranchList() {
      try {
        let list: any[] = await tauriClient.branchList().catch(() => []);
        if (!list || list.length === 0) {
          const res = await shopApi.getAllShops().catch(() => ({ success: false, data: [] }));
          if (res.success && res.data && res.data.length > 0) {
            list = res.data.map((s: any) => ({
              id: s._id || s.id,
              name: s.name,
              code: s.code || s.name.substring(0, 4).toUpperCase(),
              address: s.address || '',
            }));
          }
        }
        if (!cancelled && list && list.length > 0) {
          setBranches(
            list.map((b: any) => ({
              id: b.id || b._id,
              name: b.name,
              code: b.code,
              address: b.address,
            }))
          );
        }
      } catch (err) {
        console.warn('[ShopHeaderCardEditor] Could not load branches list:', err);
      }
    }

    loadBranchList();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!shopHeader) return null;

  const filteredBranches = branches.filter((b) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      b.name.toLowerCase().includes(q) ||
      (b.code && b.code.toLowerCase().includes(q)) ||
      (b.address && b.address.toLowerCase().includes(q))
    );
  });

  const handleSelectBranch = async (b: BranchItem) => {
    setIsDropdownOpen(false);
    setIsCustomMode(false);
    setSearchTerm('');
    updateShopHeader({
      branchName: b.name,
    });
    // Fetch and bind existing PostgreSQL settings for this specific branch
    await fetchSettings(b.id);
  };

  const handleManualBranchEdit = (val: string) => {
    updateShopHeader({ branchName: val });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
            <Store className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
            1. Shop & Branch Identity
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configure authoritative business identity tagged to each sale invoice and thermal receipt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#006970]" />}
          <span className="text-xs text-neutral-500 font-mono">PostgreSQL Synced</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Shop Name */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Shop Name
          </label>
          <input
            type="text"
            value={shopHeader.name || ''}
            onChange={(e) => updateShopHeader({ name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. Niazi Mobile Mart"
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            Branch Search & Dropdown Selector (Permanent Solution)
           ═══════════════════════════════════════════════════════════════════════ */}
        <div className="space-y-1 relative" ref={dropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#006970] dark:text-[#00B4BB]" />
              Branch Name & Identity Tag
            </label>
            {isOrgAdmin && (
              <button
                type="button"
                onClick={() => setIsCustomMode(!isCustomMode)}
                className="text-[11px] font-semibold text-[#006970] dark:text-[#00B4BB] hover:underline"
              >
                {isCustomMode ? '← Search Branch List' : '+ Custom Branch Name'}
              </button>
            )}
          </div>

          {isCustomMode ? (
            /* Custom Branch Name Text Input */
            <div className="relative">
              <input
                type="text"
                value={shopHeader.branchName || ''}
                onChange={(e) => handleManualBranchEdit(e.target.value)}
                className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
                placeholder="e.g. Saddar Branch / F-10 Markaz"
              />
            </div>
          ) : (
            /* Branch Search and Dropdown Selector */
            <div className="relative">
              <div
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm flex items-center justify-between cursor-pointer hover:border-[#006970] transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-semibold text-neutral-900 dark:text-white truncate">
                    {shopHeader.branchName || 'Select a registered branch'}
                  </span>
                  {selectedBranchId && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] font-bold">
                      TAGGED
                    </span>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
              </div>

              {/* Floating Branch Search Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl p-2.5 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search branch name, code, or address..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg dark:bg-neutral-800 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-[#006970]"
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filteredBranches.length === 0 ? (
                      <div className="p-3 text-center text-xs text-neutral-500">
                        No registered branches found matching &quot;{searchTerm}&quot;
                      </div>
                    ) : (
                      filteredBranches.map((b) => {
                        const isCurrent =
                          shopHeader.branchName?.trim().toLowerCase() === b.name.trim().toLowerCase() ||
                          selectedBranchId === b.id;

                        return (
                          <div
                            key={b.id}
                            onClick={() => handleSelectBranch(b)}
                            className={`p-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isCurrent
                                ? 'bg-[#006970]/10 text-[#006970] dark:text-[#00B4BB] font-bold'
                                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            <div>
                              <p className="font-semibold">{b.name}</p>
                              {b.code && (
                                <p className="text-[10px] font-mono text-neutral-500">
                                  Code: {b.code}
                                </p>
                              )}
                              {b.address && (
                                <p className="text-[10px] text-neutral-400 truncate max-w-[280px]">
                                  {b.address}
                                </p>
                              )}
                            </div>
                            {isCurrent && <CheckCircle2 className="w-4 h-4 shrink-0 text-[#006970] dark:text-[#00B4BB]" />}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 px-1">
                    <span>{branches.length} registered branches</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomMode(true);
                        setIsDropdownOpen(false);
                      }}
                      className="text-[#006970] dark:text-[#00B4BB] font-bold hover:underline"
                    >
                      + Custom Branch
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Shop Address */}
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Shop Address
          </label>
          <textarea
            value={shopHeader.address || ''}
            onChange={(e) => updateShopHeader({ address: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. Shop #12, Mobile Market, Main Blvd, Lahore"
          />
        </div>

        {/* Primary Phone */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Primary Phone
          </label>
          <input
            type="text"
            value={shopHeader.phone || ''}
            onChange={(e) => updateShopHeader({ phone: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0300-1234567"
          />
        </div>

        {/* Secondary Phone */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Secondary Phone (Optional)
          </label>
          <input
            type="text"
            value={shopHeader.secondaryPhone || ''}
            onChange={(e) => updateShopHeader({ secondaryPhone: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0321-7654321"
          />
        </div>

        {/* WhatsApp Number */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            WhatsApp Number
          </label>
          <input
            type="text"
            value={shopHeader.whatsapp || ''}
            onChange={(e) => updateShopHeader({ whatsapp: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. 0300-1234567"
          />
        </div>

        {/* Tax Number (NTN / STRN) */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Tax Number (NTN / STRN)
          </label>
          <input
            type="text"
            value={shopHeader.taxNumber || ''}
            onChange={(e) => updateShopHeader({ taxNumber: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="e.g. NTN-9876543-2"
          />
        </div>

        {/* Logo Image URL */}
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Logo Image URL
          </label>
          <input
            type="text"
            value={shopHeader.logoUrl || ''}
            onChange={(e) => updateShopHeader({ logoUrl: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#006970]"
            placeholder="https://example.com/logo.png or base64 image data"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3 pt-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
          <FileText className="w-5 h-5 text-[#006970] dark:text-[#00B4BB]" />
          2. Instructions & Policy Messages
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Return & Exchange Policy
          </label>
          <textarea
            value={shopHeader.returnPolicy || ''}
            onChange={(e) => updateShopHeader({ returnPolicy: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Goods once sold can only be returned/exchanged within 3 days with original receipt."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Warranty Instructions & Disclaimer
          </label>
          <textarea
            value={shopHeader.warrantyInstructions || ''}
            onChange={(e) => updateShopHeader({ warrantyInstructions: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[60px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Warranty claims require original invoice. Physical or liquid damage voids warranty."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Footer Greeting
          </label>
          <textarea
            value={shopHeader.footerText || ''}
            onChange={(e) => updateShopHeader({ footerText: e.target.value })}
            className="w-full px-3 py-2 border rounded-md dark:bg-neutral-800 dark:border-neutral-700 text-sm min-h-[50px] focus:ring-2 focus:ring-[#006970]"
            placeholder="Thank you for shopping with us!"
          />
        </div>
      </div>
    </div>
  );
};
