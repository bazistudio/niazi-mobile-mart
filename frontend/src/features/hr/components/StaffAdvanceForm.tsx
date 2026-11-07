import React, { useState } from 'react';
import { DollarSign, FileText, Lock, AlertCircle } from 'lucide-react';
import { HRStaffSelector } from './HRStaffSelector';
import { BackendIntegrationNotice } from './BackendIntegrationNotice';
import type { StaffUser } from '@/features/settings/types/staff.types';

interface StaffAdvanceFormProps {
  /** If provided, the staff selector is pre-set and hidden */
  preselectedStaff?: StaffUser;
  onCancel?: () => void;
}

/**
 * StaffAdvanceForm
 *
 * Form for submitting a staff advance request.
 *
 * ⚠️  IMPORTANT CONSTRAINTS:
 * - No advance records are stored anywhere (not localStorage, not DB)
 * - Previous sessions' prototype localStorage data is NOT displayed here
 * - Submission shows a backend-unavailable notice
 * - Real staff dropdown via useStaff() — no mock names
 */
export const StaffAdvanceForm: React.FC<StaffAdvanceFormProps> = ({
  preselectedStaff,
  onCancel,
}) => {
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | undefined>(
    preselectedStaff
  );
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [requestDate, setRequestDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const errors: Record<string, string> = {};
  if (!selectedStaff) errors.staff = 'Please select a staff member';
  if (!amount || Number(amount) <= 0) errors.amount = 'Enter a valid amount';
  if (!reason.trim()) errors.reason = 'Reason is required';

  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors) return;
    // Backend not available — show notice only (already rendered below)
  };

  return (
    <div className="space-y-5">
      {/* Backend notice — always visible */}
      <BackendIntegrationNotice
        title="Advance Recording Unavailable"
        description="Advance requests cannot be saved — the HR advances backend endpoint is not yet built. This form is for preview only. No advance record will be created."
        requiredEndpoints={[
          'POST /api/v1/hr/advances',
          'GET /api/v1/hr/advances?staffId=:staffId',
        ]}
        variant="warning"
      />

      {/* No localStorage notice */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
        <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Advance history from previous prototype sessions is not shown here. Only data from a real HR backend will be displayed when available.
        </p>
      </div>

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
            Advance Amount (PKR)
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 5000"
              className={`w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800
                border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30
                text-gray-900 dark:text-white transition-colors
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
            className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
              rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              text-gray-900 dark:text-white"
          />
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Reason for Advance
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Briefly explain the reason for the advance request..."
              className={`w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800
                border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30
                text-gray-900 dark:text-white resize-none transition-colors
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

        {/* Submit attempt notice */}
        {submitAttempted && !hasErrors && (
          <BackendIntegrationNotice
            title="Submission Not Available"
            description="The form is complete, but the advance request cannot be submitted — POST /api/v1/hr/advances is not yet implemented. No data has been saved."
            variant="warning"
            compact
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
              bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400
              border border-gray-200 dark:border-gray-700 cursor-pointer
              hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Backend not yet available — submission is a preview only"
          >
            <Lock className="w-3.5 h-3.5" />
            Submit Request (Preview)
          </button>
        </div>
      </form>
    </div>
  );
};

export default StaffAdvanceForm;
