'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ShoppingCart, ReceiptText, RefreshCw, Lock } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { SearchInput } from '../common/SearchInput';
import { ThemeToggle } from './ThemeToggle';
import { ShopSwitcher } from './ShopSwitcher';
import { selectForceSync, selectStatus } from '@/features/inventory/core/inventory.selectors';
import { useExpensesStore } from '@/features/expenses';
import { useTerminalStore } from '@/store/useTerminalStore';
import { SyncStatusBadge } from '../common/SyncStatusBadge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '@/lib/http/httpClient';
import { formatDistanceToNow } from 'date-fns';

/** Shared icon-button style for topbar action buttons */
const topbarIconBtn =
  'inline-flex items-center justify-center w-9 h-9 rounded-md border border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  reference_type: string;
  reference_id: string;
  is_read: boolean;
  created_at: string;
}

export const Topbar = () => {
  const forceSync = selectForceSync();
  const inventoryStatus = selectStatus();
  const isSyncing = inventoryStatus === 'loading';
  const lockTerminal = useTerminalStore((s) => s.lockTerminal);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await httpClient.get<{ data: Notification[]; unreadCount: number }>('/api/notifications');
      return res;
    },
    refetchInterval: 60_000,
  });

  const notifications: Notification[] = notifData?.data ?? [];
  const unreadCount: number = notifData?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => httpClient.patch(`/api/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => httpClient.post('/api/notifications/mark-all-read', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <header className="sticky top-0 z-30 flex h-12 flex-shrink-0 bg-surface/95 backdrop-blur-md border-b border-border transition-colors duration-fast">
      <div className="flex flex-1 items-center justify-between px-4 lg:px-6 gap-3 min-w-0">
        {/* Left: Search + ShopSwitcher */}
        <div className="flex flex-1 min-w-0 max-w-2xl items-center gap-3">
          <SearchInput placeholder="Search products, customers, invoices…" />
          <div className="block">
            <ShopSwitcher />
          </div>
        </div>

        {/* Right: Action cluster */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* New Sale CTA */}
          <Link
            to="/dashboard/shop-admin/pos"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 transition-all duration-fast"
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Sale</span>
          </Link>

          {/* Sync Engine Status */}
          <SyncStatusBadge />

          {/* Sync Inventory */}
          <button
            type="button"
            onClick={() => forceSync()}
            disabled={isSyncing}
            title={isSyncing ? 'Syncing...' : 'Sync Inventory'}
            aria-label="Sync inventory"
            className={`${topbarIconBtn} disabled:opacity-disabled`}
          >
            <RefreshCw
              className={`h-4 w-4 text-info ${isSyncing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>

          {/* Add Expense */}
          <button
            type="button"
            onClick={() => useExpensesStore.getState().setGlobalModalOpen(true)}
            title="Add Expense"
            aria-label="Add expense"
            className={topbarIconBtn}
          >
            <ReceiptText className="h-4 w-4 text-danger" aria-hidden="true" />
          </button>

          {/* Lock Terminal (Ctrl+L) */}
          <button
            type="button"
            onClick={() => lockTerminal()}
            title="Lock Terminal (Ctrl+L)"
            aria-label="Lock terminal"
            className={topbarIconBtn}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              aria-label="View notifications"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-black text-white ring-2 ring-surface">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border border-border bg-surface shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-surface-hover/50">
                  <span className="text-xs font-bold text-text-primary">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllReadMutation.mutate()}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-text-muted">
                      No unread notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (!n.is_read) markReadMutation.mutate(n.id);
                          setNotifOpen(false);
                          navigate(`/dashboard/repairs/${n.reference_id}`);
                        }}
                        className={`w-full text-left px-3 py-2.5 hover:bg-surface-hover transition-colors ${n.is_read ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && (
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-text-primary truncate">{n.title}</p>
                            <p className="text-[10px] text-text-secondary line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[9px] text-text-muted mt-0.5">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme & User */}
          <div className="flex items-center gap-1 border-l border-border pl-1.5 ml-0.5">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
