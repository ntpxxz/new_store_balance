import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { binRows } from '@/lib/bin-rows';

// GET /api/stock?search= — parts placed in floor bins (bin_stocks), not AS400 locations.
export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  try {
    return createResponse(await binRows(new URL(request.url).searchParams.get('search')?.trim()));
  } catch (error) {
    return createErrorResponse('Failed to fetch stock', 500);
  }
}
