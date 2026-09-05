import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ReactQueryProvider from '@/components/providers/ReactQueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import AuthHydrator from '@/components/auth/AuthHydrator';
import { GlobalPrintPreviewModal } from '@/lib/printer';
import { AppRoutes } from '@/routes/AppRoutes';

export default function App() {
  return (
    <ReactQueryProvider>
      <ThemeProvider>
        <BrowserRouter>
          {/* Rehydrates Zustand store on boot */}
          <AuthHydrator />

          {/* Core Application Routes & Layout Shell */}
          <AppRoutes />

          {/* Global UI Feedback & Overlays */}
          <GlobalPrintPreviewModal />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'dark:bg-gray-800 dark:text-white',
              duration: 4000,
            }}
          />
        </BrowserRouter>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}

