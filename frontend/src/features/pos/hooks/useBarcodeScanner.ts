import { useEffect, useRef } from 'react';

interface UseBarcodeScannerProps {
  onScan: (scannedCode: string) => void;
  enabled?: boolean;
  /**
   * Maximum inter-keystroke gap (ms) that still counts as a scanner burst.
   * USB HID scanners typically fire all characters within 20–50 ms of each other.
   * Human typists rarely sustain more than 10 characters/second (~100 ms/key).
   * Default: 50 ms (conservative — works for most USB scanner models).
   */
  maxKeystrokeGap?: number;
  /**
   * Minimum barcode length before the buffer is treated as a valid scan.
   * Prevents single accidental keystrokes from firing onScan.
   * Default: 2.
   */
  minLength?: number;
}

/**
 * Headless hook that intercepts hardware barcode scanner keystrokes globally.
 *
 * USB HID barcode scanners emulate rapid keyboard input followed by Enter or Tab.
 * The critical difference from human typing is speed: scanners emit all characters
 * within a few tens of milliseconds; a human can't sustain that rate.
 */
export const useBarcodeScanner = ({
  onScan,
  enabled = true,
  maxKeystrokeGap = 50,
  minLength = 2,
}: UseBarcodeScannerProps) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const leakedCharCountRef = useRef<number>(0);

  // Keep callback reference fresh without restarting the event listener.
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      lastKeyTimeRef.current = 0;
      leakedCharCountRef.current = 0;
      lastInputTargetRef.current = null;
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      return;
    }

    const resetInactivityTimer = () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      clearTimerRef.current = setTimeout(() => {
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        leakedCharCountRef.current = 0;
        lastInputTargetRef.current = null;
      }, Math.max(maxKeystrokeGap * 3, 200));
    };

    const cleanLeakedChars = () => {
      if (lastInputTargetRef.current && leakedCharCountRef.current > 0) {
        const input = lastInputTargetRef.current;
        if ('value' in input && typeof input.value === 'string') {
          const val = input.value;
          if (val.length >= leakedCharCountRef.current) {
            input.value = val.slice(0, val.length - leakedCharCountRef.current);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
      lastInputTargetRef.current = null;
      leakedCharCountRef.current = 0;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const now = Date.now();
      const lastKeyTime = lastKeyTimeRef.current;
      const gap = now - lastKeyTime;
      const isFirstKey = lastKeyTime === 0;
      const isBurstSpeed = !isFirstKey && gap <= maxKeystrokeGap;

      resetInactivityTimer();

      // Scanner terminator: Enter or Tab
      if (e.key === 'Enter' || e.key === 'Tab') {
        const buf = bufferRef.current;
        if (buf.length >= minLength && isBurstSpeed) {
          e.preventDefault();
          cleanLeakedChars();
          bufferRef.current = '';
          lastKeyTimeRef.current = 0;
          if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
          onScanRef.current(buf);
          return;
        }

        // Slow or empty Enter/Tab: reset scanner buffer, let event pass to form/input
        cleanLeakedChars();
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        return;
      }

      // Ignore modifier keys and functional keys (Shift, Ctrl, Alt, Arrow keys, etc.)
      if (e.key.length !== 1) {
        return;
      }

      // Handle printable character (length === 1)
      if (isFirstKey) {
        // First character of a potential sequence:
        // Do NOT preventDefault if an input is focused, so human typing is never swallowed.
        bufferRef.current = e.key;
        lastKeyTimeRef.current = now;
        if (isInputTarget && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          lastInputTargetRef.current = target as HTMLInputElement | HTMLTextAreaElement;
          leakedCharCountRef.current = 1;
        } else {
          lastInputTargetRef.current = null;
          leakedCharCountRef.current = 0;
        }
        return;
      }

      // Second or subsequent character
      if (isBurstSpeed) {
        // Confirmed scanner burst!
        // If the first character leaked into an input, clean it out now that burst speed is proven.
        cleanLeakedChars();
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
        if (isInputTarget) {
          e.preventDefault();
        }
      } else {
        // Gap > maxKeystrokeGap: human pace typing.
        // Abandon scanner buffer and allow normal input.
        lastInputTargetRef.current = null;
        leakedCharCountRef.current = 0;
        if (isInputTarget) {
          bufferRef.current = '';
          lastKeyTimeRef.current = now;
        } else {
          // Outside input: start a fresh potential scan with this key
          bufferRef.current = e.key;
          lastKeyTimeRef.current = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      bufferRef.current = '';
      lastKeyTimeRef.current = 0;
      lastInputTargetRef.current = null;
      leakedCharCountRef.current = 0;
    };
  }, [enabled, maxKeystrokeGap, minLength]);
};
