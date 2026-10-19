'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../services/repair.api';
import { FinishRepairPayload } from '../types/repair.types';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Wrench,
  FileText,
  Download,
  User,
  DollarSign,
  Trash2,
  Plus,
  AlertTriangle,
  X,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Finish / Deliver modal
// ---------------------------------------------------------------------------
interface FinishModalProps {
  job: any;
  onClose: () => void;
  onConfirm: (payload: FinishRepairPayload) => void;
  isPending: boolean;
}

const FinishDeliverModal: React.FC<FinishModalProps> = ({ job, onClose, onConfirm, isPending }) => {
  const [discount, setDiscount] = useState<number>(job.discount ?? 0);
  const [additionalCharges, setAdditionalCharges] = useState<number>(job.additionalCharges ?? 0);
  const [paymentAmount, setPaymentAmount] = useState<number>(Math.max(0, job.remainingBalance ?? 0));
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [confirmBalance, setConfirmBalance] = useState<boolean>(false);

  const grandTotal = job.grandTotal + additionalCharges - discount;
  const alreadyPaid = job.totalPaid ?? 0;
  const settlementAmount = paymentAmount;
  const outstanding = Math.max(0, grandTotal - alreadyPaid - settlementAmount);

  const handleSubmit = () => {
    if (outstanding > 0 && !confirmBalance) {
      toast.error('Tick the checkbox to confirm you accept delivering with an outstanding balance.');
      return;
    }
    const payload: FinishRepairPayload = {
      discount: discount > 0 ? discount : undefined,
      additional_charges: additionalCharges > 0 ? additionalCharges : undefined,
      settlement_payment: settlementAmount > 0
        ? { amount: settlementAmount, method: paymentMethod, reference: paymentReference || null }
        : null,
      delivery_notes: deliveryNotes.trim() || null,
    };
    onConfirm(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-modal flex flex-col overflow-hidden text-text-primary">
        {/* Header */}
        <div className="px-5 py-3 bg-gradient-to-r from-primary to-primary-hover flex items-center justify-between text-white shrink-0">
          <h2 className="text-base font-bold">Finish &amp; Deliver Repair — {job.jobId}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Billing adjustments */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Discount (Rs)</label>
              <input
                type="number"
                min="0"
                value={discount || ''}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Additional Charges (Rs)</label>
              <input
                type="number"
                min="0"
                value={additionalCharges || ''}
                onChange={(e) => setAdditionalCharges(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Financial summary */}
          <div className="rounded-xl bg-background border border-border p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Parts + Labor</span>
              <span>Rs {(job.grandTotal ?? 0).toLocaleString()}</span>
            </div>
            {additionalCharges > 0 && (
              <div className="flex justify-between text-warning">
                <span>Additional Charges</span>
                <span>+ Rs {additionalCharges.toLocaleString()}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount</span>
                <span>- Rs {discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-border pt-2">
              <span>Grand Total</span>
              <span>Rs {grandTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-success">
              <span>Already Paid</span>
              <span>Rs {alreadyPaid.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-warning font-bold border-t border-border pt-2">
              <span>Outstanding Before Settlement</span>
              <span>Rs {Math.max(0, grandTotal - alreadyPaid).toLocaleString()}</span>
            </div>
          </div>

          {/* Settlement payment */}
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1">Settlement Payment Amount (Rs)</label>
            <input
              type="number"
              min="0"
              value={paymentAmount || ''}
              onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-8 px-2 text-xs rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-primary"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank">Bank</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Reference (optional)</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Txn ID / receipt #"
                className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1">Delivery Notes (optional)</label>
            <textarea
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="e.g. Screen replaced, warranty 30 days"
              className="w-full p-2 rounded-lg bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Outstanding balance warning */}
          {outstanding > 0 && (
            <div className="rounded-xl bg-warning/10 border border-warning/40 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-warning">Outstanding Balance: Rs {outstanding.toLocaleString()}</p>
                  <p className="text-text-secondary mt-0.5">
                    This balance will remain attached to the repair job only. It will <strong>not</strong> be posted
                    to the customer&apos;s permanent ledger account.
                  </p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmBalance}
                      onChange={(e) => setConfirmBalance(e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-semibold">I confirm delivering with this outstanding balance</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 bg-surface border-t border-border flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 px-4 rounded-xl font-bold text-xs bg-surface-hover hover:bg-border text-text-secondary border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-9 px-5 rounded-xl font-bold text-xs bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {isPending ? 'Delivering...' : 'Confirm Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Add Part modal (for RepairProfile parts tab)
// ---------------------------------------------------------------------------
interface AddPartModalProps {
  repairId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const AddPartModal: React.FC<AddPartModalProps> = ({ repairId, onClose, onSuccess }) => {
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [cost, setCost] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  const addPartMutation = useMutation({
    mutationFn: () =>
      repairApi.addPart(repairId, {
        productName: productName.trim() || 'Manual Part',
        qty,
        cost,
        price,
      }),
    onSuccess: () => {
      toast.success('Part added successfully');
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to add part');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-modal flex flex-col overflow-hidden text-text-primary">
        <div className="px-4 py-3 bg-gradient-to-r from-primary to-primary-hover flex items-center justify-between text-white">
          <h3 className="text-sm font-bold">Add Part to Repair</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1">Part / Material Name</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Samsung A52 Screen"
              className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Qty</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full h-8 px-2 text-center rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Cost (Rs)</label>
              <input
                type="number"
                min="0"
                value={cost || ''}
                onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2 text-right rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">Price (Rs)</label>
              <input
                type="number"
                min="0"
                value={price || ''}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full h-8 px-2 text-right rounded-lg bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs font-bold bg-surface-hover border border-border text-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => addPartMutation.mutate()}
            disabled={addPartMutation.isPending || !productName.trim()}
            className="h-8 px-4 rounded-lg text-xs font-bold bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50"
          >
            {addPartMutation.isPending ? 'Adding...' : 'Add Part'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main RepairProfile component
// ---------------------------------------------------------------------------
export const RepairProfile = ({ repairId }: { repairId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'timeline' | 'parts' | 'labor' | 'payments' | 'notes'>('timeline');
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [removingPartId, setRemovingPartId] = useState<string | null>(null);

  const { data: job, isLoading } = useQuery({
    queryKey: ['repairJob', repairId],
    queryFn: () => repairApi.getRepairJobById(repairId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, note }: { status: string; note: string }) =>
      repairApi.updateStatus(repairId, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairJob', repairId] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success('Status updated');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update status');
    },
  });

  const removePartMutation = useMutation({
    mutationFn: (partId: string) => repairApi.removePart(repairId, partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairJob', repairId] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      toast.success('Part removed and stock restored');
      setRemovingPartId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to remove part');
      setRemovingPartId(null);
    },
  });

  const finishMutation = useMutation({
    mutationFn: (payload: FinishRepairPayload) => repairApi.finishRepair(repairId, payload),
    onSuccess: (updatedJob) => {
      queryClient.invalidateQueries({ queryKey: ['repairJob', repairId] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      setShowFinishModal(false);
      toast.success(`Repair delivered! Invoice: ${updatedJob.invoiceNumber || 'assigned'}`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to deliver repair');
    },
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading repair profile...</div>;
  if (!job) return <div className="p-8 text-center text-red-500">Repair job not found.</div>;

  const handleStatusChange = (newStatus: string) => {
    // Delivery must go through the Finish/Deliver modal — not via generic status
    if (newStatus === 'Delivered') {
      setShowFinishModal(true);
      return;
    }
    const note = prompt(`Enter optional note for changing status to ${newStatus}:`);
    if (note !== null) {
      statusMutation.mutate({ status: newStatus, note });
    }
  };

  const handleRemovePartClick = (partId: string) => {
    setRemovingPartId(partId);
  };

  const handleConfirmRemovePart = (partId: string) => {
    removePartMutation.mutate(partId);
  };

  const isTerminal = job.status === 'Delivered' || job.status === 'Cancelled' || job.status === 'Rejected';

  const settlementBadgeColor = (s: string) => {
    if (s === 'PAID') return 'bg-success/20 text-success';
    if (s === 'PARTIALLY_PAID') return 'bg-warning/20 text-warning';
    if (s === 'CREDIT') return 'bg-info/20 text-info';
    return 'bg-danger/20 text-danger';
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 animate-in fade-in">

      {/* Finish/Deliver Modal */}
      {showFinishModal && (
        <FinishDeliverModal
          job={job}
          onClose={() => setShowFinishModal(false)}
          onConfirm={(payload) => finishMutation.mutate(payload)}
          isPending={finishMutation.isPending}
        />
      )}

      {/* Add Part Modal */}
      {showAddPartModal && (
        <AddPartModal
          repairId={repairId}
          onClose={() => setShowAddPartModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['repairJob', repairId] });
            queryClient.invalidateQueries({ queryKey: ['repairs'] });
          }}
        />
      )}

      {/* Remove Part Confirmation */}
      {removingPartId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-modal p-6 text-text-primary space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <h3 className="font-bold text-base">Remove Part?</h3>
            </div>
            <p className="text-sm text-text-secondary">
              Removing this part will compensate stock back to inventory (backend transaction).
              This cannot be undone on a terminal job.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemovingPartId(null)}
                className="h-9 px-4 rounded-xl font-bold text-xs bg-surface-hover border border-border text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmRemovePart(removingPartId)}
                disabled={removePartMutation.isPending}
                className="h-9 px-4 rounded-xl font-bold text-xs bg-danger hover:bg-danger/90 text-white disabled:opacity-50"
              >
                {removePartMutation.isPending ? 'Removing...' : 'Remove Part'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/shop-admin/repairs')}
            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
              {job.jobId}
              <span className="px-2.5 py-1 text-sm font-bold bg-[#006970] text-white rounded-full ml-2">
                {job.status}
              </span>
              {job.settlementStatus && (
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${settlementBadgeColor(job.settlementStatus)}`}>
                  {job.settlementStatus.replace('_', ' ')}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Created {format(new Date(job.createdAt), 'PPP p')}
              {job.deliveredAt && (
                <span className="ml-3 text-success font-medium">
                  Delivered {format(new Date(job.deliveredAt), 'PPP p')}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm">
            <Download className="w-4 h-4" /> Print Job Card
          </button>

          {/* Finish / Deliver action — only for non-delivered jobs */}
          {!isTerminal && (
            <button
              type="button"
              onClick={() => setShowFinishModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition-colors text-sm shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Finish &amp; Deliver
            </button>
          )}

          {/* Status change — excludes Delivered (handled by Finish modal) */}
          {!isTerminal && (
            <select
              className="px-4 py-2 bg-surface border border-border text-text-primary font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer text-sm"
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="Received">Received</option>
              <option value="Diagnosing">Diagnosing</option>
              <option value="Waiting Customer Approval">Waiting Approval</option>
              <option value="Waiting Parts">Waiting Parts</option>
              <option value="Repair In Progress">Repair In Progress</option>
              <option value="Quality Check">Quality Check</option>
              <option value="Ready for Pickup">Ready for Pickup</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Summary Cards */}
        <div className="lg:col-span-1 space-y-5">

          {/* Customer & Device */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
              <User className="w-4 h-4" /> Customer &amp; Device
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Customer</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  {job.customerId?.name || job.customerId?.contactPerson || job.customerId?.customerName || 'Walk-in Customer'}
                </p>
                {(job.customerId?.phone || job.customerId?.customerPhone) && (
                  <p className="text-gray-600 dark:text-gray-400">{job.customerId?.phone || job.customerId?.customerPhone}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Device</p>
                <p className="font-bold text-gray-900 dark:text-white">{job.device?.brand} {job.device?.model}</p>
                {job.device?.imei && (
                  <p className="text-gray-600 dark:text-gray-400 font-mono text-xs">IMEI: {job.device.imei}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Problem</p>
                <p className="text-gray-800 dark:text-gray-200">{job.problemDescription}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Priority</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">{job.priority}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
              <DollarSign className="w-4 h-4" /> Financial Summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Parts Cost</span>
                <span className="font-medium">Rs {(job.partsTotal ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Labor Charges</span>
                <span className="font-medium">Rs {(job.laborTotal ?? 0).toLocaleString()}</span>
              </div>
              {(job.additionalCharges ?? 0) > 0 && (
                <div className="flex justify-between text-warning">
                  <span>Additional Charges</span>
                  <span>Rs {job.additionalCharges.toLocaleString()}</span>
                </div>
              )}
              {(job.discount ?? 0) > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount</span>
                  <span>- Rs {job.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                <span className="font-bold">Grand Total</span>
                <span className="font-bold text-[#006970]">Rs {(job.grandTotal ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span className="font-medium">Total Paid</span>
                <span className="font-medium">Rs {(job.totalPaid ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700 text-orange-600">
                <span className="font-bold">Remaining</span>
                <span className="font-bold">Rs {(job.remainingBalance ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Delivery Info (only after delivery) */}
          {job.invoiceNumber && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <FileText className="w-4 h-4" /> Delivery Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice #</span>
                  <span className="font-bold text-primary">{job.invoiceNumber}</span>
                </div>
                {job.deliveredAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Delivered At</span>
                    <span className="font-medium">{format(new Date(job.deliveredAt), 'PPp')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Settlement</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${settlementBadgeColor(job.settlementStatus)}`}>
                    {job.settlementStatus?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Tabs */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col min-h-[500px]">

            {/* Tabs Header */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto">
              {[
                { id: 'timeline', label: 'Timeline', icon: Clock },
                { id: 'parts', label: 'Parts Used', icon: Wrench },
                { id: 'labor', label: 'Labor', icon: CheckCircle },
                { id: 'payments', label: 'Payments', icon: DollarSign },
                { id: 'notes', label: 'Notes', icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#006970] text-[#006970] bg-white dark:bg-gray-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto">

              {/* Timeline Tab */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {job.timeline.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-8">No timeline events yet.</p>
                  )}
                  {job.timeline.slice().reverse().map((event: any, idx: number) => (
                    <div key={event._id || idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-[#006970] ring-4 ring-[#006970]/20" />
                        {idx !== job.timeline.length - 1 && (
                          <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 my-1" />
                        )}
                      </div>
                      <div className="pb-5">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{event.status}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(event.timestamp), 'PPp')} by {event.user?.name || 'System'}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                          {event.description}
                        </p>
                        {event.note && (
                          <p className="text-xs italic text-gray-500 mt-1">Note: {event.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Parts Tab */}
              {activeTab === 'parts' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">Parts &amp; Materials</h3>
                    {!isTerminal && (
                      <button
                        type="button"
                        onClick={() => setShowAddPartModal(true)}
                        className="flex items-center gap-1.5 text-sm font-bold text-[#006970] bg-[#006970]/10 px-3 py-1.5 rounded-lg hover:bg-[#006970]/20 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Part (Deducts Stock)
                      </button>
                    )}
                  </div>

                  {job.partsUsed.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No parts added yet.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2">Part</th>
                          <th className="px-4 py-2 text-center">Qty</th>
                          <th className="px-4 py-2 text-right">Cost</th>
                          <th className="px-4 py-2 text-right">Price</th>
                          <th className="px-4 py-2 text-right">Total</th>
                          <th className="px-4 py-2 text-center">Stock</th>
                          {!isTerminal && <th className="px-4 py-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {job.partsUsed.map((part: any) => (
                          <tr key={part._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3 font-medium">
                              {part.productId?.name || 'Manual Part'}
                              {part.productId?.sku && (
                                <div className="text-[10px] text-gray-400 font-mono">{part.productId.sku}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">{part.qty}</td>
                            <td className="px-4 py-3 text-right text-gray-500">Rs {(part.cost ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">Rs {(part.price ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold">
                              Rs {((part.qty ?? 1) * (part.price ?? 0)).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {part.stockDeducted ? (
                                <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">DEDUCTED</span>
                              ) : (
                                <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">MANUAL</span>
                              )}
                            </td>
                            {!isTerminal && (
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePartClick(part._id)}
                                  className="p-1.5 text-gray-400 hover:text-danger transition-colors rounded"
                                  title="Remove part"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 dark:border-gray-700">
                        <tr>
                          <td colSpan={!isTerminal ? 4 : 3} className="px-4 py-2 text-xs text-gray-500 font-bold uppercase">
                            Parts Total
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-[#006970]">
                            Rs {(job.partsTotal ?? 0).toLocaleString()}
                          </td>
                          <td colSpan={!isTerminal ? 2 : 1} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* Labor Tab */}
              {activeTab === 'labor' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">Labor Charges</h3>
                  </div>
                  {(!job.laborCharges || job.laborCharges.length === 0) ? (
                    <div className="text-center py-12 text-gray-400">
                      <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No labor charges recorded.</p>
                      <p className="text-xs text-gray-500 mt-1">Labor charges are managed through the job contract.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Description</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {job.laborCharges.map((lc: any) => (
                          <tr key={lc._id}>
                            <td className="px-4 py-3">{lc.description}</td>
                            <td className="px-4 py-3 text-right font-medium">Rs {(lc.amount ?? 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 dark:border-gray-700">
                        <tr>
                          <td className="px-4 py-2 font-bold text-xs uppercase text-gray-500">Labor Total</td>
                          <td className="px-4 py-2 text-right font-bold text-[#006970]">
                            Rs {(job.laborTotal ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === 'payments' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">Payment History</h3>
                    <div className="text-sm text-gray-500">
                      Total Paid: <span className="font-bold text-success">Rs {(job.totalPaid ?? 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {(!job.payments || job.payments.length === 0) ? (
                    <div className="text-center py-12 text-gray-400">
                      <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No payments recorded yet.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Date &amp; Time</th>
                          <th className="px-4 py-2 text-left">Method</th>
                          <th className="px-4 py-2 text-left">Reference</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {job.payments.map((pmt: any) => (
                          <tr key={pmt._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {pmt.timestamp ? format(new Date(pmt.timestamp), 'PPp') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                                {pmt.method || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                              {pmt.reference || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-success">
                              Rs {(pmt.amount ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 dark:border-gray-700">
                        <tr>
                          <td colSpan={3} className="px-4 py-2 font-bold text-xs uppercase text-gray-500">Total Received</td>
                          <td className="px-4 py-2 text-right font-bold text-success">
                            Rs {(job.totalPaid ?? 0).toLocaleString()}
                          </td>
                        </tr>
                        {(job.remainingBalance ?? 0) > 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-2 font-bold text-xs uppercase text-orange-600">
                              Outstanding (Job Only — not posted to ledger)
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-orange-600">
                              Rs {job.remainingBalance.toLocaleString()}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  {job.internalNotes && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Internal Notes</h4>
                      <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                        {job.internalNotes}
                      </p>
                    </div>
                  )}
                  {job.customerNotes && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Customer Notes</h4>
                      <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                        {job.customerNotes}
                      </p>
                    </div>
                  )}
                  {!job.internalNotes && !job.customerNotes && (
                    <div className="text-center py-12 text-gray-400">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No notes on this job.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
