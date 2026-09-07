import React from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Activity, 
  Search, 
  Calendar, 
  ShieldAlert, 
  Download,
  Filter
} from 'lucide-react';

export function AuditLogsPage() {
  return (
    <OrganizationPageShell
      title="Organization Audit Logs"
      description="Read-only security event stream and operational audit trail across all organization branches."
      badge="Security Audit"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-400 cursor-not-allowed shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Trail</span>
        </button>
      }
    >
      {/* Filter / Search Controls Bar */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200/80 dark:border-gray-700/80 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search audit actions, user IDs, or entities..."
              disabled
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span>Branch: All Branches</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <span>User: All Users</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <span>Action: All Actions</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Date: Past 30 Days</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <span>Entity: All Entities</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              <span>Severity: All</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Empty State Table Container */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <Activity className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Organization Security Audit Log
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          Read-only event stream of organizational actions, privilege escalations, and security audits across all branches.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 italic">
          Audit entries will record here as administrative and branch operations occur.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default AuditLogsPage;
