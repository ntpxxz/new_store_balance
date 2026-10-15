import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';

export async function DELETE(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  const { location } = await context.params;
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  await prisma.binConfig.delete({ where: { location: decodeURIComponent(location) } }).catch(() => null);
  return createResponse({ ok: true });
}
