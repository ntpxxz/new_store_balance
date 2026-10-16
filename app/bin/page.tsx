import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import { binRows } from '@/lib/bin-rows';
import BinClient from './_client';

export default async function BinPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  return <BinClient initialRows={await binRows()} />;
}
