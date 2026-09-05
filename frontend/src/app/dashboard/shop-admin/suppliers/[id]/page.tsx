import React from 'react';
import SupplierProfileClient from './client-page';

export async function generateStaticParams() {
  return [{ id: 'index' }];
}

export default function SupplierProfilePage() {
  return <SupplierProfileClient />;
}

