'use client';

import React from 'react';
import { useInventoryUIStore } from '../store/inventory-ui.store';
import { AddProductDrawer } from './AddProductDrawer';
import { usePermissions } from '@/lib/auth/usePermissions';

export function GlobalAddProductDrawer() {
  const { role } = usePermissions();
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  const { isAddProductOpen, setAddProductOpen } = useInventoryUIStore();

  if (!isOrgAdmin) {
    return null;
  }
  
  return (
    <AddProductDrawer 
      isOpen={isAddProductOpen}
      onClose={() => setAddProductOpen(false)}
    />
  );
}
