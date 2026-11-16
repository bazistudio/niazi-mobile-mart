'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  CheckCircle2,
  DollarSign,
  Wrench,
  Package,
  UserCheck,
  TrendingUp,
  CreditCard,
  Banknote,
  AlertCircle,
  FileText,
} from 'lucide-react';
import type { RepairJob } from '../../types/repair.types';
import { useStaffSalaryConfig } from '@/features/hr/hooks/useHR';

interface DoneJobSettlementModalProps {
  job: RepairJob;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    settlementAmount: number;
    paymentMethod: string;
    paymentReference?: string;
    deliveryNotes?: string;
    markDelivered: boolean;
  }) => void;
  isPending: boolean;
}

export const DoneJobSettlementModal: React.FC<DoneJobSettlementModalProps> = ({
  job,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}) => {
  if (!isOpen) return null;

  // Resolve technician ID
  const techId =
    typeof job.technicianId === 'string'
      ? job.technicianId
      : (job.technicianId as any)?._id || (job.technicianId as any)?.id || '';

  const { data: salaryConfig } = useStaffSalaryConfig(techId);

  // Configured Commission percentage (default 60% if COMMISSION_PERCENTAGE, fallback 50%)
  const mechanicCommissionPct =
    salaryConfig?.salary_type === 'COMMISSION_PERCENTAGE' && salaryConfig.commission_percentage !== null
      ? Number(salaryConfig.commission_percentage)
      : 60; // Default active standard in system

  const orgSharePct = 100 - mechanicCommissionPct;

  // Financial figures
  const totalBilled = Number(job.grandTotal || job.estimatedCost || 0);
  // Breakdown parts by source: Own Branch Stock vs Open Market Purchase
  const partsUsed = (job.partsUsed as Array<{ qty?: number; cost?: number; price?: number; productId?: any }>) || [];
  
  const ownStockParts = partsUsed.filter((p) => Boolean(p.productId));
  const marketParts = partsUsed.filter((p) => !p.productId);

  const ownStockTotal = ownStockParts.reduce(
    (sum, p) => sum + Number(p.qty || 1) * Number(p.price || p.cost || 0),
    0
  );

  const marketPartsTotal = marketParts.reduce(
    (sum, p) => sum + Number(p.qty || 1) * Number(p.cost || p.price || 0),
    0
  );

  const totalPartsDeduction = ownStockTotal + marketPartsTotal;

  const alreadyPaid = Number(job.totalPaid || 0);
  const remainingDue = Math.max(0, totalBilled - alreadyPaid);

  // Profit / Margin Pool: Customer Billed minus (Own Stock + Market Purchases pass-through)
  const commissionablePool = Math.max(0, totalBilled - totalPartsDeduction);
  const mechanicEarning = Math.floor((commissionablePool * mechanicCommissionPct) / 100);
  const shopEarning = commissionablePool - mechanicEarning;

  // State
  const [paymentAmount, setPaymentAmount] = useState<number>(remainingDue);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [markDelivered, setMarkDelivered] = useState<boolean>(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      settlementAmount: paymentAmount,
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      deliveryNotes: deliveryNotes.trim() || undefined,
      markDelivered,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-primary to-primary-hover flex items-center justify-between text-text-inverse shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Complete &amp; Settle Repair Job</h2>
              <p className="text-[11px] opacity-85">
                {job.jobId} • {job.device?.brand} {job.device?.model}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs text-text-primary">
          {/* Card 1: Job & Customer Brief */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-hover/60 border border-border">
            <div>
              <span className="block text-[10px] uppercase font-semibold text-text-muted">Customer</span>
              <span className="font-bold text-text-primary">
                {(job.customerId as any)?.name || (job as any).customer_name || 'Walk-in Customer'}
              </span>
              <span className="block text-[10px] text-text-muted">
                {(job.customerId as any)?.phone || (job as any).customer_phone || 'No phone'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-semibold text-text-muted">Assigned Technician</span>
              <span className="font-bold text-primary">
                {(job.technicianId as any)?.name || 'Lab Bench'}
              </span>
              <span className="block text-[10px] text-text-muted">
                Config: {mechanicCommissionPct}% Mechanic / {orgSharePct}% Shop
              </span>
            </div>
          </div>

          {/* Card 2: Financial & Profit Breakdown (Clear Transparent Calculations) */}
          <div className="p-3.5 rounded-xl bg-background border border-border space-y-2.5">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary" /> Done Job Profit &amp; Commission Calculation
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                Lab Bench Hold
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Total Customer Billed:</span>
                <span className="font-bold text-text-primary tabular-nums">
                  Rs {totalBilled.toLocaleString()}
                </span>
              </div>

              {ownStockTotal > 0 && (
                <div className="flex justify-between items-center text-text-muted">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-primary" /> Less Own Stock (Org Protected):
                  </span>
                  <span className="text-primary font-semibold tabular-nums">
                    - Rs {ownStockTotal.toLocaleString()}
                  </span>
                </div>
              )}

              {marketPartsTotal > 0 && (
                <div className="flex justify-between items-center text-text-muted">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-warning" /> Less Open Market Parts (Pass-Through):
                  </span>
                  <span className="text-warning font-semibold tabular-nums">
                    - Rs {marketPartsTotal.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center font-bold border-t border-border pt-1.5 text-primary">
                <span>Net Service Profit Pool:</span>
                <span className="tabular-nums">Rs {commissionablePool.toLocaleString()}</span>
              </div>

              {/* Commission Split Box */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-success/10 border border-success/30 text-center">
                  <span className="block text-[10px] font-semibold text-success uppercase">
                    Mechanic Share ({mechanicCommissionPct}%)
                  </span>
                  <span className="text-sm font-black text-success tabular-nums">
                    Rs {mechanicEarning.toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-text-muted">Earned for this job</span>
                </div>

                <div className="p-2 rounded-lg bg-info/10 border border-info/30 text-center">
                  <span className="block text-[10px] font-semibold text-info uppercase">
                    Shop / Org Share ({orgSharePct}%)
                  </span>
                  <span className="text-sm font-black text-info tabular-nums">
                    Rs {shopEarning.toLocaleString()}
                  </span>
                  <span className="block text-[9px] text-text-muted">+ Parts Rs {totalPartsDeduction.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Payment Intake into Lab Cash Register */}
          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-success" /> Lab Cash Register Payment Intake
              </span>
              <span className="text-[10px] text-text-muted">
                Remains in lab cash register
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-text-secondary mb-1">
                  Payment to Collect (Rs)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full h-8 pl-3 pr-2 text-right rounded-lg bg-background border border-border text-xs text-text-primary font-bold focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-text-muted mt-1">
                  <span>Already Paid: Rs {alreadyPaid.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(remainingDue)}
                    className="text-primary font-semibold hover:underline"
                  >
                    Full Balance (Rs {remainingDue.toLocaleString()})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-secondary mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-8 px-2 text-xs rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="Cash">Cash (Lab Bench Hold)</option>
                  <option value="EasyPaisa">EasyPaisa (Lab Wallet)</option>
                  <option value="JazzCash">JazzCash (Lab Wallet)</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
                <span className="block text-[9px] text-text-muted mt-1">
                  Recorded in Lab Register until admin settlement
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-text-secondary mb-1">
                Reference / Note (Optional)
              </label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction ID / Receipt #"
                className="w-full h-7 px-2.5 rounded-lg bg-background border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            {/* Checkbox: Mark as Delivered / Ready */}
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <input
                type="checkbox"
                id="markDeliveredCheck"
                checked={markDelivered}
                onChange={(e) => setMarkDelivered(e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-primary"
              />
              <label htmlFor="markDeliveredCheck" className="text-xs font-semibold text-text-primary cursor-pointer">
                Deliver Device to Customer &amp; Close Repair Job
              </label>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-text-inverse hover:bg-primary-hover shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isPending ? 'Processing Settlement…' : 'Confirm Settlement & Done Job'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
