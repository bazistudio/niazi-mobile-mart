'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { repairApi } from '../../services/repair.api';
import { productService } from '@/features/inventory/services/product.service';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { UnifiedInvoice, PrinterSettings, ShopHeader } from '@/features/settings/printer/types/printer.types';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { useStaff } from '@/features/settings/hooks/useStaff';
import { toast } from 'react-hot-toast';
import {
  X,
  Wrench,
  User,
  Smartphone,
  AlignLeft,
  Search,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  UserCheck
} from 'lucide-react';

interface RepairFormDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  editingJob?: any;
  onClearEditing?: () => void;
  onJobCreatedForSettlement?: (job: any) => void;
}

interface PartItem {
  id: string;
  productId?: string;
  name: string;
  qty: number;
  cost: number;
  price: number;
  sourceType: 'OWN_STOCK' | 'MARKET_PURCHASE';
}

const QUICK_CHIPS = [
  'Screen Cracked',
  'Glass Changing',
  'Board Repair',
  'Change IC',
  'Battery',
  'Water Damage',
  'Charging Port',
];

export const RepairFormDrawer: React.FC<RepairFormDrawerProps> = ({
  isOpen = true,
  onClose,
  embedded = false,
  editingJob = null,
  onClearEditing,
  onJobCreatedForSettlement,
}) => {
  const queryClient = useQueryClient();
  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const currentUser = useAuthStore((s) => s.user);
  const isMechanicUser = currentUser?.role === 'REPAIR_MECHANIC';
  const { data: staffList = [] } = useStaff();

  // Strict double-submit guard ref
  const isSubmittingRef = useRef<boolean>(false);

  // Strictly resolve the active branch territory:
  // Branch-bound roles (REPAIR_MECHANIC, CASHIER, SALESMAN, MANAGER, etc.) are locked to their assigned branch.
  // Org Admins use the currently active branch in the branch switcher (or fallback to Main Branch).
  const effectiveBranchId = useMemo(() => {
    const isOrgAdmin =
      currentUser?.role === 'ADMIN' ||
      currentUser?.role === 'OWNER' ||
      currentUser?.role === 'SUPER_ADMIN' ||
      currentUser?.role === 'MULTI_ADMIN';
    const userBranch = currentUser?.branch_id || currentUser?.branchId || currentUser?.shopId || null;
    if (!isOrgAdmin && userBranch) {
      return userBranch;
    }
    return activeShop?._id || activeShop?.id || activeShopId || userBranch || '00000000-0000-0000-0000-000000000002';
  }, [currentUser, activeShop, activeShopId]);

  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  // Format 11-digit phone number with hyphen: 03XX-XXXXXXX
  const formatMobileNumber = (val: string): string => {
    // Only accept digits, max 11 digits
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMobileNumber(formatMobileNumber(e.target.value));
  };

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');

  // Format IMEI strictly up to 15 digits only
  const formatImei = (val: string): string => {
    return val.replace(/\D/g, '').slice(0, 15);
  };

  const handleImei1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImei1(formatImei(e.target.value));
  };

  const handleImei2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImei2(formatImei(e.target.value));
  };

  const [passwordPattern, setPasswordPattern] = useState('');

  const [technicianId, setTechnicianId] = useState<string>(() =>
    currentUser?.role === 'REPAIR_MECHANIC' && currentUser?.id ? currentUser.id : ''
  );
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');

  const [productSearch, setProductSearch] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState<number>(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchListRef = useRef<HTMLDivElement>(null);
  const [partsList, setPartsList] = useState<PartItem[]>([]);

  const [problemDescription, setProblemDescription] = useState('');

  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [advanceMethod, setAdvanceMethod] = useState<'Cash' | 'EasyPaisa' | 'JazzCash' | 'Bank'>('Cash');

  const [createdRepairId, setCreatedRepairId] = useState<string | null>(null);

  useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  // Populate form when editingJob is selected
  useEffect(() => {
    if (editingJob) {
      setCustomerName((editingJob.customerId as any)?.name || editingJob.customer_name || '');
      setMobileNumber(formatMobileNumber((editingJob.customerId as any)?.phone || editingJob.customer_phone || ''));
      setBrand(editingJob.device?.brand || '');
      setModel(editingJob.device?.model || '');
      const rawImei = editingJob.device?.imei || '';
      const parts = rawImei.split(' / ');
      setImei1(formatImei(parts[0] || rawImei));
      setImei2(formatImei(parts[1] || ''));
      setPasswordPattern(editingJob.device?.password || '');
      setProblemDescription(editingJob.problemDescription || editingJob.problem_description || '');
      setEstimatedCost(Number(editingJob.grandTotal || editingJob.estimatedCost || editingJob.estimated_cost || 0));
      setTechnicianId(
        typeof editingJob.technicianId === 'string'
          ? editingJob.technicianId
          : (editingJob.technicianId as any)?._id || (editingJob.technicianId as any)?.id || ''
      );
      setPriority(editingJob.priority || 'Normal');
      if (Array.isArray(editingJob.partsUsed)) {
        setPartsList(
          editingJob.partsUsed.map((p: any) => ({
            id: p._id || p.id || Math.random().toString(),
            productId: p.productId?._id || p.productId || undefined,
            name: p.productName || p.productId?.name || 'Part',
            qty: Number(p.qty || 1),
            cost: Number(p.cost || 0),
            price: Number(p.price || 0),
          }))
        );
      }
    }
  }, [editingJob]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search products strictly scoped to the current branch territory (scope: 'branch')
  const { data: searchResults, isFetching: isSearchingProducts } = useQuery({
    queryKey: ['repairProductSearch', effectiveBranchId, productSearch.trim()],
    queryFn: () =>
      productService.getProducts({
        search: productSearch.trim(),
        limit: 15,
        page: 1,
        scope: 'branch',
      }),
    enabled: productSearch.trim().length >= 1,
  });

  // Filter & cap branch products client-side as well for instant accuracy
  const branchMatchedProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term || !searchResults?.products) return [];
    return searchResults.products
      .filter((p: any) => {
        const matchName = (p.name || '').toLowerCase().includes(term);
        const matchSku = (p.sku || '').toLowerCase().includes(term);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(term);
        const matchBrand = (p.brand || '').toLowerCase().includes(term) && p.brand !== '-';
        const matchCompany = (p.company || '').toLowerCase().includes(term) && p.company !== '-';
        const matchModels =
          Array.isArray(p.compatibleModels) &&
          p.compatibleModels.some((m: string) => m.toLowerCase().includes(term));
        return matchName || matchSku || matchBarcode || matchBrand || matchCompany || matchModels;
      })
      .slice(0, 15);
  }, [productSearch, searchResults]);

  const branchMechanics = useMemo(() => {
    return staffList.filter((s: any) => {
      const roleKey = `${s.roleId || ''} ${s.roleName || ''}`.toUpperCase();
      return roleKey.includes('MECHANIC') && (effectiveBranchId ? s.branchId === effectiveBranchId : true);
    });
  }, [staffList, effectiveBranchId]);

  // Auto-select the sole mechanic for this branch when booking a new job
  useEffect(() => {
    if (isMechanicUser || editingJob) return;
    if (branchMechanics.length === 1) {
      const solo = branchMechanics[0] as any;
      setTechnicianId(solo._id || solo.id || '');
    }
  }, [branchMechanics, isMechanicUser, editingJob]);

  // Reset highlighted index to 0 when search query or results change
  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [productSearch, branchMatchedProducts.length]);

  // Keep highlighted option scrolled into view during Up/Down arrow navigation
  useEffect(() => {
    if (isSearchDropdownOpen && searchListRef.current) {
      const activeEl = searchListRef.current.children[selectedSearchIndex] as HTMLElement | undefined;
      if (activeEl) {
        const container = searchListRef.current;
        if (activeEl.offsetTop < container.scrollTop) {
          container.scrollTop = activeEl.offsetTop;
        } else if (activeEl.offsetTop + activeEl.offsetHeight > container.scrollTop + container.offsetHeight) {
          container.scrollTop = activeEl.offsetTop + activeEl.offsetHeight - container.offsetHeight;
        }
      }
    }
  }, [selectedSearchIndex, isSearchDropdownOpen]);

  // Calculate totals
  const partsTotalCost = useMemo(() => {
    return partsList.reduce((acc, p) => acc + (p.cost * p.qty), 0);
  }, [partsList]);

  const partsTotalPrice = useMemo(() => {
    return partsList.reduce((acc, p) => acc + (p.price * p.qty), 0);
  }, [partsList]);

  const remainingBalance = useMemo(() => {
    const totalJobCost = estimatedCost > 0 ? estimatedCost : partsTotalPrice;
    return Math.max(0, totalJobCost - advancePaid);
  }, [estimatedCost, partsTotalPrice, advancePaid]);

  const handleChipClick = (chip: string) => {
    setProblemDescription((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.includes(chip)) return trimmed; // already present
      return `${trimmed}, ${chip}`;
    });
  };

  const handleAddProductPart = (prod: any) => {
    const unitCost = Number(prod.purchasePrice ?? prod.averageCost ?? prod.purchase_price ?? prod.cost_price ?? 0);
    const unitPrice = Number(prod.price ?? prod.sale_price ?? prod.selling_price ?? 0);
    const existing = partsList.find((p) => p.productId === prod.id);
    if (existing) {
      setPartsList(partsList.map((p) => (p.productId === prod.id ? { ...p, qty: p.qty + 1 } : p)));
    } else {
      setPartsList([
        ...partsList,
        {
          id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: prod.id,
          name: prod.name || 'Branch Stock Part',
          qty: 1,
          cost: unitCost,
          price: unitPrice,
          sourceType: 'OWN_STOCK',
        },
      ]);
    }
    setProductSearch('');
    setIsSearchDropdownOpen(false);
    setSelectedSearchIndex(0);
    toast.success(`Added Own Stock: ${prod.name}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSearchDropdownOpen && branchMatchedProducts.length > 0) {
        setIsSearchDropdownOpen(true);
      }
      setSelectedSearchIndex((prev) =>
        branchMatchedProducts.length > 0 ? (prev < branchMatchedProducts.length - 1 ? prev + 1 : 0) : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isSearchDropdownOpen && branchMatchedProducts.length > 0) {
        setIsSearchDropdownOpen(true);
      }
      setSelectedSearchIndex((prev) =>
        branchMatchedProducts.length > 0 ? (prev > 0 ? prev - 1 : branchMatchedProducts.length - 1) : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (branchMatchedProducts.length > 0) {
        const targetProd = branchMatchedProducts[selectedSearchIndex] || branchMatchedProducts[0];
        if (targetProd) {
          handleAddProductPart(targetProd);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsSearchDropdownOpen(false);
    }
  };

  const handleAddManualPart = () => {
    setPartsList([
      ...partsList,
      {
        id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: 'Market Purchased Part',
        qty: 1,
        cost: 0,
        price: 0,
        sourceType: 'MARKET_PURCHASE',
      },
    ]);
  };

  const handleRemovePart = (id: string) => {
    setPartsList(partsList.filter((p) => p.id !== id));
  };

  const handleUpdatePart = (id: string, field: keyof PartItem, value: any) => {
    setPartsList(
      partsList.map((p) => {
        if (p.id !== id) return p;
        // For market purchases, cost and price are equal pass-through (no org profit markup)
        if (p.sourceType === 'MARKET_PURCHASE') {
          if (field === 'cost') {
            return { ...p, cost: value, price: value };
          }
          if (field === 'price') {
            return { ...p, cost: value, price: value };
          }
        }
        return { ...p, [field]: value };
      })
    );
  };

  const handleResetForm = () => {
    setCustomerName('');
    setMobileNumber('');
    setBrand('');
    setModel('');
    setImei1('');
    setImei2('');
    setPasswordPattern('');
    setTechnicianId(currentUser?.role === 'REPAIR_MECHANIC' && currentUser?.id ? currentUser.id : '');
    setPriority('Normal');
    setProductSearch('');
    setPartsList([]);
    setProblemDescription('');
    setEstimatedCost(0);
    setAdvancePaid(0);
    setAdvanceMethod('Cash');
    setCreatedRepairId(null);
    if (onClearEditing) onClearEditing();
  };

  const handleClose = () => {
    setCreatedRepairId(null);
    if (embedded) {
      handleResetForm();
    } else if (onClose) {
      onClose();
    }
  };

  // Dedicated Print Booking Invoice
  const printBookingInvoice = (jobId: string) => {
    const effectiveShop: ShopHeader = shopHeader || {
      name: activeShop?.name || 'Niazi Mobile Mart',
      address: activeShop?.address || 'Main Service Center',
      phone: (activeShop as any)?.phone || '',
      email: '',
      taxNumber: '',
      footerText: 'Mobile Repair Booking Receipt. Keep receipt safe for pickup!',
    };

    const effectiveSettings: PrinterSettings = settings || {
      enabled: true,
      printerType: 'THERMAL_80MM',
      connectionType: 'BROWSER_PRINT',
      paperSize: { width: '80mm' },
      layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
      font: { size: 12, family: 'monospace' },
      invoice: {
        showLogo: false,
        showShopInfo: true,
        showBarcode: true,
        showQR: false,
        showTax: false,
        showDiscount: false,
      },
      autoPrint: false,
      printCopyCount: 1,
    };

    const selectedTech = staffList.find((s) => (s._id || s.id) === technicianId);

    const unified: UnifiedInvoice = {
      invoiceNo: `BOOK-${jobId}`,
      date: new Date().toLocaleString(),
      customer: {
        name: `${customerName || 'Walk-in'} (Ph: ${mobileNumber || 'N/A'})`,
      },
      cashier: selectedTech ? selectedTech.name : 'Technician Desk',
      items: [
        {
          name: `Device: ${brand} ${model}`.trim() || 'Mobile Device',
          qty: 1,
          price: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
          total: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
        },
        ...(imei1 ? [{ name: `IMEI: ${imei1} ${imei2 ? '/ ' + imei2 : ''}`, qty: 1, price: 0, total: 0 }] : []),
        ...(passwordPattern ? [{ name: `Pattern/Lock: ${passwordPattern}`, qty: 1, price: 0, total: 0 }] : []),
        ...(problemDescription ? [{ name: `Fault: ${problemDescription}`, qty: 1, price: 0, total: 0 }] : []),
        ...partsList.map((p) => ({
          name: `Part: ${p.name}`,
          qty: p.qty,
          price: p.price,
          total: p.price * p.qty,
        })),
      ],
      subtotal: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
      discount: 0,
      tax: 0,
      total: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
      paymentMethod: advanceMethod.toLowerCase(),
      tendered: advancePaid,
      change: 0,
      due: remainingBalance,
      shop: effectiveShop,
      returnPolicy: 'Customer must present this booking receipt at device delivery. Check all functions before leaving shop.',
    };

    const html = printFormatter.format(unified, effectiveSettings);
    openPreview({
      html,
      documentType: 'SaleInvoice',
      referenceId: jobId,
      title: `Booking Invoice - ${jobId}`,
    });
  };

  const createJobMutation = useMutation({
    mutationFn: async ({ shouldPrint, markRepaired, shouldSettle }: { shouldPrint: boolean; markRepaired: boolean; shouldSettle?: boolean }) => {
      // Guard against double clicks / concurrent duplicate calls
      if (isSubmittingRef.current) return null;
      isSubmittingRef.current = true;

      try {
        if (editingJob) {
          const editId = editingJob.id || editingJob._id;

          // 1. Update text fields and estimated cost
          const updated = await repairApi.updateRepairJob(editId, {
            customer_name: customerName.trim() || 'Walk-in Customer',
            customer_phone: mobileNumber.trim() || null,
            device: {
              type: 'Smartphone',
              brand: brand.trim(),
              model: model.trim() || 'Generic Smartphone',
              imei: [imei1, imei2].filter(Boolean).join(' / ') || undefined,
              password: passwordPattern.trim() || undefined,
            },
            problem_description: problemDescription.trim() || 'Diagnostic Inspection Required',
            technician_id: technicianId || (currentUser?.role === 'REPAIR_MECHANIC' && currentUser?.id ? currentUser.id : null),
            priority: priority,
            estimated_cost: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
          });

          // 2. Synchronize parts fluctuations (Add new parts, remove deleted parts)
          const existingParts: any[] = Array.isArray(editingJob.partsUsed) ? editingJob.partsUsed : [];
          const existingPartIds = new Set(existingParts.map((p) => String(p._id || p.id)));

          // Remove parts that were deleted in the form
          const currentPartIds = new Set(partsList.map((p) => String(p.id)));
          for (const ep of existingParts) {
            const epId = String(ep._id || ep.id);
            if (!currentPartIds.has(epId)) {
              try {
                await repairApi.removePart(editId, epId);
              } catch (e: any) {
                console.error(`Failed to remove part ${epId}:`, e);
              }
            }
          }

          // Add newly added parts (parts whose ID wasn't in existing parts)
          for (const p of partsList) {
            const isExisting = existingPartIds.has(String(p.id));
            if (!isExisting) {
              await repairApi.addPart(editId, {
                productId: p.productId,
                productName: p.name,
                qty: p.qty,
                cost: p.cost,
                price: p.price,
              });
            }
          }

          return { job: updated, shouldPrint: false, isEdit: true };
        }

        const job = await repairApi.createRepairJob({
          customer_name: customerName.trim() || 'Walk-in Customer',
          customer_phone: mobileNumber.trim() || null,
          device: {
            type: 'Smartphone',
            brand: brand.trim(),
            model: model.trim() || 'Generic Smartphone',
            imei: [imei1, imei2].filter(Boolean).join(' / ') || undefined,
            password: passwordPattern.trim() || undefined,
          },
          problem_description: problemDescription.trim() || 'Diagnostic Inspection Required',
          technician_id: technicianId || (currentUser?.role === 'REPAIR_MECHANIC' && currentUser?.id ? currentUser.id : null),
          priority: priority,
          estimated_cost: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
          advance_payment: advancePaid > 0
            ? { amount: advancePaid, method: advanceMethod }
            : null,
          branch_id: effectiveBranchId || undefined,
        });

        if (!job?.id) throw new Error('Failed to create repair job');
        setCreatedRepairId(job.id);

        for (const p of partsList) {
          await repairApi.addPart(job.id, {
            productId: p.productId,
            productName: p.name,
            qty: p.qty,
            cost: p.cost,
            price: p.price,
          });
        }

        if (markRepaired && !shouldSettle) {
          await repairApi.updateStatus(job.id, 'Ready for Pickup', 'Marked as completed / repaired by technician.');
        }

        return { job, shouldPrint, isEdit: false, shouldSettle: shouldSettle ?? false };
      } finally {
        isSubmittingRef.current = false;
      }
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success(data.isEdit ? 'Repair job details updated successfully!' : 'Repair job booked successfully!');
      if (data.shouldPrint && data.job?.jobId) {
        printBookingInvoice(data.job.jobId);
      }
      if ((data as any).shouldSettle && onJobCreatedForSettlement) {
        onJobCreatedForSettlement(data.job);
        handleResetForm();
      } else {
        handleClose();
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save repair job');
    },
  });

  if (!embedded && !isOpen) return null;

  // Embedded Permanent Panel Mode (35% Right Column — Full Height Auto, Zero Header, No Internal Scrollbar)
  if (embedded) {
    return (
      <div className="w-full h-auto bg-surface border border-border rounded-2xl shadow-card flex flex-col text-text-primary font-sans transition-colors p-3 space-y-2.5">

        {/* Card 1: Customer & Device Information */}
        <div className="bg-background/40 border border-border rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Customer and Device Information
            </h3>
            <button
              type="button"
              onClick={handleResetForm}
              className="px-2 py-0.5 rounded-md text-text-muted hover:text-primary hover:bg-surface-hover transition-colors flex items-center gap-1 text-[10px] font-bold"
              title="Clear / Reset Form"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Form</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Customer Name <span className="text-text-muted font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer (or name)"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Mobile Number <span className="text-text-muted font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={mobileNumber}
                onChange={handleMobileChange}
                maxLength={12}
                placeholder="0300-1234567"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Brand <span className="text-danger font-bold">*</span>
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Samsung, Apple, Infinix"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Model <span className="text-danger font-bold">*</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. A52, iPhone 13, Note 30"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                IMEI 1 / Serial No <span className="text-text-muted font-normal">(15 digits)</span>
              </label>
              <input
                type="text"
                value={imei1}
                onChange={handleImei1Change}
                maxLength={15}
                placeholder="15-digit IMEI (optional)"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Password / Pattern Lock <span className="text-text-muted font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={passwordPattern}
                onChange={(e) => setPasswordPattern(e.target.value)}
                placeholder="PIN or Pattern (optional)"
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Mechanic / Technician
              </label>
              {isMechanicUser ? (
                <div className="w-full h-7 px-2 rounded-lg bg-surface-hover border border-border text-xs text-text-muted flex items-center gap-1.5">
                  <UserCheck className="w-3 h-3 shrink-0 text-primary" />
                  <span className="truncate font-medium">{currentUser?.name}</span>
                </div>
              ) : (
                <select
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Desk / Walk-in</option>
                  {branchMechanics.map((s: any) => (
                    <option key={s._id || s.id} value={s._id || s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full h-7 px-2 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 3: Parts & Materials (Search Bar in Header + Expanded Add Part Button) */}
        <div className="bg-background/40 border border-border rounded-xl p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 pb-0.5">
            <div className="relative flex-1 min-w-0" ref={searchContainerRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                onFocus={() => {
                  if (productSearch.trim().length >= 1) {
                    setIsSearchDropdownOpen(true);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search branch inventory product/material to attach..."
                className="w-full h-[34px] pl-8 pr-3 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
              {isSearchDropdownOpen && productSearch.trim().length >= 1 && (
                <div className="absolute left-0 right-0 top-9 bg-surface border border-border rounded-lg shadow-xl z-30 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1 bg-surface-hover border-b border-border text-[9px] text-text-muted">
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono">↑↓</kbd> Select{' '}
                      <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono ml-1">Enter</kbd> Add
                    </span>
                    <span className="font-semibold text-primary">
                      {activeShop?.name || 'Current Branch'} Stock
                    </span>
                  </div>
                  {isSearchingProducts && branchMatchedProducts.length === 0 ? (
                    <div className="px-3 py-2.5 text-center text-xs text-text-muted">
                      Searching current branch inventory...
                    </div>
                  ) : branchMatchedProducts.length === 0 ? (
                    <div className="px-3 py-2.5 text-center text-xs text-text-muted">
                      No matching product in this branch
                    </div>
                  ) : (
                    <div ref={searchListRef} className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-border/60">
                      {branchMatchedProducts.map((prod: any, idx: number) => {
                        const isSelected = idx === selectedSearchIndex;
                        const branchStock = Number(prod.stock ?? prod.quantity ?? 0);
                        const sellPrice = Number(prod.price ?? prod.sale_price ?? prod.selling_price ?? 0);
                        const costPrice = Number(prod.purchasePrice ?? prod.averageCost ?? prod.purchase_price ?? prod.cost_price ?? 0);
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onMouseEnter={() => setSelectedSearchIndex(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddProductPart(prod);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs flex justify-between items-center transition-colors ${
                              isSelected
                                ? 'bg-primary/15 border-l-2 border-l-primary'
                                : 'hover:bg-surface-hover'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-text-primary truncate">{prod.name}</div>
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
                                {prod.sku && <span>{prod.sku}</span>}
                                <span className={branchStock > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                                  Branch Stock: {branchStock}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-primary font-bold">Rs {sellPrice.toLocaleString()}</div>
                              <div className="text-[10px] text-text-muted">Cost: Rs {costPrice.toLocaleString()}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleAddManualPart}
              className="h-[34px] px-3 rounded-lg bg-surface hover:bg-surface-hover text-text-primary border border-border text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
              title="Add part purchased from open market (Pass-through cost)"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>+ Market Part</span>
            </button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden flex flex-col bg-surface">
            <div className="grid grid-cols-12 bg-surface-hover text-[10px] uppercase font-bold text-text-secondary px-2 py-1 border-b border-border">
              <span className="col-span-5">Part Name &amp; Source</span>
              <span className="col-span-2 text-center">Qty</span>
              <span className="col-span-2 text-right">Cost (Rs)</span>
              <span className="col-span-2 text-right">Price (Rs)</span>
              <span className="col-span-1 text-center"></span>
            </div>
            <div className="divide-y divide-border/60">
              {partsList.length === 0 ? (
                <div className="py-3 text-center text-text-muted text-[11px]">
                  No parts added yet. Search branch stock or click &quot;+ Market Part&quot;
                </div>
              ) : (
                partsList.map((part) => {
                  const isMarket = part.sourceType === 'MARKET_PURCHASE' || !part.productId;
                  return (
                    <div key={part.id} className="grid grid-cols-12 items-center px-2 py-1 text-xs gap-1">
                      <div className="col-span-5 flex flex-col justify-center">
                        <input
                          type="text"
                          value={part.name}
                          onChange={(e) => handleUpdatePart(part.id, 'name', e.target.value)}
                          className="w-full h-5 px-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary text-xs text-text-primary focus:outline-none"
                        />
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                              isMarket
                                ? 'bg-warning/15 text-warning border border-warning/30'
                                : 'bg-primary/15 text-primary border border-primary/30'
                            }`}
                          >
                            {isMarket ? 'Market Purchase' : 'Branch Stock'}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={part.qty}
                          onChange={(e) => handleUpdatePart(part.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full h-6 px-1 text-center bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.cost}
                          onChange={(e) => handleUpdatePart(part.id, 'cost', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-primary"
                          title={isMarket ? 'Market purchase cost = price' : 'Inventory purchase cost'}
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.price}
                          onChange={(e) => handleUpdatePart(part.id, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-surface border border-border rounded text-xs text-primary font-semibold focus:outline-none focus:border-primary"
                          title={isMarket ? 'Pass-through price for market purchase' : 'Customer selling price'}
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePart(part.id)}
                          className="p-0.5 text-text-muted hover:text-danger transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-2.5 py-1.5 bg-surface-hover border-t border-border flex justify-between items-center text-[11px] font-medium">
              <span className="text-text-secondary">Parts: {partsList.length}</span>
              <div className="flex gap-3">
                <span className="text-text-secondary">Cost: Rs {partsTotalCost.toLocaleString()}</span>
                <span className="text-primary font-bold">Total: Rs {partsTotalPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Problem & Diagnostic */}
        <div className="bg-background/40 border border-border rounded-xl p-2.5 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1">
            <AlignLeft className="w-3.5 h-3.5" /> Problem &amp; Diagnostic
          </h3>
          <textarea
            rows={2}
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            placeholder="Detail faults, diagnostics, customer symptoms..."
            className="w-full p-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors resize-none"
          />
          <div className="flex flex-wrap gap-1">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleChipClick(chip)}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface hover:bg-primary hover:text-white text-text-secondary transition-colors border border-border"
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Card 5: Cost & Advance Billing */}
        <div className="bg-background/40 border border-border rounded-xl p-2.5 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1">
            Cost &amp; Advance Billing
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">
                Total Bill / Est. Cost (Rs)
              </label>
              <input
                type="number"
                min="0"
                value={estimatedCost || ''}
                onChange={(e) => setEstimatedCost(parseFloat(e.target.value) || 0)}
                placeholder={partsTotalPrice > 0 ? partsTotalPrice.toString() : '0'}
                className="w-full h-8 px-2 text-right rounded-lg bg-surface border border-primary/50 text-xs text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-primary shadow-xs"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-semibold text-text-secondary">Advance (Rs)</label>
                {estimatedCost > 0 && (
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(estimatedCost)}
                    className="text-[9px] font-bold text-primary hover:underline"
                  >
                    Full Pay
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                value={advancePaid || ''}
                onChange={(e) => setAdvancePaid(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full h-8 px-2 text-right rounded-lg bg-surface border border-border text-xs text-success font-bold focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-0.5">Method</label>
              <select
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as any)}
                className="w-full h-8 px-1.5 text-xs rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-primary"
              >
                <option value="Cash">Cash</option>
                <option value="EasyPaisa">EasyPaisa</option>
                <option value="JazzCash">JazzCash</option>
                <option value="Bank">Bank</option>
              </select>
            </div>
          </div>

          {/* Quick Pay Buttons Row */}
          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            <span className="text-[10px] text-text-muted font-medium">Quick Payment:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAdvancePaid(0)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Zero (Rs 0)
              </button>
              {partsTotalPrice > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!estimatedCost || estimatedCost < partsTotalPrice) {
                      setEstimatedCost(partsTotalPrice);
                    }
                    setAdvancePaid(partsTotalPrice);
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  Parts Only (Rs {partsTotalPrice.toLocaleString()})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = estimatedCost > 0 ? estimatedCost : partsTotalPrice;
                  if (target > 0) {
                    setEstimatedCost(target);
                    setAdvancePaid(target);
                  }
                }}
                className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-primary text-text-inverse hover:bg-primary-hover shadow-xs transition-colors"
              >
                Full Payment
              </button>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between">
            <div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-primary">Remaining Balance</span>
              <span className="block text-[9px] text-text-muted">Due upon device delivery</span>
            </div>
            <span className="text-base font-black text-primary tabular-nums">
              Rs {remainingBalance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Bottom Action Buttons */}
        <div className="pt-1 flex items-center justify-between gap-2">
          {editingJob ? (
            <>
              <button
                type="button"
                onClick={handleResetForm}
                className="h-9 px-3 rounded-xl font-bold text-xs bg-surface hover:bg-surface-hover text-text-secondary border border-border transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <span>Cancel Edit</span>
              </button>

              <button
                type="button"
                disabled={createJobMutation.isPending}
                onClick={() => {
                  if (!brand.trim() || !model.trim()) {
                    toast.error('Please enter device Brand and Model');
                    return;
                  }
                  createJobMutation.mutate({ shouldPrint: false, markRepaired: false });
                }}
                className="flex-1 h-9 px-3 rounded-xl font-bold text-xs bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                title="Save updated repair job details"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {createJobMutation.isPending ? 'Updating...' : 'Save Job Details'}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={createJobMutation.isPending}
                onClick={() => {
                  if (!brand.trim() || !model.trim()) {
                    toast.error('Please enter device Brand and Model');
                    return;
                  }
                  createJobMutation.mutate({ shouldPrint: false, markRepaired: false, shouldSettle: true });
                }}
                className="h-9 px-3 rounded-xl font-bold text-xs bg-surface hover:bg-surface-hover text-primary border border-primary/40 hover:border-primary transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Mark device repair as finished/completed and open payment settlement"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Finish / Repaired</span>
              </button>

              <button
                type="button"
                disabled={createJobMutation.isPending}
                onClick={() => {
                  if (!brand.trim() || !model.trim()) {
                    toast.error('Please enter device Brand and Model');
                    return;
                  }
                  createJobMutation.mutate({ shouldPrint: true, markRepaired: false });
                }}
                className="flex-1 h-9 px-3 rounded-xl font-bold text-xs bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                title="Create repair job booking and print dedicated booking invoice"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{createJobMutation.isPending ? 'Processing...' : 'Create Job & Print Invoice'}</span>
              </button>
            </>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in select-none">
      <div className="w-full max-w-7xl max-h-[96vh] h-auto bg-surface border border-border rounded-2xl shadow-modal flex flex-col overflow-hidden text-text-primary font-sans transition-colors">

        {/* Top Header */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-primary via-primary-hover to-primary flex items-center justify-between border-b border-primary-active/40 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center shadow-xs">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Repair Job &amp; Mobile Booking
              </h2>
              <p className="text-[11px] text-white/80">
                Intake device, attach parts, and generate booking invoice
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Single-Screen 3-Column Content */}
        <div className="p-3.5 sm:p-4 grid grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0 bg-background/50">

          {/* Column 1: Customer (Top) + Device (Bottom) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col gap-3 min-h-0">

            {/* Card 1: Customer Information */}
            <div className="bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                <User className="w-3.5 h-3.5" /> Customer Information
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">
                    Customer Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer full name"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">
                    Mobile Number <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={handleMobileChange}
                    maxLength={12}
                    placeholder="0300-1234567"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition-colors font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Device Information */}
            <div className="bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 flex-1 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1.5 shrink-0">
                <Smartphone className="w-3.5 h-3.5" /> Device Information
              </h3>
              <div className="space-y-2 overflow-y-auto custom-scrollbar pr-0.5 flex-1 min-h-0">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Brand</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Samsung, Apple"
                      className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. A52, iPhone 13"
                      className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">IMEI 1 / Serial No (15 digits)</label>
                  <input
                    type="text"
                    value={imei1}
                    onChange={handleImei1Change}
                    maxLength={15}
                    placeholder="Primary 15-digit IMEI"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">IMEI 2 (Optional, 15 digits)</label>
                  <input
                    type="text"
                    value={imei2}
                    onChange={handleImei2Change}
                    maxLength={15}
                    placeholder="Secondary IMEI (Dual-SIM)"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Password / Pattern Lock</label>
                  <input
                    type="text"
                    value={passwordPattern}
                    onChange={(e) => setPasswordPattern(e.target.value)}
                    placeholder="PIN, Password or 'Pattern 1-2-3'"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Mechanic & Priority */}
            <div className="bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Mechanic &amp; Priority
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Mechanic / Technician</label>
                  {isMechanicUser ? (
                    <div className="w-full h-8 px-2.5 rounded-lg bg-surface-hover border border-border text-xs text-text-muted flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium">{currentUser?.name}</span>
                    </div>
                  ) : (
                    <select
                      value={technicianId}
                      onChange={(e) => setTechnicianId(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="">Desk / Walk-in</option>
                      {branchMechanics.map((s: any) => (
                        <option key={s._id || s.id} value={s._id || s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* Column 2: Product Search & Parts Table */}
          <div className="col-span-12 md:col-span-4 lg:col-span-5 bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 min-h-0">

            {/* Header with Search and Manual Add */}
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  Parts &amp; Materials
                </h3>
              </div>
              <button
                type="button"
                onClick={handleAddManualPart}
                className="h-7 px-2.5 rounded-lg bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Part</span>
              </button>
            </div>

            {/* Search Bar for Product Search */}
            <div className="relative shrink-0" ref={searchContainerRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                onFocus={() => {
                  if (productSearch.trim().length >= 1) {
                    setIsSearchDropdownOpen(true);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search branch inventory product/material to attach..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />

              {/* Product Search Dropdown Results */}
              {isSearchDropdownOpen && productSearch.trim().length >= 1 && (
                <div className="absolute left-0 right-0 top-9 bg-surface border border-border rounded-lg shadow-xl z-30 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1 bg-surface-hover border-b border-border text-[9px] text-text-muted">
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono">↑↓</kbd> Select{' '}
                      <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono ml-1">Enter</kbd> Add
                    </span>
                    <span className="font-semibold text-primary">
                      {activeShop?.name || 'Current Branch'} Stock
                    </span>
                  </div>
                  {isSearchingProducts && branchMatchedProducts.length === 0 ? (
                    <div className="px-3 py-2.5 text-center text-xs text-text-muted">
                      Searching current branch inventory...
                    </div>
                  ) : branchMatchedProducts.length === 0 ? (
                    <div className="px-3 py-2.5 text-center text-xs text-text-muted">
                      No matching product in this branch
                    </div>
                  ) : (
                    <div ref={searchListRef} className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-border/60">
                      {branchMatchedProducts.map((prod: any, idx: number) => {
                        const isSelected = idx === selectedSearchIndex;
                        const branchStock = Number(prod.stock ?? prod.quantity ?? 0);
                        const sellPrice = Number(prod.price ?? prod.sale_price ?? prod.selling_price ?? 0);
                        const costPrice = Number(prod.purchasePrice ?? prod.averageCost ?? prod.purchase_price ?? prod.cost_price ?? 0);
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onMouseEnter={() => setSelectedSearchIndex(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddProductPart(prod);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs flex justify-between items-center transition-colors ${
                              isSelected
                                ? 'bg-primary/15 border-l-2 border-l-primary'
                                : 'hover:bg-surface-hover'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-text-primary truncate">{prod.name}</div>
                              <div className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
                                {prod.sku && <span>{prod.sku}</span>}
                                <span className={branchStock > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                                  Branch Stock: {branchStock}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-primary font-bold">Rs {sellPrice.toLocaleString()}</div>
                              <div className="text-[10px] text-text-muted">Cost: Rs {costPrice.toLocaleString()}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Internal Table with Scrollbar for Parts List */}
            <div className="flex-1 border border-border rounded-lg overflow-hidden flex flex-col min-h-0 bg-background/30">
              <div className="grid grid-cols-12 bg-surface-hover text-[10px] uppercase font-bold text-text-secondary px-2 py-1.5 border-b border-border shrink-0">
                <span className="col-span-5">Item / Part Name</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Cost</span>
                <span className="col-span-2 text-right">Sell Price</span>
                <span className="col-span-1 text-center"></span>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-border/60">
                {partsList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-slate-500 text-xs">
                    <p>No parts added yet.</p>
                    <p className="text-[10px] text-slate-600 mt-1">Search inventory above or click &quot;Add Part&quot;</p>
                  </div>
                ) : (
                  partsList.map((part) => (
                    <div key={part.id} className="grid grid-cols-12 items-center px-2 py-1.5 text-xs hover:bg-slate-800/40 gap-1">
                      <div className="col-span-5">
                        <input
                          type="text"
                          value={part.name}
                          onChange={(e) => handleUpdatePart(part.id, 'name', e.target.value)}
                          className="w-full h-6 px-1.5 bg-transparent border-b border-transparent hover:border-slate-600 focus:border-teal-500 text-xs text-white focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={part.qty}
                          onChange={(e) => handleUpdatePart(part.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full h-6 px-1 text-center bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.cost}
                          onChange={(e) => handleUpdatePart(part.id, 'cost', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.price}
                          onChange={(e) => handleUpdatePart(part.id, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-slate-950 border border-slate-700 rounded text-xs text-primary font-semibold focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePart(part.id)}
                          className="p-1 text-slate-400 hover:text-danger transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Parts Total Footer Row */}
              <div className="px-3 py-2 bg-surface-hover border-t border-border flex justify-between items-center text-xs shrink-0 font-medium">
                <span className="text-text-secondary text-[11px]">Parts Count: {partsList.length}</span>
                <div className="flex gap-4">
                  <span className="text-text-secondary text-[11px]">Cost: Rs {partsTotalCost.toLocaleString()}</span>
                  <span className="text-primary font-bold">Total: Rs {partsTotalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Column 3: Problem & Diagnostic (Top) + Cost & Billing (Bottom) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-4 flex flex-col gap-3 min-h-0">

            {/* Card 4: Problem & Diagnostic */}
            <div className="bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Problem &amp; Diagnostic
              </h3>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-0.5">Problem Description</label>
                <textarea
                  rows={2}
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  placeholder="Detail faults, diagnostics, customer symptoms..."
                  className="w-full p-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Quick Selection Chips
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-hover hover:bg-primary hover:text-white text-text-secondary transition-colors border border-border"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 5: Cost & Advance Billing */}
            <div className="bg-surface border border-border rounded-xl p-3 shadow-card flex flex-col gap-2 flex-1 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b border-border pb-1.5 shrink-0">
                Cost &amp; Advance Billing
              </h3>

              <div className="flex-1 flex flex-col justify-between space-y-2 overflow-y-auto custom-scrollbar pr-0.5 min-h-0">
                <div className="space-y-2">

                  {/* Estimated Cost Row */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Estimated Cost</span>
                    <div className="flex items-center gap-1 w-36">
                      <span className="text-slate-400 font-mono text-[11px]">Rs</span>
                      <input
                        type="number"
                        min="0"
                        value={estimatedCost || ''}
                        onChange={(e) => setEstimatedCost(parseFloat(e.target.value) || 0)}
                        placeholder={(partsTotalPrice || 0).toString()}
                        className="w-full h-8 px-2 text-right rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-bold focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Advance Paid Row */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Advance Paid</span>
                    <div className="flex items-center gap-1 w-36">
                      <span className="text-slate-400 font-mono text-[11px]">Rs</span>
                      <input
                        type="number"
                        min="0"
                        value={advancePaid || ''}
                        onChange={(e) => setAdvancePaid(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full h-8 px-2 text-right rounded-lg bg-slate-900 border border-slate-700 text-xs text-success font-bold focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Advance Payment Method */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Advance Method</span>
                    <select
                      value={advanceMethod}
                      onChange={(e) => setAdvanceMethod(e.target.value as any)}
                      className="w-36 h-8 px-2 text-xs rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-primary"
                    >
                      <option value="Cash">Cash</option>
                      <option value="EasyPaisa">EasyPaisa</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Bank">Bank</option>
                    </select>
                  </div>
                </div>

                {/* Remaining Balance Due */}
                <div className="mt-2 p-2.5 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between shrink-0">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-primary">Remaining Balance</span>
                    <span className="text-[10px] text-slate-400">Due upon device delivery</span>
                  </div>
                  <span className="text-lg font-black text-primary tabular-nums">
                    Rs {remainingBalance.toLocaleString()}
                  </span>
                </div>

              </div>
            </div>

          </div>

        </div>

        {/* Bottom Action Bar */}
        <div className="px-5 py-3 bg-surface border-t border-border flex flex-wrap items-center justify-between gap-2 shrink-0">

          {/* Left: Cancel */}
          <button
            type="button"
            onClick={handleClose}
            disabled={createJobMutation.isPending}
            className="h-9 px-4 rounded-xl font-bold text-xs bg-surface-hover hover:bg-border text-text-secondary transition-colors border border-border"
          >
            Cancel
          </button>

          {/* Center: Replace/Return workflows not yet implemented */}
          <div />

          {/* Right: Finish Job / Repaired & Create Job & Print Booking Invoice */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={createJobMutation.isPending}
              onClick={() => {
                if (!customerName.trim()) {
                  toast.error('Please enter customer name');
                  return;
                }
                createJobMutation.mutate({ shouldPrint: false, markRepaired: false, shouldSettle: true });
              }}
              className="h-9 px-4 rounded-xl font-bold text-xs bg-surface hover:bg-surface-hover text-primary border border-primary/40 hover:border-primary transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Mark device repair as finished/completed and open payment settlement"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>Finish Job / Repaired</span>
            </button>

            <button
              type="button"
              disabled={createJobMutation.isPending}
              onClick={() => {
                if (!customerName.trim()) {
                  toast.error('Please enter customer name');
                  return;
                }
                createJobMutation.mutate({ shouldPrint: true, markRepaired: false });
              }}
              className="h-9 px-4 rounded-xl font-bold text-xs bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
              title="Create repair job booking and print dedicated booking invoice"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{createJobMutation.isPending ? 'Processing...' : 'Create Job & Print Booking Invoice'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
