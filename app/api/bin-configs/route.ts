import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const rows = await prisma.binConfig.findMany({ orderBy: { location: 'asc' } });
  return createResponse(rows);
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const body = await request.json().catch(() => ({}));
  const location = String(body.location ?? '').trim();
  if (!location) return createErrorResponse('location is required', 400);

  const row = await prisma.binConfig.upsert({
    where: { location },
    update: { maxCapacity: Number(body.maxCapacity) || 0 },
    create: { location, maxCapacity: Number(body.maxCapacity) || 0 },
  });
  return createResponse(row, 201);
}
