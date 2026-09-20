import React, { useState, useEffect, useMemo } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Package, 
  Plus, 
  Search, 
  ArrowRightLeft, 
  Boxes, 
  Download, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  RefreshCw, 
  Building2, 
  Store, 
  Layers
} from 'lucide-react';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { InventoryProduct, StockStatus } from '@/features/inventory/types';
import { AddProductDrawer } from '@/features/inventory/components/AddProductDrawer';
import { ProductEditModal } from '@/features/inventory/product/components/ProductEditModal';
import { ProductDeleteDialog } from '@/features/inventory/product/components/ProductDeleteDialog';
import { StockTransferModal } from '@/features/inventory/components/StockTransferModal';
import { tauriClient, Branch } from '@/lib/tauri/tauriClient';
import toast from 'react-hot-toast';

export function OrganizationProductsPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'intake' | 'transfer' | 'distribution'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drawer / Modal states
  const [isAddProductOpen, setAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<InventoryProduct | null>(null);
  const [transferProduct, setTransferProduct] = useState<InventoryProduct | null>(null);
  const [isTransferOpen, setTransferOpen] = useState(false);

  // Central Stock Intake form state
  const [intakeProductId, setIntakeProductId] = useState<string>('');
  const [intakeQuantity, setIntakeQuantity] = useState<number>(1);
  const [intakeReason, setIntakeReason] = useState<string>('');
  const [isIntakeSubmitting, setIsIntakeSubmitting] = useState<boolean>(false);

  // Branch stock mapping state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchStockMaps, setBranchStockMaps] = useState<Record<string, Record<string, number>>>({});
  const [isLoadingBranchStocks, setIsLoadingBranchStocks] = useState<boolean>(false);

  const products = useInventoryStore((state) => state.products);
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);
  const reqStatus = useInventoryStore((state) => state.status);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Load branch list and fetch stock maps for cross-branch distribution matrix
  useEffect(() => {
    async function loadBranchesAndStocks() {
      setIsLoadingBranchStocks(true);
      try {
        const branchList = await tauriClient.branchList();
        const activeBranches = branchList && branchList.length > 0 ? branchList : [
          { id: '00000000-0000-0000-0000-000000000002', organization_id: 'org1', name: 'Main Branch', code: 'MAIN', is_active: true, created_at: '', updated_at: '' },
        ];
        setBranches(activeBranches);

        const maps: Record<string, Record<string, number>> = {};
        for (const branch of activeBranches) {
          try {
            const stockMap = await tauriClient.inventoryGetStockMap(branch.id);
            maps[branch.id] = stockMap;
          } catch {
            maps[branch.id] = {};
          }
        }
        setBranchStockMaps(maps);
      } catch (err) {
        console.warn('Failed to fetch branch stock distribution', err);
      } finally {
        setIsLoadingBranchStocks(false);
      }
    }

    loadBranchesAndStocks();
  }, [products]);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const query = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query))
    );
  }, [products, searchTerm]);

  // Set default product for intake form
  useEffect(() => {
    if (products.length > 0 && !intakeProductId) {
      setIntakeProductId(products[0].id);
    }
  }, [products, intakeProductId]);

  // Handle Central Stock Intake submit
  const handleStockIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeProductId) {
      toast.error('Please select a product for stock intake.');
      return;
    }
    if (intakeQuantity <= 0) {
      toast.error('Stock intake quantity must be at least 1.');
      return;
    }

    const mainBranchId = '00000000-0000-0000-0000-000000000002'; // Central/Main Branch ID
    const selectedProd = products.find((p) => p.id === intakeProductId);

    try {
      setIsIntakeSubmitting(true);
      await tauriClient.inventoryIncrease({
        product_id: intakeProductId,
        branch_id: mainBranchId,
        quantity: intakeQuantity,
        reason: intakeReason.trim() || 'Central Main Branch Stock Intake',
      });

      toast.success(`Successfully added ${intakeQuantity} ${selectedProd?.unit || 'pcs'} to Central Main Branch stock.`);
      setIntakeQuantity(1);
      setIntakeReason('');
      await fetchProducts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete stock intake.');
    } finally {
      setIsIntakeSubmitting(false);
    }
  };

  const productSections = [
    { id: 'catalog', label: 'Product Master Catalog', icon: Package, desc: 'Central organization product master definitions, SKUs, and prices.' },
    { id: 'intake', label: 'Central Stock Intake', icon: Plus, desc: 'Receive and restock inventory directly at Central/Main Branch.' },
    { id: 'transfer', label: 'Stock Transfer Dispatch', icon: ArrowRightLeft, desc: 'Allocate and transfer stock from Main Branch to operational retail branches.' },
    { id: 'distribution', label: 'Branch Stock Distribution', icon: Store, desc: 'Organization-wide inventory breakdown across all physical branches.' },
  ];

  return (
    <OrganizationPageShell
      title="Organization Inventory Workspace"
      description="Central workspace for Master Product Catalog, Central Stock Receiving, and Inter-Branch Stock Transfers."
      badge="Central Inventory Authority"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddProductOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#006970] hover:bg-[#005a60] text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Master Product</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTransferProduct(null);
              setTransferOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Stock Transfer</span>
          </button>
        </div>
      }
    >
      {/* Stat Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Product Masters</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{products.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Branches</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{branches.length || 1}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Org Stock Units</div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {products.reduce((acc, p) => acc + (p.stock || 0), 0)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Low Stock Lines</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {products.filter((p) => p.status === StockStatus.LOW_STOCK || p.status === StockStatus.OUT_OF_STOCK).length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-800">
        {productSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#006970] text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PRODUCT MASTER CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl p-3 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by name, SKU, barcode, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
              />
            </div>
            <div className="text-xs text-gray-500 font-medium">
              Showing <strong>{filteredProducts.length}</strong> master items
            </div>
          </div>

          {/* Master Table */}
          <div className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-[11px] font-bold border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3">SKU / Code</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Purchase Cost</th>
                    <th className="px-4 py-3">Sale Price</th>
                    <th className="px-4 py-3">Main Branch Stock</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-gray-400">
                        No product master records found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{p.sku || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.category || 'General'}</td>
                        <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                          Rs. {(p.purchasePrice || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-bold text-[#006970] dark:text-[#00B4BB]">
                          Rs. {(p.price || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white tabular-nums">
                          {p.stock} {p.unit || 'pcs'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              p.status === StockStatus.HEALTHY
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : p.status === StockStatus.LOW_STOCK
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {p.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTransferProduct(p);
                                setTransferOpen(true);
                              }}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                              title="Transfer stock to branch"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Transfer
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingProduct(p)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors cursor-pointer"
                              title="Edit product master"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingProduct(p)}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors cursor-pointer"
                              title="Deactivate product master"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CENTRAL STOCK INTAKE */}
      {activeTab === 'intake' && (
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-6 border border-gray-200/80 dark:border-gray-700/80 shadow-sm max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 rounded-xl bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Central Stock Intake / Restock</h3>
              <p className="text-xs text-gray-500">Receive inventory directly at Main Branch (Central Stock)</p>
            </div>
          </div>

          <form onSubmit={handleStockIntake} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Select Product Master
              </label>
              <select
                value={intakeProductId}
                onChange={(e) => setIntakeProductId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970]"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku || 'No SKU'}) — Current Main Stock: {p.stock} {p.unit || 'pcs'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Stock Quantity to Add (Central Intake)
              </label>
              <input
                type="number"
                min="1"
                value={intakeQuantity}
                onChange={(e) => setIntakeQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3.5 py-2.5 text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-black text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Intake Notes / Invoice Reference (Optional)
              </label>
              <input
                type="text"
                value={intakeReason}
                onChange={(e) => setIntakeReason(e.target.value)}
                placeholder="e.g. Supplier box batch #4021, central purchase restock"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isIntakeSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-[#006970] hover:bg-[#005a60] text-white text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isIntakeSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Adding Stock...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Confirm Central Stock Intake
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: STOCK TRANSFER DISPATCH */}
      {activeTab === 'transfer' && (
        <div className="bg-white dark:bg-gray-800/90 rounded-xl p-8 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
            <ArrowRightLeft className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Inter-Branch Stock Transfer Dispatch</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-2 leading-relaxed">
            Dispatch stock from Main Branch (Central Stock) to operational retail branches. Uses Rust backend authorization and updates inventory atomically.
          </p>
          <button
            type="button"
            onClick={() => {
              setTransferProduct(null);
              setTransferOpen(true);
            }}
            className="mt-6 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Open Stock Transfer Dispatch Modal
          </button>
        </div>
      )}

      {/* TAB 4: BRANCH STOCK DISTRIBUTION */}
      {activeTab === 'distribution' && (
        <div className="bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Store className="w-4 h-4 text-[#006970]" />
              Cross-Branch Inventory Distribution Matrix
            </h3>
            {isLoadingBranchStocks && <span className="text-xs text-gray-400 animate-pulse">Syncing branch stock levels...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-[11px] font-bold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">SKU</th>
                  {branches.map((b) => (
                    <th key={b.id} className="px-4 py-3 text-center">
                      {b.name} ({b.code})
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total Organization Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {products.map((p) => {
                  let totalOrgStock = 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{p.sku || '-'}</td>
                      {branches.map((b) => {
                        const count = branchStockMaps[b.id]?.[p.id] ?? (b.code === 'MAIN' ? p.stock : 0);
                        totalOrgStock += count;
                        return (
                          <td key={b.id} className="px-4 py-3 text-center font-bold tabular-nums text-gray-800 dark:text-gray-200">
                            {count}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-black text-[#006970] dark:text-[#00B4BB] tabular-nums">
                        {totalOrgStock} {p.unit || 'pcs'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Product Drawer */}
      <AddProductDrawer
        isOpen={isAddProductOpen}
        onClose={() => setAddProductOpen(false)}
      />

      {/* Edit Product Master Modal */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {/* Product Delete Dialog */}
      {deletingProduct && (
        <ProductDeleteDialog
          product={deletingProduct}
          onClose={() => setDeletingProduct(null)}
        />
      )}

      {/* Inter-Branch Stock Transfer Modal */}
      <StockTransferModal
        isOpen={isTransferOpen}
        initialProduct={transferProduct}
        onClose={() => {
          setTransferOpen(false);
          setTransferProduct(null);
        }}
        onSuccess={() => fetchProducts()}
      />
    </OrganizationPageShell>
  );
}

export default OrganizationProductsPage;
