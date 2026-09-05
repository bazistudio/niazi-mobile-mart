'use client'; // Error components must be Client Components

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-6 text-center">
      <div className="bg-red-50 dark:bg-red-900/10 text-red-500 rounded-full p-4 mb-4">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong!</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
        An unexpected error occurred in the dashboard. We've logged the issue.
      </p>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="rounded-full bg-[#006970] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#005a60] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006970] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
