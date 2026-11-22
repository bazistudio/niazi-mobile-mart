// src/lib/http/abortUtils.ts
//
// PACKAGE 3B-D: HTTP Timeout Enforcement & Custom AbortSignal Merging Helper
// Combines an internal timeout with an optional caller-provided AbortSignal.
// Enforces "first-abort-wins" behavior and guarantees leak-free cleanup.

export interface ComposedSignalResult {
  signal: AbortSignal;
  cleanup: () => void;
  isTimeout: () => boolean;
}

/**
 * Creates an AbortError DOMException or Error compatible with browser & Node environments.
 */
export function createAbortError(message: string = 'The user aborted a request.'): Error {
  try {
    return new DOMException(message, 'AbortError');
  } catch {
    const err = new Error(message);
    err.name = 'AbortError';
    return err;
  }
}

/**
 * Creates a TimeoutError DOMException or Error compatible with browser & Node environments.
 */
export function createTimeoutError(message: string = 'Request timed out'): Error {
  try {
    return new DOMException(message, 'TimeoutError');
  } catch {
    const err = new Error(message);
    err.name = 'TimeoutError';
    return err;
  }
}

/**
 * Merges an optional caller AbortSignal with an internal timeout timer.
 *
 * Mandatory behaviors:
 * 1. Pre-aborted caller signal: immediately returns an already aborted signal without starting timers.
 * 2. First-abort-wins: the first abort event determines the final reason and cannot be overwritten.
 * 3. Timeout enforcement: caller signal cannot disable the timeout.
 * 4. Resource cleanup: clears timer and detaches caller event listener reliably and idempotently.
 */
export function composeAbortSignals(
  callerSignal?: AbortSignal | null,
  timeoutMs: number = 10_000
): ComposedSignalResult {
  let timedOut = false;
  let cleanedUp = false;

  // 1. If caller signal is already aborted before request begins, do not start a timer.
  if (callerSignal?.aborted) {
    const reason = (callerSignal as any).reason || createAbortError('Request aborted by caller');
    const controller = new AbortController();
    try {
      controller.abort(reason);
    } catch {
      controller.abort();
    }
    return {
      signal: controller.signal,
      cleanup: () => {},
      isTimeout: () => false,
    };
  }

  const compositeController = new AbortController();
  let timeoutId: any = null;

  // Handler for caller-initiated abort
  const onCallerAbort = () => {
    if (compositeController.signal.aborted) return;
    const reason = (callerSignal as any)?.reason || createAbortError('Request aborted by caller');
    try {
      compositeController.abort(reason);
    } catch {
      compositeController.abort();
    }
    cleanup();
  };

  // Register listener on callerSignal if provided
  if (callerSignal) {
    try {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    } catch {
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  // Arm timeout timer if timeoutMs is positive and finite
  if (typeof timeoutMs === 'number' && timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timeoutId = setTimeout(() => {
      if (compositeController.signal.aborted) return;
      timedOut = true;
      const timeoutReason = createTimeoutError(`Request timed out after ${timeoutMs}ms`);
      try {
        compositeController.abort(timeoutReason);
      } catch {
        compositeController.abort();
      }
      cleanup();
    }, timeoutMs);
  }

  // Idempotent cleanup function
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (callerSignal) {
      try {
        callerSignal.removeEventListener('abort', onCallerAbort);
      } catch {}
    }
  };

  return {
    signal: compositeController.signal,
    cleanup,
    isTimeout: () => timedOut,
  };
}
