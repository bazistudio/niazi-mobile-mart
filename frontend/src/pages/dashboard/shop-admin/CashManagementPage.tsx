import React, { useEffect, useState } from 'react';
import {
  useCashStore,
  CashSessionActiveCard,
  CashSessionOpenModal,
  CashSessionCloseModal,
  CashAdjustmentModal,
  CashMovementsTable,
  CashSessionHistoryTable,
} from '@/features/cash';
import { Coins, RefreshCw } from 'lucide-react';

export const CashManagementPage: React.FC = () => {
  const { fetchCurrentState, isLoading } = useCashStore();
  const [isOpenModalActive, setIsOpenModalActive] = useState(false);
  const [isCloseModalActive, setIsCloseModalActive] = useState(false);
  const [isAdjustmentModalActive, setIsAdjustmentModalActive] = useState(false);

  useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 w-full max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Coins className="h-6 w-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
              Cash Management & Daily Closing
            </h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Authoritative physical cash drawer sessions, daily closings, and real-time reconciliation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchCurrentState()}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Active Session & Real-Time Aggregation Card */}
      <CashSessionActiveCard
        onOpenSession={() => setIsOpenModalActive(true)}
        onCloseSession={() => setIsCloseModalActive(true)}
        onAdjustment={() => setIsAdjustmentModalActive(true)}
      />

      {/* Real-Time Cash Movements Ledger */}
      <div className="space-y-4">
        <CashMovementsTable />
      </div>

      {/* Historical Sessions Table */}
      <div className="space-y-4">
        <CashSessionHistoryTable />
      </div>

      {/* Modals */}
      <CashSessionOpenModal
        isOpen={isOpenModalActive}
        onClose={() => setIsOpenModalActive(false)}
      />

      <CashSessionCloseModal
        isOpen={isCloseModalActive}
        onClose={() => setIsCloseModalActive(false)}
      />

      <CashAdjustmentModal
        isOpen={isAdjustmentModalActive}
        onClose={() => setIsAdjustmentModalActive(false)}
      />
    </div>
  );
};
