import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import { binDetail } from '@/lib/bin-rows';
import BinDetailClient from './_client';

export default async function BinDetailPage({ params }: PageProps<'/bin/[location]'>) {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const location = decodeURIComponent((await params).location);
  return <BinDetailClient location={location} initialData={await binDetail(location)} />;
}
