import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

const IQC_SYSTEM_URL = process.env.IQC_SYSTEM_URL || 'http://localhost:3060';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    try {
        const row = await prisma.aS400Queue.findUnique({ where: { id: Number(id) } });
        if (!row) return createErrorResponse('Queue item not found', 404);
        if (row.status !== 'AWAITING_CONFIRM')
            return createErrorResponse(`Cannot confirm — status is ${row.status}`, 409);

        // Mark queue as confirmed (RPA will press Enter)
        await prisma.aS400Queue.update({
            where: { id: Number(id) },
            data: { status: 'CONFIRMED', updatedAt: new Date() },
        });

        // itemType='I' (store entry): task is already COMPLETED, StockLot already created — just CONFIRMED is enough.
        // itemType='P' (receive): promote task to IQC_WAITING so inspection can begin.
        if (row.inboundTaskId && row.itemType === 'P') {
            const task = await prisma.inboundTask.findUnique({ where: { id: row.inboundTaskId } });
            if (task && task.status === 'ARRIVED') {
                await prisma.inboundTask.update({
                    where: { id: row.inboundTaskId },
                    data: { status: 'IQC_WAITING', updatedAt: new Date() },
                });

                // Notify IQC team
                await prisma.notification.create({
                    data: {
                        type: 'IQC_WAITING',
                        title: `🔬 รอตรวจ IQC: ${task.partNo}`,
                        message: `Part ${task.partNo} (${task.invoiceNo}) บันทึก AS400 แล้ว ${task.actualQty} pcs — รอการตรวจ IQC`,
                        data: JSON.stringify({
                            taskId: task.id,
                            partNo: task.partNo,
                            partName: task.partName,
                            invoiceNo: task.invoiceNo,
                            receivedQty: task.actualQty,
                            isUrgent: task.isUrgent,
                        }),
                        isRead: false,
                    },
                });
                logger.info({ taskId: task.id, partNo: task.partNo }, 'IQC_WAITING: promoted after AS400 confirm');

                // Create task in IQC_DB so 3070 app can pick it up (non-blocking)
                fetch(`${IQC_SYSTEM_URL}/api/tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        invoice: task.invoiceNo,
                        part: task.partNo,
                        partName: task.partName || '',
                        vendor: task.vendor,
                        qty: task.actualQty,
                        receiver: task.receivedBy || 'System',
                        receivedAt: task.receivedAt ? task.receivedAt.toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
                        lotNo: task.lotNo || '',
                        poNo: task.poNo || '',
                        rev: task.rev || '',
                        mfgDate: task.mfgDate ? task.mfgDate.toLocaleDateString('en-GB') : '',
                        samplingType: task.samplingType || 'Normal',
                        aql: task.aql || '0.65',
                        totalSampling: task.totalSampling || 0,
                        urgent: task.isUrgent,
                        location: task.targetLocation || '',
                        warehouse: 'Main',
                    }),
                    signal: AbortSignal.timeout(3000),
                }).catch(e => logger.warn({ err: e.message }, 'External IQC system unreachable (non-critical)'));
            }
        }

        return createResponse({ ok: true });
    } catch (error: any) {
        logger.error({ err: error, id }, 'AS400 confirm error');
        return createErrorResponse(error.message || 'Failed to confirm AS400 queue item', 500);
    }
}
