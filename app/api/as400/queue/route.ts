import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    try {
        const rows = await prisma.aS400Queue.findMany({
            where: { status: 'AWAITING_CONFIRM' },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, vendorCode: true, vendorName: true,
                matLot: true, itemNo: true, stockQty: true,
                screenshot: true, createdAt: true, status: true,
            },
        });
        return createResponse(rows);
    } catch (error) {
        logger.error({ err: error }, 'Get AS400 queue error');
        return createErrorResponse('Failed to fetch AS400 queue', 500);
    }
}
