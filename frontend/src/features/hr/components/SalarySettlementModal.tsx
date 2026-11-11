import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Lock,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { BackendIntegrationNotice } from './BackendIntegrationNotice';
import { submitSalarySettlement } from '../services/hr.api';
import type { HRSalarySettlementPreview, SalarySettlementScenario } from '../types/hr.types';

type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';

interface SalarySettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  staffId: string;
  month: number;
  year: number;
  netSalary: number;
  /** When provided, enables actual payment recording via POST /api/v1/hr/salary-records/:recordId/pay */
  salaryRecordId?: string;
  /** Called after a successful payment so the caller can refresh data */
  onPaymentRecorded?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'EASYPAISA', label: 'EasyPaisa' },
  { value: 'JAZZCASH', label: 'JazzCash' },
  { value: 'OTHER', label: 'Other' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * SalarySettlementModal
 *
 * When `salaryRecordId` is provided: wires up the "Record Payment" button
 * to POST /api/v1/hr/salary-records/:recordId/pay. Payment method is required.
 *
 * When `salaryRecordId` is absent: preview-only mode (original behaviour).
 */
export const SalarySettlementModal: React.FC<SalarySettlementModalProps> = ({
  isOpen,
  onClose,
  staffName,
  staffId,
  month,
  year,
  netSalary,
  salaryRecordId,
  onPaymentRecorded,
}) => {
  const [paymentAmount, setPaymentAmount] = useState(netSalary);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const canRecord = !!salaryRecordId;

  const preview = useMemo((): HRSalarySettlementPreview => {
    const difference = paymentAmount - netSalary;
    let scenario: SalarySettlementScenario = 'exact';
    if (Math.abs(difference) > 0.5) {
      scenario = difference > 0 ? 'overpaid' : 'underpaid';
    }
    return {
      staffId,
      month,
      year,
      netSalary,
      paymentAmount,
      scenario,
      difference: Math.abs(difference),
      isPreviewOnly: true as true,
    };
  }, [staffId, month, year, netSalary, paymentAmount, canRecord]);

  const handleRecordPayment = async () => {
    if (!salaryRecordId) return;
    if (!paymentAmount || paymentAmount <= 0) {
      setSubmitError('Payment amount must be greater than zero.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitSalarySettlement({
        salaryRecordId,
        amount: paymentAmount,
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSubmitSuccess(true);
      onPaymentRecorded?.();
      setTimeout(() => {
        onClose();
        setSubmitSuccess(false);
      }, 1500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSubmitError(e?.message || 'Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const scenarioConfig = {
    exact: {
      icon: CheckCircle,
      color: 'text-green-500 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800',
      label: 'Exact Payment',
      description: `Payment of ${formatCurrency(paymentAmount)} matches net salary exactly.`,
    },
    overpaid: {
      icon: TrendingUp,
      color: 'text-blue-500 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      label: 'Overpayment',
      description: `Payment exceeds net salary by ${formatCurrency(preview.difference)}. The excess would need to be recovered from the next cycle.`,
    },
    underpaid: {
      icon: TrendingDown,
      color: 'text-amber-500 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      label: 'Partial Payment',
      description: `Payment is ${formatCurrency(preview.difference)} short of net salary. The remaining amount would be carried forward.`,
    },
  } as const;

  const scenario = scenarioConfig[preview.scenario];
  const ScenarioIcon = scenario.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40">
                {canRecord
                  ? <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  : <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                }
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {canRecord ? 'Record Salary Payment' : 'Salary Settlement Preview'}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {staffName} · {MONTH_NAMES[month - 1]} {year}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Preview-only notice when no salaryRecordId */}
            {!canRecord && (
              <BackendIntegrationNotice
                title="Preview Only"
                description="To record an actual payment, open this settlement from a generated payroll record. The payroll must be generated first via the Payroll Periods tab."
                requiredEndpoints={['POST /api/v1/hr/salary-records/:recordId/pay']}
                variant="warning"
              />
            )}

            {/* Success banner */}
            {submitSuccess && (
              <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Payment recorded successfully!
                </span>
              </div>
            )}

            {/* Error banner */}
            {submitError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {submitError}
              </div>
            )}

            {/* Net Salary Display */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Net Salary Due</span>
              <span className="text-lg font-black text-gray-900 dark:text-white">
                {formatCurrency(netSalary)}
              </span>
            </div>

            {/* Payment Amount Input */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Payment Amount (PKR)
                {!canRecord && <span className="text-gray-400 font-normal ml-1">— Preview</span>}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₨</span>
                <input
                  type="number"
                  min={0}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  disabled={isSubmitting || submitSuccess}
                  className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white font-semibold disabled:opacity-60"
                />
              </div>
            </div>

            {/* Payment method — only shown when recording is possible */}
            {canRecord && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={isSubmitting || submitSuccess}
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white disabled:opacity-60"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reference number — only shown when recording is possible */}
            {canRecord && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Reference Number <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  disabled={isSubmitting || submitSuccess}
                  placeholder="Transaction ID, cheque no., etc."
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white disabled:opacity-60"
                />
              </div>
            )}

            {/* Scenario Display */}
            <div className={`rounded-xl border p-4 space-y-2 ${scenario.bg} ${scenario.border}`}>
              <div className="flex items-center gap-2">
                <ScenarioIcon className={`w-5 h-5 ${scenario.color}`} />
                <span className={`text-sm font-semibold ${scenario.color}`}>
                  {scenario.label}
                </span>
              </div>
              <p className={`text-sm ${scenario.color}`}>
                {scenario.description}
              </p>

              {/* Breakdown */}
              <div className={`mt-2 pt-2 border-t ${scenario.border} space-y-1.5`}>
                <SettlementRow label="Net Salary" value={netSalary} />
                <SettlementRow label="Payment Amount" value={paymentAmount} />
                {preview.scenario !== 'exact' && (
                  <SettlementRow
                    label={preview.scenario === 'overpaid' ? 'Excess (to recover)' : 'Balance (to carry forward)'}
                    value={preview.difference}
                    highlight
                    variant={preview.scenario}
                  />
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={isSubmitting || submitSuccess}
                placeholder="Add notes for this settlement..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                  text-gray-900 dark:text-white resize-none disabled:opacity-60"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3">
            {!canRecord && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <Lock className="w-3 h-3" />
                <span>Preview only — open from a payroll record to record payment</span>
              </div>
            )}
            {canRecord && <div />}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {submitSuccess ? 'Done' : 'Close'}
              </button>
              {canRecord ? (
                <button
                  onClick={handleRecordPayment}
                  disabled={isSubmitting || submitSuccess || !paymentAmount || paymentAmount <= 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700
                    text-white text-sm font-semibold transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Recording…
                    </>
                  ) : submitSuccess ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Recorded
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      Record Payment
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  title="Open from a payroll record to record payment"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700
                    text-gray-400 dark:text-gray-500 text-sm font-semibold cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function SettlementRow({
  label,
  value,
  highlight = false,
  variant,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  variant?: 'overpaid' | 'underpaid';
}) {
  const colorClass = !highlight
    ? 'text-gray-700 dark:text-gray-300'
    : variant === 'overpaid'
    ? 'text-blue-600 dark:text-blue-400 font-bold'
    : 'text-amber-600 dark:text-amber-400 font-bold';

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className={colorClass}>
        {new Intl.NumberFormat('en-PK', {
          style: 'currency',
          currency: 'PKR',
          maximumFractionDigits: 0,
        }).format(value)}
      </span>
    </div>
  );
}

export default SalarySettlementModal;
