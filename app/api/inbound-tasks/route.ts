import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse, requireRole } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import { logActivity, ActivityType } from '@/lib/audit';
import { validateRequest, createInboundTaskSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) {
        return createErrorResponse(authResult.error, authResult.status);
    }

    try {
        const { searchParams } = new URL(request.url);
        const statusStr = searchParams.get('status');
        const search = searchParams.get('search');

        console.log(`[API] Fetching tasks. Status: ${statusStr}, Search: ${search}`);

        const where: any = {};

        if (statusStr && statusStr !== 'all') {
            const upStatus = statusStr.toUpperCase();
            if (upStatus === 'PENDING' || upStatus === 'RECEIVING') {
                where.status = {
                    in: ['PENDING', 'ARRIVED']
                };
            } else if (upStatus === 'SAMPLING' || upStatus === 'IQC') {
                // Awaiting IQC only — a passed result is "Done" in this app (put-away skipped)
                where.status = {
                    in: ['IQC_WAITING', 'IQC_IN_PROGRESS']
                };
            } else if (upStatus === 'COMPLETED') {
                // Done = IQC finished (pass = COMPLETED, fail = REJECTED) or closed
                where.status = {
                    in: ['COMPLETED', 'REJECTED', 'CANCELLED']
                };
            }
        }

        if (search) {
            const terms = search.split(',').map(s => s.trim()).filter(Boolean);
            if (terms.length > 0) {
                where.OR = [];
                terms.forEach(term => {
                    where.OR.push({ vendor: { contains: term } });
                    where.OR.push({ poNo: { contains: term } });
                    where.OR.push({ partNo: { contains: term } });
                    where.OR.push({ invoiceNo: { contains: term } });
                    where.OR.push({ partName: { contains: term } });
                });
            }
        }

        const tasks = await prisma.inboundTask.findMany({
            where,
            include: { inspection: true },
            orderBy: { createdAt: 'desc' },
        });

        console.log(`[API] Found ${tasks.length} tasks matching criteria.`);

        const mappedTasks = tasks.map((t: any) => ({
            ...t,
            passedQty: t.inspection?.passedQty,
            failedQty: t.inspection?.failedQty,
            judgment: t.inspection?.judgment,
            defectReason: t.inspection?.defectReason,
        }));

        return createResponse(mappedTasks);
    } catch (error) {
        logger.error({ err: error }, 'Get inbound tasks error');
        captureException(error, { route: '/api/inbound-tasks', action: 'GET' });
        return createErrorResponse('Failed to fetch inbound tasks', 500);
    }
}

export async function POST(request: NextRequest) {
    const authResult = await requireRole(['ADMIN', 'SUPERVISOR', 'USER'])(request);
    if ('error' in authResult) {
        return createErrorResponse(authResult.error, authResult.status);
    }

    try {
        const body = await request.json();

        const validation = validateRequest(createInboundTaskSchema, body);
        if (!validation.success) {
            return createErrorResponse(validation.error, 400);
        }
        const v = validation.data;
        const planQty = v.planQty ?? v.qty!;

        // ── Duplicate Invoice Guard ───────────────────────────────
        if (!v.allowDuplicate) {
            const invoiceNo = v.invoiceNo ?? v.invoice ?? 'N/A';
            if (invoiceNo !== 'N/A') {
                const existing = await prisma.inboundTask.findFirst({
                    where: {
                        invoiceNo,
                        partNo: v.partNo,
                        vendor: v.vendor,
                        status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] }
                    },
                    select: { id: true, invoiceNo: true, partNo: true, vendor: true, status: true, planQty: true, createdAt: true }
                });
                if (existing) {
                    return NextResponse.json(
                        { success: false, error: 'DUPLICATE_INVOICE', message: `Invoice ${invoiceNo} / ${v.partNo} already exists`, existing },
                        { status: 409 }
                    );
                }
            }
        }

        // Find or create Part if partId not provided
        let partId = v.partId;
        if (!partId) {
            const part = await prisma.part.findUnique({ where: { partNo: v.partNo } });
            if (part) partId = part.id;
        }

        const task = await prisma.inboundTask.create({
            data: {
                status: ((v.iqcstatus ?? v.status ?? 'PENDING')).toUpperCase(),
                invoiceNo: v.invoiceNo ?? v.invoice ?? 'N/A',
                poNo: v.poNo ?? v.po,
                vendor: v.vendor,
                partNo: v.partNo,
                partName: v.partName,
                partId,
                planQty,
                actualQty: 0,
                isUrgent: v.isUrgent ?? false,
            },
        });

        // ── Activity Log ──────────────────────────────────────────
        await logActivity({
            userId: authResult.user.id,
            type: 'INBOUND_TASK_CREATE',
            label: `Task Created: ${task.invoiceNo}`,
            description: `Created inbound task for ${task.partNo} from ${task.vendor}`,
            details: {
                taskId: task.id,
                partNo: task.partNo,
                invoiceNo: task.invoiceNo,
                vendor: task.vendor,
                planQty: task.planQty
            }
        });

        return createResponse(task, 201);
    } catch (error) {
        logger.error({ err: error }, 'Create inbound task error');
        captureException(error, { route: '/api/inbound-tasks', action: 'POST' });
        return createErrorResponse('Failed to create inbound task', 500);
    }
}
