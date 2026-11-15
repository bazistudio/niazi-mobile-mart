import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { purchaseApi } from '@/services/purchase.api';
import { supplierApi } from '@/services/supplier.api';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { type Purchase, type PurchaseLine } from '@/lib/tauri/tauriClient';

// Extended runtime shape returned by GET /api/purchases — includes joined columns
// not in the base TypeScript interface (populated server-side in the list endpoint)
type PurchaseExtended = Purchase & {
  supplier_name?: string | null;
  demand_id?: string | null;
  demand_number?: string | null;
  supplier_invoice_ref?: string | null;
};

type PurchaseLineExtended = PurchaseLine & {
  product_name?: string | null; // alias for product_name_snapshot
  sku?: string | null;          // alias for sku_snapshot
};
import {
  Loader2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Receipt,
  Truck,
  Calendar,
} from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────
function paymentStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    PAID:         { label: 'Paid',         cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    PARTIAL:      { label: 'Partial',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    UNPAID:       { label: 'Credit',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    CREDIT:       { label: 'Credit',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  };
  const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Expandable row with line items ────────────────────────────────────────────
function PurchaseLineRow({ purchaseId }: { purchaseId: string }) {
  const { data: lines, isLoading } = useQuery<PurchaseLineExtended[]>({
    queryKey: ['purchase-lines', purchaseId],
    queryFn: () => purchaseApi.getPurchaseLines(purchaseId) as Promise<PurchaseLineExtended[]>,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-gray-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading lines…
      </div>
    );
  }
  if (!lines || lines.length === 0) {
    return <div className="py-4 px-6 text-xs text-gray-400 italic">No line items found.</div>;
  }

  return (
    <div className="border border-blue-200/60 dark:border-blue-800/40 rounded-lg overflow-hidden mx-4 my-2">
      <table className="w-full text-xs">
        <thead className="bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
          <tr>
            <th className="px-3 py-1.5 text-left">Product</th>
            <th className="px-3 py-1.5 text-right">Qty</th>
            <th className="px-3 py-1.5 text-right">Unit Cost</th>
            <th className="px-3 py-1.5 text-right">Discount</th>
            <th className="px-3 py-1.5 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-100/60 dark:divide-blue-900/20">
          {lines.map((line) => (
            <tr key={line.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10">
              <td className="px-3 py-1.5">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {line.product_name || line.product_name_snapshot || line.product_id}
                </div>
                {(line.sku || line.sku_snapshot) && (
                  <div className="text-gray-400 text-[10px]">{line.sku || line.sku_snapshot}</div>
                )}
              </td>
              <td className="px-3 py-1.5 text-right font-semibold">{line.quantity}</td>
              <td className="px-3 py-1.5 text-right">Rs. {Number(line.unit_cost).toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right text-gray-500">
                {Number(line.discount) > 0 ? `Rs. ${Number(line.discount).toLocaleString()}` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right font-bold text-[#006970] dark:text-[#00B4BB]">
                Rs. {Number(line.line_total).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function InventoryPurchasesPage() {
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const navigate = useNavigate();
  const activeShop = useOrganizationStore((s) => s.activeShop);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load suppliers for filter dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-purchases-filter'],
    queryFn: () => supplierApi.getSuppliers(1, 200),
    enabled: isOrgAdmin,
  });
  const suppliers = suppliersData?.data || [];

  // Load purchases
  const { data: purchases, isFetching, refetch } = useQuery<PurchaseExtended[]>({
    queryKey: ['purchases-history', supplierFilter, paymentStatusFilter, startDate, endDate, activeShop?.id],
    queryFn: () =>
      purchaseApi.getPurchases({  // cast: server returns extended shape at runtime
        supplier_id: supplierFilter || null,
        payment_status: paymentStatusFilter || null,
        start_date: startDate || null,
        end_date: endDate || null,
        limit: 200,
        offset: 0,
      }),
    enabled: isOrgAdmin,
    staleTime: 30_000,
  });

  // Client-side text search over purchase_number, supplier_name, notes
  const filtered = useMemo(() => {
    if (!purchases) return [];
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter(
      (p) =>
        p.purchase_number?.toLowerCase().includes(q) ||
        p.supplier_name?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.supplier_invoice_ref?.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  if (!isOrgAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <p className="text-sm">Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter Bar */}
      <div className="flex-shrink-0 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search purchase # or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
            />
          </div>

          {/* Supplier filter */}
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Payment status filter */}
          <select
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
          >
            <option value="">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNPAID">Credit</option>
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              title="From date"
            />
            <span className="text-gray-400 text-xs">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              title="To date"
            />
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Summary count */}
          <span className="ml-auto text-xs text-gray-500 font-semibold">
            {filtered.length} receipt{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isFetching && (!purchases || purchases.length === 0) ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading purchase history…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Receipt className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-700" />
            <p className="text-sm font-semibold">No purchase receipts found.</p>
            <p className="text-xs text-gray-400 mt-1">Goods received via the Demand tab will appear here.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[11px] font-extrabold text-gray-600 dark:text-gray-300 uppercase">
              <tr>
                <th className="px-3 py-2.5 w-6"></th>
                <th className="px-3 py-2.5">Purchase #</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">
                  <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />Supplier</span>
                </th>
                <th className="px-3 py-2.5">Demand #</th>
                <th className="px-3 py-2.5">Invoice Ref</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {filtered.map((p) => {
                const isExpanded = expandedId === p.id;
                const creditAmount = Number(p.total_amount) - Number(p.paid_amount);

                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                        isExpanded ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      <td className="px-3 py-2.5 text-gray-400">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#006970] dark:text-[#00B4BB]">
                        {p.purchase_number}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">
                        {p.supplier_name ? (
                          <button
                            type="button"
                            className="hover:underline text-[#006970] dark:text-[#00B4BB] cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (p.supplier_id) navigate(`/dashboard/shop-admin/suppliers/${p.supplier_id}`);
                            }}
                          >
                            {p.supplier_name}
                          </button>
                        ) : (
                          <span className="text-gray-400 italic">No supplier</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {p.demand_id ? (
                          <button
                            type="button"
                            className="hover:underline text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/dashboard/shop-admin/inventory/demand');
                            }}
                            title="Go to demand"
                          >
                            {p.demand_number || p.demand_id.slice(0, 8) + '…'}
                          </button>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {p.supplier_invoice_ref || <span className="text-gray-300 dark:text-gray-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {paymentStatusBadge(p.payment_status || 'UNPAID')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                        Rs. {Number(p.total_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        Rs. {Number(p.paid_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {creditAmount > 0 ? (
                          <span className="text-red-600 dark:text-red-400">Rs. {creditAmount.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded: line items */}
                    {isExpanded && (
                      <tr className="bg-blue-50/20 dark:bg-blue-900/5">
                        <td colSpan={10} className="py-1">
                          <PurchaseLineRow purchaseId={p.id} />
                          {p.notes && (
                            <div className="px-6 pb-2 text-xs text-gray-500">
                              <span className="font-bold">Notes:</span> {p.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default InventoryPurchasesPage;
