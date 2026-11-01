import React from 'react';
import { useParams } from 'react-router-dom';
import { CustomerProfile } from '@/features/customers/components/CustomerProfile';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-2 sm:p-4 md:p-5 lg:p-6 space-y-4 w-full">
      {id ? <CustomerProfile id={id} /> : <p className="text-gray-500">Customer ID not specified</p>}
    </div>
  );
}

export default CustomerDetailPage;
