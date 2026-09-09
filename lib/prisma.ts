import { PrismaClient } from '../generated/client';
import { logger, captureException } from './logger';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Singleton pattern with forced refresh if schema changed
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Attach runtime listeners
try {
    const anyPrisma = prisma as unknown as { $on?: (event: string, cb: (payload: unknown) => void) => void };
    if (anyPrisma.$on) {

        anyPrisma.$on('info', (payload) => {
            logger.info({ payload: typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : String(payload) }, 'Prisma info');
        });

        anyPrisma.$on('warn', (payload) => {
            logger.warn({ payload: typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : String(payload) }, 'Prisma warn');
        });

        anyPrisma.$on('error', (payload) => {
            logger.error({ payload: typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : String(payload) }, 'Prisma error');
            captureException(payload, { component: 'prisma' });
        });
    }
} catch (err) {
    logger.warn('Failed to attach Prisma event listeners', String(err));
}

// In Next.js dev mode, the global object is preserved between HMR reloads.
// We store the instance on globalThis to prevent multiples PrismaClient instances.
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;