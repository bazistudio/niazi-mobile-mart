import React from 'react';
import { InventoryWorkspaceLayout } from '@/components/inventory/InventoryWorkspaceLayout';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <InventoryWorkspaceLayout>{children}</InventoryWorkspaceLayout>;
}
