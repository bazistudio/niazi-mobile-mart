'use client';

import React from 'react';
import { useInventoryUIStore } from '../store/inventory-ui.store';
import { AddProductDrawer } from './AddProductDrawer';

export function GlobalAddProductDrawer() {
  const { isAddProductOpen, setAddProductOpen } = useInventoryUIStore();
  
  return (
    <AddProductDrawer 
      isOpen={isAddProductOpen}
      onClose={() => setAddProductOpen(false)}
    />
  );
}
