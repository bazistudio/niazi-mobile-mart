import React from 'react';
import { Loader2 } from 'lucide-react';

interface GlobalLoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

export const GlobalLoadingOverlay: React.FC<GlobalLoadingOverlayProps> = ({ isOpen, message = "Processing... Please wait" }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col items-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-sm w-full mx-4 text-center">
        <Loader2 className="w-12 h-12 text-[#006970] dark:text-[#00B4BB] animate-spin mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
          {message}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Do not close or refresh the window.
        </p>
      </div>
    </div>
  );
};
