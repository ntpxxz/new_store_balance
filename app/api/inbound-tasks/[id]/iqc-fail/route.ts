import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { logActivity, ActivityType } from '@/lib/audit';

const IQC_API_KEY = process.env.IQC_API_KEY;

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: taskId } = await context.params;

    // Accept API key (iqcsamp system) or JWT (UI users)
    const hasApiKey = IQC_API_KEY && request.headers.get('x-api-key') === IQC_API_KEY;
    if (!hasApiKey) {
        const authResult = await verifyAuth(request);
        if ('error' in authResult) return createErrorResponse('Unauthorized', 401);
    }

    try {
        const body = await request.json();
        const { passedQty = 0, failedQty, defectReason, remark, inspector } = body;

        const task = await prisma.inboundTask.findUnique({ where: { id: taskId } });
        if (!task) return createErrorResponse(`Task "${taskId}" not found`, 404);

        if (task.status === 'COMPLETED' || task.status === 'REJECTED') {
            return createErrorResponse(`Task is already ${task.status}`, 409);
        }

        const resolvedFailedQty = failedQty ?? ((task.actualQty ?? 0) - Number(passedQty));

        const result = await prisma.$transaction(async (tx) => {
            const updatedTask = await tx.inboundTask.update({
                where: { id: taskId },
                data: { status: 'REJECTED', finishedAt: new Date(), updatedAt: new Date() }
            });

            const inspection = await tx.inspectionResult.upsert({
                where: { inboundTaskId: taskId },
                update: { passedQty: Number(passedQty), failedQty: Number(resolvedFailedQty), judgment: 'FAIL', defectReason, remark, inspector },
                create: { inboundTaskId: taskId, passedQty: Number(passedQty), failedQty: Number(resolvedFailedQty), judgment: 'FAIL', defectReason, remark, inspector }
            });

            return { updatedTask, inspection };
        });

        await prisma.notification.create({
            data: {
                type: 'IQC_FAILED',
                title: `IQC ไม่ผ่าน: ${task.partNo}`,
                message: `Part ${task.partNo} (${task.invoiceNo}) ไม่ผ่าน IQC — ${defectReason ?? 'ไม่ระบุสาเหตุ'}`,
                data: JSON.stringify({ taskId, partNo: task.partNo, passedQty, failedQty: resolvedFailedQty, defectReason }),
            }
        });

        await logActivity({
            userId: inspector || 'IQC_SYSTEM',
            type: ActivityType.INBOUND_STORE,
            label: `IQC Fail: ${task.partNo}`,
            description: `IQC rejected ${resolvedFailedQty} units of ${task.partNo}`,
            details: { taskId, partNo: task.partNo, passedQty, failedQty: resolvedFailedQty, defectReason, inspector }
        });

        return createResponse(result);
    } catch (error: any) {
        logger.error({ err: error, taskId }, 'IQC fail error');
        captureException(error, { route: '/api/inbound-tasks/[id]/iqc-fail', action: 'POST' });
        return createErrorResponse(error.message || 'Failed to process IQC fail', 500);
    }
}
