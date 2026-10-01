import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import prisma from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only'

export async function getServerUser(): Promise<{ id: string; username: string; role: string } | null> {
    const token = (await cookies()).get('session')?.value
    if (!token) return null
    try {
        jwt.verify(token, JWT_SECRET)
        const session = await (prisma.session.findUnique as any)({
            where: { token },
            include: { user: true },
        })
        if (!session || new Date() > session.expiresAt) return null
        return { id: session.user.id, username: session.user.username, role: session.user.role }
    } catch {
        return null
    }
}
