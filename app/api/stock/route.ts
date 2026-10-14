import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

// GET /api/stock?search= — stock rows in registered physical bins only (not raw AS400 locations).
export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  try {
    const search = new URL(request.url).searchParams.get('search')?.trim();

    const bins = await prisma.binConfig.findMany({ select: { location: true } });
    const binLocations = bins.map(b => b.location);

    const where: any = { location: { in: binLocations } };
    if (search) {
      where.OR = [
        { partId: { contains: search } },
        { location: { contains: search } },
        { vendorName: { contains: search } },
      ];
    }

    const rows = await prisma.stock.findMany({
      where,
      orderBy: [{ location: 'asc' }, { partId: 'asc' }],
      take: 500,
    });

    const partIds = [...new Set(rows.map((r: any) => r.partId).filter(Boolean))];
    const parts = await prisma.part.findMany({
      where: { partNo: { in: partIds } },
      select: { partNo: true, partName: true },
    });
    const partMap = new Map(parts.map((p: any) => [p.partNo, p]));

    return createResponse(rows.map((r: any) => ({
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
    })));
  } catch (error) {
    return createErrorResponse('Failed to fetch stock', 500);
  }
}
