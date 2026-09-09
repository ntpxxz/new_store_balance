import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    try {
        const part = await prisma.part.findUnique({
            where: { id },
            include: {
                stocks: {
                    orderBy: { quantity: 'desc' },
                },
                inboundTasks: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true, invoiceNo: true, vendor: true, planQty: true, actualQty: true,
                        status: true, invoiceDate: true, receivedAt: true, lotNo: true,
                    },
                },
                movements: {
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                    select: { id: true, type: true, qty: true, docRef: true, location: true, createdAt: true },
                },
            },
        });

        if (!part) return createErrorResponse('Part not found', 404);

        const totalQty = part.stocks.reduce((s, r) => s + (r.quantity ?? 0), 0);

        return createResponse({ ...part, totalQty });
    } catch (error) {
        logger.error({ err: error }, 'Get part detail error');
        captureException(error, { route: '/api/parts/[id]' });
        return createErrorResponse('Failed to fetch part', 500);
    }
}
