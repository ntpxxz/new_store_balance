import prisma from '@/lib/prisma';
import type { BinDetail, BinRow } from '@/lib/client';

// Per part: AS400 total (inventory_stocks, read-only) vs total placed across all floor bins (bin_stocks).
// After a sync the two must match; a difference is flagged red in the UI.
export async function partTotals(partIds: string[], tx: any = prisma) {
  const ids = [...new Set(partIds)];
  const [as400, inBins] = await Promise.all([
    tx.stock.groupBy({ by: ['partId'], where: { partId: { in: ids } }, _sum: { quantity: true } }),
    tx.binStock.groupBy({ by: ['partId'], where: { partId: { in: ids } }, _sum: { quantity: true } }),
  ]);
  const m = new Map<string, { as400: number; bins: number }>(ids.map(p => [p, { as400: 0, bins: 0 }]));
  for (const r of as400) m.get(r.partId)!.as400 = r._sum.quantity ?? 0;
  for (const r of inBins) m.get(r.partId)!.bins = r._sum.quantity ?? 0;
  return m;
}

// Floor bin contents for the /bin rack map (shared by the server page and GET /api/stock)
export async function binRows(search?: string): Promise<BinRow[]> {
  const rows = await prisma.binStock.findMany({
    where: search ? { OR: [{ partId: { contains: search } }, { location: { contains: search } }] } : undefined,
    orderBy: [{ location: 'asc' }, { partId: 'asc' }],
    take: 500,
  });
  const ids = rows.map(r => r.partId);
  const [parts, totals] = await Promise.all([
    prisma.part.findMany({ where: { partNo: { in: [...new Set(ids)] } }, select: { partNo: true, partName: true } }),
    partTotals(ids),
  ]);
  const names = new Map(parts.map(p => [p.partNo, p.partName]));

  return rows.map(r => {
    const t = totals.get(r.partId)!;
    return {
      id: r.id,
      partNo: r.partId,
      partName: names.get(r.partId) ?? null,
      location: r.location,
      quantity: r.quantity,
      latestUpdateDate: r.updatedAt.toISOString().slice(0, 10),
      mismatch: t.as400 !== t.bins,
    };
  });
}

// One bin + its parts; `part` searches parts to add (shared by the server page and GET /api/bin-configs/:location)
export async function binDetail(location: string, part?: string): Promise<BinDetail> {
  const [bin, rows, found] = await Promise.all([
    prisma.binConfig.findUnique({ where: { location }, select: { id: true, location: true, maxCapacity: true, isLocked: true } }),
    prisma.binStock.findMany({ where: { location }, orderBy: { partId: 'asc' } }),
    part
      ? prisma.part.findMany({ where: { partNo: { contains: part } }, select: { partNo: true, partName: true }, take: 10 })
      : Promise.resolve([]),
  ]);

  const [parts, totals] = await Promise.all([
    prisma.part.findMany({ where: { partNo: { in: rows.map(r => r.partId) } }, select: { partNo: true, partName: true } }),
    partTotals([...rows.map(r => r.partId), ...found.map(p => p.partNo)]),
  ]);
  const names = new Map(parts.map(p => [p.partNo, p.partName]));

  return {
    bin,
    rows: rows.map(r => ({
      id: r.id, partNo: r.partId, partName: names.get(r.partId) ?? null, location: r.location,
      wh: null, quantity: r.quantity, vendorName: null,
      latestUpdateDate: r.updatedAt.toISOString().slice(0, 16).replace('T', ' '), latestOperatorName: r.updatedBy,
      as400Qty: totals.get(r.partId)!.as400, binsQty: totals.get(r.partId)!.bins,
    })),
    candidates: found.map(p => {
      const t = totals.get(p.partNo)!;
      return { partNo: p.partNo, partName: p.partName, available: Math.max(0, t.as400 - t.bins) };
    }),
  };
}
