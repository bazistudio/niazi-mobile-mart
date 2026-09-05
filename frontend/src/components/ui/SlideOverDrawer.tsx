"use client";

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  width = 'max-w-md md:max-w-xl' // 500-600px roughly
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={handleBackdropClick}
    >
      <div 
        ref={drawerRef}
        className={`w-full ${width} h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col transform transition-transform duration-250 ease-out animate-slide-in-right border-l border-gray-200 dark:border-gray-800`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-md">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
