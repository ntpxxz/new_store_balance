import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireRole, createResponse, createErrorResponse } from '@/lib/auth';
import { validateRequest, createUserSchema, userSelect } from '@/lib/validation';

// GET /api/users — admin only
export async function GET(request: NextRequest) {
    const authResult = await requireRole(['ADMIN'])(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);
    return createResponse(await prisma.user.findMany({ select: userSelect, orderBy: { username: 'asc' } }));
}

// POST /api/users — admin only; password required on create
export async function POST(request: NextRequest) {
    const authResult = await requireRole(['ADMIN'])(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const v = validateRequest(createUserSchema, await request.json().catch(() => ({})));
    if (!v.success) return createErrorResponse(v.error, 400);
    const { password, ...data } = v.data;
    if (!password) return createErrorResponse('Password is required', 400);

    if (await prisma.user.findUnique({ where: { username: data.username } })) {
        return createErrorResponse('Username already exists', 409);
    }
    const user = await prisma.user.create({
        data: { ...data, password: await bcrypt.hash(password, 10) },
        select: userSelect,
    });
    return createResponse(user, 201);
}
