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
    const [partCount, stockCount] = await Promise.all([
      prisma.part.count(),
      prisma.stock.count(),
    ]);

    logger.info({ partCount, stockCount }, 'Parts sync complete');
    return createResponse({ partCount, stockCount });
  } catch (error: any) {
    logger.error({ err: error }, 'Parts sync error');
    captureException(error, { route: '/api/parts/sync' });
    return createErrorResponse(error.message || 'Parts sync failed', 500);
  }
}
