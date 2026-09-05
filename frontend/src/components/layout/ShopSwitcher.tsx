'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building, Store, Loader2, Check } from 'lucide-react';
import { useOrganizationStore, Shop } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/axios';

export const ShopSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { user } = useAuthStore();
  const {
    activeOrganization,
    activeOrganizationId,
    activeShop,
    viewMode,
    setActiveContext,
    setActiveShop,
  } = useOrganizationStore();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Fetch shops when dropdown first opens
  useEffect(() => {
    if (isOpen && activeOrganizationId && shops.length === 0) {
      const fetchShops = async () => {
        try {
          const res = await api.get(`/api/v1/shops`);
          if (res.data?.success) setShops(res.data.data);
        } catch (error) {
          console.error('Failed to load shops', error);
        }
      };
      fetchShops();
    }
  }, [isOpen, activeOrganizationId]);

  if (!activeOrganizationId || (user as any)?.accountType === 'SINGLE_SHOP') return null;

  const handleContextSwitch = async (shopId: string | null, path: string) => {
    const prevContext = { viewMode, activeShop };

    setIsLoading(true);
    setIsOpen(false);

    setActiveContext(activeOrganizationId!, shopId);
    if (shopId) {
      const selected = shops.find((s) => s._id === shopId);
      if (selected) setActiveShop(selected);
    } else {
      setActiveShop(null);
    }

    try {
      await api.post('/api/v1/auth/switch-context', {
        organizationId: activeOrganizationId,
        shopId,
      });
      router.push(path);
    } catch (error) {
      console.error('Failed to switch context', error);
      setActiveContext(
        activeOrganizationId!,
        prevContext.viewMode === 'shop' ? prevContext.activeShop?._id || null : null
      );
      setActiveShop(prevContext.activeShop);
    } finally {
      setIsLoading(false);
    }
  };

  const displayLabel =
    viewMode === 'organization' ? 'All Shops' : activeShop?.name || 'Loading…';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 h-8 px-3 text-sm font-medium text-text-secondary bg-surface border border-border rounded-md hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-all duration-fast disabled:opacity-disabled"
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
        ) : viewMode === 'organization' ? (
          <Building className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        ) : (
          <Store className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        )}
        <span className="truncate max-w-[110px]">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform duration-fast ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Select shop context"
          className="absolute left-0 top-full mt-1.5 w-60 origin-top-left bg-surface rounded-lg shadow-dropdown border border-border focus:outline-none z-[var(--z-dropdown)] overflow-hidden"
        >
          {/* Organization header */}
          <div className="px-3 py-2 border-b border-border bg-surface-hover/40">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-widest truncate">
              {activeOrganization?.name || 'Organization'}
            </p>
          </div>

          <div className="py-1 max-h-72 overflow-y-auto custom-scrollbar">
            {/* All Shops option */}
            <button
              type="button"
              role="option"
              aria-selected={viewMode === 'organization'}
              onClick={() => handleContextSwitch(null, '/dashboard/organization')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast ${
                viewMode === 'organization'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Building className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">All Shops</span>
              {viewMode === 'organization' && (
                <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              )}
            </button>

            {/* Divider */}
            <div className="border-t border-border my-1" />

            {/* Individual shops */}
            {shops.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading shops…
              </div>
            ) : (
              shops.map((shop) => {
                const isSelected = activeShop?._id === shop._id;
                return (
                  <button
                    key={shop._id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleContextSwitch(shop._id, '/dashboard/shop-admin')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <Store className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{shop.name}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
