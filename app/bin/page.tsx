import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import BinClient from './_client';
import type { BinRow } from '@/lib/client';

export default async function BinPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const rows = await prisma.stock.findMany({
    orderBy: [{ location: 'asc' }, { partId: 'asc' }],
    take: 500,
  });

  const partIds = [...new Set(rows.map((r: any) => r.partId).filter(Boolean))];
  const parts = await prisma.part.findMany({
    where: { partNo: { in: partIds } },
    select: { partNo: true, partName: true },
  });
  const partMap = new Map(parts.map((p: any) => [p.partNo, p]));

  const initial: BinRow[] = rows.map((r: any) => ({
    id: r.id,
    partNo: r.partId,
    partName: partMap.get(r.partId)?.partName ?? null,
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
