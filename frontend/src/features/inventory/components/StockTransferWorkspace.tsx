'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowRightLeft, 
  Search, 
  Printer, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  Building2, 
  Warehouse, 
  Package, 
  RefreshCw, 
  SlidersHorizontal,
  Check,
  FileText,
  Boxes,
  HelpCircle
} from 'lucide-react';
import { InventoryProduct } from '../types';
import { useInventoryStore } from '../core/inventory.store';
import { usePermissions } from '@/lib/auth/usePermissions';
import { tauriClient, Branch } from '@/lib/tauri/tauriClient';
import { httpClient } from '@/lib/http/httpClient';
import { DynamicMasterSelect } from './master-data/DynamicMasterSelect';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import toast from 'react-hot-toast';

export interface StagedTransferItem {
  productId: string;
  product: InventoryProduct;
  quantity: number;
}

interface StockTransferWorkspaceProps {
  isActiveTab?: boolean;
  initialProduct?: InventoryProduct | null;
  onClearInitialProduct?: () => void;
  onSuccess?: () => void;
}

function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const StockTransferWorkspace: React.FC<StockTransferWorkspaceProps> = ({
  isActiveTab = true,
  initialProduct,
  onClearInitialProduct,
  onSuccess
}) => {
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';

  const products = useInventoryStore((state) => state.products);
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);

  // Branch and routing state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceBranchId, setSourceBranchId] = useState<string>('');
  const [destBranchId, setDestBranchId] = useState<string>('');
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(true);

  // Authoritative Stock Maps
  const [sourceStockMap, setSourceStockMap] = useState<Record<string, number>>({});
  const [destStockMap, setDestStockMap] = useState<Record<string, number>>({});
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);

  // Specification Filters (matching real inventory filter bar)
  const [categoryId, setCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>('');
  const [colorId, setColorId] = useState<string>('');
  const [qualityId, setQualityId] = useState<string>('');

  // Search & Keyboard Autocomplete State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Staged Batch State
  const [stagedItems, setStagedItems] = useState<StagedTransferItem[]>([]);
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [activeTransferId, setActiveTransferId] = useState<string>(() => crypto.randomUUID());
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // ─── 1. Load Branches & Initialize Source/Dest ──────────────────────────
  useEffect(() => {
    async function loadBranches() {
      try {
        setIsLoadingBranches(true);
        const list = await httpClient.get<Branch[]>('/api/v1/branches');
        if (list && list.length > 0) {
          setBranches(list);

          // Canonical source: Central Warehouse (is_warehouse === 1 or code WAREHOUSE or UUID ...0003)
          const warehouseBranch =
            list.find((b) => b.is_warehouse === 1 || b.code === 'WAREHOUSE' || b.id === '00000000-0000-0000-0000-000000000003') ||
            list.find((b) => b.name.toLowerCase().includes('warehouse'));
          
          const mainBranch =
            list.find((b) => b.code === 'MAIN' || b.name.toLowerCase().includes('main')) ||
            list[0];

          const source = warehouseBranch ?? mainBranch;
          setSourceBranchId(source.id);

          // Default destination: First retail branch that is not the source
          const dest = list.find((b) => b.id !== source.id && b.is_warehouse !== 1) || list.find((b) => b.id !== source.id) || list[0];
          if (dest) {
            setDestBranchId(dest.id);
          }
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
        toast.error('Failed to load branch list.');
      } finally {
        setIsLoadingBranches(false);
      }
    }

    loadBranches();
  }, []);

  // ─── 2. Refresh Stock Maps Whenever Branches Change ──────────────────────
  const refreshStockMaps = async (srcId = sourceBranchId, dstId = destBranchId) => {
    if (!srcId && !dstId) return;
    setIsLoadingStock(true);
    try {
      const [srcMap, dstMap] = await Promise.all([
        srcId ? tauriClient.inventoryGetStockMap(srcId).catch(() => ({} as Record<string, number>)) : Promise.resolve({}),
        dstId ? tauriClient.inventoryGetStockMap(dstId).catch(() => ({} as Record<string, number>)) : Promise.resolve({})
      ]);
      setSourceStockMap(srcMap || {});
      setDestStockMap(dstMap || {});
    } catch (err) {
      console.error('Error fetching stock maps:', err);
    } finally {
      setIsLoadingStock(false);
    }
  };

  useEffect(() => {
    if (sourceBranchId || destBranchId) {
      refreshStockMaps(sourceBranchId, destBranchId);
    }
  }, [sourceBranchId, destBranchId]);

  // ─── 3. Stage Initial Product if passed from catalog ────────────────────
  useEffect(() => {
    if (initialProduct?.id) {
      handleStageProduct(initialProduct);
      if (onClearInitialProduct) onClearInitialProduct();
    }
  }, [initialProduct]);

  // ─── 4. Keyboard Shortcut: Press '/' to focus search ────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActiveTab) return;
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        // Prevent default only if not in an input/textarea
        if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActiveTab]);

  // ─── 5. Filter Products based on search & specification dropdowns ───────
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Dynamic master specification filters
      if (categoryId && p.categoryId !== categoryId && p.category !== categoryId) return false;
      if (brandId && p.brandId !== brandId && p.brand !== brandId) return false;
      if (companyId && p.companyId !== companyId && p.company !== companyId) return false;
      if (colorId && p.colorId !== colorId && p.color !== colorId) return false;
      if (qualityId && p.qualityId !== qualityId && p.quality !== qualityId) return false;

      // Text search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(query);
        const matchSku = p.sku?.toLowerCase().includes(query);
        const matchBarcode = p.barcode?.toLowerCase().includes(query);
        const matchCategory = p.category?.toLowerCase().includes(query);
        const matchBrand = p.brand?.toLowerCase().includes(query);
        const matchCompany = p.company?.toLowerCase().includes(query);
        const matchQuality = p.quality?.toLowerCase().includes(query);
        return matchName || matchSku || matchBarcode || matchCategory || matchBrand || matchCompany || matchQuality;
      }

      return true;
    });
  }, [products, searchQuery, categoryId, brandId, companyId, colorId, qualityId]);

  // Reset highlighted index when filter results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, categoryId, brandId, companyId, colorId, qualityId]);

  // Reset all specification filters
  const handleResetFilters = () => {
    setCategoryId('');
    setBrandId('');
    setCompanyId('');
    setColorId('');
    setQualityId('');
    setSearchQuery('');
    toast.success('Search & filters reset');
  };

  // ─── 6. Staging & Duplicate Handling Logic ──────────────────────────────
  const handleStageProduct = (product: InventoryProduct) => {
    const availableSourceStock = sourceStockMap[product.id] ?? product.stock ?? 0;

    setStagedItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id);
      if (existingIndex >= 0) {
        // Increment quantity if already staged (up to available source stock)
        const currentQty = prev[existingIndex].quantity;
        const newQty = availableSourceStock > 0 ? Math.min(currentQty + 1, availableSourceStock) : currentQty + 1;
        
        toast(`Incremented quantity for ${product.name} to ${newQty}`, {
          icon: '🔄',
          style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
        });

        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      } else {
        // Add new item with initial quantity 1
        toast.success(`Staged ${product.name}`, {
          style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
        });
        return [...prev, { productId: product.id, product, quantity: 1 }];
      }
    });

    setSearchQuery('');
    setIsSearchFocused(false);
  };

  const handleUpdateQuantity = (productId: string, newQty: number) => {
    const availableStock = sourceStockMap[productId] ?? 0;
    const validatedQty = Math.max(1, isNaN(newQty) ? 1 : newQty);

    setStagedItems((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity: validatedQty } : item))
    );
  };

  const handleSetMaxQuantity = (productId: string) => {
    const availableStock = sourceStockMap[productId] ?? 0;
    if (availableStock <= 0) {
      toast.error('Zero available stock in Central Warehouse.');
      return;
    }
    setStagedItems((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity: availableStock } : item))
    );
  };

  const handleRemoveStagedItem = (productId: string) => {
    setStagedItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleClearBatch = () => {
    if (stagedItems.length === 0) return;
    if (confirm('Are you sure you want to clear all staged products from this transfer batch?')) {
      setStagedItems([]);
      setActiveTransferId(crypto.randomUUID());
      toast.success('Transfer batch cleared.');
    }
  };

  // ─── 7. Search Input Keydown Handler (Enter to stage, Arrow navigation) ─
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0 && filteredProducts[highlightedIndex]) {
        handleStageProduct(filteredProducts[highlightedIndex]);
      } else {
        toast.error('No matching product to add.');
      }
    } else if (e.key === 'Escape') {
      setIsSearchFocused(false);
    }
  };

  // ─── 8. Validation Metrics ──────────────────────────────────────────────
  const totalUnits = useMemo(() => {
    return stagedItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [stagedItems]);

  const hasInvalidRows = useMemo(() => {
    return stagedItems.some((item) => {
      const srcStock = sourceStockMap[item.productId] ?? 0;
      return item.quantity <= 0 || item.quantity > srcStock;
    });
  }, [stagedItems, sourceStockMap]);

  // Active branches names
  const sourceBranch = branches.find((b) => b.id === sourceBranchId);
  const destBranch = branches.find((b) => b.id === destBranchId);

  // ─── 9. Print & Download PDF Transfer Slip Formatter (Safe HTML) ───────
  const generateTransferSlipHtml = () => {
    const timestamp = escapeHtml(new Date().toLocaleString());
    const batchId = escapeHtml(`TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`);

    const rowsHtml = stagedItems
      .map((item, idx) => {
        const srcStock = sourceStockMap[item.productId] ?? 0;
        const remainingSrc = srcStock - item.quantity;
        const dstStock = destStockMap[item.productId] ?? 0;
        const projDst = dstStock + item.quantity;

        const safeName = escapeHtml(item.product.name);
        const safeSku = escapeHtml(item.product.sku || '-');
        const safeCategory = escapeHtml(item.product.category || '');
        const safeQuality = escapeHtml(item.product.quality || '');

        return `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
            <td style="padding: 8px 6px; text-align: center;">${idx + 1}</td>
            <td style="padding: 8px 6px;">
              <strong>${safeName}</strong><br/>
              <span style="color: #64748b; font-size: 11px;">SKU: ${safeSku} | Spec: ${safeCategory} ${safeQuality}</span>
            </td>
            <td style="padding: 8px 6px; text-align: center;">${srcStock} pcs</td>
            <td style="padding: 8px 6px; text-align: center; font-weight: bold; color: #0284c7; font-size: 13px;">${item.quantity} pcs</td>
            <td style="padding: 8px 6px; text-align: center; color: #475569;">${remainingSrc} pcs</td>
            <td style="padding: 8px 6px; text-align: center;">${dstStock} pcs</td>
            <td style="padding: 8px 6px; text-align: center; font-weight: bold; color: #059669;">${projDst} pcs</td>
          </tr>
        `;
      })
      .join('');

    const safeSrcName = escapeHtml(sourceBranch?.name || 'Central Warehouse');
    const safeSrcCode = escapeHtml(sourceBranch?.code || 'WAREHOUSE');
    const safeDstName = escapeHtml(destBranch?.name || 'Main Branch');
    const safeDstCode = escapeHtml(destBranch?.code || 'MAIN');
    const safeNotes = escapeHtml(transferNotes);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Stock Transfer Dispatch Slip — ${batchId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #0f172a; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #e0f2fe; color: #0369a1; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 8px 6px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; }
            .summary { margin-top: 20px; display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; }
            .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
            .sign-box { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 12px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h2 style="margin: 0; font-size: 20px; color: #006970;">NIAZI MOBILE MART</h2>
              <div style="font-size: 14px; font-weight: bold; margin-top: 3px;">INTER-BRANCH STOCK TRANSFER DISPATCH SLIP</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Document Reference: <strong>${batchId}</strong></div>
            </div>
            <div style="text-align: right; font-size: 12px;">
              <div>Date: <strong>${timestamp}</strong></div>
              <div>Status: <span class="badge">DISPATCHED</span></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; font-size: 13px;">
            <div style="border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; background: #fafafa;">
              <span style="color: #64748b; font-size: 11px;">SOURCE ORIGIN:</span><br/>
              <strong style="font-size: 14px;">${safeSrcName}</strong><br/>
              <span style="font-size: 11px; color: #64748b;">Code: ${safeSrcCode}</span>
            </div>
            <div style="border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; background: #fafafa;">
              <span style="color: #64748b; font-size: 11px;">DESTINATION TARGET:</span><br/>
              <strong style="font-size: 14px;">${safeDstName}</strong><br/>
              <span style="font-size: 11px; color: #64748b;">Code: ${safeDstCode}</span>
            </div>
          </div>

          ${safeNotes ? `<div style="font-size: 12px; margin-bottom: 12px; background: #fefce8; border: 1px solid #fef08a; padding: 8px; border-radius: 4px;"><strong>Transfer Notes / Reason:</strong> ${safeNotes}</div>` : ''}

          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 30px;">#</th>
                <th>Product Description & SKU</th>
                <th style="text-align: center;">Source Stock</th>
                <th style="text-align: center;">Transfer Qty</th>
                <th style="text-align: center;">Remaining Whs</th>
                <th style="text-align: center;">Dest Current</th>
                <th style="text-align: center;">Dest Projected</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="summary">
            <div>Total Products: <strong>${stagedItems.length} items</strong></div>
            <div>Total Transfer Quantity: <strong>${totalUnits} units</strong></div>
          </div>

          <div class="signatures">
            <div class="sign-box">Dispatched By (Warehouse Head)</div>
            <div class="sign-box">Carrier / Driver Handover</div>
            <div class="sign-box">Received By (Branch Manager)</div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintSlip = () => {
    if (stagedItems.length === 0) {
      toast.error('Add at least one product to the transfer batch to print a slip.');
      return;
    }
    const html = generateTransferSlipHtml();
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 300);
    } else {
      toast.error('Pop-up was blocked. Please allow pop-ups to print slips.');
    }
  };

  const handleDownloadPdf = async () => {
    if (stagedItems.length === 0) {
      toast.error('Add at least one product to the transfer batch to export PDF.');
      return;
    }
    try {
      const html = generateTransferSlipHtml();
      const filename = `Stock_Transfer_${destBranch?.code || 'Branch'}_${new Date().toISOString().slice(0, 10)}`;
      toast.loading('Generating PDF transfer slip...', { id: 'pdf-toast' });
      await downloadHtmlAsPdf(html, filename);
      toast.success('Transfer PDF downloaded successfully!', { id: 'pdf-toast' });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF slip: ' + (err?.message || 'Unknown error'), { id: 'pdf-toast' });
    }
  };

  // ─── 10. Finish Stock Transfer UI Action ─────────────────────────────────
  const handleOpenReview = () => {
    if (stagedItems.length === 0) {
      toast.error('Please stage at least one product before finishing transfer.');
      return;
    }
    if (hasInvalidRows) {
      toast.error('Cannot proceed: Some rows have quantities exceeding available warehouse stock or invalid quantities.');
      return;
    }
    setIsReviewModalOpen(true);
  };

  const handleConfirmFinishTransfer = async () => {
    setIsSubmitting(true);
    try {
      const batchPayload = {
        transfer_id: activeTransferId,
        source_branch_id: sourceBranchId,
        destination_branch_id: destBranchId,
        items: stagedItems.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
        reason: 'Organization Stock Transfer Dispatch',
        notes: transferNotes.trim() || undefined,
      };

      const result = await httpClient.post<{
        batch_id: string;
        total_items: number;
        total_quantity: number;
      }>('/api/v1/inventory/transfer/batch', batchPayload);

      toast.success(
        `Successfully transferred ${result?.total_items ?? stagedItems.length} products (${result?.total_quantity ?? totalUnits} units) to ${destBranch?.name || 'Destination'}.`,
        { duration: 5000 }
      );

      // Clear staged list, generate fresh batch ID for next transfer, and close modal
      setStagedItems([]);
      setTransferNotes('');
      setActiveTransferId(crypto.randomUUID());
      setIsReviewModalOpen(false);

      // Refresh catalog and live branch stock levels
      await Promise.all([
        fetchProducts({ scope: 'organization' }),
        refreshStockMaps(sourceBranchId, destBranchId)
      ]);

      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'Failed to complete batch transfer.';
      toast.error(errMsg, { duration: 6000 });
      // Note: activeTransferId is intentionally NOT rotated on error, so retrying sends the same batch key (F-13)
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* ─── CARD A: ROUTING CONTROL HEADER ─────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl p-4 sm:p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Source Location */}
          <div className="flex-1 w-full bg-gray-50 dark:bg-gray-900/70 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700/70">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                Source Location
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                <Check className="w-3 h-3" /> System Origin
              </span>
            </div>
            
            <div className="relative">
              <select
                value={sourceBranchId}
                onChange={(e) => setSourceBranchId(e.target.value)}
                disabled={!isOrgAdmin}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 px-3 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] transition-all cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.is_warehouse === 1 || b.code === 'WAREHOUSE' ? 'Warehouse Stock' : b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Directional Flow Arrow */}
          <div className="shrink-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 flex items-center justify-center shadow-sm">
              <ArrowRightLeft className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* Destination Branch */}
          <div className="flex-1 w-full bg-gray-50 dark:bg-gray-900/70 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700/70">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Destination Branch
              </span>
              <span className="text-[11px] text-gray-400">
                Retail Target
              </span>
            </div>

            <div className="relative">
              <select
                value={destBranchId}
                onChange={(e) => setDestBranchId(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 px-3 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#006970] transition-all cursor-pointer"
              >
                {branches
                  .filter((b) => b.id !== sourceBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* ─── CARD B: SEARCH BAR & HEADER ACTION BUTTONS ──────────────────── */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl p-4 sm:p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm space-y-3.5">
        
        {/* Top Search & Actions Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search Input with Hotkey Hint */}
          <div className="relative flex-1 min-w-65">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search className="w-4 h-4" />
            </div>

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search product by name, SKU, barcode, model (Press / to search)..."
              className="w-full pl-10 pr-24 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970] focus:border-transparent transition-all"
            />

            <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5 pointer-events-none">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded">
                /
              </kbd>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded">
                ↵ Add
              </kbd>
            </div>

            {/* Autocomplete Search Dropdown */}
            {isSearchFocused && searchQuery.trim().length > 0 && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsSearchFocused(false)} 
                />
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800"
                >
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">
                      No matching products found. Try adjusting filters or search query.
                    </div>
                  ) : (
                    filteredProducts.slice(0, 15).map((p, idx) => {
                      const srcStock = sourceStockMap[p.id] ?? p.stock ?? 0;
                      const isHighlighted = idx === highlightedIndex;

                      return (
                        <div
                          key={p.id}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handleStageProduct(p)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-teal-50/80 dark:bg-teal-950/40 text-gray-900 dark:text-white'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{p.name}</div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                <span className="font-mono">SKU: {p.sku || '-'}</span>
                                {p.category && <span>• {p.category}</span>}
                                {p.quality && <span className="text-teal-600 dark:text-teal-400">• {p.quality}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-[11px] text-gray-400">Whs Stock</div>
                              <div className={`text-xs font-bold ${srcStock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                                {srcStock} {p.unit || 'pcs'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="px-2.5 py-1 bg-[#006970] hover:bg-[#005a60] text-white rounded text-xs font-semibold"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Action Buttons: Print Slip & Download PDF */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintSlip}
              disabled={stagedItems.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/80 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-xs font-bold transition-all border border-gray-200 dark:border-gray-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Print transfer dispatch slip for physical store handover"
            >
              <Printer className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Print Slip</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={stagedItems.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/80 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-xs font-bold transition-all border border-gray-200 dark:border-gray-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Download transfer manifest as PDF"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Download PDF</span>
            </button>
          </div>

        </div>

        {/* ─── REAL SPECIFICATION FILTER BAR (MATCHING INVENTORY) ─────────── */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-750 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <SlidersHorizontal className="w-3 h-3" />
            Specs:
          </span>

          <DynamicMasterSelect 
            entity="category"
            value={categoryId}
            onChange={(id: string) => setCategoryId(id)}
          />

          <DynamicMasterSelect 
            entity="brand"
            value={brandId}
            onChange={(id: string) => setBrandId(id)}
          />

          <DynamicMasterSelect 
            entity="company"
            value={companyId}
            onChange={(id: string) => setCompanyId(id)}
          />

          <DynamicMasterSelect 
            entity="color"
            value={colorId}
            onChange={(id: string) => setColorId(id)}
          />

          <DynamicMasterSelect 
            entity="quality"
            value={qualityId}
            onChange={(id: string) => setQualityId(id)}
          />

          {(categoryId || brandId || companyId || colorId || qualityId || searchQuery) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer ml-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

      </div>

      {/* ─── CARD C: STAGED TRANSFER DATA TABLE ──────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
        
        <div className="p-4 border-b border-gray-100 dark:border-gray-750 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-[#006970] dark:text-[#00B4BB]" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Staged Transfer Products ({stagedItems.length})
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {isLoadingStock && (
              <span className="text-xs text-gray-400 flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Live stock verification...
              </span>
            )}
            {stagedItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearBatch}
                className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {stagedItems.length === 0 ? (
          <div className="py-14 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto flex items-center justify-center text-gray-400 mb-3">
              <Package className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200">
              No products staged for transfer yet
            </h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Use the search bar above or press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[11px]">/</kbd> to quickly find parts by model, SKU, or specs and press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[11px]">Enter</kbd> to stage them.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 uppercase text-[11px] font-bold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">Product Details</th>
                  <th className="px-4 py-3 text-center">Current Whs Stock</th>
                  <th className="px-4 py-3 text-center min-w-42.5">Transfer Qty</th>
                  <th className="px-4 py-3 text-center">Remaining Whs Stock</th>
                  <th className="px-4 py-3 text-center">Current Branch Stock</th>
                  <th className="px-4 py-3 text-center">Projected Branch Stock</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {stagedItems.map((item) => {
                  const srcStock = sourceStockMap[item.productId] ?? 0;
                  const remainingSrc = srcStock - item.quantity;
                  const dstStock = destStockMap[item.productId] ?? 0;
                  const projDst = dstStock + item.quantity;

                  const isExceeding = item.quantity > srcStock;
                  const isZero = item.quantity <= 0;
                  const isValid = !isExceeding && !isZero;

                  return (
                    <tr 
                      key={item.productId}
                      className={`transition-colors ${
                        isExceeding
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : 'hover:bg-gray-50/70 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      {/* Product Details */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
                            <Package className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white text-xs">
                              {item.product.name}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.2 rounded text-[10px]">
                                {item.product.sku || 'NO-SKU'}
                              </span>
                              {item.product.category && (
                                <span className="text-gray-400">• {item.product.category}</span>
                              )}
                              {item.product.quality && (
                                <span className="text-teal-600 dark:text-teal-400 font-semibold">• {item.product.quality}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Warehouse Stock */}
                      <td className="px-4 py-3.5 text-center font-bold text-gray-900 dark:text-white tabular-nums">
                        {srcStock} <span className="text-xs font-normal text-gray-400">{item.product.unit || 'pcs'}</span>
                      </td>

                      {/* Transfer Quantity Stepper */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(item.productId, parseInt(e.target.value) || 0)}
                            className="w-14 text-center bg-transparent text-xs font-bold text-gray-900 dark:text-white focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= srcStock}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetMaxQuantity(item.productId)}
                            className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-teal-600/10 hover:bg-teal-600/20 text-[#006970] dark:text-[#00B4BB] ml-0.5 transition-colors"
                            title="Transfer maximum available warehouse stock"
                          >
                            Max
                          </button>
                        </div>
                      </td>

                      {/* Remaining Warehouse Stock */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-bold tabular-nums text-gray-800 dark:text-gray-200">
                          {remainingSrc} <span className="text-xs font-normal text-gray-400">{item.product.unit || 'pcs'}</span>
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          -{item.quantity}
                        </span>
                      </td>

                      {/* Current Branch Stock */}
                      <td className="px-4 py-3.5 text-center font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                        {dstStock} <span className="text-xs font-normal text-gray-400">{item.product.unit || 'pcs'}</span>
                      </td>

                      {/* Projected Branch Stock */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-bold tabular-nums text-gray-900 dark:text-white">
                          {projDst} <span className="text-xs font-normal text-gray-400">{item.product.unit || 'pcs'}</span>
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          +{item.quantity}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        {isExceeding ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" /> Exceeds Stock
                          </span>
                        ) : isZero ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            Zero Qty
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </td>

                      {/* Action Remove */}
                      <td className="px-3 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedItem(item.productId)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                          title="Remove from transfer batch"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ─── CARD D: BATCH DISPATCH FOOTER ───────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl p-4 sm:p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Summary Metric & Batch Notes */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="px-3.5 py-2 bg-gray-100 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">Staged Batch:</span>{' '}
              <strong className="text-xs text-gray-900 dark:text-white">
                {stagedItems.length} Products ({totalUnits} Units)
              </strong>
            </div>

            <div className="flex-1">
              <input
                type="text"
                placeholder="Transfer Notes (optional, e.g. Weekend stock replenishment, Gate pass #402)..."
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006970]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleClearBatch}
              disabled={stagedItems.length === 0}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/80 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Clear Batch
            </button>

            <button
              type="button"
              onClick={handleOpenReview}
              disabled={stagedItems.length === 0 || hasInvalidRows || isSubmitting}
              className="px-6 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finish Stock Transfer ({stagedItems.length})</span>
            </button>
          </div>

        </div>
      </div>

      {/* ─── MODAL: BATCH REVIEW & CONFIRMATION ──────────────────────────── */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Confirm Stock Transfer Batch
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              
              <div className="bg-gray-50 dark:bg-gray-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-gray-400">Source:</span>
                  <div className="font-bold text-gray-900 dark:text-white">{sourceBranch?.name}</div>
                </div>
                <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                <div className="text-right">
                  <span className="text-[11px] text-gray-400">Destination:</span>
                  <div className="font-bold text-gray-900 dark:text-white">{destBranch?.name}</div>
                </div>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 pr-1">
                {stagedItems.map((item) => (
                  <div key={item.productId} className="pt-1.5 pb-1 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{item.product.name}</div>
                      <div className="text-[10px] text-gray-400">SKU: {item.product.sku || '-'}</div>
                    </div>
                    <div className="font-bold text-teal-600 dark:text-teal-400">
                      {item.quantity} {item.product.unit || 'pcs'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-teal-50 dark:bg-teal-950/30 rounded-xl border border-teal-200 dark:border-teal-900/50 flex items-center justify-between font-bold text-teal-900 dark:text-teal-200">
                <span>Total Items / Quantity:</span>
                <span>{stagedItems.length} Products · {totalUnits} Units</span>
              </div>

              {transferNotes && (
                <div className="text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">Notes:</span> {transferNotes}
                </div>
              )}

            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back to Edit
              </button>
              
              <button
                type="button"
                onClick={handleConfirmFinishTransfer}
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Finish Transfer</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
