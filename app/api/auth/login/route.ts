import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { validateRequest, loginSchema } from '@/lib/validation';
import { createResponse, createErrorResponse } from '@/lib/auth';
import { isRateLimited, getClientIp } from '@/lib/rate-limit';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

export async function POST(request: NextRequest) {
    // 10 attempts per 15 minutes per IP
    if (isRateLimited(`login:${getClientIp(request)}`, 10, 15 * 60 * 1000)) {
        return createErrorResponse('Too many login attempts — please try again later', 429);
    }

    try {
        const body = await request.json();

        // Accept either 'username' or 'email' field for the identifier
        const username = body.username || body.email;
        const password = body.password;

        if (!username || !password) {
            return NextResponse.json({ error: 'Username/Email and password are required' }, { status: 400 });
        }

        // Try to find user by email OR username
        // We use findFirst because 'email' might not be recognized as unique by some generated clients initially
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: username }, // Check if input is email
                    { username: username } // Check if input is username
                ]
            }
        });

        if (user) {
            // Check if password matches (either hashed or plain text for migration)
            let isPasswordValid = false;

            // Handle null password just in case (though schema says string)
            const storedPassword = user.password || '';

            if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
                // Hashed password
                isPasswordValid = await bcrypt.compare(password, storedPassword);
            } else {
                // Plain text password (fallback for old users)
                isPasswordValid = (password === storedPassword);
            }

            if (isPasswordValid) {
                // Create JWT token
                const token = jwt.sign(
                    { userId: user.id, role: user.role, username: user.username },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                // Create session
                // Ensure userId is valid string
                if (user.id) {
                    try {
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 7);
                        await prisma.session.create({
                            data: {
                                id: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                userId: user.id,
                                token,
                                expiresAt,
                            },
                        });
                    } catch (sessionError) {
                        console.error('Session creation failed', sessionError);
                    }
                }

                // ── Login Activity Log ─────────────────────────────────────
                const { logActivity, ActivityType } = await import('@/lib/audit');
                await logActivity({
                    userId: user.id,
                    type: 'USER_LOGIN',
                    label: `User Login: ${user.username}`,
                    description: `User successfully logged into the system`,
                    details: {
                        userId: user.id,
                        username: user.username,
                        userAgent: request.headers.get('user-agent'),
                        ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1'
                    }
                });
                // ─────────────────────────────────────────────────────────────

                const response = createResponse({
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        username: user.username,
                        name: user.username, // Map username to name for frontend compatibility
                        role: user.role,
                        section: user.section
                    }
                });
                return response;
            }
        }


        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    } catch (err) {
        console.error('Auth Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
