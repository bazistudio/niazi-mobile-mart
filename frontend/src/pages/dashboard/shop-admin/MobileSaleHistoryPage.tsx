import React from 'react';
import { MobileSaleHistoryDashboard } from '@/features/mobiles/components/MobileSaleHistoryDashboard';

/**
 * MobileSaleHistoryPage — thin page wrapper for the Mobile Sale History view.
 *
 * ⚠️  FRONTEND PREVIEW — Sale History Not Connected
 *
 * Displays typed sample records only until the backend sale-history endpoint
 * is authorised and integrated. See MobileSaleHistoryDashboard for the
 * PREVIEW_ADAPTER that must be replaced during backend integration.
 */
export const MobileSaleHistoryPage: React.FC = () => {
  return <MobileSaleHistoryDashboard />;
};
