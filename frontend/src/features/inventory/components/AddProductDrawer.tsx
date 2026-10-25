'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Package, Building2, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { DynamicMasterSelect } from './master-data/DynamicMasterSelect';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useInventoryStore } from '@/features/inventory/core/inventory.store';
import { httpClient } from '@/lib/http/httpClient';
import type { Branch } from '@/lib/tauri/tauriClient';

export interface AddProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddProductDrawer({ isOpen, onClose }: AddProductDrawerProps) {
  const { createProduct, isCreating } = useProducts({ page: 1, limit: 10 }, { enabled: false });
  const fetchProducts = useInventoryStore((state) => state.fetchProducts);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);
  const [branchLoadError, setBranchLoadError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    productCode: '',
    sku: '',
    barcode: '',
    description: '',
    
    categoryId: '',
    brandId: '',
    companyId: '',
    colorId: '',
    qualityId: '',
    
    quantity: '',
    branchId: '',
    minStockThreshold: '2',
    trackInventory: true,
    
    purchasePrice: '',
    price: '',
    
    // Compatible Models
    compatibleModels: [] as string[],
    newModelInput: '',
    
    // Advanced
    serialTracking: false,
    imeiTracking: false,
    batchTracking: false,
    expiryTracking: false,
    costMethod: 'Average Cost'
  });


  // Load branches for stock destination selection
  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      setIsLoadingBranches(true);
      setBranchLoadError(null);
      httpClient.get<Branch[]>('/api/v1/branches')
        .then((list) => {
          if (cancelled) return;
          if (list && list.length > 0) {
            setBranches(list);
            setFormData((prev) => {
              if (prev.branchId) return prev;
              const warehouseBranch =
                list.find((b) => b.id === '00000000-0000-0000-0000-000000000003') ||
                list.find((b) => b.code === 'WAREHOUSE' || b.name.toLowerCase().includes('warehouse'));
              const mainBranch =
                list.find((b) => b.code === 'MAIN' || b.name.toLowerCase().includes('main')) ||
                list[0];
              const defaultBranch = warehouseBranch ?? mainBranch;
              return { ...prev, branchId: defaultBranch ? defaultBranch.id : '' };
            });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('[AddProductDrawer] Failed to load branches:', err);
            setBranchLoadError('Failed to load branches');
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingBranches(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Load remembered master data on open and focus product name
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
      try {
        const remembered = localStorage.getItem('niazi_last_product_masters') || localStorage.getItem('tijaratpro_last_product_masters');
        if (remembered) {
          const parsed = JSON.parse(remembered);
          setFormData(prev => ({
            ...prev,
            categoryId: parsed.categoryId || '',
            brandId: parsed.brandId || '',
            companyId: parsed.companyId || '',
            colorId: parsed.colorId || '',
            qualityId: parsed.qualityId || ''
          }));
        }
      } catch (e) {
        // ignore
      }
    }
  }, [isOpen]);

  // Add ESC key listener
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateCode = () => {
    const code = 'PRD-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    handleChange('productCode', code);
  };

  const handleSave = async () => {
    try {
      // Remember selections for next time
      localStorage.setItem('niazi_last_product_masters', JSON.stringify({
        categoryId: formData.categoryId,
        brandId: formData.brandId,
        companyId: formData.companyId,
        colorId: formData.colorId,
        qualityId: formData.qualityId
      }));

      const effectiveProductCode = formData.productCode.trim() || ('PRD-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'));

      await createProduct({
        ...formData,
        productCode: effectiveProductCode,
        sku: formData.sku.trim() || effectiveProductCode,
        purchasePrice: Number(formData.purchasePrice) || 0,
        price: Number(formData.price) || 0,
        quantity: Number(formData.quantity) || 0,
        branchId: formData.branchId || undefined,
        branch_id: formData.branchId || undefined,
        lowStockThreshold: Number(formData.minStockThreshold) || 2,
        compatible_models: formData.compatibleModels,
      });
      
      toast.success('Product created! Ready for next product.');

      // Refresh products table in background so new item appears immediately
      try {
        fetchProducts({ scope: 'organization' });
      } catch (e) {
        // ignore
      }

      // Reset fields for the next product entry while preserving category/brand selections
      setFormData(prev => ({
        ...prev,
        name: '', productCode: '', sku: '', barcode: '', description: '',
        quantity: '', purchasePrice: '', price: '', compatibleModels: [], newModelInput: ''
      }));

      // Auto focus back to Product Name for rapid consecutive entry
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      // Retain modal open for rapid consecutive product intake; user closes manually
    } catch (err: any) {
      console.error('[AddProductDrawer] Failed to create product:', err);
      const errMsg = err?.response?.data?.message || err?.message || (typeof err === 'string' ? err : '') || String(err) || 'Failed to create product';
      toast.error(`Product Creation Failed: ${errMsg}`);
    }
  };

  const isValid = formData.name.trim() !== '' && formData.price !== '' && formData.quantity !== '' && formData.categoryId !== '';

  const margin = (Number(formData.price) || 0) - (Number(formData.purchasePrice) || 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[1150px] min-h-[500px] my-auto flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800/80 gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Product</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configure catalog specifications, pricing, and inventory tracking</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Destination Branch in Header */}
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Building2 className="w-4 h-4 text-[#006970] dark:text-[#00B4BB] shrink-0" />
              <select
                tabIndex={-1}
                value={formData.branchId}
                onChange={(e) => handleChange('branchId', e.target.value)}
                disabled={isLoadingBranches || branches.length === 0}
                className="bg-transparent text-xs font-semibold text-gray-900 dark:text-white focus:outline-none cursor-pointer pr-1 py-0.5"
              >
                {isLoadingBranches && <option value="">Loading branches...</option>}
                {!isLoadingBranches && branches.length === 0 && <option value="">No branches available</option>}
                {!isLoadingBranches && branches.map((b) => (
                  <option key={b.id} value={b.id} className="dark:bg-gray-800 text-gray-900 dark:text-white">
                    {b.name} {b.is_warehouse === 1 || b.id === '00000000-0000-0000-0000-000000000003' ? '(Warehouse)' : b.code ? `(${b.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body with auto-layout and adaptive scrolling only if screen height is exceeded */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 flex flex-col max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-8">
              
              {/* Section 1: Basic Information (Includes Pricing) */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">1. Basic Information</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product Name *</label>
                    <input
                      ref={nameInputRef}
                      tabIndex={1}
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="e.g. Samsung A55"
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purchase Price</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">Rs.</span>
                        </div>
                        <input
                          tabIndex={2}
                          type="number"
                          value={formData.purchasePrice}
                          onChange={(e) => handleChange('purchasePrice', e.target.value)}
                          placeholder="0.00"
                          className="block w-full pl-9 pr-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sale Price *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">Rs.</span>
                        </div>
                        <input
                          tabIndex={3}
                          type="number"
                          value={formData.price}
                          onChange={(e) => handleChange('price', e.target.value)}
                          placeholder="0.00"
                          className="block w-full pl-9 pr-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  {margin > 0 && (
                    <div className="mt-0.5 text-sm text-green-600 dark:text-green-400 font-medium text-right">
                      Margin: Rs. {margin.toLocaleString()}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product Code</label>
                      <div className="flex">
                        <input
                          tabIndex={-1}
                          type="text"
                          value={formData.productCode}
                          onChange={(e) => handleChange('productCode', e.target.value)}
                          placeholder="PRD-0001 (Auto)"
                          className="block w-full px-3 py-2 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                        />
                        <button 
                          type="button"
                          tabIndex={-1}
                          onClick={handleGenerateCode}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-md bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                          Gen
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Barcode / SKU</label>
                      <input
                        tabIndex={-1}
                        type="text"
                        value={formData.barcode}
                        onChange={(e) => handleChange('barcode', e.target.value)}
                        placeholder="Scan / Enter barcode"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea
                      tabIndex={-1}
                      value={formData.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                      rows={4}
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm resize-none"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-8">
              
              {/* Section 2: Product Classification */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">2. Product Classification</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
                      <DynamicMasterSelect tabIndex={4} showAddButton hideAllOption entity="category" value={formData.categoryId} onChange={(v) => handleChange('categoryId', v)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                      <DynamicMasterSelect tabIndex={5} showAddButton hideAllOption entity="brand" value={formData.brandId} onChange={(v) => handleChange('brandId', v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
                      <DynamicMasterSelect tabIndex={6} showAddButton hideAllOption entity="company" value={formData.companyId} onChange={(v) => handleChange('companyId', v)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                      <DynamicMasterSelect tabIndex={7} showAddButton hideAllOption entity="color" value={formData.colorId} onChange={(v) => handleChange('colorId', v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quality</label>
                      <DynamicMasterSelect tabIndex={8} showAddButton hideAllOption entity="quality" value={formData.qualityId} onChange={(v) => handleChange('qualityId', v)} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 3: Inventory */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">3. Inventory</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Open Stock *</label>
                      <input
                        tabIndex={9}
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => handleChange('quantity', e.target.value)}
                        placeholder="0"
                        className="block w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Alert</label>
                      <input
                        tabIndex={10}
                        type="number"
                        value={formData.minStockThreshold}
                        onChange={(e) => handleChange('minStockThreshold', e.target.value)}
                        placeholder="2"
                        className="block w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center pt-1">
                    <input
                      tabIndex={-1}
                      id="trackInventory"
                      type="checkbox"
                      checked={formData.trackInventory}
                      onChange={(e) => handleChange('trackInventory', e.target.checked)}
                      className="h-4 w-4 text-[#006970] focus:ring-[#006970] border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700"
                    />
                    <label htmlFor="trackInventory" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                      Track Inventory
                    </label>
                  </div>

                  {/* Compatible Mobile Models (Spare Parts) */}
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Compatible Mobile Models (Spare Parts)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        tabIndex={-1}
                        type="text"
                        value={formData.newModelInput}
                        onChange={(e) => handleChange('newModelInput', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = formData.newModelInput.trim();
                            if (val && !formData.compatibleModels.includes(val)) {
                              setFormData(prev => ({
                                ...prev,
                                compatibleModels: [...prev.compatibleModels, val],
                                newModelInput: ''
                              }));
                            }
                          }
                        }}
                        placeholder="e.g. Realme C35, Tecno X680 (Press Enter)"
                        className="block flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      />
                      <button
                        tabIndex={-1}
                        type="button"
                        onClick={() => {
                          const val = formData.newModelInput.trim();
                          if (val && !formData.compatibleModels.includes(val)) {
                            setFormData(prev => ({
                              ...prev,
                              compatibleModels: [...prev.compatibleModels, val],
                              newModelInput: ''
                            }));
                          }
                        }}
                        className="px-3 py-1.5 bg-[#006970] text-white text-xs font-semibold rounded-md hover:bg-[#005a60] transition-colors"
                      >
                        + Add Model
                      </button>
                    </div>
                    {formData.compatibleModels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md max-h-24 overflow-y-auto">
                        {formData.compatibleModels.map((m, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/30 dark:text-teal-200 border border-[#006970]/20"
                          >
                            {m}
                            <button
                              tabIndex={-1}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  compatibleModels: prev.compatibleModels.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="hover:text-red-500 font-bold ml-1"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Section 4: Advanced Inventory Settings */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">4. Advanced Settings</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input tabIndex={-1} type="checkbox" id="serialTracking" checked={formData.serialTracking} onChange={(e) => handleChange('serialTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="serialTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Serial Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input tabIndex={-1} type="checkbox" id="imeiTracking" checked={formData.imeiTracking} onChange={(e) => handleChange('imeiTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="imeiTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">IMEI Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input tabIndex={-1} type="checkbox" id="batchTracking" checked={formData.batchTracking} onChange={(e) => handleChange('batchTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="batchTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Batch Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input tabIndex={-1} type="checkbox" id="expiryTracking" checked={formData.expiryTracking} onChange={(e) => handleChange('expiryTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="expiryTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Expiry Tracking</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 mt-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cost Method</label>
                      <select
                        tabIndex={-1}
                        value={formData.costMethod}
                        onChange={(e) => handleChange('costMethod', e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm mb-1.5"
                      >
                        <option value="Average Cost">Average Cost (Recommended)</option>
                        <option value="FIFO">FIFO</option>
                        <option value="LIFO">LIFO</option>
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formData.costMethod === 'Average Cost' && "Uses the average purchase cost of all available stock. Best for most local retail shops."}
                        {formData.costMethod === 'FIFO' && "Uses the oldest purchase cost first. Best for expiry-based inventory and strict inventory accounting."}
                        {formData.costMethod === 'LIFO' && "Uses the latest purchase cost first. Advanced option for specialized accounting."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>

        {/* Bottom Sticky Action */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
          <button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
          >
            Cancel
          </button>
          <button
            tabIndex={11}
            onClick={handleSave}
            disabled={!isValid || isCreating}
            className="px-8 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#006970] hover:bg-[#005a60] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006970] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>
    </div>
  );
}
