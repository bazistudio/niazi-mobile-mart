import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { InventoryTable, TableColumn } from '@/features/inventory/components/InventoryTable';
import { useInventoryFilters } from '@/features/inventory/components/InventoryFilterContext';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { productService } from '@/features/inventory/services/product.service';
import { InventoryProduct } from '@/features/inventory/types';
import { useDemandStore } from '@/features/inventory/store/demand.store';
import { Loader2, Printer, Download, ArrowRight, CheckSquare, Square, ShieldAlert, Settings2 } from 'lucide-react';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePrintStore } from '@/lib/printer/print.store';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import {
  buildProductInventoryA4Html,
  buildProductInventoryPdfFilename,
} from '@/features/inventory/templates/productInventoryA4Template';
import { useMasterData } from '@/features/inventory/hooks/useMasterData';
import toast from 'react-hot-toast';

function computeLatestCostMargin(salePrice: number, purchasePrice: number): { profitAmount: number; marginPct: number } {
  const sp = salePrice || 0;
  const pp = purchasePrice || 0;
  if (sp === 0) return { profitAmount: 0, marginPct: 0 };
  const profitAmount = sp - pp;
  const marginPct = (profitAmount / sp) * 100;
  return { profitAmount, marginPct };
}

export function InventoryLowStockPage() {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const normalizedRole = (role || '').toUpperCase();
  const canViewCost = normalizedRole !== '' && normalizedRole !== 'PUBLIC_USER';

  const { filters } = useInventoryFilters();
  const {
    selectedLowStockIds,
    toggleSelectLowStock,
    selectAllLowStock,
    clearSelectedLowStock,
    moveToDemand,
  } = useDemandStore();

  const { products, isLoading, error } = useProducts({
    page: 1,
    limit: 1000,
    search: filters.search,
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    companyId: filters.companyId,
    colorId: filters.colorId,
    qualityId: filters.qualityId,
  });

  // ── GAP 04: Configurable min-stock threshold (session-local) ────────────────
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [showThresholdConfig, setShowThresholdConfig] = useState<boolean>(false);

  // Products split into critical (stock ≤ 0) and low (0 < stock ≤ threshold)
  const criticalStockProducts = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= 0),
    [products]
  );
  const lowStockProducts = useMemo(
    () => products.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= lowStockThreshold),
    [products, lowStockThreshold]
  );
  // Combined list shown on this page (critical first, then low-stock)
  const zeroStockProducts = useMemo(
    () => [...criticalStockProducts, ...lowStockProducts],
    [criticalStockProducts, lowStockProducts]
  );

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeShop = useOrganizationStore((s) => s.activeShop);
  const currentUser = useAuthStore((s) => s.user);

  const { options: categories } = useMasterData('category');
  const { options: brands } = useMasterData('brand');
  const { options: companies } = useMasterData('company');
  const { options: colors } = useMasterData('color');
  const { options: qualities } = useMasterData('quality');

  const fetchCompleteLowStockProducts = useCallback(async () => {
    const filterSnapshot = {
      search: filters.search ? String(filters.search).trim() : undefined,
      categoryId: filters.categoryId || undefined,
      brandId: filters.brandId || undefined,
      companyId: filters.companyId || undefined,
      colorId: filters.colorId || undefined,
      qualityId: filters.qualityId || undefined,
    };

    const res = await productService.getProducts({
      page: 1,
      limit: 10000,
      search: filterSnapshot.search,
      categoryId: filterSnapshot.categoryId,
      brandId: filterSnapshot.brandId,
      companyId: filterSnapshot.companyId,
      colorId: filterSnapshot.colorId,
      qualityId: filterSnapshot.qualityId,
    });

    const items = (res.products || []).filter((p) => (p.stock ?? 0) <= lowStockThreshold);

    const categoryLabel = filterSnapshot.categoryId
      ? categories.find((c: any) => c.id === filterSnapshot.categoryId)?.name || filterSnapshot.categoryId
      : undefined;
    const brandLabel = filterSnapshot.brandId
      ? brands.find((b: any) => b.id === filterSnapshot.brandId)?.name || filterSnapshot.brandId
      : undefined;
    const companyLabel = filterSnapshot.companyId
      ? companies.find((c: any) => c.id === filterSnapshot.companyId)?.name || filterSnapshot.companyId
      : undefined;
    const colorLabel = filterSnapshot.colorId
      ? colors.find((c: any) => c.id === filterSnapshot.colorId)?.name || filterSnapshot.colorId
      : undefined;
    const qualityLabel = filterSnapshot.qualityId
      ? qualities.find((q: any) => q.id === filterSnapshot.qualityId)?.name || filterSnapshot.qualityId
      : undefined;

    return {
      items,
      categoryLabel,
      brandLabel,
      companyLabel,
      colorLabel,
      qualityLabel,
      searchKeyword: filterSnapshot.search,
    };
  }, [filters, categories, brands, companies, colors, qualities]);

  const handlePrintA4 = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const { items, categoryLabel, brandLabel, companyLabel, colorLabel, qualityLabel, searchKeyword } =
        await fetchCompleteLowStockProducts();

      const branchName = activeShop?.branch_name || (activeShop?.code ? `Branch ${activeShop.code}` : undefined);
      const html = buildProductInventoryA4Html(items, {
        shopName: `${activeShop?.name || 'Niazi Mobile Mart'} — Low Stock Alert (≤${lowStockThreshold}) Report`,
        branchName,
        categoryFilter: categoryLabel,
        brandFilter: brandLabel,
        companyFilter: companyLabel,
        colorFilter: colorLabel,
        qualityFilter: qualityLabel,
        searchKeyword,
        generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
        canViewCost,
      });

      usePrintStore.getState().openPreview({
        html,
        documentType: 'Generic',
        referenceId: `low_stock_${Date.now()}`,
        title: `Low Stock Report (${items.length} Records)`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate A4 print preview';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, fetchCompleteLowStockProducts, activeShop, currentUser, canViewCost]);

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const { items, categoryLabel, brandLabel, companyLabel, colorLabel, qualityLabel, searchKeyword } =
        await fetchCompleteLowStockProducts();

      const branchName = activeShop?.branch_name || (activeShop?.code ? `Branch ${activeShop.code}` : undefined);
      const html = buildProductInventoryA4Html(items, {
        shopName: `${activeShop?.name || 'Niazi Mobile Mart'} — Low Stock Alert (≤${lowStockThreshold}) Report`,
        branchName,
        categoryFilter: categoryLabel,
        brandFilter: brandLabel,
        companyFilter: companyLabel,
        colorFilter: colorLabel,
        qualityFilter: qualityLabel,
        searchKeyword,
        generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
        canViewCost,
      });

      const filename = buildProductInventoryPdfFilename('low_stock_0_qty');
      await downloadHtmlAsPdf(html, filename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export A4 PDF document';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, fetchCompleteLowStockProducts, activeShop, currentUser, canViewCost]);

  if (!isOrgAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-white dark:bg-gray-900 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Admin Access Only</h3>
        <p className="text-xs text-gray-500 max-w-sm mt-1">
          Low Stock tracking and Supplier Demand creation are restricted to Organization Administrators.
        </p>
      </div>
    );
  }

  const allVisibleSelected =
    zeroStockProducts.length > 0 &&
    zeroStockProducts.every((p) => selectedLowStockIds.includes(p.id));

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      clearSelectedLowStock();
    } else {
      selectAllLowStock(zeroStockProducts.map((p) => p.id));
    }
  };

  const handleMoveSelectedToDemand = () => {
    const selectedProducts = zeroStockProducts.filter((p) =>
      selectedLowStockIds.includes(p.id)
    );
    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product to move to Demand.');
      return;
    }
    moveToDemand(selectedProducts);
    toast.success(`${selectedProducts.length} product(s) moved to Demand list.`);
    navigate('/dashboard/shop-admin/inventory/demand');
  };

  const handleMoveSingleToDemand = (product: InventoryProduct) => {
    moveToDemand([product]);
    toast.success(`"${product.name}" added to Demand list.`);
    navigate('/dashboard/shop-admin/inventory/demand');
  };

  const columns: TableColumn<InventoryProduct>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <div className="font-bold">{row.name}</div>
          {row.sku && <div className="text-xs text-gray-500 font-normal">{row.sku}</div>}
        </div>
      ),
    },
    { key: 'category', label: 'Category' },
    { key: 'brand', label: 'Brand' },
    { key: 'company', label: 'Company' },
    { key: 'color', label: 'Color' },
    { key: 'quality', label: 'Quality' },
    {
      key: 'stock',
      label: 'Stock',
      render: (row) => {
        const stock = row.stock ?? 0;
        const isCritical = stock <= 0;
        const isLow = stock > 0 && stock <= lowStockThreshold;
        return (
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-gray-300'
              }`}
            />
            <span
              className={`font-bold ${
                isCritical
                  ? 'text-red-600 dark:text-red-400'
                  : isLow
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {stock}
            </span>
            {isCritical && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                OUT
              </span>
            )}
          </div>
        );
      },
    },
    ...(canViewCost
      ? [
          {
            key: 'purchasePrice',
            label: 'Purchase',
            render: (row: InventoryProduct) => (
              <span className="font-bold text-blue-600 dark:text-blue-400">
                Rs. {(row.purchasePrice || 0).toLocaleString()}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'price',
      label: 'Sale',
      render: (row: InventoryProduct) => (
        <span className="font-bold text-green-600 dark:text-green-400">
          Rs. {(row.price || 0).toLocaleString()}
        </span>
      ),
    },
    ...(canViewCost
      ? [
          {
            key: 'averageCost',
            label: 'Avg Cost',
            render: (row: InventoryProduct) => (
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Rs. {(row.averageCost || 0).toLocaleString()}
              </span>
            ),
          },
          {
            key: 'marginAmount',
            label: 'Margin (Rs.)',
            render: (row: InventoryProduct) => {
              const { profitAmount } = computeLatestCostMargin(row.price || 0, row.purchasePrice || 0);
              return (
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {(row.price || 0) === 0 ? '—' : `Rs. ${profitAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </span>
              );
            },
          },
          {
            key: 'totalValue',
            label: 'Value',
            render: (row: InventoryProduct) => (
              <span className="font-bold text-[#006970] dark:text-[#00B4BB]">
                Rs. {((row.stock || 0) * (row.purchasePrice || 0)).toLocaleString()}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'actions',
      label: 'Action',
      render: (row: InventoryProduct) => {
        const isChecked = selectedLowStockIds.includes(row.id);
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelectLowStock(row.id);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                isChecked
                  ? 'bg-[#006970] text-white border-[#006970]'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
              }`}
              title="Mark product for supplier demand"
            >
              {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>{isChecked ? 'Selected' : 'Select'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveSingleToDemand(row);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] hover:bg-[#006970]/20 transition-colors cursor-pointer"
              title="Directly move this item to Demand"
            >
              <span>Demand</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        );
      },
    },
  ];

  if (error) {
    return <div className="p-4 text-red-500">Failed to load low stock products.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 flex-wrap">
            Low Stock Alert —
            <span className="text-red-500 dark:text-red-400"> {criticalStockProducts.length} Critical</span>
            {lowStockProducts.length > 0 && (
              <span className="text-amber-500 dark:text-amber-400">, {lowStockProducts.length} Low (≤{lowStockThreshold})</span>
            )}
          </span>

          {zeroStockProducts.length > 0 && (
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-[#006970]" />
              ) : (
                <Square className="w-3.5 h-3.5 text-gray-400" />
              )}
              <span>{allVisibleSelected ? 'Deselect All' : 'Select All (0 Stock)'}</span>
            </button>
          )}

          {selectedLowStockIds.length > 0 && (
            <button
              type="button"
              onClick={handleMoveSelectedToDemand}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-[#006970] hover:bg-[#005a60] rounded-lg shadow-xs transition-colors cursor-pointer animate-fade-in"
            >
              <span>Move to Demand ({selectedLowStockIds.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* GAP 04: Threshold config toggle */}
        <button
          type="button"
          onClick={() => setShowThresholdConfig((v) => !v)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
            showThresholdConfig
              ? 'bg-[#006970]/10 border-[#006970]/40 text-[#006970] dark:text-[#00B4BB]'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
          }`}
          title="Configure low-stock alert threshold"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Threshold: ≤{lowStockThreshold}</span>
        </button>

        {/* On-Demand Print & PDF Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintA4}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            title="Print A4 report of 0-stock items"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />}
            <span>Print A4</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            title="Download A4 PDF of 0-stock items"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* GAP 04: Threshold Config Panel */}
      {showThresholdConfig && (
        <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
            Min Stock Threshold
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Products with stock &gt; 0 and stock ≤ this value will appear as low-stock alerts.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setLowStockThreshold((v) => Math.max(1, v - 1))}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={999}
              value={lowStockThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 999) setLowStockThreshold(val);
              }}
              className="w-14 text-center text-xs font-bold border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setLowStockThreshold((v) => Math.min(999, v + 1))}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              +
            </button>
            <span className="text-xs text-gray-400 ml-1">units</span>
          </div>
        </div>
      )}

      {/* Export Error Banner */}
      {exportError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center justify-between" role="alert">
          <span>{exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="underline hover:no-underline cursor-pointer ml-3 font-semibold">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative p-4">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-[#006970]" />
          </div>
        ) : null}
        <InventoryTable
          columns={columns}
          data={zeroStockProducts}
          onRowClick={(row) => toggleSelectLowStock(row.id)}
        />
      </div>
    </div>
  );
}

export default InventoryLowStockPage;
