'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../../services/repair.api';
import { X, Save, Smartphone, User, AlignLeft, DollarSign, Plus } from 'lucide-react';

interface RepairFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RepairFormDrawer: React.FC<RepairFormDrawerProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [partialFailureMessage, setPartialFailureMessage] = useState<string | null>(null);
  const [createdRepairId, setCreatedRepairId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customerId: '', // in a real app, this would be a searchable dropdown component
    customerName: '',
    customerPhone: '',
    device: {
      type: 'Smartphone',
      brand: '',
      model: '',
      color: '',
      imei: '',
      password: ''
    },
    accessories: {
      charger: false,
      battery: false,
      sim: false,
      memoryCard: false,
      cover: false,
      box: false,
      other: ''
    },
    problemDescription: '',
    initialInspection: [] as string[],
    priority: 'Normal' as 'Low' | 'Normal' | 'High' | 'Urgent',
    estimatedCost: 0,
    expectedDeliveryDate: '',
    advancePaymentAmount: 0,
    advancePaymentMethod: 'Cash',
  });

  const handleClose = () => {
    setPartialFailureMessage(null);
    setCreatedRepairId(null);
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen) {
      setPartialFailureMessage(null);
      setCreatedRepairId(null);
    }
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setPartialFailureMessage(null);

      let targetRepairId = createdRepairId;
      let job: any = null;

      // Step 1: Create the repair job only if not already created
      if (!targetRepairId) {
        job = await repairApi.createRepairJob({
          customer_id: formData.customerId || null,
          customer_name: formData.customerName || formData.customerId || 'Walk-in Customer',
          customer_phone: formData.customerPhone || null,
          device: formData.device,
          accessories: formData.accessories,
          problem_description: formData.problemDescription,
          priority: formData.priority,
          estimated_cost: formData.estimatedCost,
          expected_delivery_date: formData.expectedDeliveryDate || null,
        });

        if (!job?.id) {
          throw new Error('Failed to obtain repair job ID from server');
        }
        targetRepairId = job.id;
        setCreatedRepairId(job.id);
      }

      // Step 2: Record advance payment if amount > 0
      const amount = Number(formData.advancePaymentAmount);
      if (amount > 0 && targetRepairId) {
        try {
          await repairApi.addPayment(targetRepairId, {
            amount,
            method: formData.advancePaymentMethod,
          });
        } catch (paymentErr: any) {
          // Repair was created — surface partial failure, retain targetRepairId, do NOT show complete success
          throw Object.assign(
            new Error(
              `Repair job created (ID: ${targetRepairId}) but advance payment of ${amount} was NOT confirmed: ${paymentErr?.message ?? 'Unknown error'}. Please retry payment or record it manually.`
            ),
            { isPartialFailure: true, repairId: targetRepairId }
          );
        }
      }

      return job || { id: targetRepairId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      setCreatedRepairId(null);
      setPartialFailureMessage(null);
      onClose();
    },
    onError: (err: any) => {
      if (err?.isPartialFailure) {
        // Repair was created but payment failed — invalidate list so it shows up,
        // retain createdRepairId in state so retry will NOT recreate the repair job,
        // and display the partial-failure warning.
        queryClient.invalidateQueries({ queryKey: ['repairs'] });
        if (err.repairId) {
          setCreatedRepairId(err.repairId);
        }
        setPartialFailureMessage(err.message);
      }
      // For full create failures, createMutation.error will display the message below.
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return;
    createMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity" onClick={handleClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-50 dark:bg-gray-900 shadow-2xl z-50 transform transition-transform overflow-y-auto custom-scrollbar flex flex-col">

        <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#006970]" />
            New Repair Job
          </h2>
          <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1">
          {/* Partial-failure warning — repair created but payment not confirmed */}
          {partialFailureMessage && (
            <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>Warning:</strong> {partialFailureMessage}
            </div>
          )}

          {/* Full create-failure error */}
          {createMutation.isError && !partialFailureMessage && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-800 dark:text-red-200 text-sm">
              <strong>Error:</strong> {(createMutation.error as any)?.message ?? 'Failed to create repair job.'}
            </div>
          )}

          <form id="repair-form" onSubmit={handleSubmit} className="space-y-8">

            {/* Customer Section */}
            <section className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <User className="w-4 h-4" /> Customer Information
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer ID (Placeholder)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-[#006970]"
                    value={formData.customerId}
                    onChange={e => setFormData({...formData, customerId: e.target.value})}
                    placeholder="Customer UUID (optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name</label>
                  <input
                    type="text" required
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-[#006970]"
                    value={formData.customerName}
                    onChange={e => setFormData({...formData, customerName: e.target.value})}
                    placeholder="Customer full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-[#006970]"
                    value={formData.customerPhone}
                    onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </section>

            {/* Device Info */}
            <section className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <Smartphone className="w-4 h-4" /> Device Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand</label>
                  <input type="text" required value={formData.device.brand} onChange={e => setFormData({...formData, device: {...formData.device, brand: e.target.value}})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                  <input type="text" required value={formData.device.model} onChange={e => setFormData({...formData, device: {...formData.device, model: e.target.value}})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMEI / Serial No</label>
                  <input type="text" value={formData.device.imei} onChange={e => setFormData({...formData, device: {...formData.device, imei: e.target.value}})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password / Pattern</label>
                  <input type="text" value={formData.device.password} onChange={e => setFormData({...formData, device: {...formData.device, password: e.target.value}})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
              </div>
            </section>

            {/* Problem & Inspection */}
            <section className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <AlignLeft className="w-4 h-4" /> Problem & Inspection
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Problem Description</label>
                  <textarea
                    required rows={3}
                    value={formData.problemDescription}
                    onChange={e => setFormData({...formData, problemDescription: e.target.value})}
                    placeholder="E.g., No Display, Water Damage..."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Estimates & Payment */}
            <section className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <DollarSign className="w-4 h-4" /> Estimates & Priority
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Cost</label>
                  <input type="number" required value={formData.estimatedCost} onChange={e => setFormData({...formData, estimatedCost: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Advance Payment</label>
                  <input type="number" min="0" value={formData.advancePaymentAmount} onChange={e => setFormData({...formData, advancePaymentAmount: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
                  <select value={formData.advancePaymentMethod} onChange={e => setFormData({...formData, advancePaymentMethod: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Mobile Payment">Mobile Payment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as 'Low' | 'Normal' | 'High' | 'Urgent'})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Delivery</label>
                  <input type="date" value={formData.expectedDeliveryDate} onChange={e => setFormData({...formData, expectedDeliveryDate: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
                </div>
              </div>
            </section>

          </form>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 sticky bottom-0">
          <button type="button" onClick={handleClose} className="px-6 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="repair-form"
            disabled={createMutation.isPending}
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-[#006970] hover:bg-[#005a60] transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving...' : createdRepairId ? <><Save className="w-4 h-4" /> Retry Advance Payment</> : <><Save className="w-4 h-4" /> Create Repair Job</>}
          </button>
        </div>

      </div>
    </>
  );
};
