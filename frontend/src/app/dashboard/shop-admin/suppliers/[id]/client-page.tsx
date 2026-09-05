'use client';

import React from 'react';
import { SupplierProfile } from '@/features/suppliers/components/SupplierProfile';
import { useParams } from 'next/navigation';

export default function SupplierProfileClient() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <SupplierProfile id={id} />
    </div>
  );
}
