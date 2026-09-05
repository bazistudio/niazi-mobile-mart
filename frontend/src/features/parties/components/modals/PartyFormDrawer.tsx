"use client";

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { FloatingLabelInput } from '@/components/ui/FloatingLabelInput';
import { partyApi } from '@/services/party.api';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { invalidateQueries } from '@/lib/react-query/invalidate';

interface PartyFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  parties: any[];
  editingParty?: any;
}

export const PartyFormDrawer: React.FC<PartyFormDrawerProps> = ({ isOpen, onClose, parties, editingParty }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [formData, setFormData] = useState({
    contactPerson: '',
    phone: '',
    companyName: '',
    email: '',
    address: '',
    type: 'BOTH',
    openingBalance: 0,
    openingBalanceType: 'DR'
  });

  useEffect(() => {
    if (editingParty && isOpen) {
      setFormData({
        contactPerson: editingParty.contactPerson || editingParty.name || '',
        phone: editingParty.phone || '',
        companyName: editingParty.companyName || '',
        email: editingParty.email || '',
        address: editingParty.address || '',
        type: editingParty.type || 'BOTH',
        openingBalance: editingParty.openingBalance || 0,
        openingBalanceType: editingParty.openingBalanceType || 'DR'
      });
    } else if (isOpen) {
      setFormData({ contactPerson: '', phone: '', companyName: '', email: '', address: '', type: 'BOTH', openingBalance: 0, openingBalanceType: 'DR' });
    }
  }, [editingParty, isOpen]);

  const [phoneError, setPhoneError] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);

  useEffect(() => {
    if (formData.phone.length > 5) {
      const exists = parties?.some(p => p.phone === formData.phone && (p.id || p._id) !== (editingParty?.id || editingParty?._id));
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
  }, [formData.phone, parties]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => 
      editingParty 
        ? partyApi.updateParty(editingParty.id || editingParty._id, data) 
        : partyApi.addParty(data),
    onSuccess: () => {
      // invalidateQueries.parties does not exist yet so we invalidate directly
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.success(`Party ${editingParty ? 'updated' : 'added'} successfully!`);
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || `Failed to ${editingParty ? 'update' : 'add'} party`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contactPerson || !formData.phone) {
      toast.error('Contact Person and Phone are required');
      return;
    }
    if (phoneError) {
      toast.error('Please fix validation errors');
      return;
    }
    
    saveMutation.mutate({
      ...formData,
      // Pass opening balance only when creating
      ...(editingParty ? {} : {
        openingBalance: Number(formData.openingBalance),
        openingBalanceType: formData.openingBalanceType
      })
    });
  };

  return (
    <SlideOverDrawer isOpen={isOpen} onClose={onClose} title={editingParty ? "Edit Party" : "Add New Party"}>
      <div className="bg-gradient-to-br from-[#006970]/10 to-[#008990]/5 dark:from-[#006970]/20 dark:to-[#008990]/10 rounded-xl p-5 mb-6 border border-[#006970]/20 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm shrink-0 text-[#006970] dark:text-[#00B4BB]">
          <Users className="w-8 h-8" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">{editingParty ? 'Edit Party Profile' : 'New Party Profile'}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            Manage a unified profile for someone acting as a customer, supplier, or both.
          </p>
        </div>
      </div>

      <form id="party-form" onSubmit={handleSubmit} className="space-y-8 pb-20">
        
        {/* Contact Information Section */}
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">Contact Information</h4>
          <div className="space-y-4">
            <FloatingLabelInput 
              label="Contact Person Name *" 
              value={formData.contactPerson}
              onChange={e => setFormData({...formData, contactPerson: e.target.value})}
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

            {!editingParty && (
              <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <h5 className="text-sm font-semibold mb-3">Opening Balance</h5>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <FloatingLabelInput 
                      label="Amount" 
                      type="number"
                      value={formData.openingBalance}
                      onChange={e => setFormData({...formData, openingBalance: Number(e.target.value)})}
                    />
                  </div>
                  <div className="w-1/3">
                    <select 
                      className="block w-full px-4 py-2.5 h-[52px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#006970]"
                      value={formData.openingBalanceType}
                      onChange={(e) => setFormData({...formData, openingBalanceType: e.target.value})}
                    >
                      <option value="DR">Debit (They owe us)</option>
                      <option value="CR">Credit (We owe them)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
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
          form="party-form"
          type="submit"
          disabled={saveMutation.isPending || !!phoneError}
          className="px-5 py-2.5 rounded-lg bg-[#006970] text-white font-medium hover:bg-[#00585e] transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Party'}
        </button>
      </div>
    </SlideOverDrawer>
  );
};
