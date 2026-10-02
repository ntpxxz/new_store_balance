import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

// GET /api/stock?search= — stock rows with part info, searchable by part or location.
export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  try {
    const search = new URL(request.url).searchParams.get('search')?.trim();
    const where: any = search ? {
      OR: [
        { part: { partNo: { contains: search } } },
        { part: { name: { contains: search } } },
        { location: { contains: search } },
        { as400Location: { contains: search } },
        { vendorName: { contains: search } },
      ],
    } : {};

    const rows = await prisma.stock.findMany({
      where,
      include: { part: { select: { partNo: true, name: true } } },
      orderBy: [{ location: 'asc' }, { part: { partNo: 'asc' } }],
      take: 500,
    });

    return createResponse(rows.map((r: any) => ({
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
    })));
  } catch (error) {
    return createErrorResponse('Failed to fetch stock', 500);
  }
}
