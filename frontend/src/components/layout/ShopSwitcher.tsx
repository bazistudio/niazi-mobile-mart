'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building, Store, Loader2, Check } from 'lucide-react';
import { useOrganizationStore, Shop } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useNavigate } from 'react-router-dom';
import { tauriClient, Branch } from '@/lib/tauri/tauriClient';

export const ShopSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  // Fetch branches via Tauri IPC when dropdown first opens
  useEffect(() => {
    if (isOpen && branches.length === 0) {
      const fetchBranches = async () => {
        try {
          const list = await tauriClient.branchList();
          setBranches(list);
          if (list.length > 0 && !activeShop) {
            setActiveShop({
              _id: list[0].id,
              name: list[0].name,
              organizationId: list[0].organization_id,
              status: list[0].is_active ? 'active' : 'inactive',
            });
          }
        } catch (error) {
          console.error('Failed to load branches from SQLite', error);
        }
      };
      fetchBranches();
    }
  }, [isOpen, branches.length, activeShop, setActiveShop]);

  const handleContextSwitch = (branch: Branch | null, path: string) => {
    setIsLoading(true);
    setIsOpen(false);

    if (branch) {
      setActiveContext(branch.organization_id, branch.id);
      setActiveShop({
        _id: branch.id,
        name: branch.name,
        organizationId: branch.organization_id,
        status: branch.is_active ? 'active' : 'inactive',
      });
    } else {
      setActiveContext(activeOrganizationId || '00000000-0000-0000-0000-000000000001', null);
      setActiveShop(null);
    }

    navigate(path);
    setIsLoading(false);
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

            {/* Individual branches */}
            {branches.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading branches…
              </div>
            ) : (
              branches.map((branch) => {
                const isSelected = activeShop?._id === branch.id;
                return (
                  <button
                    key={branch.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleContextSwitch(branch, '/dashboard/shop-admin')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <Store className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{branch.name} ({branch.code})</span>
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
