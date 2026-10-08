import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

const partFilter = { OR: [
  { partName: { contains: 'RAMP' } },
  { partName: { contains: 'DIVERTOR' } },
  { partName: { contains: 'BASEPLATE' } },
]};

export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const [pending, iqc, completed, parts] = await Promise.all([
    prisma.inboundTask.count({ where: { AND: [partFilter], status: { in: ['PENDING', 'ARRIVED'] } } }),
    prisma.inboundTask.count({ where: { AND: [partFilter], status: { in: ['IQC_WAITING', 'IQC_IN_PROGRESS'] } } }),
    prisma.inboundTask.count({ where: { AND: [partFilter], status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] } } }),
    prisma.part.findMany({ select: { safetyStock: true, stocks: { select: { quantity: true } } } }),
  ]);

  const totalParts = parts.length;
  const inStock = parts.filter(p => p.stocks.reduce((s, r) => s + r.quantity, 0) > 0).length;
  const belowSafety = parts.filter(p => {
    const qty = p.stocks.reduce((s, r) => s + r.quantity, 0);
    return (p.safetyStock ?? 0) > 0 && qty < (p.safetyStock ?? 0);
  }).length;

  return createResponse({ pending, iqc, completed, totalParts, inStock, belowSafety });
}
