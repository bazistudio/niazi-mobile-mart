'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ChefHat, 
  Clock, 
  RefreshCw, 
  CheckCircle2, 
  Flame, 
  Bell, 
  UtensilsCrossed, 
  Timer, 
  AlertCircle,
  Printer,
  ChevronRight,
  Filter,
  Check
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi } from '@/services/sales.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { usePrintStore } from '@/lib/printer';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import toast from 'react-hot-toast';

type KitchenStatus = 'pending' | 'cooking' | 'ready' | 'completed' | 'all';

interface OrderItem {
  productId?: {
    name: string;
    sku?: string;
  } | string;
  name?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  notes?: string;
}

interface KitchenOrder {
  _id: string;
  id?: string;
  orderNumber: string;
  createdAt: string;
  status: 'pending' | 'cooking' | 'ready' | 'completed' | 'cancelled' | string;
  items: OrderItem[];
  customerId?: {
    name?: string;
    phone?: string;
  } | string;
  totalAmount?: number;
  paymentMethod?: string;
  tableNumber?: string;
  notes?: string;
}

/** Formats elapsed time since order creation */
function getElapsedMinutes(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / 60000));
}

function formatElapsedTime(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m ago`;
}

export const KitchenDisplayBoard: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const { openPreview } = usePrintStore();

  const [activeFilter, setActiveFilter] = useState<KitchenStatus>('all');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(15000); // 15s polling
  const [currentTime, setCurrentTime] = useState<string>('');

  // Update digital clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  // Fetch live orders with polling refetchInterval
  const { 
    data: ordersResponse, 
    isLoading, 
    isFetching, 
    refetch, 
    error 
  } = useQuery({
    queryKey: queryKeys.ordersToday,
    queryFn: () => salesApi.getOrders({ limit: 50 }),
    refetchInterval: autoRefreshInterval > 0 ? autoRefreshInterval : false,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  const orders: KitchenOrder[] = useMemo(() => {
    const list = ordersResponse?.data || [];
    return list.map((o: any) => ({
      ...o,
      _id: o._id || o.id,
      status: o.status?.toLowerCase() || 'pending'
    }));
  }, [ordersResponse]);

  // Status transition mutation
  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) => 
      salesApi.updateOrderStatus(orderId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersToday });
      const label = variables.status === 'cooking' ? 'Preparing' : variables.status === 'ready' ? 'Ready for Pickup' : 'Completed';
      toast.success(`Order status updated to ${label}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update order status');
    }
  });

  const handleStatusChange = (orderId: string, nextStatus: string) => {
    statusMutation.mutate({ orderId, status: nextStatus });
  };

  const handlePrintTicket = (order: KitchenOrder) => {
    if (!settings || !shopHeader) return;
    const ticketInvoice = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerId: typeof order.customerId === 'object' ? order.customerId : undefined,
      items: order.items.map(item => ({
        name: typeof item.productId === 'object' && item.productId ? item.productId.name : item.name || 'Kitchen Item',
        qty: item.quantity || item.qty || 1,
        price: item.price || 0,
        total: (item.quantity || item.qty || 1) * (item.price || 0)
      })),
      totalAmount: order.totalAmount || 0,
      paymentMethod: order.paymentMethod || 'Cash',
      status: order.status
    };
    const html = printFormatter.formatSaleInvoice(ticketInvoice, settings, shopHeader);
    openPreview({
      html,
      documentType: 'KitchenTicket',
      referenceId: order.orderNumber,
      title: `Kitchen Ticket - ${order.orderNumber}`
    });
  };

  // Filter orders by status
  const pendingOrders = useMemo(() => 
    orders.filter(o => o.status === 'pending' || o.status === 'new' || o.status === 'open'),
    [orders]
  );

  const cookingOrders = useMemo(() => 
    orders.filter(o => o.status === 'cooking' || o.status === 'preparing' || o.status === 'in_progress'),
    [orders]
  );

  const readyOrders = useMemo(() => 
    orders.filter(o => o.status === 'ready' || o.status === 'prepared'),
    [orders]
  );

  const completedOrders = useMemo(() => 
    orders.filter(o => o.status === 'completed' || o.status === 'served'),
    [orders]
  );

  const visibleOrders = useMemo(() => {
    if (activeFilter === 'pending') return pendingOrders;
    if (activeFilter === 'cooking') return cookingOrders;
    if (activeFilter === 'ready') return readyOrders;
    if (activeFilter === 'completed') return completedOrders;
    return orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
  }, [activeFilter, orders, pendingOrders, cookingOrders, readyOrders, completedOrders]);

  return (
    <div className="flex flex-col h-full space-y-4 pb-8 animate-in fade-in duration-200">
      {/* KDS Header */}
      <div className="bg-neutral-900 text-white p-4 md:p-5 rounded-2xl border border-neutral-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              Kitchen Display System
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                KDS v1.0
              </span>
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live Order Queue & Preparation Workflow
            </p>
          </div>
        </div>

        {/* Digital Clock & Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-neutral-800/80 rounded-xl border border-neutral-700 font-mono text-sm font-bold text-amber-400">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{currentTime || '00:00:00'}</span>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-200 rounded-xl text-xs font-bold transition-all border border-neutral-700 disabled:opacity-50"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isFetching ? 'Syncing...' : 'Sync'}</span>
          </button>

          <select
            value={autoRefreshInterval}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className="bg-neutral-800 text-neutral-200 text-xs font-medium rounded-xl px-2.5 py-1.5 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            <option value={5000}>Auto: 5s</option>
            <option value={15000}>Auto: 15s</option>
            <option value={30000}>Auto: 30s</option>
            <option value={0}>Manual Only</option>
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeFilter === 'all'
              ? 'bg-[#006970] text-white shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
        >
          <span>All Active</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/20 text-white font-mono">
            {pendingOrders.length + cookingOrders.length + readyOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeFilter === 'pending'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
        >
          <Bell className="w-3.5 h-3.5 text-amber-500" />
          <span>New / Pending</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
            {pendingOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('cooking')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeFilter === 'cooking'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-blue-500" />
          <span>Cooking / Preparing</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300 font-mono">
            {cookingOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('ready')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeFilter === 'ready'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Ready for Pickup</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono">
            {readyOrders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('completed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeFilter === 'completed'
              ? 'bg-neutral-700 text-white shadow-sm'
              : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5 text-neutral-400" />
          <span>Completed</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">
            {completedOrders.length}
          </span>
        </button>
      </div>

      {/* Main Order Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm animate-pulse space-y-4">
              <div className="h-6 bg-neutral-200 dark:bg-neutral-800 rounded w-1/2" />
              <div className="space-y-2">
                <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-3/4" />
                <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-2/3" />
              </div>
              <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Unable to load kitchen orders</h3>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Check backend connection or retry</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
          >
            Retry Query
          </button>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mb-3">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-neutral-800 dark:text-neutral-200">No Orders in Queue</h3>
          <p className="text-xs text-neutral-400 max-w-sm mt-1">
            Orders created in the POS workspace will appear here automatically for kitchen preparation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          {visibleOrders.map(order => {
            const elapsed = getElapsedMinutes(order.createdAt);
            const isLate = elapsed > 20 && order.status !== 'completed';
            const customerName = typeof order.customerId === 'object' && order.customerId?.name 
              ? order.customerId.name 
              : 'Walk-in Customer';

            // Theme borders & badges according to status
            const statusConfig = {
              pending: {
                border: 'border-amber-400/60 dark:border-amber-500/40',
                badgeBg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
                label: 'NEW ORDER',
                nextAction: 'Start Cooking',
                nextStatus: 'cooking',
                btnBg: 'bg-amber-600 hover:bg-amber-700 text-white'
              },
              new: {
                border: 'border-amber-400/60 dark:border-amber-500/40',
                badgeBg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
                label: 'NEW ORDER',
                nextAction: 'Start Cooking',
                nextStatus: 'cooking',
                btnBg: 'bg-amber-600 hover:bg-amber-700 text-white'
              },
              cooking: {
                border: 'border-blue-400/60 dark:border-blue-500/40',
                badgeBg: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300',
                label: 'COOKING',
                nextAction: 'Mark Ready',
                nextStatus: 'ready',
                btnBg: 'bg-blue-600 hover:bg-blue-700 text-white'
              },
              ready: {
                border: 'border-emerald-400/60 dark:border-emerald-500/40',
                badgeBg: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
                label: 'READY',
                nextAction: 'Mark Served',
                nextStatus: 'completed',
                btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white'
              },
              completed: {
                border: 'border-neutral-300 dark:border-neutral-700 opacity-75',
                badgeBg: 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300',
                label: 'COMPLETED',
                nextAction: null,
                nextStatus: null,
                btnBg: ''
              }
            }[order.status] || {
              border: 'border-neutral-200 dark:border-neutral-800',
              badgeBg: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300',
              label: order.status.toUpperCase(),
              nextAction: null,
              nextStatus: null,
              btnBg: ''
            };

            return (
              <div 
                key={order._id}
                className={`bg-white dark:bg-neutral-900 rounded-2xl border-2 ${statusConfig.border} shadow-sm overflow-hidden flex flex-col justify-between transition-all hover:shadow-md`}
              >
                {/* Card Top Banner */}
                <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-base text-neutral-900 dark:text-white">
                        #{order.orderNumber}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${statusConfig.badgeBg}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    <button
                      onClick={() => handlePrintTicket(order)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg transition-colors"
                      title="Print Kitchen Ticket"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium truncate max-w-[140px]">
                      {customerName}
                    </span>
                    <div className={`flex items-center gap-1 font-semibold ${isLate ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-neutral-500 dark:text-neutral-400'}`}>
                      <Timer className="w-3.5 h-3.5" />
                      <span>{formatElapsedTime(elapsed)}</span>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-2.5 flex-1 divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {order.items.map((item, idx) => {
                    const itemName = typeof item.productId === 'object' && item.productId 
                      ? item.productId.name 
                      : item.name || 'Kitchen Item';
                    const qty = item.quantity || item.qty || 1;

                    return (
                      <div key={idx} className={`pt-2 flex items-start justify-between gap-3 ${idx === 0 ? 'pt-0' : ''}`}>
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono font-bold text-xs flex-shrink-0">
                            {qty}×
                          </span>
                          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 leading-snug">
                            {itemName}
                          </span>
                        </div>
                        {item.notes && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                            {item.notes}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Card Action Footer */}
                {statusConfig.nextAction && (
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800">
                    <button
                      onClick={() => handleStatusChange(order._id, statusConfig.nextStatus!)}
                      disabled={statusMutation.isPending}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 shadow-sm ${statusConfig.btnBg} disabled:opacity-50`}
                    >
                      {statusMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>{statusConfig.nextAction}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
