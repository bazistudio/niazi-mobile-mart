'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Building, Store, Loader2, Check } from 'lucide-react';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useNavigate } from 'react-router-dom';
import { tauriClient, Branch } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';

export const ShopSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingBranches, setIsFetchingBranches] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { user } = useAuthStore();
  const {
    activeOrganization,
    activeOrganizationId,
    activeShop,
    activeShopId,
    viewMode,
    setActiveContext,
    setActiveShop,
  } = useOrganizationStore();

  const isOrgAdmin =
    user?.role === 'OWNER' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'MULTI_ADMIN' ||
    user?.role === 'ADMIN';

  // Fetch branches on mount or when auth/admin status changes
  const loadBranches = useCallback(async () => {
    setIsFetchingBranches(true);
    try {
      let list: Branch[] = [];

      // 1. Try fetching from Tauri IPC SQLite backend
      try {
        list = await tauriClient.branchList();
      } catch (ipcErr) {
        console.warn('Tauri IPC branchList unavailable, loading via shopApi fallback', ipcErr);
      }

      // 2. Fallback / merge with shopApi (handles stored local shops)
      if (!list || list.length === 0) {
        const res = await shopApi.getAllShops();
        if (res.success && res.data && res.data.length > 0) {
          list = res.data.map((s) => ({
            id: s._id,
            organization_id: activeOrganizationId || '00000000-0000-0000-0000-000000000001',
            name: s.name,
            code: s.name.substring(0, 4).toUpperCase(),
            is_active: s.status === 'active' || s.status === 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
        }
      }

      // 3. Fallback to canonical Main Branch if still empty
      if (!list || list.length === 0) {
        list = [
          {
            id: '00000000-0000-0000-0000-000000000002',
            organization_id: activeOrganizationId || '00000000-0000-0000-0000-000000000001',
            name: 'Main Branch',
            code: 'MAIN',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }

      // Filter branches: Org Admin sees all branches; branch users see ONLY their assigned branch
      const userBranchId = (user as any)?.branchId || (user as any)?.shopId;
      const accessible = isOrgAdmin
        ? list
        : list.filter((b) => !userBranchId || b.id === userBranchId);

      setBranches(accessible);

      // Ensure activeShop in Zustand store is initialized from accessible branches
      if (accessible.length > 0) {
        const currentShopId = activeShopId || activeShop?._id;
        const matchedBranch = accessible.find((b) => b.id === currentShopId) || accessible[0];

        if (matchedBranch && (!activeShop || activeShop._id !== matchedBranch.id)) {
          setActiveShop({
            _id: matchedBranch.id,
            name: matchedBranch.name,
            organizationId: matchedBranch.organization_id,
            status: matchedBranch.is_active ? 'active' : 'inactive',
          });
        }
      }
    } catch (error) {
      console.error('Failed to load branches', error);
    } finally {
      setIsFetchingBranches(false);
    }
  }, [user, isOrgAdmin, activeOrganizationId, activeShopId, activeShop, setActiveShop]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // Listen for branch update events across the app
  useEffect(() => {
    const handleBranchUpdate = () => {
      loadBranches();
    };
    window.addEventListener('branch-updated', handleBranchUpdate);
    return () => window.removeEventListener('branch-updated', handleBranchUpdate);
  }, [loadBranches]);

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

  const handleContextSwitch = (branch: Branch | null, path: string) => {
    // Prevent non-admin users from switching to All Shops
    if (!branch && !isOrgAdmin) {
      return;
    }

    // Prevent non-admin users from switching to a branch other than their assigned one
    const userBranchId = (user as any)?.branchId || (user as any)?.shopId;
    if (branch && !isOrgAdmin && userBranchId && branch.id !== userBranchId) {
      return;
    }

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
    viewMode === 'organization'
      ? 'All Shops'
      : activeShop?.name || (isFetchingBranches ? 'Loading…' : 'Main Branch');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 h-8 px-3 text-sm font-medium text-text-secondary bg-surface border border-border rounded-md hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-all duration-fast disabled:opacity-disabled cursor-pointer"
      >
        {isLoading || (isFetchingBranches && !activeShop) ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
        ) : viewMode === 'organization' ? (
          <Building className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        ) : (
          <Store className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        )}
        <span className="truncate max-w-[130px]">{displayLabel}</span>
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
          className="absolute left-0 top-full mt-1.5 w-64 origin-top-left bg-surface rounded-lg shadow-dropdown border border-border focus:outline-none z-[var(--z-dropdown)] overflow-hidden"
        >
          {/* Organization header */}
          <div className="px-3 py-2 border-b border-border bg-surface-hover/40 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-widest truncate">
              {activeOrganization?.name || 'Organization'}
            </p>
            {isFetchingBranches && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          </div>

          <div className="py-1 max-h-72 overflow-y-auto custom-scrollbar">
            {/* All Shops option (Organization Admin only) */}
            {isOrgAdmin && (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={viewMode === 'organization'}
                  onClick={() => handleContextSwitch(null, '/dashboard/organization')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast cursor-pointer ${
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
                <div className="border-t border-border my-1" />
              </>
            )}

            {/* Individual branches */}
            {isFetchingBranches && branches.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading branches…
              </div>
            ) : branches.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-muted text-center">
                No branches found
              </div>
            ) : (
              branches.map((branch) => {
                const isSelected = viewMode === 'shop' && activeShop?._id === branch.id;
                return (
                  <button
                    key={branch.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleContextSwitch(branch, '/dashboard/shop-admin')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <Store className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">
                      {branch.name} {branch.code ? `(${branch.code})` : ''}
                    </span>
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

