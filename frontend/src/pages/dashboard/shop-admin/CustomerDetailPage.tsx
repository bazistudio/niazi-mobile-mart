import React from 'react';
import { useParams } from 'react-router-dom';
import { CustomerProfile } from '@/features/customers/components/CustomerProfile';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {id ? <CustomerProfile id={id} /> : <p className="text-gray-500">Customer ID not specified</p>}
    </div>
  );
}

export default CustomerDetailPage;
