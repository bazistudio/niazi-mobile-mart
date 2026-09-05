import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-center px-4">
      <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-6">Page Not Found</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Sorry, we couldn't find the page you're looking for.
      </p>
      <Link 
        to="/dashboard"
        className="px-6 py-3 bg-[#006970] hover:bg-[#005258] text-white font-medium rounded-lg transition-colors shadow-sm"
      >
        Return to Dashboard
      </Link>
    </div>
  );
};
