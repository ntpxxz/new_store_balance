import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';

// POST /api/inbound-tasks/sync
// External program inserts into inbound_tasks directly.
// This route links partId for any tasks the external program left unresolved.

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const body = await request.json().catch(() => ({}));

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rangeStart = body.dateFrom ? new Date(body.dateFrom) : today;
    const rangeEnd = body.dateTo
      ? (() => { const d = new Date(body.dateTo); d.setHours(23, 59, 59, 999); return d; })()
      : (() => { const d = new Date(today); d.setDate(today.getDate() + 2); d.setHours(23, 59, 59, 999); return d; })();

    // Tasks inserted by external program but missing part linkage
    const unlinkedTasks = await prisma.inboundTask.findMany({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        partId: null,
        partNo: { not: '' },
      },
      select: { id: true, partNo: true },
    });

    if (dryRun) {
      const dbCount = await prisma.inboundTask.count({ where: { status: 'PENDING' } });
      return createResponse({ dryRun: true, unlinked: unlinkedTasks.length, dbCount });
    }

    let linked = 0;
    for (const task of unlinkedTasks) {
      const part = await prisma.part.findUnique({
        where: { partNo: task.partNo },
        select: { partNo: true },
      });
      if (part) {
        await prisma.inboundTask.update({
          where: { id: task.id },
          data: { partId: part.partNo },
        });
        linked++;
      }
    }

    const dbCount = await prisma.inboundTask.count({ where: { status: 'PENDING' } });

    logger.info({ unlinked: unlinkedTasks.length, linked, dbCount }, 'Inbound task sync complete');
    return createResponse({ unlinked: unlinkedTasks.length, linked, dbCount });
  } catch (error: any) {
    logger.error({ err: error }, 'Inbound task sync error');
    captureException(error, { route: '/api/inbound-tasks/sync' });
    return createErrorResponse(error.message || 'Sync failed', 500);
  }
}
