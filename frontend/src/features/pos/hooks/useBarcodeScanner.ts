import { useEffect, useRef } from 'react';

interface UseBarcodeScannerProps {
  onScan: (scannedCode: string) => void;
  enabled?: boolean;
}

/**
 * Headless hook that intercepts hardware barcode scanner strokes.
 * Scanners emulate rapid keyboard input followed by Enter or Tab.
 */
export const useBarcodeScanner = ({ onScan, enabled = true }: UseBarcodeScannerProps) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  // Keep callback reference updated without restarting the listener
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Skip if the user is typing in an input, textarea, or contentEditable element
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Reset buffer if keystrokes are spaced out (normal human typing outside inputs)
      if (timeDiff > 250) {
        bufferRef.current = '';
      }

      // Scanner terminator (Enter or Tab)
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.length >= 2) {
          e.preventDefault();
          const scanned = bufferRef.current;
          bufferRef.current = '';
          onScanRef.current(scanned);
        }
        return;
      }

      // Buffer printable single characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
};
