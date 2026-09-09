type LoggerLike = {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};

type SentryLike = {
    init?: (opts?: { dsn?: string }) => void;
    captureException?: (err: Error, ctx?: Record<string, unknown>) => void;
} | null;

let Sentry: SentryLike = null;
let sentryEnabled = false;

export let logger: LoggerLike;

// Only load Node-only libraries when running on the server.
if (typeof window === 'undefined') {
    try {
        // Use eval('require') to prevent bundlers from statically analyzing the require
        // and accidentally including Node-only modules in the client bundle.
        const req = eval('require') as unknown as (id: string) => unknown;
        const pinoFactory = req('pino') as unknown as (opts?: unknown) => LoggerLike;
        logger = pinoFactory({
            level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
        });
    } catch (_err) {
        // Fallback to console if pino isn't available in the environment.
        logger = {
            debug: (...args: unknown[]) => console.debug(...(args as any)),
            info: (...args: unknown[]) => console.info(...(args as any)),
            warn: (...args: unknown[]) => console.warn(...(args as any)),
            error: (...args: unknown[]) => console.error(...(args as any)),
        };
    }

    // Initialize Sentry on server only using hidden require to avoid client bundling.
    if (process.env.SENTRY_DSN) {
        try {
            const req = eval('require') as unknown as (id: string) => unknown;
            const mod = req('@sentry/node') as unknown as { init?: (opts?: { dsn?: string }) => void; captureException?: (e: Error, ctx?: unknown) => void };
            Sentry = mod ?? null;
            if (Sentry && typeof Sentry.init === 'function') {
                Sentry.init({ dsn: process.env.SENTRY_DSN });
                sentryEnabled = true;
            }
        } catch (_initErr) {
            // Use console because logger may be a pino instance
            console.warn('Sentry failed to initialize:', _initErr);
        }
    }
} else {
    // Browser-friendly logger to avoid pulling Node-only modules into client bundle
    logger = {
        debug: (...args: unknown[]) => console.debug(...(args as any)),
        info: (...args: unknown[]) => console.info(...(args as any)),
        warn: (...args: unknown[]) => console.warn(...(args as any)),
        error: (...args: unknown[]) => console.error(...(args as any)),
    };
}

export const captureException = (err: unknown, ctx?: Record<string, unknown>) => {
    try {
        const errInfo = err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { message: (err as Record<string, unknown>)?.message != null ? String((err as Record<string, unknown>).message) : String(err) };
        logger.error({ err: errInfo, ctx } as unknown as string, 'Captured exception');
        // Send to Sentry only if initialized on server
        if (sentryEnabled && Sentry && typeof Sentry.captureException === 'function') {
            // Sentry captureException expects an Error
            const e = err instanceof Error ? err : new Error(String(err));
            Sentry.captureException(e, { ...(ctx ?? {}) });
        }
    } catch (_e) {
        console.error('Error capturing exception', _e);
    }
};

export default logger;
