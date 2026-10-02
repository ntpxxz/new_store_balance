import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import BinClient from './_client';
import type { BinRow } from '@/lib/client';

export default async function BinPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const rows = await prisma.stock.findMany({
    include: { part: { select: { partNo: true, name: true } } },
    orderBy: [{ location: 'asc' }, { part: { partNo: 'asc' } }],
    take: 500,
  });

  const initial: BinRow[] = rows.map((r: any) => ({
    id: r.id,
    partNo: r.part.partNo,
    partName: r.part.name,
    location: r.location,
    wh: r.wh,
    as400Location: r.as400Location,
    stcl: r.stcl,
    quantity: r.quantity,
    vendorName: r.vendorName,
    lastStockIn: r.lastStockIn,
    latestUpdateDate: r.latestUpdateDate,
  }));

  return <BinClient initialRows={initial} />;
}
