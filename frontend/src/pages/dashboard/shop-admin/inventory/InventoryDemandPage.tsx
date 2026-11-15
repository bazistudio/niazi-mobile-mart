import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useInventoryFilters } from '@/features/inventory/components/InventoryFilterContext';
import { useDemandStore, DemandItem } from '@/features/inventory/store/demand.store';
import { supplierApi } from '@/services/supplier.api';
import { customerApi } from '@/services/customer.api';
import { purchaseApi } from '@/services/purchase.api';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePrintStore } from '@/lib/printer/print.store';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import {
  buildProductInventoryA4Html,
  buildProductInventoryPdfFilename,
} from '@/features/inventory/templates/productInventoryA4Template';
import { PdfImportPage } from '@/features/import/pages/PdfImportPage';
import { type SupplierDemand } from '@/lib/tauri/tauriClient';
import {
  Loader2,
  Printer,
  Download,
  Trash2,
  Truck,
  User,
  Upload,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Plus,
  ClipboardList,
  Send,
  Save,
  List,
  Eye,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function InventoryDemandPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const normalizedRole = (role || '').toUpperCase();
  const canViewCost = normalizedRole !== '' && normalizedRole !== 'PUBLIC_USER';

  const { filters } = useInventoryFilters();
  const {
    demandItems,
    selectedSupplierId,
    selectedCustomerId,
    demandNotes,
    updateDemandItemQty,
    updateDemandItemCost,
    removeDemandItem,
    clearDemandQueue,
    setSelectedSupplierId,
    setSelectedCustomerId,
    setDemandNotes,
  } = useDemandStore();

  const navigate = useNavigate();
  const [subMode, setSubMode] = useState<'demand_queue' | 'saved_demands' | 'bulk_import'>('demand_queue');
  const [isExporting, setIsExporting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingDemand, setIsSendingDemand] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Saved Demands Queue state
  const [savedDemandSearch, setSavedDemandSearch] = useState('');
  const [savedDemandStatusFilter, setSavedDemandStatusFilter] = useState<string>('');
  const [savedDemandSupplierFilter, setSavedDemandSupplierFilter] = useState<string>('');
  const [expandedDemandId, setExpandedDemandId] = useState<string | null>(null);

  // ── Partial Goods Receiving Modal state (GAP 01 + GAP 03) ────────────────
  const [receivingDemand, setReceivingDemand] = useState<SupplierDemand | null>(null);
  // Per-line receiving inputs: keyed by demand item id
  const [receivingLines, setReceivingLines] = useState<Record<string, { actualQty: number; actualCost: number }>>({});
  const [receivingPaymentMethod, setReceivingPaymentMethod] = useState<'CASH' | 'CREDIT'>('CASH');
  const [receivingPaidAmount, setReceivingPaidAmount] = useState<number>(0);
  const [receivingNotes, setReceivingNotes] = useState<string>('');
  const [receivingIdempotencyKey, setReceivingIdempotencyKey] = useState<string | null>(null);
  const [isSubmittingReceiving, setIsSubmittingReceiving] = useState(false);
  const [receivingConfirmStep, setReceivingConfirmStep] = useState(false);

  const activeShop = useOrganizationStore((s) => s.activeShop);
  const currentUser = useAuthStore((s) => s.user);

  // Load Suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-demand-list'],
    queryFn: () => supplierApi.getSuppliers(1, 200),
    enabled: isOrgAdmin,
  });
  const suppliers = suppliersData?.data || [];

  // Load Customers
  const { data: customersData } = useQuery({
    queryKey: ['customers-demand-list'],
    queryFn: () => customerApi.getCustomers(1, 200),
    enabled: isOrgAdmin,
  });
  const customers = customersData?.data || [];

  // Load Saved Demands from PostgreSQL (persistent queue)
  const { data: savedDemandsData, isFetching: isFetchingDemands, refetch: refetchDemands } = useQuery({
    queryKey: ['saved-demands', savedDemandSupplierFilter, savedDemandStatusFilter],
    queryFn: () => purchaseApi.listDemands({
      supplier_id: savedDemandSupplierFilter || null,
      status: savedDemandStatusFilter || null,
      limit: 100,
      offset: 0,
    }),
    enabled: isOrgAdmin,
    staleTime: 30_000,
  });
  const savedDemands: SupplierDemand[] = savedDemandsData || [];

  // Filter saved demands by local search term
  const filteredSavedDemands = useMemo(() => {
    if (!savedDemandSearch.trim()) return savedDemands;
    const q = savedDemandSearch.toLowerCase();
    return savedDemands.filter((d) =>
      d.demand_number?.toLowerCase().includes(q) ||
      d.supplier_name?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q)
    );
  }, [savedDemands, savedDemandSearch]);

  // Status badge helper
  const demandStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      DRAFT:              { label: 'Draft',              cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
      ORDERED:            { label: 'Ordered',            cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
      PARTIALLY_RECEIVED: { label: 'Partial',            cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
      RECEIVED:           { label: 'Received',           cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
      CANCELLED:          { label: 'Cancelled',          cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    };
    const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.cls}`}>{cfg.label}</span>;
  };

  // Auto-select supplier from URL query param (e.g. ?supplierId=UUID from SupplierProfile)
  useEffect(() => {
    const urlSupplierId = searchParams.get('supplierId');
    if (urlSupplierId && suppliers.length > 0) {
      const found = suppliers.find((s: any) => s.id === urlSupplierId || s._id === urlSupplierId);
      if (found) {
        setSelectedSupplierId(urlSupplierId);
      }
    }
  }, [searchParams, suppliers, setSelectedSupplierId]);

  // Filter demand items by the active top specification filter bar
  const filteredDemandItems = useMemo(() => {
    return demandItems.filter(({ product }) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchName = product.name?.toLowerCase().includes(q);
        const matchSku = product.sku?.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }
      if (filters.categoryId && product.categoryId !== filters.categoryId && product.category !== filters.categoryId) {
        return false;
      }
      if (filters.brandId && product.brandId !== filters.brandId && product.brand !== filters.brandId) {
        return false;
      }
      if (filters.companyId && product.companyId !== filters.companyId && product.company !== filters.companyId) {
        return false;
      }
      if (filters.colorId && product.colorId !== filters.colorId && product.color !== filters.colorId) {
        return false;
      }
      if (filters.qualityId && product.qualityId !== filters.qualityId && product.quality !== filters.qualityId) {
        return false;
      }
      return true;
    });
  }, [demandItems, filters]);

  const totalOrderUnits = useMemo(
    () => filteredDemandItems.reduce((sum, i) => sum + i.demandQty, 0),
    [filteredDemandItems]
  );

  const totalEstimatedCost = useMemo(
    () => filteredDemandItems.reduce((sum, i) => sum + i.demandQty * i.unitCost, 0),
    [filteredDemandItems]
  );

  const selectedSupplier = suppliers.find((s: any) => s.id === selectedSupplierId);
  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId);

  // Build synthetic InventoryProduct rows representing the demand quantities for A4 Print / PDF export
  const buildReportProducts = useCallback(() => {
    return filteredDemandItems.map((item) => ({
      ...item.product,
      stock: item.demandQty,
      purchasePrice: item.unitCost,
    }));
  }, [filteredDemandItems]);

  const handlePrintA4 = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const reportItems = buildReportProducts();
      const supplierTag = selectedSupplier ? ` | Supplier: ${selectedSupplier.name}` : '';
      const customerTag = selectedCustomer ? ` | Customer: ${selectedCustomer.name}` : '';
      const branchName = activeShop?.branch_name || (activeShop?.code ? `Branch ${activeShop.code}` : undefined);

      const html = buildProductInventoryA4Html(reportItems, {
        shopName: `${activeShop?.name || 'Niazi Mobile Mart'} — Supplier Demand Order${supplierTag}${customerTag}`,
        branchName,
        searchKeyword: filters.search || undefined,
        generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
        canViewCost,
      });

      usePrintStore.getState().openPreview({
        html,
        documentType: 'PurchaseInvoice',
        referenceId: `demand_${Date.now()}`,
        title: `Supplier Demand Order (${reportItems.length} Products)`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate Demand A4 print preview';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, buildReportProducts, selectedSupplier, selectedCustomer, activeShop, filters.search, currentUser, canViewCost]);

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const reportItems = buildReportProducts();
      const supplierTag = selectedSupplier ? ` | Supplier: ${selectedSupplier.name}` : '';
      const customerTag = selectedCustomer ? ` | Customer: ${selectedCustomer.name}` : '';
      const branchName = activeShop?.branch_name || (activeShop?.code ? `Branch ${activeShop.code}` : undefined);

      const html = buildProductInventoryA4Html(reportItems, {
        shopName: `${activeShop?.name || 'Niazi Mobile Mart'} — Supplier Demand Order${supplierTag}${customerTag}`,
        branchName,
        searchKeyword: filters.search || undefined,
        generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
        canViewCost,
      });

      const filename = buildProductInventoryPdfFilename('supplier_demand_order');
      await downloadHtmlAsPdf(html, filename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export Demand A4 PDF';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, buildReportProducts, selectedSupplier, selectedCustomer, activeShop, filters.search, currentUser, canViewCost]);

  // ── Save Draft — persist current demand queue as DRAFT in PostgreSQL ────────
  const handleSaveDraft = useCallback(async () => {
    if (demandItems.length === 0) {
      toast.error('No products in the Demand queue to save.');
      return;
    }
    setIsSavingDraft(true);
    try {
      const store = useOrganizationStore.getState();
      const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
      if (!branchId) throw new Error('No active branch selected.');

      const result = await purchaseApi.saveDemand({
        supplier_id: selectedSupplierId || null,
        customer_id: selectedCustomerId || null,
        branch_id: branchId,
        notes: demandNotes || null,
        items: demandItems.map((item) => ({
          product_id: item.product.id,
          requested_quantity: item.demandQty,
          estimated_unit_cost: Math.round(item.unitCost),
        })),
      });

      await queryClient.invalidateQueries({ queryKey: ['saved-demands'] });
      toast.success(`Draft saved — ${result.demand.demand_number} (${result.items.length} items). Reload anytime from Saved Demand Orders tab.`);
      // Switch to saved demands to show the new entry
      setSubMode('saved_demands');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save demand draft.');
    } finally {
      setIsSavingDraft(false);
    }
  }, [demandItems, selectedSupplierId, selectedCustomerId, demandNotes, queryClient]);

  // ── Save & Send — persist as ORDERED and generate print document ─────────────
  const handleSaveSendDemand = useCallback(async () => {
    if (demandItems.length === 0) {
      toast.error('No products in the Demand queue to send.');
      return;
    }
    if (!selectedSupplierId) {
      toast.error('Please select a Supplier before sending the demand order.');
      return;
    }
    setIsSendingDemand(true);
    try {
      const store = useOrganizationStore.getState();
      const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
      if (!branchId) throw new Error('No active branch selected.');

      // 1. Save the demand
      const result = await purchaseApi.saveDemand({
        supplier_id: selectedSupplierId,
        customer_id: selectedCustomerId || null,
        branch_id: branchId,
        notes: demandNotes || null,
        items: demandItems.map((item) => ({
          product_id: item.product.id,
          requested_quantity: item.demandQty,
          estimated_unit_cost: Math.round(item.unitCost),
        })),
      });

      // 2. Update status to ORDERED
      await purchaseApi.updateDemandStatus(result.demand.id, 'ORDERED');
      await queryClient.invalidateQueries({ queryKey: ['saved-demands'] });

      // 3. Generate print document
      const supplierLabel = selectedSupplier ? selectedSupplier.name : 'Supplier';
      const customerLabel = selectedCustomer ? ` | Customer: ${selectedCustomer.name}` : '';
      const branchName = store.activeShop?.branch_name || (store.activeShop?.code ? `Branch ${store.activeShop.code}` : undefined);
      const reportItems = filteredDemandItems.map((item) => ({
        ...item.product,
        stock: item.demandQty,
        purchasePrice: item.unitCost,
      }));
      const html = buildProductInventoryA4Html(reportItems, {
        shopName: `${store.activeShop?.name || 'Niazi Mobile Mart'} — Demand Order ${result.demand.demand_number} | ${supplierLabel}${customerLabel}`,
        branchName,
        generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
        canViewCost,
      });
      usePrintStore.getState().openPreview({
        html,
        documentType: 'PurchaseInvoice',
        referenceId: result.demand.id,
        title: `Demand Order ${result.demand.demand_number} — ${supplierLabel}`,
      });

      toast.success(`Demand ${result.demand.demand_number} sent to ${supplierLabel}. Print/PDF ready.`);
      setSubMode('saved_demands');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save and send demand order.');
    } finally {
      setIsSendingDemand(false);
    }
  }, [demandItems, selectedSupplierId, selectedCustomerId, demandNotes, selectedSupplier, selectedCustomer,
      filteredDemandItems, currentUser, canViewCost, queryClient]);

  // ── Cancel a saved demand (DRAFT or ORDERED only) ─────────────────────────
  const handleCancelSavedDemand = useCallback(async (demandId: string, demandNumber: string) => {
    if (!window.confirm(`Cancel demand order ${demandNumber}? This cannot be undone.`)) return;
    try {
      await purchaseApi.updateDemandStatus(demandId, 'CANCELLED');
      await queryClient.invalidateQueries({ queryKey: ['saved-demands'] });
      toast.success(`Demand ${demandNumber} cancelled.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel demand.');
    }
  }, [queryClient]);

  // ── Print a saved demand ───────────────────────────────────────────────────
  const handlePrintSavedDemand = useCallback(async (demand: SupplierDemand) => {
    if (!demand.items || demand.items.length === 0) {
      toast.error('No items to print for this demand.');
      return;
    }
    const store = useOrganizationStore.getState();
    const branchName = store.activeShop?.branch_name || (store.activeShop?.code ? `Branch ${store.activeShop.code}` : undefined);
    const reportItems = demand.items.map((item) => ({
      id: item.product_id,
      name: item.product_name || item.product_id,
      sku: item.sku || '',
      stock: item.requested_quantity,
      purchasePrice: item.estimated_unit_cost,
    }));
    const html = buildProductInventoryA4Html(reportItems as any, {
      shopName: `${store.activeShop?.name || 'Niazi Mobile Mart'} — Demand Order ${demand.demand_number}${demand.supplier_name ? ' | ' + demand.supplier_name : ''}`,
      branchName,
      generatedBy: currentUser?.name || currentUser?.username || 'Authorized Admin',
      canViewCost,
    });
    usePrintStore.getState().openPreview({
      html,
      documentType: 'PurchaseInvoice',
      referenceId: demand.id,
      title: `Demand Order ${demand.demand_number}`,
    });
  }, [currentUser, canViewCost]);

  // ── Open Partial Goods Receiving Modal (GAP 01 + GAP 03) ──────────────────
  const handleOpenReceivingModal = useCallback((demand: SupplierDemand) => {
    if (!demand.items || demand.items.length === 0) {
      toast.error('This demand has no items to receive.');
      return;
    }
    // Pre-populate actual qty with remaining (requested - received), actual cost with estimated
    const lines: Record<string, { actualQty: number; actualCost: number }> = {};
    for (const item of demand.items) {
      const remaining = item.requested_quantity - item.received_quantity;
      if (remaining > 0) {
        lines[item.id] = {
          actualQty: remaining,
          actualCost: item.actual_unit_cost ?? item.estimated_unit_cost ?? 0,
        };
      } else {
        // Already fully received — still show with 0 so user can see it
        lines[item.id] = { actualQty: 0, actualCost: item.actual_unit_cost ?? item.estimated_unit_cost ?? 0 };
      }
    }
    // Compute initial paid amount as the sum of all lines with actualQty > 0
    const initialTotal = demand.items.reduce((sum, item) => {
      const l = lines[item.id];
      return sum + (l ? l.actualQty * l.actualCost : 0);
    }, 0);
    setReceivingDemand(demand);
    setReceivingLines(lines);
    setReceivingPaymentMethod('CASH');
    setReceivingPaidAmount(Math.round(initialTotal));
    setReceivingNotes('');
    setReceivingConfirmStep(false);
    // Generate a fresh idempotency key for this attempt — it stays stable across
    // confirm/submit within the same modal open, re-generated only on re-open
    setReceivingIdempotencyKey(crypto.randomUUID());
  }, []);

  const handleCloseReceivingModal = useCallback(() => {
    setReceivingDemand(null);
    setReceivingLines({});
    setReceivingConfirmStep(false);
    setReceivingIdempotencyKey(null);
  }, []);

  // Recompute receiving total from current line inputs
  const receivingTotal = useMemo(() => {
    if (!receivingDemand?.items) return 0;
    return receivingDemand.items.reduce((sum, item) => {
      const l = receivingLines[item.id];
      return sum + (l ? Math.round(l.actualQty) * Math.round(l.actualCost) : 0);
    }, 0);
  }, [receivingDemand, receivingLines]);

  const handleUpdateReceivingLine = useCallback(
    (itemId: string, field: 'actualQty' | 'actualCost', value: number) => {
      setReceivingLines((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], [field]: value },
      }));
    },
    []
  );

  // ── Submit Goods Receipt ──────────────────────────────────────────────────
  const handleSubmitReceiving = useCallback(async () => {
    if (!receivingDemand) return;
    if (isSubmittingReceiving) return;

    const store = useOrganizationStore.getState();
    const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
    if (!branchId) {
      toast.error('No active branch selected.');
      return;
    }
    if (!receivingDemand.supplier_id) {
      toast.error('This demand has no supplier — cannot post to inventory without a supplier.');
      return;
    }

    // Build lines: only items where actualQty > 0
    const linesToSubmit = (receivingDemand.items || []).filter((item) => {
      const l = receivingLines[item.id];
      return l && Math.round(l.actualQty) > 0;
    });

    if (linesToSubmit.length === 0) {
      toast.error('Enter at least one line with quantity > 0 to receive.');
      return;
    }

    // Validate: actualQty cannot exceed remaining
    for (const item of linesToSubmit) {
      const l = receivingLines[item.id]!;
      const remaining = item.requested_quantity - item.received_quantity;
      if (Math.round(l.actualQty) > remaining) {
        toast.error(
          `«${item.product_name || item.product_id}»: actual qty (${l.actualQty}) exceeds remaining (${remaining}).`
        );
        return;
      }
      if (Math.round(l.actualCost) < 0) {
        toast.error(`«${item.product_name || item.product_id}»: unit cost cannot be negative.`);
        return;
      }
    }

    if (!receivingConfirmStep) {
      setReceivingConfirmStep(true);
      return;
    }

    // Compute paid amount: cap to total if CASH, 0 if CREDIT
    const totalAmount = linesToSubmit.reduce(
      (s, item) => s + Math.round(receivingLines[item.id]!.actualQty) * Math.round(receivingLines[item.id]!.actualCost),
      0
    );
    const paidAmount =
      receivingPaymentMethod === 'CREDIT'
        ? 0
        : Math.min(Math.max(0, Math.round(receivingPaidAmount)), totalAmount);

    setIsSubmittingReceiving(true);
    try {
      await purchaseApi.completePurchase({
        supplier_id: receivingDemand.supplier_id,
        branch_id: branchId,
        demand_id: receivingDemand.id,
        notes: receivingNotes.trim() || `Goods receipt for demand ${receivingDemand.demand_number}`,
        paid_amount: paidAmount,
        payment_method: receivingPaymentMethod === 'CREDIT' ? 'OTHER' : 'CASH',
        idempotency_key: receivingIdempotencyKey,
        items: linesToSubmit.map((item) => ({
          product_id: item.product_id,
          quantity: Math.round(receivingLines[item.id]!.actualQty),
          unit_cost: Math.round(receivingLines[item.id]!.actualCost),
        })),
      });

      await queryClient.invalidateQueries({ queryKey: ['saved-demands'] });
      await queryClient.invalidateQueries({ queryKey: ['supplier-demands'] });

      const totalQty = linesToSubmit.reduce((s, i) => s + Math.round(receivingLines[i.id]!.actualQty), 0);
      toast.success(
        `Goods received: ${linesToSubmit.length} product(s), ${totalQty} units for demand ${receivingDemand.demand_number}.`
      );
      handleCloseReceivingModal();
    } catch (err: any) {
      // On error keep modal open — idempotency key stays the same so retry is safe
      setReceivingConfirmStep(false);
      toast.error(err?.message || 'Failed to record goods receipt. You can retry safely.');
    } finally {
      setIsSubmittingReceiving(false);
    }
  }, [
    receivingDemand, receivingLines, receivingPaymentMethod, receivingPaidAmount,
    receivingNotes, receivingIdempotencyKey, receivingConfirmStep,
    isSubmittingReceiving, handleCloseReceivingModal, queryClient,
  ]);

  // Direct Inventory Intake with Supplier Tag — ONE atomic purchase transaction
  const handleDirectReceiveToInventory = async () => {
    if (demandItems.length === 0) {
      toast.error('No products in the Demand list to receive.');
      return;
    }
    if (!selectedSupplierId) {
      toast.error('Please select a Supplier before receiving demand items into inventory.');
      return;
    }

    setIsReceiving(true);
    try {
      const store = useOrganizationStore.getState();
      const branchId = store.activeShop?._id || store.activeShop?.id || store.activeShopId;
      if (!branchId) {
        throw new Error('No active branch selected. Please select a shop before receiving inventory.');
      }

      const supplierLabel = selectedSupplier ? selectedSupplier.name : selectedSupplierId;
      const customerLabel = selectedCustomer ? ` (Customer Demand: ${selectedCustomer.name})` : '';

      // Build one atomic purchase — all items in a single transaction
      const result = await purchaseApi.completePurchase({
        supplier_id: selectedSupplierId,
        branch_id: branchId,
        items: demandItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.demandQty,
          unit_cost: Math.round(item.unitCost),
        })),
        paid_amount: 0,          // On-credit by default; payment captured separately
        payment_method: null,
        notes: demandNotes
          ? `Demand Order Intake — Supplier: ${supplierLabel}${customerLabel} — ${demandNotes}`
          : `Demand Order Intake — Supplier: ${supplierLabel}${customerLabel}`,
      });

      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      await queryClient.invalidateQueries({ queryKey: ['suppliers-demand-list'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      toast.success(
        `Purchase ${result.purchase.purchase_number} created — ${demandItems.length} product(s) received under supplier "${supplierLabel}". Outstanding: Rs. ${result.credit_amount.toLocaleString()}`,
      );
      clearDemandQueue();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to receive demand items into inventory.');
    } finally {
      setIsReceiving(false);
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-white dark:bg-gray-900 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Admin Access Only</h3>
        <p className="text-xs text-gray-500 max-w-sm mt-1">
          Product Demand orders, Supplier intake, and Bulk Import are restricted to Organization Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      {/* Top Action & Sub-Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Demand & Procurement ({filteredDemandItems.length} Items)
          </span>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
            <button
              type="button"
              onClick={() => setSubMode('demand_queue')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                subMode === 'demand_queue'
                  ? 'bg-[#006970] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>New Demand</span>
            </button>
            <button
              type="button"
              onClick={() => setSubMode('saved_demands')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                subMode === 'saved_demands'
                  ? 'bg-[#006970] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Saved Orders {savedDemands.length > 0 ? `(${savedDemands.length})` : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubMode('bulk_import')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                subMode === 'bulk_import'
                  ? 'bg-[#006970] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Invoice Import</span>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Save Draft — only visible on New Demand tab */}
          {subMode === 'demand_queue' && (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSavingDraft || demandItems.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                title="Save demand as draft (survives restart)"
              >
                {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-blue-500" />}
                <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveSendDemand}
                disabled={isSendingDemand || demandItems.length === 0 || !selectedSupplierId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
                title={!selectedSupplierId ? 'Select a supplier first' : 'Save demand, mark as Ordered, and open print/PDF'}
              >
                {isSendingDemand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isSendingDemand ? 'Sending...' : 'Save & Send'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handlePrintA4}
            disabled={isExporting || filteredDemandItems.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            title="Print A4 Demand Order"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />}
            <span>Print A4</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting || filteredDemandItems.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            title="Download A4 PDF Demand Order"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Export Error Banner */}
      {exportError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center justify-between" role="alert">
          <span>{exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="underline hover:no-underline cursor-pointer ml-3 font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {subMode === 'bulk_import' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <PdfImportPage />
        </div>
      ) : subMode === 'saved_demands' ? (
        /* ── SAVED DEMAND ORDERS QUEUE ─────────────────────────────── */
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search demand # or supplier..."
                value={savedDemandSearch}
                onChange={(e) => setSavedDemandSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              />
            </div>
            <select
              value={savedDemandStatusFilter}
              onChange={(e) => setSavedDemandStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ORDERED">Ordered</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="RECEIVED">Received</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={savedDemandSupplierFilter}
              onChange={(e) => setSavedDemandSupplierFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refetchDemands()}
              disabled={isFetchingDemands}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-50 transition-colors cursor-pointer"
              title="Refresh demand list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingDemands ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Demand List */}
          <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
            {isFetchingDemands && filteredSavedDemands.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading demand orders...</span>
              </div>
            ) : filteredSavedDemands.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <ClipboardList className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-700" />
                <p className="text-sm font-semibold">No demand orders found.</p>
                <p className="text-xs text-gray-400 mt-1">Create a demand from the New Demand tab and click Save Draft or Save &amp; Send.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[11px] font-extrabold text-gray-600 dark:text-gray-300 uppercase">
                  <tr>
                    <th className="px-3 py-2.5 w-6"></th>
                    <th className="px-3 py-2.5">Demand #</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">Branch</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Est. Amount</th>
                    <th className="px-3 py-2.5 text-right">Items</th>
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredSavedDemands.map((demand) => {
                    const isExpanded = expandedDemandId === demand.id;
                    const canCancel = demand.status === 'DRAFT' || demand.status === 'ORDERED';
                    const canReceive = demand.status === 'ORDERED' || demand.status === 'PARTIALLY_RECEIVED';
                    const itemCount = demand.items?.length ?? 0;
                    const receivedCount = demand.items?.reduce((s, i) => s + (i.received_quantity > 0 ? 1 : 0), 0) ?? 0;

                    return (
                      <React.Fragment key={demand.id}>
                        <tr
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                            isExpanded ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                          }`}
                          onClick={() => setExpandedDemandId(isExpanded ? null : demand.id)}
                        >
                          <td className="px-3 py-2.5 text-gray-400">
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </td>
                          {/* GAP 03: canReceive flag */}
                          <td className="px-3 py-2.5 font-bold text-[#006970] dark:text-[#00B4BB]">{demand.demand_number}</td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                            {new Date(demand.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">
                            {demand.supplier_name || <span className="text-gray-400 italic">No supplier</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{demand.branch_id.slice(0, 8)}…</td>
                          <td className="px-3 py-2.5">{demandStatusBadge(demand.status)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                            Rs. {Number(demand.total_estimated_amount).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                            {itemCount > 0 ? `${receivedCount}/${itemCount}` : '—'}
                          </td>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              {canReceive && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReceivingModal(demand)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                                  title="Receive goods for this demand"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Receive
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrintSavedDemand(demand)}
                                disabled={!demand.items || demand.items.length === 0}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-[#006970] disabled:opacity-40 cursor-pointer"
                                title="Print demand document"
                              >
                                <Printer className="w-3 h-3" />
                                Print
                              </button>
                              {canCancel && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelSavedDemand(demand.id, demand.demand_number)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 cursor-pointer"
                                  title="Cancel this demand"
                                >
                                  <XCircle className="w-3 h-3" />
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded line items */}
                        {isExpanded && demand.items && demand.items.length > 0 && (
                          <tr className="bg-blue-50/20 dark:bg-blue-900/5">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="border border-blue-200/60 dark:border-blue-800/40 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left">Product</th>
                                      <th className="px-3 py-1.5 text-right">Requested</th>
                                      <th className="px-3 py-1.5 text-right">Received</th>
                                      <th className="px-3 py-1.5 text-right">Remaining</th>
                                      <th className="px-3 py-1.5 text-right">Est. Unit Cost</th>
                                      <th className="px-3 py-1.5 text-right">Est. Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-blue-100/60 dark:divide-blue-900/20">
                                    {demand.items.map((item) => {
                                      const remaining = item.requested_quantity - item.received_quantity;
                                      return (
                                        <tr key={item.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10">
                                          <td className="px-3 py-1.5">
                                            <div className="font-semibold text-gray-900 dark:text-white">{item.product_name || item.product_id}</div>
                                            {item.sku && <div className="text-gray-500">{item.sku}</div>}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-semibold">{item.requested_quantity}</td>
                                          <td className="px-3 py-1.5 text-right">
                                            <span className={item.received_quantity > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>
                                              {item.received_quantity}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-right">
                                            <span className={remaining > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}>
                                              {remaining}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-right">Rs. {Number(item.estimated_unit_cost).toLocaleString()}</td>
                                          <td className="px-3 py-1.5 text-right font-bold text-[#006970] dark:text-[#00B4BB]">
                                            Rs. {Number(item.estimated_line_total).toLocaleString()}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {demand.notes && (
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  <span className="font-bold">Notes:</span> {demand.notes}
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
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {/* Supplier & Customer Assignment Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl">
            {/* Supplier Select */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-[#006970]" />
                <span>Select Supplier *</span>
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Select (Optional) */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[#006970]" />
                <span>Link Customer (Opt)</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              >
                <option value="">-- General Shop Stock --</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Demand Notes / Reference */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[#006970]" />
                <span>Order Reference / Notes</span>
              </label>
              <input
                type="text"
                value={demandNotes}
                onChange={(e) => setDemandNotes(e.target.value)}
                placeholder="e.g. Weekly LCD Restock / Urgent Demand"
                className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#006970]"
              />
            </div>

            {/* Summary & Receive Button */}
            <div className="flex flex-col justify-end">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Est. Demand Total</div>
                  <div className="text-sm font-black text-[#006970] dark:text-[#00B4BB]">
                    Rs. {totalEstimatedCost.toLocaleString()} ({totalOrderUnits} pcs)
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isReceiving || demandItems.length === 0}
                  onClick={handleDirectReceiveToInventory}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-[#006970] hover:bg-[#005a60] disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Directly add these demand items into Inventory with Supplier Tag"
                >
                  {isReceiving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Add to Inventory</span>
                </button>
              </div>
            </div>
          </div>

          {/* Demand Items Table */}
          <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
            <table className="w-full border-collapse text-sm text-left whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-extrabold text-gray-600 dark:text-gray-300 uppercase">
                <tr>
                  <th className="px-3 py-2.5">Product Name</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Brand</th>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Color</th>
                  <th className="px-3 py-2.5">Quality</th>
                  <th className="px-3 py-2.5">Current Stock</th>
                  <th className="px-3 py-2.5">Demand Qty</th>
                  <th className="px-3 py-2.5">Supplier Unit Cost</th>
                  <th className="px-3 py-2.5">Subtotal</th>
                  <th className="px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredDemandItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="font-semibold text-sm">No products in the Demand Queue.</span>
                        <span className="text-xs text-gray-400">
                          Go to the <strong>Low Stock</strong> tab, mark 0-stock items, and click <strong>Move to Demand</strong>.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDemandItems.map(({ product, demandQty, unitCost }: DemandItem) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2">
                        <div className="font-bold text-gray-900 dark:text-white">{product.name}</div>
                        {product.sku && <div className="text-xs text-gray-500">{product.sku}</div>}
                      </td>
                      <td className="px-3 py-2">{product.category || '-'}</td>
                      <td className="px-3 py-2">{product.brand || '-'}</td>
                      <td className="px-3 py-2">{product.company || '-'}</td>
                      <td className="px-3 py-2">{product.color || '-'}</td>
                      <td className="px-3 py-2">{product.quality || '-'}</td>
                      <td className="px-3 py-2">
                        <span className="font-bold text-red-600 dark:text-red-400">{product.stock ?? 0}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={demandQty}
                          onChange={(e) => updateDemandItemQty(product.id, parseInt(e.target.value, 10) || 1)}
                          className="w-20 px-2 py-1 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          value={unitCost}
                          onChange={(e) => updateDemandItemCost(product.id, parseInt(e.target.value, 10) || 0)}
                          className="w-28 px-2 py-1 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2 font-bold text-[#006970] dark:text-[#00B4BB]">
                        Rs. {(demandQty * unitCost).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeDemandItem(product.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                          title="Remove from Demand"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── GAP 01: Partial Goods Receiving Modal ─────────────────────────────────────── */}
      {receivingDemand && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseReceivingModal(); }}
        >
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-sm font-black text-gray-900 dark:text-white">
                  Receive Goods — {receivingDemand.demand_number}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Supplier: <span className="font-semibold text-gray-800 dark:text-gray-200">{receivingDemand.supplier_name || receivingDemand.supplier_id}</span>
                  {' · '}
                  <span className="font-semibold">{receivingDemand.status}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseReceivingModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800 text-[10px] font-extrabold uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left rounded-tl-lg">Product</th>
                    <th className="px-3 py-2 text-right">Requested</th>
                    <th className="px-3 py-2 text-right">Already Received</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Actual Qty *</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Actual Unit Cost *</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {receivingDemand.items?.map((item) => {
                    const remaining = item.requested_quantity - item.received_quantity;
                    const line = receivingLines[item.id] ?? { actualQty: 0, actualCost: 0 };
                    const isFullyReceived = remaining <= 0;
                    return (
                      <tr key={item.id} className={isFullyReceived ? 'opacity-50' : ''}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-gray-900 dark:text-white">{item.product_name || item.product_id}</div>
                          {item.sku && <div className="text-gray-400 text-[10px]">{item.sku}</div>}
                          {isFullyReceived && (
                            <div className="text-emerald-600 text-[10px] font-bold">✓ Fully received</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{item.requested_quantity}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={item.received_quantity > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>
                            {item.received_quantity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={remaining > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}>
                            {remaining}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            disabled={isFullyReceived}
                            value={line.actualQty}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(remaining, parseInt(e.target.value, 10) || 0));
                              handleUpdateReceivingLine(item.id, 'actualQty', v);
                              // Keep paid amount in sync when CASH
                              if (receivingPaymentMethod === 'CASH') {
                                const newTotal = (receivingDemand.items || []).reduce((s, it) => {
                                  const l = it.id === item.id
                                    ? { actualQty: v, actualCost: receivingLines[it.id]?.actualCost ?? 0 }
                                    : receivingLines[it.id] ?? { actualQty: 0, actualCost: 0 };
                                  return s + Math.round(l.actualQty) * Math.round(l.actualCost);
                                }, 0);
                                setReceivingPaidAmount(newTotal);
                              }
                            }}
                            className="w-20 px-2 py-1 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right focus:ring-1 focus:ring-[#006970] disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-gray-400">Rs.</span>
                            <input
                              type="number"
                              min={0}
                              disabled={isFullyReceived}
                              value={line.actualCost}
                              onChange={(e) => {
                                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                handleUpdateReceivingLine(item.id, 'actualCost', v);
                                if (receivingPaymentMethod === 'CASH') {
                                  const newTotal = (receivingDemand.items || []).reduce((s, it) => {
                                    const l = it.id === item.id
                                      ? { actualQty: receivingLines[it.id]?.actualQty ?? 0, actualCost: v }
                                      : receivingLines[it.id] ?? { actualQty: 0, actualCost: 0 };
                                    return s + Math.round(l.actualQty) * Math.round(l.actualCost);
                                  }, 0);
                                  setReceivingPaidAmount(newTotal);
                                }
                              }}
                              className="w-28 px-2 py-1 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-right focus:ring-1 focus:ring-[#006970] disabled:opacity-40"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: Payment + Totals + Submit */}
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 rounded-b-2xl">
              {/* Payment row */}
              <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Payment</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setReceivingPaymentMethod('CASH'); setReceivingPaidAmount(receivingTotal); }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        receivingPaymentMethod === 'CASH'
                          ? 'bg-[#006970] text-white border-[#006970]'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
                      } cursor-pointer`}
                    >
                      Cash (Full)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReceivingPaymentMethod('CREDIT'); setReceivingPaidAmount(0); }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        receivingPaymentMethod === 'CREDIT'
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
                      } cursor-pointer`}
                    >
                      Credit
                    </button>
                  </div>
                </div>

                {receivingPaymentMethod === 'CASH' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Amount Paid (Rs.)</label>
                    <input
                      type="number"
                      min={0}
                      max={receivingTotal}
                      value={receivingPaidAmount}
                      onChange={(e) => setReceivingPaidAmount(Math.max(0, Math.min(receivingTotal, parseInt(e.target.value, 10) || 0)))}
                      className="w-32 px-2 py-1.5 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#006970]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={receivingNotes}
                    onChange={(e) => setReceivingNotes(e.target.value)}
                    placeholder="Invoice ref, delivery note..."
                    className="w-52 px-2 py-1.5 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#006970]"
                  />
                </div>

                <div className="ml-auto text-right">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Receipt Total</div>
                  <div className="text-lg font-black text-[#006970] dark:text-[#00B4BB]">Rs. {receivingTotal.toLocaleString()}</div>
                  {receivingPaymentMethod === 'CASH' && receivingTotal - receivingPaidAmount > 0 && (
                    <div className="text-xs text-amber-600 font-bold">
                      Credit: Rs. {(receivingTotal - receivingPaidAmount).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Confirm step warning */}
              {receivingConfirmStep && (
                <div className="mb-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 font-semibold">
                  ⚠️ Confirm: This will post a purchase invoice and update inventory & supplier ledger. Are you sure?
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseReceivingModal}
                  disabled={isSubmittingReceiving}
                  className="px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitReceiving()}
                  disabled={isSubmittingReceiving}
                  className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-lg shadow-xs disabled:opacity-50 cursor-pointer transition-colors ${
                    receivingConfirmStep
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-[#006970] hover:bg-[#005a60]'
                  }`}
                >
                  {isSubmittingReceiving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {receivingConfirmStep ? '✔ Confirm & Post Receipt' : 'Review & Receive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryDemandPage;
