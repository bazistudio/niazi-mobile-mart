import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Lock,
} from 'lucide-react';
import { BackendIntegrationNotice } from './BackendIntegrationNotice';
import type { HRSalarySettlementPreview, SalarySettlementScenario } from '../types/hr.types';

interface SalarySettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  staffId: string;
  month: number;
  year: number;
  netSalary: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
 * Presents a 3-scenario salary settlement preview:
 * - Exact: payment equals net salary
 * - Overpaid: payment exceeds net salary
 * - Underpaid: payment less than net salary
 *
 * ⚠️  PAYMENT RECORDING IS NOT AVAILABLE.
 * This modal is PREVIEW ONLY. No transaction is created.
 * Backend endpoint POST /api/v1/hr/settlements is required.
 */
export const SalarySettlementModal: React.FC<SalarySettlementModalProps> = ({
  isOpen,
  onClose,
  staffName,
  staffId,
  month,
  year,
  netSalary,
}) => {
  const [paymentAmount, setPaymentAmount] = useState(netSalary);
  const [notes, setNotes] = useState('');

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
      isPreviewOnly: true,
    };
  }, [staffId, month, year, netSalary, paymentAmount]);

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
                <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  Salary Settlement Preview
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {staffName} · {MONTH_NAMES[month - 1]} {year}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Backend Unavailable Notice */}
            <BackendIntegrationNotice
              title="Payment Recording Unavailable"
              description="Salary settlement payment cannot be recorded — the HR settlements backend is not yet built. This form generates a preview only. No transaction is created."
              requiredEndpoints={['POST /api/v1/hr/settlements']}
              variant="warning"
            />

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
                Payment Amount (PKR) — Preview
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₨</span>
                <input
                  type="number"
                  min={0}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                    rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                    text-gray-900 dark:text-white font-semibold"
                />
              </div>
            </div>

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
                placeholder="Add notes for this settlement..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                  text-gray-900 dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <Lock className="w-3 h-3" />
              <span>Recording disabled — backend pending</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
              <button
                disabled
                title="Settlement recording requires HR backend — not yet implemented"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700
                  text-gray-400 dark:text-gray-500 text-sm font-semibold cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5" />
                Record Payment
              </button>
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
