import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import { binRows } from '@/lib/bin-rows';
import prisma from '@/lib/prisma';
import BinClient from './_client';

export default async function BinPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  // both in parallel so the rack map paints complete on first render (no client fetch flash)
  const [rows, bins] = await Promise.all([
    binRows(),
    prisma.binConfig.findMany({ orderBy: { location: 'asc' }, select: { id: true, location: true, maxCapacity: true, isLocked: true } }),
  ]);
  return <BinClient initialRows={rows} initialBins={bins} />;
}
