import React from 'react';
import { useParams } from 'react-router-dom';
import { PartyProfile } from '@/features/parties/components/PartyProfile';

export function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {id ? <PartyProfile partyId={id} /> : <p className="text-gray-500">Party ID not specified</p>}
    </div>
  );
}

export default PartyDetailPage;
