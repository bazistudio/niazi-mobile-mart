"use client";

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { FloatingLabelInput } from '@/components/ui/FloatingLabelInput';
import { customerApi } from '@/services/customer.api';
import { DBCustomer } from '@/types/db.types';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { invalidateQueries } from '@/lib/react-query/invalidate';

interface CustomerFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customers: DBCustomer[];
  editingCustomer?: DBCustomer | null;
}

export const CustomerFormDrawer: React.FC<CustomerFormDrawerProps> = ({ isOpen, onClose, customers, editingCustomer }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    cnic: '',
    notes: '',
    creditLimit: '100000',
  });

  useEffect(() => {
    if (editingCustomer && isOpen) {
      setFormData({
        name: editingCustomer.name || '',
        phone: editingCustomer.phone || '',
        email: editingCustomer.email || '',
        address: editingCustomer.address || '',
        cnic: (editingCustomer as any).cnic || '',
        notes: (editingCustomer as any).notes || '',
        creditLimit: editingCustomer.creditLimit?.toString() || '0',
      });
    } else if (isOpen) {
      setFormData({ name: '', phone: '', email: '', address: '', cnic: '', notes: '', creditLimit: '100000' });
    }
  }, [editingCustomer, isOpen]);

  const [phoneError, setPhoneError] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);

  // Validate phone uniqueness while typing
  useEffect(() => {
    if (formData.phone.length > 5) {
      const exists = customers.some(c => 
        (c.phone === formData.phone || c.mobile === formData.phone) && 
        (c.id || c._id) !== (editingCustomer?.id || editingCustomer?._id)
      );
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
  }, [formData.phone, customers]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<DBCustomer>) => 
      editingCustomer 
        ? customerApi.updateCustomer(editingCustomer.id, data as any) 
        : customerApi.addCustomer(data as any),
    onSuccess: () => {
      invalidateQueries.customers(queryClient, user);
      toast.success(`Customer ${editingCustomer ? 'updated' : 'added'} successfully!`);
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || `Failed to ${editingCustomer ? 'update' : 'add'} customer`);
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
      email: formData.email,
      address: formData.address,
      creditLimit: parseInt(formData.creditLimit) || 0,
    } as any);
  };

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(
      formData.name !== (editingCustomer?.name || '') ||
      formData.phone !== (editingCustomer?.phone || '') ||
      formData.email !== (editingCustomer?.email || '') ||
      formData.address !== (editingCustomer?.address || '')
    );
  }, [formData, editingCustomer]);

  const handleClose = () => {
    if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to close?")) {
      return;
    }
    onClose();
  };

  return (
    <SlideOverDrawer isOpen={isOpen} onClose={handleClose} title={editingCustomer ? "Edit Customer" : "Add New Customer"}>
      {/* ERP Summary Card */}
      <div className="bg-gradient-to-br from-[#006970]/10 to-blue-50 dark:from-[#006970]/20 dark:to-blue-900/10 rounded-xl p-5 mb-6 border border-[#006970]/20 dark:border-[#006970]/30 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm shrink-0 text-[#006970] dark:text-[#00B4BB]">
          <UserCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">{editingCustomer ? 'Edit Customer Profile' : 'New Customer Profile'}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            Track credit sales, ledger balances, and purchase history.
          </p>
        </div>
      </div>

      <form id="customer-form" onSubmit={handleSubmit} className="space-y-8 pb-20">
        
        {/* Basic Information Section */}
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">Basic Information</h4>
          <div className="space-y-4">
            <FloatingLabelInput 
              label="Customer Name *" 
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
            
            <FloatingLabelInput 
              label="Physical Address" 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />

            <FloatingLabelInput 
              label="CNIC (Optional)" 
              value={formData.cnic}
              onChange={e => setFormData({...formData, cnic: e.target.value})}
            />
          </div>
        </section>

        {/* Financial Settings Section */}
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">Financial Settings</h4>
          <div className="space-y-4">
            <FloatingLabelInput 
              label="Credit Limit (Rs)" 
              type="number"
              min="0"
              value={formData.creditLimit}
              onChange={e => setFormData({...formData, creditLimit: e.target.value})}
            />
            
            {!editingCustomer && (
              <div className="relative mb-1 w-full opacity-60">
                <input
                  disabled
                  value="0"
                  className="peer block w-full appearance-none rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 pb-2 pt-6 text-sm text-gray-500 cursor-not-allowed"
                />
                <label className="absolute left-4 top-4 z-10 origin-[0] -translate-y-3 scale-75 transform text-sm text-gray-500">
                  Opening Balance (Read Only)
                </label>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 px-1">
                  <AlertCircle className="w-3 h-3" /> New customers always start with a zero ledger balance.
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
          onClick={handleClose}
          className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button 
          form="customer-form"
          type="submit"
          disabled={saveMutation.isPending || !!phoneError}
          className="px-5 py-2.5 rounded-lg bg-[#006970] text-white font-medium hover:bg-[#00585e] transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Customer'}
        </button>
      </div>
    </SlideOverDrawer>
  );
};
