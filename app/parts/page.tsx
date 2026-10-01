import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import PartsClient from './_client';
import type { Part } from '@/lib/client';

export default async function PartsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const rows = await prisma.part.findMany({
    include: { stocks: { select: { quantity: true, location: true } } },
    orderBy: { partNo: 'asc' },
    take: 500,
  });

  const parts: Part[] = rows.map((p: any) => ({
    id: p.id,
    partNo: p.partNo,
    name: p.name,
    unit: p.unit,
    safetyStock: p.safetyStock ?? 0,
    divisionName: p.divisionName,
    qty: p.stocks.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0),
    locations: p.stocks.map((r: any) => r.location).filter(Boolean),
  }));

  return <PartsClient initialParts={parts} />;
}
