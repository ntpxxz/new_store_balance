import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

const partNameFilter = { OR: [
    { partName: { contains: 'RAMP' } },
    { partName: { contains: 'DIVERTOR' } },
    { partName: { contains: 'BASEPLATE' } },
]};

export async function GET(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const [pending, iqc, completed] = await Promise.all([
        prisma.inboundTask.count({ where: { AND: [partNameFilter], status: { in: ['PENDING', 'ARRIVED'] } } }),
        prisma.inboundTask.count({ where: { AND: [partNameFilter], status: { in: ['IQC_WAITING', 'IQC_IN_PROGRESS'] } } }),
        prisma.inboundTask.count({ where: { AND: [partNameFilter], status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] } } }),
    ]);

    return createResponse({ pending, iqc, completed });
}
