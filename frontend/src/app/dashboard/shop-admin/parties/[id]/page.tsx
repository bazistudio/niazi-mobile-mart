import { PartyProfile } from '@/features/parties/components/PartyProfile';

export async function generateStaticParams() {
  return [{ id: 'index' }];
}

export default function PartyProfilePage({ params }: { params: { id: string } }) {
  return <PartyProfile partyId={params.id} />;
}

