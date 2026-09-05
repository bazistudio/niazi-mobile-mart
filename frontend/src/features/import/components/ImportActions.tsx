import React from 'react';
import { Save, RefreshCw, Archive } from 'lucide-react';

interface ImportActionsProps {
  onConfirm: () => void;
  onReset: () => void;
  isSaving: boolean;
  disabled: boolean;
}

export const ImportActions = ({ onConfirm, onReset, isSaving, disabled }: ImportActionsProps) => {
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
      <button
        onClick={onReset}
        disabled={isSaving}
        className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        <RefreshCw className="w-4 h-4" />
        Reset
      </button>

      <button
        disabled={isSaving || disabled}
        className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        <Archive className="w-4 h-4" />
        Save Draft
      </button>

      <button
        onClick={onConfirm}
        disabled={isSaving || disabled}
        className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#006970] border border-transparent rounded-xl hover:bg-[#005a60] transition-colors shadow-sm disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {isSaving ? 'Committing to System...' : 'Confirm Import'}
      </button>
    </div>
  );
};
