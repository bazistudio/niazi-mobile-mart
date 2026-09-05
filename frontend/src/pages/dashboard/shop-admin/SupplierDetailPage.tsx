import React from 'react';
import { useParams } from 'react-router-dom';
import { SupplierProfile } from '@/features/suppliers/components/SupplierProfile';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {id ? <SupplierProfile id={id} /> : <p className="text-gray-500">Supplier ID not specified</p>}
    </div>
  );
}

export default SupplierDetailPage;
