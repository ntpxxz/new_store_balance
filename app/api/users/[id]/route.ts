import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireRole, createResponse, createErrorResponse } from '@/lib/auth';
import { validateRequest, updateUserSchema, userSelect } from '@/lib/validation';

// PATCH /api/users/:id — admin only. No delete: users own tasks/sessions; deactivate instead.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const authResult = await requireRole(['ADMIN'])(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const v = validateRequest(updateUserSchema, await request.json().catch(() => ({})));
    if (!v.success) return createErrorResponse(v.error, 400);
    const { password, ...data } = v.data;

    // don't let an admin lock themselves out
    if (id === authResult.user.id && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) {
        return createErrorResponse('Cannot demote or deactivate your own account', 400);
    }

    try {
        const user = await prisma.user.update({
            where: { id },
            data: { ...data, ...(password ? { password: await bcrypt.hash(password, 10) } : {}) },
            select: userSelect,
        });
        // kick existing logins when access is revoked or password changes
        if (data.isActive === false || password) await prisma.session.deleteMany({ where: { userId: id } });
        return createResponse(user);
    } catch {
        return createErrorResponse('User not found', 404);
    }
}
