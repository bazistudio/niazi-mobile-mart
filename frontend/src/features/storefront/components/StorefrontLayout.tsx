import React from 'react';
import { StorefrontNavbar } from './StorefrontNavbar';
import { StorefrontFooter } from './StorefrontFooter';

interface StorefrontLayoutProps {
  children: React.ReactNode;
}

export const StorefrontLayout: React.FC<StorefrontLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#00b4bb]/30 selection:text-[#00474c]">
      <StorefrontNavbar />
      <main className="flex-1 w-full">
        {children}
      </main>
      <StorefrontFooter />
    </div>
  );
};
