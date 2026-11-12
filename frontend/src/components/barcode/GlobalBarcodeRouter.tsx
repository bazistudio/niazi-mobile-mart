import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBarcodeScanner } from '@/features/pos/hooks/useBarcodeScanner';
import toast from 'react-hot-toast';

/**
 * GlobalBarcodeRouter
 * Intercepts scanned invoice barcodes from ANY page across the application.
 * When an invoice barcode is scanned:
 * 1. If user is NOT on POS page, navigates instantly to /dashboard/shop-admin/pos.
 * 2. Emits 'pos:open-invoice-lookup' event with the scanned invoice number.
 * 3. Opens the Invoice Lookup / Return modal with the invoice pre-loaded and ready.
 */
export const GlobalBarcodeRouter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleGlobalScan = (scannedCode: string) => {
    const trimmed = scannedCode.trim();
    if (!trimmed || trimmed.length < 2) return;

    // Check if scanned code is an Invoice / Return voucher pattern or invoice number suffix (4-8 digits)
    const isInvoiceCode =
      /^(ORD|RET|INV|TP|MAIN|BRANCH|[A-Z]{2,6}-U\d|[A-Z]{2,6}-POS)/i.test(trimmed) ||
      /^\d{4,8}$/.test(trimmed);

    if (isInvoiceCode) {
      const codeUpper = trimmed.toUpperCase();
      const currentPath = location.pathname;

      if (!currentPath.includes('/dashboard/shop-admin/pos')) {
        toast.success(`Invoice scanned: ${codeUpper} — Navigating to POS...`, {
          icon: '🧾',
          duration: 3000,
        });

        navigate('/dashboard/shop-admin/pos');

        // Delay slightly for the POS workspace to mount, then trigger direct load into cart
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('pos:open-invoice-lookup', {
              detail: { prefill: codeUpper, directLoad: true },
            })
          );
        }, 350);
      } else {
        // Already on POS page: dispatch event directly
        window.dispatchEvent(
          new CustomEvent('pos:open-invoice-lookup', {
            detail: { prefill: codeUpper },
          })
        );
        toast(`Invoice scanned: ${codeUpper}`, { icon: '🧾', duration: 2500 });
      }
    }
  };

  // Only active globally when outside the POS page so SaleWorkspace handles POS-level scans
  const isPosPage = location.pathname.includes('/dashboard/shop-admin/pos');
  useBarcodeScanner({
    onScan: handleGlobalScan,
    enabled: !isPosPage,
  });

  return null;
};

