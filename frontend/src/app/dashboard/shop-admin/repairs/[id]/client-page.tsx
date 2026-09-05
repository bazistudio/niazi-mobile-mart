'use client';

import { use } from 'react';
import { RepairProfile } from '@/features/repairs/components/RepairProfile';

export default function RepairProfileClient({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  return <RepairProfile repairId={resolvedParams.id} />;
}
