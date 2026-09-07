import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface OrganizationPageShellProps {
  title: string;
  description: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const OrganizationPageShell: React.FC<OrganizationPageShellProps> = ({
  title,
  description,
  badge,
  action,
  children,
}) => {
  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 bg-gray-50/50 dark:bg-gray-950/50 min-h-full">
      {/* Breadcrumb & Navigation Anchor */}
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Link 
          to="/dashboard/organization" 
          className="hover:text-primary transition-colors"
        >
          Organization Admin
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-800 dark:text-gray-200 font-semibold">{title}</span>
      </div>

      {/* Header Container */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200/80 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {title}
            </h1>
            {badge && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                {badge}
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-3xl">
            {description}
          </p>
        </div>

        {action && (
          <div className="flex items-center gap-3 shrink-0">
            {action}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
};

export default OrganizationPageShell;
