import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { partTotals } from '@/lib/bin-rows';

// Floor bins live in bin_stocks. AS400 inventory_stocks is read-only here: it caps how much of a part
// can be placed (available = AS400 total − already in bins) and flags parts whose totals don't match.

// GET /api/bin-configs/:location?part= — bin + its parts; `part` searches parts to add
export async function GET(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  const location = decodeURIComponent((await context.params).location);
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const part = new URL(request.url).searchParams.get('part')?.trim();
  const [bin, rows, found] = await Promise.all([
    prisma.binConfig.findUnique({ where: { location } }),
    prisma.binStock.findMany({ where: { location }, orderBy: { partId: 'asc' } }),
    part
      ? prisma.part.findMany({ where: { partNo: { contains: part } }, select: { partNo: true, partName: true }, take: 10 })
      : Promise.resolve([]),
  ]);

  const names = new Map((await prisma.part.findMany({
    where: { partNo: { in: rows.map(r => r.partId) } }, select: { partNo: true, partName: true },
  })).map(p => [p.partNo, p.partName]));
  const totals = await partTotals([...rows.map(r => r.partId), ...found.map(p => p.partNo)]);

  return createResponse({
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
  });
}

// POST /api/bin-configs/:location { action: 'add' | 'remove', partNo, qty }
export async function POST(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  const location = decodeURIComponent((await context.params).location);
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const partNo = String(body.partNo ?? '').trim();
  const qty = Number(body.qty);
  if (action !== 'add' && action !== 'remove') return createErrorResponse('action must be add or remove', 400);
  if (!partNo || !Number.isFinite(qty) || qty <= 0) return createErrorResponse('partNo and qty > 0 are required', 400);

  const bin = await prisma.binConfig.findUnique({ where: { location } });
  if (!bin) return createErrorResponse(`Bin ${location} is not registered`, 404);
  if (bin.isLocked && action === 'add') return createErrorResponse(`Bin ${location} is locked`, 409);

  const updatedBy = authResult.user.username;
  try {
    await prisma.$transaction(async (tx) => {
      const key = { location_partId: { location, partId: partNo } };
      if (action === 'add') {
        const t = (await partTotals([partNo], tx)).get(partNo)!;
        const left = t.as400 - t.bins;
        if (qty > left) throw new Error(`Only ${Math.max(0, left)} pcs of ${partNo} left to place in bins`);
        await tx.binStock.upsert({
          where: key,
          update: { quantity: { increment: qty }, updatedBy },
          create: { location, partId: partNo, quantity: qty, updatedBy },
        });
      } else {
        const row = await tx.binStock.findUnique({ where: key });
        if (!row || qty > row.quantity) throw new Error(`Only ${row?.quantity ?? 0} pcs of ${partNo} in this bin`);
        if (qty === row.quantity) await tx.binStock.delete({ where: key }); // unassign
        else await tx.binStock.update({ where: key, data: { quantity: { decrement: qty }, updatedBy } });
      }
    });
  } catch (e: any) {
    return createErrorResponse(e.message || 'Bin update failed', 400);
  }
  return createResponse({ ok: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  const { location } = await context.params;
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  await prisma.binConfig.delete({ where: { location: decodeURIComponent(location) } }).catch(() => null);
  return createResponse({ ok: true });
}
