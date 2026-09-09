import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse, requireRole } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { normalizeLocation } from '@/lib/validation';
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

        // Handle optional bin assignment during receipt (no existence check — item goes to IQC first)
        let targetLocation = undefined;
        if (bin && bin.trim() !== '') {
            targetLocation = normalizeLocation(bin);
        }

        // Update task status to IQC_WAITING and record received quantity
        const updatedTask = await prisma.inboundTask.update({
            where: { id: taskId },
            data: {
                status: 'IQC_WAITING',
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
        const fmtDate = (d: Date | null | undefined) =>
            d ? d.toISOString().slice(0, 10).replace(/-/g, '') : '';
        prisma.aS400Queue.create({
            data: {
                inboundTaskId: taskId,
                vendorCode:    task.vendor,
                vendorName:    task.vendor,
                matLot:        task.invoiceNo,
                itemNo:        task.partNo,
                stockQty:      Number(receivedQty),
                itemType:      'P',
                invDate:       fmtDate(task.invoiceDate ?? task.createdAt),
                rcvDate:       fmtDate(new Date()),
                rcvBy:         authResult.user.username,
            }
        }).catch(e => logger.error({ err: e, taskId }, 'Failed to enqueue AS400 receive'));

        // ── 1. Notification ใน DB → แจ้ง IQC ว่ามีของรอตรวจ ──────────────────
        await prisma.notification.create({
            data: {
                type: 'IQC_WAITING',
                title: `🔬 รอตรวจ IQC: ${task.partNo}`,
                message: `${isUrgent ? '🚨 URGENT: ' : ''}Part ${task.partNo} (${task.invoiceNo}) รับแล้ว ${receivedQty} pcs — รอการตรวจ IQC${note ? ' | หมายเหตุ: ' + note : ''}`,
                data: JSON.stringify({ taskId: task.id, partNo: task.partNo, partName: task.partName, invoiceNo: task.invoiceNo, receivedQty, isUrgent: !!isUrgent, receivedBy: authResult.user.username }),
                isRead: false
            }
        });
        logger.info({ taskId, partNo: task.partNo }, 'IQC_WAITING notification created in DB');

        // ── 2. ส่งไปยัง IQC external system (iqcsamp) ถ้ามี ─────────────────
        try {
            const iqcNotification = {
                taskId: task.id,
                status: 'IQC_WAITING',
                isUrgent: !!isUrgent,
                message: `${isUrgent ? '🚨 URGENT: ' : ''}Part ${task.partNo} received. Awaiting inspection.${note ? ' Note: ' + note : ''}`
            };

            const iqcResponse = await fetch(`${IQC_SYSTEM_URL}/api/tasks`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(iqcNotification),
                signal: AbortSignal.timeout(3000) // timeout 3s ไม่ให้ block response
            });

            if (!iqcResponse.ok) {
                logger.warn({ taskId, status: iqcResponse.status }, 'External IQC system update failed (non-critical)');
            } else {
                logger.info({ taskId }, 'External IQC system updated successfully');
            }
        } catch (iqcError: any) {
            logger.warn({ err: iqcError.message, taskId }, 'External IQC system unreachable (non-critical — DB notification already saved)');
        }

        // ── 3. Audit Logging ──────────────────────────────────────────
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
