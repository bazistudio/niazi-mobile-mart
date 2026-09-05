'use client';

import React from 'react';
import { Upload, Download, FileText } from 'lucide-react';

export default function InventoryImportPage() {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 p-6 overflow-y-auto">
      
      <div className="max-w-4xl mx-auto w-full">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Import Products
          </h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 rounded text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />
            Download Template
          </button>
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 flex flex-col items-center justify-center text-center bg-gray-50 dark:bg-gray-800/50 mb-8 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
          <Upload className="w-10 h-10 text-gray-400 mb-4" />
          <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
            Click or drag file to this area to upload
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Support for a single or bulk upload. Strictly prohibit from uploading company data or other band files.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Accepted formats: .csv, .xlsx
          </p>
        </div>

        {/* Import History */}
        <div>
          <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-4">
            Import History
          </h3>
          
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">File Name</th>
                  <th className="px-4 py-3 font-semibold">Records</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">2026-07-13 14:30</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    products_july.csv
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">150</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Success
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
