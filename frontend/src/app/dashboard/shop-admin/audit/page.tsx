import React from 'react';
import { TransactionTimeline } from '@/features/audit/components/TransactionTimeline';
import { ShieldCheck } from 'lucide-react';

export default function AuditDashboardPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-[#006970]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Audit & Transactions
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Secure, immutable log of all historical ERP events.
        </p>
      </div>

      <TransactionTimeline />
    </div>
  );
}
