import React, { useState } from 'react';
import { DollarSign, FileText, AlertCircle, CheckCircle, Loader2, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { HRStaffSelector } from './HRStaffSelector';
import { submitAdvanceRequest } from '../services/hr.api';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { StaffUser } from '@/features/settings/types/staff.types';

interface StaffAdvanceFormProps {
  /** If provided, the staff selector is pre-set and hidden */
  preselectedStaff?: StaffUser;
  onCancel?: () => void;
  onSuccess?: () => void;
}

/**
 * StaffAdvanceForm
 *
 * Form for submitting a staff advance request via POST /api/v1/hr/staff/:userId/advances.
 * Wires to real backend — no localStorage, no mock data.
 */
export const StaffAdvanceForm: React.FC<StaffAdvanceFormProps> = ({
  preselectedStaff,
  onCancel,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>(preselectedStaff);
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const errors: Record<string, string> = {};
  if (!selectedStaff) errors.staff = 'Please select a staff member';
  if (!amount || Number(amount) <= 0) errors.amount = 'Enter a valid amount greater than zero';
  if (!reason.trim()) errors.reason = 'Reason is required';

  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors) return;
    if (!selectedStaff) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitAdvanceRequest({
        staffId: selectedStaff._id,
        amount: Number(amount),
        reason: reason.trim(),
        requested_date: requestDate,
      });
      setSubmitSuccess(true);
      // Invalidate the advance list for this staff member
      await queryClient.invalidateQueries({
        queryKey: queryKeys.hr.advances(selectedStaff._id),
      });
      onSuccess?.();
      // Reset form after short delay
      setTimeout(() => {
        setAmount('');
        setReason('');
        setRequestDate(new Date().toISOString().slice(0, 10));
        setSubmitAttempted(false);
        setSubmitSuccess(false);
        if (!preselectedStaff) setSelectedStaff(undefined);
      }, 2000);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSubmitError(e?.message || 'Failed to submit advance request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Success banner */}
      {submitSuccess && (
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Advance request submitted successfully!
          </span>
        </div>
      )}

      {/* Error banner */}
      {submitError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-red-700 dark:text-red-300">{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Staff Selector */}
        {preselectedStaff ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {preselectedStaff.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {preselectedStaff.name}
              </div>
              {preselectedStaff.branchName && (
                <div className="text-xs text-gray-400">{preselectedStaff.branchName}</div>
              )}
            </div>
          </div>
        ) : (
          <HRStaffSelector
            value={selectedStaff?._id}
            onChange={(_id, staff) => setSelectedStaff(staff)}
            label="Staff Member"
            required
            error={submitAttempted ? errors.staff : undefined}
          />
        )}

        {/* Amount */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Advance Amount (PKR) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 5000"
              disabled={isSubmitting || submitSuccess}
              className={`w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800
                border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30
                text-gray-900 dark:text-white transition-colors disabled:opacity-60
                ${submitAttempted && errors.amount
                  ? 'border-red-400 dark:border-red-500 focus:border-red-400'
                  : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                }`}
            />
          </div>
          {submitAttempted && errors.amount && (
            <span className="text-xs text-red-500 dark:text-red-400">{errors.amount}</span>
          )}
        </div>

        {/* Request Date */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Request Date
          </label>
          <input
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            disabled={isSubmitting || submitSuccess}
            className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white disabled:opacity-60"
          />
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Reason for Advance <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={isSubmitting || submitSuccess}
              placeholder="Briefly explain the reason for the advance request..."
              className={`w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800
                border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30
                text-gray-900 dark:text-white resize-none transition-colors disabled:opacity-60
                ${submitAttempted && errors.reason
                  ? 'border-red-400 dark:border-red-500 focus:border-red-400'
                  : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                }`}
            />
          </div>
          {submitAttempted && errors.reason && (
            <span className="text-xs text-red-500 dark:text-red-400">{errors.reason}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || submitSuccess}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
              bg-blue-600 hover:bg-blue-700 text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Submitting…
              </>
            ) : submitSuccess ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Submitted
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Submit Request
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StaffAdvanceForm;
