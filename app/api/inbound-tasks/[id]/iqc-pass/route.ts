import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { logActivity, ActivityType } from '@/lib/audit';

// Called by iqcsamp system when inspection passes
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: taskId } = await context.params;

    try {
        const body = await request.json();
        const { passedQty, failedQty, inspector, defectReason, remark } = body;

        if (passedQty === undefined || isNaN(Number(passedQty))) {
            return createErrorResponse('passedQty is required', 400);
        }

        const task = await prisma.inboundTask.findUnique({ where: { id: taskId } });
        if (!task) return createErrorResponse(`Task "${taskId}" not found`, 404);

        if (task.status === 'COMPLETED' || task.status === 'REJECTED') {
            return createErrorResponse(`Task is already ${task.status}`, 409);
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedTask = await tx.inboundTask.update({
                where: { id: taskId },
                // Put-away skipped in this app: a passed IQC result completes the receipt.
                data: { status: 'COMPLETED', finishedAt: new Date(), updatedAt: new Date() }
            });

            const inspection = await tx.inspectionResult.upsert({
                where: { inboundTaskId: taskId },
                update: { passedQty, failedQty: failedQty ?? 0, judgment: 'PASS', defectReason, remark, inspector },
                create: { inboundTaskId: taskId, passedQty, failedQty: failedQty ?? 0, judgment: 'PASS', defectReason, remark, inspector }
            });

            return { updatedTask, inspection };
        });

        await prisma.notification.create({
            data: {
                type: 'IQC_PASSED',
                title: `✅ IQC ผ่าน: ${task.partNo}`,
                message: `Part ${task.partNo} (${task.invoiceNo}) ผ่าน IQC แล้ว ${passedQty} pcs — รอนำเข้า Stock`,
                data: JSON.stringify({ taskId, partNo: task.partNo, passedQty, failedQty }),
            }
        });

        await logActivity({
            userId: inspector || 'IQC_SYSTEM',
            type: ActivityType.INBOUND_STORE,
            label: `IQC Pass: ${task.partNo}`,
            description: `IQC passed ${passedQty} units of ${task.partNo}`,
            details: { taskId, partNo: task.partNo, passedQty, failedQty, inspector }
        });

        return createResponse(result);
    } catch (error: any) {
        logger.error({ err: error, taskId }, 'IQC pass error');
        captureException(error, { route: '/api/inbound-tasks/[id]/iqc-pass', action: 'POST' });
        return createErrorResponse(error.message || 'Failed to process IQC pass', 500);
    }
}
