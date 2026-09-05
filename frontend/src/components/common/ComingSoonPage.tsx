import React from 'react';
import { Clock } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
  description?: string;
}

export const ComingSoonPage = ({ title, description = "Module planned for future implementation." }: ComingSoonPageProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
        <Clock className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {title}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 max-w-sm">
        {description}
      </p>
    </div>
  );
};
