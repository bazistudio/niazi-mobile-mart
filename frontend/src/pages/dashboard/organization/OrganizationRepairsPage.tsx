import React from 'react';
import { RepairDashboard } from '@/features/repairs/components/RepairDashboard';

export function OrganizationRepairsPage() {
  return (
    <div className="p-4 sm:p-6 w-full min-w-0">
      <RepairDashboard hideBookingForm />
    </div>
  );
}

export default OrganizationRepairsPage;
