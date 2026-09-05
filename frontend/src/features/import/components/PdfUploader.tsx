import React from 'react';
import { UploadCloud, FileType } from 'lucide-react';

interface PdfUploaderProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

export const PdfUploader = ({ onFileSelect, selectedFile }: PdfUploaderProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <UploadCloud className="w-12 h-12 text-gray-400 mb-4" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Select an Invoice PDF to Import
      </p>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="block w-full max-w-xs text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#006970]/10 file:text-[#006970] hover:file:bg-[#006970]/20"
      />

      {selectedFile && (
        <div className="mt-6 flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm w-full max-w-sm">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
            <FileType className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
