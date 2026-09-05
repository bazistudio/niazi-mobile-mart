'use client';

import React from 'react';
import { CustomerProfile } from '@/features/customers/components/CustomerProfile';
import { useParams } from 'next/navigation';

export default function CustomerProfileClient() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <CustomerProfile id={id} />
    </div>
  );
}
