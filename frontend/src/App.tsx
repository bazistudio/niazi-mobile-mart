import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ReactQueryProvider from '@/components/providers/ReactQueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import AuthHydrator from '@/components/auth/AuthHydrator';
import { GlobalPrintPreviewModal } from '@/lib/printer';

// Temporary landing shell for Phase 2.1 verification
function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl bg-surface border border-border p-8 text-center shadow-lg">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-bold text-xl">
          TP
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">TijaratPro ERP</h1>
        <p className="text-sm text-text-secondary mb-6">
          Vite + React 19 foundation initialized successfully.
        </p>
        <div className="rounded-lg bg-surface-hover/70 border border-border p-3 text-xs text-text-muted space-y-1 text-left">
          <div className="flex justify-between">
            <span>Runtime Engine:</span>
            <span className="font-semibold text-text-primary">Vite + React 19</span>
          </div>
          <div className="flex justify-between">
            <span>Styling:</span>
            <span className="font-semibold text-text-primary">Tailwind CSS v4</span>
          </div>
          <div className="flex justify-between">
            <span>Routing:</span>
            <span className="font-semibold text-text-primary">React Router</span>
          </div>
          <div className="flex justify-between">
            <span>Backend Status:</span>
            <span className="font-semibold text-success">Frozen & Preserved</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactQueryProvider>
      <ThemeProvider>
        <Toaster position="bottom-right" />
        {/* Rehydrates Zustand store on boot */}
        <AuthHydrator />

        <BrowserRouter>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>

        <GlobalPrintPreviewModal />
      </ThemeProvider>
    </ReactQueryProvider>
  );
}
