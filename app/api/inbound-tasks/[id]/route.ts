import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const task = await prisma.inboundTask.findUnique({
        where: { id },
        include: { inspection: true },
    });

    if (!task) return createErrorResponse('Task not found', 404);

    return createResponse({
        ...task,
        passedQty: task.inspection?.passedQty ?? null,
        failedQty: task.inspection?.failedQty ?? null,
        judgment: task.inspection?.judgment ?? null,
        defectReason: task.inspection?.defectReason ?? null,
    });
}
