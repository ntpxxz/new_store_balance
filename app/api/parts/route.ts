import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';

// GET /api/parts?search= — parts master with on-hand stock rolled up per part.
export async function GET(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) {
        return createErrorResponse(authResult.error, authResult.status);
    }

    try {
        const search = new URL(request.url).searchParams.get('search')?.trim();
        const where: any = {};
        if (search) {
            where.OR = [
                { partNo: { contains: search } },
                { name: { contains: search } },
                { divisionName: { contains: search } },
            ];
        }

        const parts = await prisma.part.findMany({
            where,
            include: { stocks: { select: { quantity: true, location: true } } },
            orderBy: { partNo: 'asc' },
            take: 500, // ponytail: cap the list; add paging if the master grows past this
        });

        const rows = parts.map((p: any) => {
            const qty = p.stocks.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
            return {
                id: p.id,
                partNo: p.partNo,
                name: p.name,
                unit: p.unit,
                safetyStock: p.safetyStock ?? 0,
                divisionName: p.divisionName,
                qty,
                locations: p.stocks.map((r: any) => r.location).filter(Boolean),
            };
        });

        return createResponse(rows);
    } catch (error) {
        logger.error({ err: error }, 'Get parts error');
        captureException(error, { route: '/api/parts', action: 'GET' });
        return createErrorResponse('Failed to fetch parts', 500);
    }
}
