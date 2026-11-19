import React from 'react';
import { RepairDashboard } from '@/features/repairs/components/RepairDashboard';

export function OrganizationRepairsPage() {
  return (
    <div className="py-2 px-0 w-full min-w-0">
      <RepairDashboard hideBookingForm />
    </div>
  );
}

export default OrganizationRepairsPage;
