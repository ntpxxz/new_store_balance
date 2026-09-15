import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse, requireRole } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { normalizeLocation, fmtDateAS400 } from '@/lib/validation';
import { logActivity, ActivityType } from '@/lib/audit';

const IQC_SYSTEM_URL = process.env.IQC_SYSTEM_URL || 'http://localhost:3060';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: taskId } = await context.params;
    const authResult = await requireRole(['ADMIN', 'SUPERVISOR', 'USER'])(request);
    if ('error' in authResult) {
        return createErrorResponse(authResult.error, authResult.status);
    }

    try {
        const body = await request.json();

        const { receivedQty, lotNo, isUrgent, note, bin } = body;

        if (receivedQty === undefined || isNaN(Number(receivedQty)) || Number(receivedQty) <= 0) {
            return createErrorResponse('Received quantity must be a positive number', 400);
        }

        if (!bin || !bin.trim()) {
            return createErrorResponse('Store bin is required', 400);
        }

        // Get the task
        const task = await prisma.inboundTask.findUnique({
            where: { id: taskId }
        });

        if (!task) {
            return createErrorResponse(`Task with ID "${taskId}" not found`, 404);
        }

        // Prevent re-receiving if already processed
        if (task.status !== 'PENDING' && task.status !== 'ARRIVED') {
            return createErrorResponse(`This task cannot be received as it is already in ${task.status} status.`, 409);
        }

        if (Number(receivedQty) > task.planQty) {
            return createErrorResponse(`Received quantity (${receivedQty}) exceeds planned quantity (${task.planQty}).`, 400);
        }

        // bin validated required above; item goes to IQC first so no existence check needed
        const targetLocation = normalizeLocation(bin);

        // Status stays ARRIVED until RPA confirms in AS400 — promote to IQC_WAITING via confirm API
        const updatedTask = await prisma.inboundTask.update({
            where: { id: taskId },
            data: {
                status: 'ARRIVED',
                actualQty: receivedQty, // actualQty records what was received for inspection
                lotNo: lotNo || undefined,
                targetLocation: targetLocation || undefined,
                isUrgent: isUrgent ?? task.isUrgent,
                receiverNote: note || undefined,
                receivedAt: new Date(),
                receivedBy: authResult.user.username,
                updatedAt: new Date()
            }
        });

        // ── 0. AS400 Queue: enqueue on physical receipt ───────────────────────
        const supplier = await prisma.supplier.findFirst({
            where: { name: task.vendor }, select: { code: true }
        });
        prisma.aS400Queue.create({
            data: {
                inboundTaskId: taskId,
                vendorCode:    supplier?.code ?? task.vendor,
                vendorName:    task.vendor,
                matLot:        task.invoiceNo,
                itemNo:        task.partNo,
                stockQty:      Number(receivedQty),
                itemType:      'P',
                invDate:       fmtDateAS400(task.invoiceDate ?? task.createdAt),
                rcvDate:       fmtDateAS400(new Date()),
                rcvBy:         authResult.user.username,
            }
        }).catch(e => logger.error({ err: e, taskId }, 'Failed to enqueue AS400 receive'));

        // ── 1. Audit Logging ──────────────────────────────────────────
        await logActivity({
            userId: authResult.user.id,
            type: ActivityType.INBOUND_RECEIVE,
            label: `Item Received: ${task.partNo}`,
            description: `Received ${receivedQty} units of ${task.partNo} from ${task.vendor}`,
            details: {
                taskId: task.id,
                partNo: task.partNo,
                qty: receivedQty,
                invoiceNo: task.invoiceNo,
                lotNo: lotNo,
                isUrgent: !!isUrgent,
                receiverNote: note,
                targetLocation: targetLocation
            }
        });

        return createResponse(updatedTask);
    } catch (error: any) {
        logger.error({ err: error, taskId }, 'Receive inbound task error');
        captureException(error, { route: '/api/inbound-tasks/[id]/receive', action: 'POST' });
        return createErrorResponse(error.message || 'Failed to receive inbound task', 500);
    }
}
