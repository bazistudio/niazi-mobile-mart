'use client';

import React, { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { DynamicMasterSelect } from './master-data/DynamicMasterSelect';
import { useProducts } from '@/features/inventory/hooks/useProducts';

export interface AddProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddProductDrawer({ isOpen, onClose }: AddProductDrawerProps) {
  const { createProduct, isCreating } = useProducts({ page: 1, limit: 10 }, { enabled: false });
  
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
    unit: 'Piece',
    minStockThreshold: '2',
    trackInventory: true,
    
    purchasePrice: '',
    price: '',
    
    // Advanced
    serialTracking: false,
    imeiTracking: false,
    batchTracking: false,
    expiryTracking: false,
    costMethod: 'Average Cost'
  });


  // Load remembered master data on open
  useEffect(() => {
    if (isOpen) {
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

      await createProduct({
        ...formData,
        purchasePrice: Number(formData.purchasePrice) || 0,
        price: Number(formData.price) || 0,
        quantity: Number(formData.quantity) || 0,
        lowStockThreshold: Number(formData.minStockThreshold) || 2
      });
      
      // Reset main fields but keep master data
      setFormData(prev => ({
        ...prev,
        name: '', productCode: '', sku: '', barcode: '', description: '',
        quantity: '', purchasePrice: '', price: ''
      }));
      onClose();
    } catch (err) {
      console.error('Failed to create product', err);
    }
  };

  const isValid = formData.name.trim() !== '' && formData.price !== '' && formData.quantity !== '' && formData.categoryId !== '';

  const margin = (Number(formData.price) || 0) - (Number(formData.purchasePrice) || 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-[1050px] h-[750px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-end px-4 pt-4 pb-0">
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-8">
              
              {/* Section 1: Basic Information (Includes Pricing) */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">1. Basic Information</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product Name *</label>
                    <input
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
                          type="text"
                          value={formData.productCode}
                          onChange={(e) => handleChange('productCode', e.target.value)}
                          placeholder="PRD-0001"
                          className="block w-full px-3 py-2 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                        />
                        <button 
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
                      <DynamicMasterSelect showAddButton hideAllOption entity="category" value={formData.categoryId} onChange={(v) => handleChange('categoryId', v)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                      <DynamicMasterSelect showAddButton hideAllOption entity="brand" value={formData.brandId} onChange={(v) => handleChange('brandId', v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
                      <DynamicMasterSelect showAddButton hideAllOption entity="company" value={formData.companyId} onChange={(v) => handleChange('companyId', v)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                      <DynamicMasterSelect showAddButton hideAllOption entity="color" value={formData.colorId} onChange={(v) => handleChange('colorId', v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quality</label>
                      <DynamicMasterSelect showAddButton hideAllOption entity="quality" value={formData.qualityId} onChange={(v) => handleChange('qualityId', v)} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 3: Inventory */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">3. Inventory</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Open Stock *</label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => handleChange('quantity', e.target.value)}
                        placeholder="0"
                        className="block w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
                      <select
                        value={formData.unit}
                        onChange={(e) => handleChange('unit', e.target.value)}
                        className="block w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-[#006970] focus:border-[#006970] dark:bg-gray-800 dark:text-white sm:text-sm"
                      >
                        <option>Piece</option>
                        <option>Box</option>
                        <option>Kg</option>
                        <option>Meter</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Alert</label>
                      <input
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
                </div>
              </section>

              {/* Section 4: Advanced Inventory Settings */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">4. Advanced Settings</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input type="checkbox" id="serialTracking" checked={formData.serialTracking} onChange={(e) => handleChange('serialTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="serialTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Serial Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="imeiTracking" checked={formData.imeiTracking} onChange={(e) => handleChange('imeiTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="imeiTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">IMEI Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="batchTracking" checked={formData.batchTracking} onChange={(e) => handleChange('batchTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="batchTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Batch Tracking</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="expiryTracking" checked={formData.expiryTracking} onChange={(e) => handleChange('expiryTracking', e.target.checked)} className="h-4 w-4 text-[#006970] rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                      <label htmlFor="expiryTracking" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Expiry Tracking</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 mt-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cost Method</label>
                      <select
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
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
          >
            Cancel
          </button>
          <button
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
