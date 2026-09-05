'use client';

import React from 'react';
import { KitchenDisplayBoard } from '@/features/kds/components/KitchenDisplayBoard';

export default function KitchenDisplayRoute() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto h-full">
      <KitchenDisplayBoard />
    </div>
  );
}
