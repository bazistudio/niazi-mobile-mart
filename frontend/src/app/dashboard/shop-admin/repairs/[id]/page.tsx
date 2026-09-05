import RepairProfileClient from './client-page';

export async function generateStaticParams() {
  return [{ id: 'index' }];
}

export default function RepairProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <RepairProfileClient params={params} />;
}

