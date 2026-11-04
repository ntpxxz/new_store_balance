import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';

// POST /api/parts/sync
// External program inserts into master_parts and inventory_stocks directly.
// This route returns a summary of the current parts/stock state.

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  try {
    // Both counts are distinct parts with stock on hand; "new" = stock updated today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const inStock = { quantity: { gt: 0 } };
    const [newParts, allParts] = await Promise.all([
      prisma.stock.groupBy({ by: ['partId'], where: { ...inStock, updatedAt: { gte: startOfToday } } }),
      prisma.stock.groupBy({ by: ['partId'], where: inStock }),
    ]);
    const newCount = newParts.length;
    const allCount = allParts.length;

    logger.info({ newCount, allCount }, 'Parts sync complete');
    return createResponse({ newCount, allCount });
  } catch (error: any) {
    logger.error({ err: error }, 'Parts sync error');
    captureException(error, { route: '/api/parts/sync' });
    return createErrorResponse(error.message || 'Parts sync failed', 500);
  }
}
