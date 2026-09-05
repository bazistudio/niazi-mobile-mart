'use client';
import React, { useRef } from 'react';
import { usePrintStore } from './print.store';
import { X, Printer, Download } from 'lucide-react';

import { GlobalLoadingOverlay } from '@/components/ui/GlobalLoadingOverlay';

export const GlobalPrintPreviewModal: React.FC = () => {
  const { currentPayload, isPreviewOpen, isPrinting, closePreview, setPrinting } = usePrintStore();
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  // Automatically trigger print when payload is available
  React.useEffect(() => {
    if (isPreviewOpen && currentPayload && printIframeRef.current) {
      const iframe = printIframeRef.current;
      const doc = iframe.contentWindow?.document;
      
      if (doc) {
        doc.open();
        doc.write(`
          <html>
            <head>
              <style>
                body { margin: 0; padding: 0; box-sizing: border-box; }
                * { box-sizing: border-box; }
              </style>
            </head>
            <body>
              ${currentPayload.html}
            </body>
          </html>
        `);
        doc.close();

        // Trigger print and then automatically close the preview state
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          closePreview(); // Clean up state immediately after opening print dialog
          
          // In some browsers, print() blocks JavaScript. Once it unblocks (dialog closed), we stop printing state.
          // In non-blocking browsers, this timeout runs right away. We just clear the UI immediately so the user can continue.
          setPrinting(false);
        }, 250);
      }
    }
  }, [isPreviewOpen, currentPayload, closePreview, setPrinting]);

  return (
    <>
      <GlobalLoadingOverlay isOpen={isPrinting} message="Preparing Print Dialog..." />
      {(isPreviewOpen && currentPayload) && (
        <iframe 
          ref={printIframeRef} 
          style={{ display: 'none', position: 'absolute', width: 0, height: 0, border: 0 }} 
        />
      )}
    </>
  );
};
