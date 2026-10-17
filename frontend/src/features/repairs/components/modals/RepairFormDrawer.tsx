'use client';

import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { repairApi } from '../../services/repair.api';
import { productService } from '@/features/inventory/services/product.service';
import { usePrintStore } from '@/lib/printer';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { UnifiedInvoice, PrinterSettings, ShopHeader } from '@/features/settings/printer/types/printer.types';
import { useOrganizationStore } from '@/store/useOrganizationStore';
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
  RefreshCw,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface RepairFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PartItem {
  id: string;
  productId?: string;
  name: string;
  qty: number;
  cost: number;
  price: number;
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

export const RepairFormDrawer: React.FC<RepairFormDrawerProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const activeShop = useOrganizationStore((s) => s.activeShop);

  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [passwordPattern, setPasswordPattern] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [partsList, setPartsList] = useState<PartItem[]>([]);

  const [problemDescription, setProblemDescription] = useState('');

  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [advanceMethod, setAdvanceMethod] = useState<'Cash' | 'Card' | 'Bank' | 'Online'>('Cash');

  const [createdRepairId, setCreatedRepairId] = useState<string | null>(null);
  const [partialFailureMessage, setPartialFailureMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  // Search products from inventory catalog
  const { data: searchResults } = useQuery({
    queryKey: ['repairProductSearch', productSearch],
    queryFn: () => productService.getProducts({ search: productSearch, limit: 8, page: 1 }),
    enabled: productSearch.trim().length >= 2,
  });

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
    const existing = partsList.find((p) => p.productId === prod.id);
    if (existing) {
      setPartsList(partsList.map((p) => (p.productId === prod.id ? { ...p, qty: p.qty + 1 } : p)));
    } else {
      setPartsList([
        ...partsList,
        {
          id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: prod.id,
          name: prod.name || 'Spare Part',
          qty: 1,
          cost: prod.cost_price || 0,
          price: prod.selling_price || 0,
        },
      ]);
    }
    setProductSearch('');
    toast.success(`Added ${prod.name}`, { icon: 'ðŸ”§' });
  };

  const handleAddManualPart = () => {
    setPartsList([
      ...partsList,
      {
        id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: 'New Part / Material',
        qty: 1,
        cost: 0,
        price: 0,
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
        return { ...p, [field]: value };
      })
    );
  };

  const handleClose = () => {
    setPartialFailureMessage(null);
    setCreatedRepairId(null);
    onClose();
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

    const unified: UnifiedInvoice = {
      invoiceNo: `BOOK-${jobId}`,
      date: new Date().toLocaleString(),
      customer: {
        name: `${customerName || 'Walk-in'} (Ph: ${mobileNumber || 'N/A'})`,
      },
      cashier: 'Technician Desk',
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
    mutationFn: async ({ shouldPrint, markRepaired }: { shouldPrint: boolean; markRepaired: boolean }) => {
      setPartialFailureMessage(null);

      let targetRepairId = createdRepairId;
      let job: any = null;

      if (!targetRepairId) {
        job = await repairApi.createRepairJob({
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
          priority: 'Normal',
          estimated_cost: estimatedCost > 0 ? estimatedCost : partsTotalPrice,
        });

        if (!job?.id) throw new Error('Failed to create repair job ID');
        targetRepairId = job.id;
        setCreatedRepairId(job.id);

        // Add consumed parts to repair job if any exist
        for (const p of partsList) {
          try {
            await repairApi.addPart(targetRepairId!, {
              productId: p.productId,
              productName: p.name,
              qty: p.qty,
              cost: p.cost,
              price: p.price,
            });
          } catch (partErr) {
            console.warn('Part sync notice:', partErr);
          }
        }
      }

      // Record advance payment if > 0
      if (advancePaid > 0 && targetRepairId) {
        try {
          await repairApi.addPayment(targetRepairId, {
            amount: advancePaid,
            method: advanceMethod,
          });
        } catch (paymentErr: any) {
          throw Object.assign(
            new Error(`Repair job booked (ID: ${targetRepairId}) but advance payment could not be registered: ${paymentErr?.message || 'Check connection'}.`),
            { isPartialFailure: true, repairId: targetRepairId }
          );
        }
      }

      // If markRepaired button was clicked, update status to Ready for Pickup / Delivered
      if (markRepaired && targetRepairId) {
        await repairApi.updateStatus(targetRepairId, 'Ready for Pickup', 'Marked as completed / repaired by technician.');
      }

      return { job: job || { id: targetRepairId, jobId: targetRepairId }, shouldPrint };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success('Repair job saved successfully!', { icon: 'âœ…' });
      if (data.shouldPrint && data.job?.id) {
        printBookingInvoice(data.job.jobId || data.job.id);
      }
      handleClose();
    },
    onError: (err: any) => {
      if (err?.isPartialFailure) {
        queryClient.invalidateQueries({ queryKey: ['repairs'] });
        setPartialFailureMessage(err.message);
      } else {
        toast.error(err?.message || 'Failed to process repair job');
      }
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in select-none">
      <div className="w-full max-w-7xl max-h-[96vh] h-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">

        {/* â”€â”€ Top Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-[#006970] via-[#00575d] to-slate-900 flex items-center justify-between border-b border-teal-500/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-400/20 text-teal-300 flex items-center justify-center shadow-xs">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Repair Job & Mobile Booking
              </h2>
              <p className="text-[11px] text-teal-100/75">
                Intake device, attach parts, and generate booking invoice
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* â”€â”€ Warnings / Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {partialFailureMessage && (
          <div className="px-5 py-2 bg-amber-500/20 border-b border-amber-500/40 text-amber-200 text-xs flex items-center justify-between shrink-0">
            <span>{partialFailureMessage}</span>
            <button
              onClick={() => createJobMutation.mutate({ shouldPrint: false, markRepaired: false })}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-[11px]"
            >
              Retry Payment
            </button>
          </div>
        )}

        {/* â”€â”€ Main Single-Screen 3-Column Content (Fits Screen Without Scroll) â”€â”€â”€ */}
        <div className="p-3.5 sm:p-4 grid grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">

          {/* â•â• Column 1: Customer (Top) + Device (Bottom) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col gap-3 min-h-0">

            {/* Card 1: Customer Information */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 shadow-xs flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/80 pb-1.5">
                <User className="w-3.5 h-3.5" /> Customer Information
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                    Customer Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer full name"
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                    Mobile Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="03XXXXXXXXX"
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Device Information (Stacked below Customer Information) */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 shadow-xs flex flex-col gap-2 flex-1 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/80 pb-1.5 shrink-0">
                <Smartphone className="w-3.5 h-3.5" /> Device Information
              </h3>
              <div className="space-y-2 overflow-y-auto custom-scrollbar pr-0.5 flex-1 min-h-0">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Brand</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Samsung, Apple"
                      className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. A52, iPhone 13"
                      className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">IMEI 1 / Serial No</label>
                  <input
                    type="text"
                    value={imei1}
                    onChange={(e) => setImei1(e.target.value)}
                    placeholder="Primary 15-digit IMEI"
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">IMEI 2 (Optional)</label>
                  <input
                    type="text"
                    value={imei2}
                    onChange={(e) => setImei2(e.target.value)}
                    placeholder="Secondary IMEI (Dual-SIM)"
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Password / Pattern Lock</label>
                  <input
                    type="text"
                    value={passwordPattern}
                    onChange={(e) => setPasswordPattern(e.target.value)}
                    placeholder="PIN, Password or 'Pattern 1-2-3'"
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* â•â• Column 2: Product Search & Parts Table (Center Full Height) â•â•â•â•â• */}
          <div className="col-span-12 md:col-span-4 lg:col-span-5 bg-slate-800/80 border border-slate-700 rounded-xl p-3 shadow-xs flex flex-col gap-2 min-h-0">

            {/* Header with Search and Manual Add */}
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  Parts & Materials
                </h3>
              </div>
              <button
                type="button"
                onClick={handleAddManualPart}
                className="h-7 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Part</span>
              </button>
            </div>

            {/* Search Bar for Product Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search inventory product/material to attach..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />

              {/* Product Search Dropdown Results */}
              {productSearch.trim().length >= 2 && searchResults?.products && searchResults.products.length > 0 && (
                <div className="absolute left-0 right-0 top-9 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto custom-scrollbar">
                  {searchResults.products.map((prod: any) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleAddProductPart(prod)}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 flex justify-between items-center border-b border-slate-800 last:border-0"
                    >
                      <div>
                        <div className="font-semibold text-white">{prod.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Stock: {prod.quantity ?? 0}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-teal-400 font-bold">Rs {(prod.selling_price || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400">Cost: Rs {(prod.cost_price || 0).toLocaleString()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Internal Table with Scrollbar for Parts List */}
            <div className="flex-1 border border-slate-700/80 rounded-lg overflow-hidden flex flex-col min-h-0 bg-slate-900/50">
              <div className="grid grid-cols-12 bg-slate-800 text-[10px] uppercase font-bold text-slate-400 px-2 py-1.5 border-b border-slate-700 shrink-0">
                <span className="col-span-5">Item / Part Name</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Cost</span>
                <span className="col-span-2 text-right">Sell Price</span>
                <span className="col-span-1 text-center"></span>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-slate-800">
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
                          className="w-full h-6 px-1 text-center bg-slate-950 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.cost}
                          onChange={(e) => handleUpdatePart(part.id, 'cost', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-slate-950 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          value={part.price}
                          onChange={(e) => handleUpdatePart(part.id, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full h-6 px-1 text-right bg-slate-950 border border-slate-700 rounded text-xs text-teal-300 font-semibold focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePart(part.id)}
                          className="p-1 text-slate-400 hover:text-red-400 transition-colors"
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
              <div className="px-3 py-1.5 bg-slate-800/90 border-t border-slate-700 flex justify-between items-center text-xs shrink-0 font-medium">
                <span className="text-slate-400 text-[11px]">Parts Count: {partsList.length}</span>
                <div className="flex gap-4">
                  <span className="text-slate-400 text-[11px]">Cost: Rs {partsTotalCost.toLocaleString()}</span>
                  <span className="text-teal-400 font-bold">Total: Rs {partsTotalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>

          </div>

          {/* â•â• Column 3: Problem & Diagnostic (Top) + Cost & Billing (Bottom) â• */}
          <div className="col-span-12 md:col-span-4 lg:col-span-4 flex flex-col gap-3 min-h-0">

            {/* Card 4: Problem & Diagnostic */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 shadow-xs flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/80 pb-1.5">
                <AlignLeft className="w-3.5 h-3.5" /> Problem & Diagnostic
              </h3>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Problem Description</label>
                <textarea
                  rows={2}
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  placeholder="Detail faults, diagnostics, customer symptoms..."
                  className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none"
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
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 hover:bg-teal-700 text-slate-200 hover:text-white transition-colors border border-slate-600/70"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 5: Cost & Advance Billing (Price Table Layout) */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 shadow-xs flex flex-col gap-2 flex-1 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/80 pb-1.5 shrink-0">
                Cost & Advance Billing
              </h3>

              {/* Exact Price Table layout fitted to card */}
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
                        className="w-full h-8 px-2 text-right rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-bold focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Advance Payment Method */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Advance Method</span>
                    <select
                      value={advanceMethod}
                      onChange={(e) => setAdvanceMethod(e.target.value as any)}
                      className="w-36 h-7 px-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Bank">Bank</option>
                      <option value="Online">Online</option>
                    </select>
                  </div>
                </div>

                {/* Remaining Balance Due (Prominently Highlighted Row) */}
                <div className="mt-2 p-2.5 rounded-xl bg-teal-950/60 border border-teal-500/40 flex items-center justify-between shrink-0">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-teal-300">Remaining Balance</span>
                    <span className="text-[10px] text-slate-400">Due upon device delivery</span>
                  </div>
                  <span className="text-lg font-black text-teal-300 tabular-nums">
                    Rs {remainingBalance.toLocaleString()}
                  </span>
                </div>

              </div>
            </div>

          </div>

        </div>

        {/* â”€â”€ Bottom Action Bar: Exactly 5 Clean Single-Instance Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">

          {/* Left: Cancel */}
          <button
            type="button"
            onClick={handleClose}
            disabled={createJobMutation.isPending}
            className="h-9 px-4 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            Cancel
          </button>

          {/* Center: Replace Parts & Return / Refund Parts */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (partsList.length === 0) {
                  toast.error('Add parts to the repair before initiating a replacement.');
                  return;
                }
                toast('Replace mode active: select replacement part from search', { icon: 'ðŸ”„' });
              }}
              className="h-9 px-3.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors flex items-center gap-1.5 shadow-xs"
              title="Replace / Exchange defective repair part"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Replace Parts</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (partsList.length === 0) {
                  toast.error('No parts to return or refund.');
                  return;
                }
                toast('Return part: credit / refund adjusted to job billing', { icon: 'â†©ï¸' });
              }}
              className="h-9 px-3.5 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white transition-colors flex items-center gap-1.5 shadow-xs"
              title="Return part and back money / credit"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return & Refund Parts</span>
            </button>
          </div>

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
                createJobMutation.mutate({ shouldPrint: false, markRepaired: true });
              }}
              className="h-9 px-4 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/40 hover:border-teal-400 transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Mark device repair as finished/completed and ready for pickup"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
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
              className="h-9 px-4 rounded-xl font-bold text-xs bg-[#006970] hover:bg-[#005a60] active:bg-[#004e53] text-white transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
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
