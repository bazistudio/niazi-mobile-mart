import React from 'react';
import { useParams } from 'react-router-dom';
import { RepairProfile } from '@/features/repairs/components/RepairProfile';

export const RepairDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div className="p-8 text-center text-red-500">Invalid repair ID</div>;
  }

  return <RepairProfile repairId={id} />;
};
