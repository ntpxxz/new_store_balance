import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const row = await prisma.aS400Queue.findUnique({ where: { id: Number(id) } });
    if (!row) return createErrorResponse('Queue item not found', 404);
    if (row.status !== 'AWAITING_CONFIRM')
        return createErrorResponse(`Cannot reject — status is ${row.status}`, 409);
    // Store-entry items (itemType='I') are already COMPLETED in the app — StockLot exists.
    // Rejecting would leave stock/task inconsistent. Confirm only; fix AS400 manually.
    if (row.itemType === 'I')
        return createErrorResponse('Store-entry items cannot be rejected — confirm and correct AS400 manually', 422);

    await prisma.aS400Queue.update({
        where: { id: Number(id) },
        data: { status: 'FAILED', error: 'Rejected by operator', updatedAt: new Date() },
    });

    // Revert inbound task to PENDING so the receiver can retry
    if (row.inboundTaskId && row.itemType === 'P') {
        await prisma.inboundTask.update({
            where: { id: row.inboundTaskId },
            data: { status: 'PENDING', updatedAt: new Date() },
        }).catch(e => logger.warn({ err: e }, 'Failed to revert inbound task status'));
        logger.info({ taskId: row.inboundTaskId }, 'Inbound task reverted to PENDING after AS400 reject');
    }

    return createResponse({ ok: true });
}
