"use client";

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { FloatingLabelInput } from '@/components/ui/FloatingLabelInput';
import { supplierApi } from '@/services/supplier.api';
import { DBSupplier } from '@/types/db.types';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { invalidateQueries } from '@/lib/react-query/invalidate';

interface SupplierFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: any[];
  editingSupplier?: any;
}

export const SupplierFormDrawer: React.FC<SupplierFormDrawerProps> = ({ isOpen, onClose, suppliers, editingSupplier }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    companyName: '',
    email: '',
    address: '',
    ntn: '',
    notes: '',
  });

  useEffect(() => {
    if (editingSupplier && isOpen) {
      setFormData({
        name: editingSupplier.name || '',
        phone: editingSupplier.phone || '',
        companyName: editingSupplier.companyName || '',
        email: editingSupplier.email || '',
        address: editingSupplier.address || '',
        ntn: editingSupplier.ntn || '',
        notes: editingSupplier.notes || '',
      });
    } else if (isOpen) {
      setFormData({ name: '', phone: '', companyName: '', email: '', address: '', ntn: '', notes: '' });
    }
  }, [editingSupplier, isOpen]);

  const [phoneError, setPhoneError] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);

  // Validate phone uniqueness while typing
  useEffect(() => {
    if (formData.phone.length > 5) {
      const exists = suppliers.some(s => s.phone === formData.phone && (s.id || s._id) !== (editingSupplier?.id || editingSupplier?._id));
      if (exists) {
        setPhoneError('Phone number already exists in your database');
        setIsPhoneValid(false);
      } else {
        setPhoneError('');
        setIsPhoneValid(true);
      }
    } else {
      setPhoneError('');
      setIsPhoneValid(false);
    }
  }, [formData.phone, suppliers]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => 
      editingSupplier 
        ? supplierApi.updateSupplier(editingSupplier.id || editingSupplier._id, data) 
        : supplierApi.addSupplier(data),
    onSuccess: () => {
      invalidateQueries.suppliers(queryClient, user);
      toast.success(`Supplier ${editingSupplier ? 'updated' : 'added'} successfully!`);
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || `Failed to ${editingSupplier ? 'update' : 'add'} supplier`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast.error('Name and Phone are required');
      return;
    }
    if (phoneError) {
      toast.error('Please fix validation errors');
      return;
    }
    
    // Convert to API model
    saveMutation.mutate({
      name: formData.name,
      phone: formData.phone,
      companyName: formData.companyName,
      email: formData.email,
      address: formData.address,
    } as any);
  };

  return (
    <SlideOverDrawer isOpen={isOpen} onClose={onClose} title={editingSupplier ? "Edit Supplier" : "Add New Supplier"}>
      {/* ERP Summary Card */}
      <div className="bg-gradient-to-br from-indigo-500/10 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/10 rounded-xl p-5 mb-6 border border-indigo-500/20 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm shrink-0 text-indigo-600 dark:text-indigo-400">
          <Building2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">{editingSupplier ? 'Edit Supplier Profile' : 'New Supplier Profile'}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            Track purchases, payables, and procurement records.
          </p>
        </div>
      </div>

      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-8 pb-20">
        
        {/* Contact Information Section */}
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">Contact Information</h4>
          <div className="space-y-4">
            <FloatingLabelInput 
              label="Contact Person Name *" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              required
              autoFocus
            />
            
            <FloatingLabelInput 
              label="Phone Number *" 
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              error={phoneError}
              success={isPhoneValid}
              required
            />
            
            <FloatingLabelInput 
              label="Email Address (Optional)" 
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
        </section>

        {/* Business Details Section */}
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">Business Details</h4>
          <div className="space-y-4">
            <FloatingLabelInput 
              label="Company Name" 
              value={formData.companyName}
              onChange={e => setFormData({...formData, companyName: e.target.value})}
            />

            <FloatingLabelInput 
              label="Physical Address" 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />

            <FloatingLabelInput 
              label="NTN / GST Number (Optional)" 
              value={formData.ntn}
              onChange={e => setFormData({...formData, ntn: e.target.value})}
            />
            
            {!editingSupplier && (
              <div className="relative mb-1 w-full opacity-60">
                <input
                  disabled
                  value="0"
                  className="peer block w-full appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 pb-2 pt-6 text-sm text-gray-500 cursor-not-allowed"
                />
                <label className="absolute left-4 top-4 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-gray-500">
                  Initial Payable (Read Only)
                </label>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 px-1">
                  <AlertCircle className="w-3 h-3" /> New suppliers always start with a zero payable balance.
                </p>
              </div>
            )}

            <div className="relative mb-1 w-full">
              <textarea
                placeholder=" "
                className="peer block w-full appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-4 pb-2 pt-6 text-sm text-gray-900 dark:text-white focus:border-[#006970] focus:outline-none focus:ring-1 focus:ring-[#006970] min-h-[100px] resize-y custom-scrollbar"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
              <label className="absolute left-4 top-4 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 cursor-text peer-focus:text-[#006970]">
                Internal Notes
              </label>
            </div>
          </div>
        </section>

      </form>

      {/* Sticky Footer Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md flex justify-end gap-3 z-10">
        <button 
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button 
          form="supplier-form"
          type="submit"
          disabled={saveMutation.isPending || !!phoneError}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Supplier'}
        </button>
      </div>
    </SlideOverDrawer>
  );
};
