import React from 'react';
import CustomerProfileClient from './client-page';

export async function generateStaticParams() {
  return [{ id: 'index' }];
}

export default function CustomerProfilePage() {
  return <CustomerProfileClient />;
}

