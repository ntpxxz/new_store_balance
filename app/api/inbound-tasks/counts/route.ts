import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { taskDateWhere } from '@/lib/date-range';

const partNameFilter = { OR: [
    { partName: { contains: 'RAMP' } },
    { partName: { contains: 'DIVERTOR' } },
    { partName: { contains: 'BASEPLATE' } },
]};

export async function GET(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    try {
        const { searchParams } = new URL(request.url);
        const dateWhere = taskDateWhere(searchParams.get('dateFrom'), searchParams.get('dateTo'));
        const base = dateWhere ? [partNameFilter, dateWhere] : [partNameFilter];
        const [pending, iqc, completed] = await Promise.all([
            prisma.inboundTask.count({ where: { AND: base, status: { in: ['PENDING', 'ARRIVED'] } } }),
            prisma.inboundTask.count({ where: { AND: base, status: { in: ['IQC_WAITING', 'IQC_IN_PROGRESS'] } } }),
            prisma.inboundTask.count({ where: { AND: base, status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] } } }),
        ]);
        return createResponse({ pending, iqc, completed });
    } catch (error) {
        logger.error({ err: error }, 'Get counts error');
        return createErrorResponse('Failed to fetch counts', 500);
    }
}
