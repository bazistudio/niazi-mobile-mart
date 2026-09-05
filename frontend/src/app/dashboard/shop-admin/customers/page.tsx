import React, { Suspense } from 'react';
import { CustomersModuleShell } from '@/features/customers/components/CustomersModuleShell';

export default function CustomersPage() {
  return (
    <div className="h-[calc(100vh-6rem)]">
      <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading Customers Module...</div>}>
        <CustomersModuleShell />
      </Suspense>
    </div>
  );
}
