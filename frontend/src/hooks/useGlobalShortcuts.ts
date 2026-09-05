import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const useGlobalShortcuts = (onAction: (action: string) => void) => {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 -> Dashboard
      if (e.key === 'F1') {
        e.preventDefault();
        onAction('GOTO_DASHBOARD');
      }
      // F2 -> POS
      else if (e.key === 'F2') {
        e.preventDefault();
        onAction('GOTO_POS');
      }
      // F3 -> Inventory
      else if (e.key === 'F3') {
        e.preventDefault();
        onAction('GOTO_INVENTORY');
      }
      // F4 -> Customers
      else if (e.key === 'F4') {
        e.preventDefault();
        onAction('GOTO_CUSTOMERS');
      }
      // F5 -> Suppliers
      else if (e.key === 'F5') {
        e.preventDefault();
        onAction('GOTO_SUPPLIERS');
      }
      // Ctrl + N -> New Sale
      else if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onAction('NEW_SALE');
      }
      // Alt + F4 is handled natively by the OS to close the window
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction]);
};
