'use client';
import React, { useRef } from 'react';
import { usePrintStore } from './print.store';
import { X, Printer } from 'lucide-react';

export const GlobalPrintPreviewModal: React.FC = () => {
  const { currentPayload, isPreviewOpen, closePreview } = usePrintStore();
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (printIframeRef.current?.contentWindow) {
      const win = printIframeRef.current.contentWindow;
      win.focus();
      win.print();
    }
  };

  React.useEffect(() => {
    if (isPreviewOpen && currentPayload && printIframeRef.current) {
      const iframe = printIframeRef.current;
      const doc = iframe.contentWindow?.document;
      
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <style>
                body { margin: 0; padding: 0; box-sizing: border-box; background: #fff; }
                * { box-sizing: border-box; }
              </style>
            </head>
            <body>
              ${currentPayload.html}
            </body>
          </html>
        `);
        doc.close();

        // Automatically trigger print dialog so cashier doesn't have to click twice
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
        }, 300);
      }
    }
  }, [isPreviewOpen, currentPayload]);

  if (!isPreviewOpen || !currentPayload) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-hover/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-base leading-tight">
                {currentPayload.title || 'Print Preview'}
              </h3>
              <p className="text-xs text-text-muted">Review receipt before sending to printer</p>
            </div>
          </div>
          <button
            onClick={closePreview}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Visible Receipt Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 dark:bg-neutral-900 flex justify-center">
          <iframe
            ref={printIframeRef}
            title="Receipt Preview"
            className="w-[320px] min-h-[480px] bg-white shadow-md border border-neutral-200 rounded-sm"
          />
        </div>

        {/* Modal Footer / Confirm Action */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-surface">
          <button
            type="button"
            onClick={closePreview}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Printer className="w-4 h-4" />
            Print to BIXOLON
          </button>
        </div>
      </div>
    </div>
  );
};
