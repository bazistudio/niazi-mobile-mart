import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ReactQueryProvider from '@/components/providers/ReactQueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import AuthHydrator from '@/components/auth/AuthHydrator';
import { GlobalPrintPreviewModal } from '@/lib/printer';
import { UpdateModal } from '@/components/updater/UpdateModal';
import { AutoUpdaterBanner } from '@/components/updater/AutoUpdaterBanner';
import { UpdaterProvider } from '@/context/UpdaterContext';
import { AppRoutes } from '@/app/router/AppRoutes';
import { isTauriEnvironment } from '@/lib/tauri/tauriClient';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function App() {
  React.useEffect(() => {
    if (isTauriEnvironment()) {
      try {
        getCurrentWindow().maximize().catch(() => {});
      } catch {}
    }
  }, []);

  return (
    <ReactQueryProvider>
      <ThemeProvider>
        <UpdaterProvider>
          <BrowserRouter>
            {/* Rehydrates Zustand store on boot */}
            <AuthHydrator />

            {/* Core Application Routes & Layout Shell */}
            <AppRoutes />

            {/* Global UI Feedback & Overlays */}
            <AutoUpdaterBanner />
            <UpdateModal />
            <GlobalPrintPreviewModal />
            <Toaster
              position="bottom-right"
              toastOptions={{
                className: 'dark:bg-gray-800 dark:text-white',
                duration: 4000,
              }}
            />
          </BrowserRouter>
        </UpdaterProvider>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}
