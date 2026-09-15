import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { fmtDateAS400 } from '@/lib/validation';
import { logActivity, ActivityType } from '@/lib/audit';

const IQC_API_KEY = process.env.IQC_API_KEY;

// Called by iqcsamp system when inspection passes
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: taskId } = await context.params;

    if (IQC_API_KEY) {
        const key = request.headers.get('x-api-key');
        if (key !== IQC_API_KEY) return createErrorResponse('Unauthorized', 401);
    }

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

        // Resolve partId — needed for StockLot (may not be set on older tasks)
        const partId = task.partId ||
            (await prisma.part.findUnique({ where: { partNo: task.partNo }, select: { id: true } }))?.id;

        const result = await prisma.$transaction(async (tx) => {
            const updatedTask = await tx.inboundTask.update({
                where: { id: taskId },
                data: { status: 'COMPLETED', finishedAt: new Date(), updatedAt: new Date() }
            });

            const inspection = await tx.inspectionResult.upsert({
                where: { inboundTaskId: taskId },
                update: { passedQty, failedQty: failedQty ?? 0, judgment: 'PASS', defectReason, remark, inspector },
                create: { inboundTaskId: taskId, passedQty, failedQty: failedQty ?? 0, judgment: 'PASS', defectReason, remark, inspector }
            });

            // Create StockLot at the bin chosen during receive
            if (partId && task.targetLocation) {
                await tx.stockLot.create({
                    data: {
                        partId,
                        location: task.targetLocation,
                        lotNo: task.lotNo || undefined,
                        invoiceNo: task.invoiceNo,
                        originalQty: Number(passedQty),
                        remainingQty: Number(passedQty),
                    }
                });
            }

            return { updatedTask, inspection };
        });

        // AS400 store entry — non-blocking
        if (task.targetLocation) {
            const supplier = await prisma.supplier.findFirst({
                where: { name: task.vendor }, select: { code: true }
            });
            prisma.aS400Queue.create({
                data: {
                    inboundTaskId: taskId,
                    vendorCode: supplier?.code ?? task.vendor,
                    vendorName: task.vendor,
                    matLot: task.invoiceNo,
                    itemNo: task.partNo,
                    stockQty: Number(passedQty),
                    itemType: 'I',
                    invDate: fmtDateAS400(task.invoiceDate ?? task.createdAt),
                    rcvDate: fmtDateAS400(new Date()),
                    rcvBy: inspector || 'IQC_SYSTEM',
                }
            }).catch(e => logger.error({ err: e, taskId }, 'Failed to enqueue AS400 store'));
        }

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
