import React from "react";
import { Link } from "react-router-dom";

export function SuspendedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Account Suspended</h1>
      <p className="text-gray-600 dark:text-gray-400 max-w-md mb-8">
        Your account has been suspended. Please contact support for more information or to resolve the issue.
      </p>
      <Link 
        to="/auth/login" 
        className="px-4 py-2 bg-[#006970] text-white rounded-lg hover:bg-[#005157] transition-colors"
      >
        Back to Login
      </Link>
    </div>
  );
}

export default SuspendedPage;
