interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Prune expired entries every 5 minutes to prevent unbounded growth
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt <= now) store.delete(key);
    }
}, 5 * 60 * 1000);

/**
 * Returns true when the caller is over limit and should be rejected.
 * @param key      Unique bucket key (e.g. "login:<ip>")
 * @param limit    Max requests allowed in the window
 * @param windowMs Rolling window duration in milliseconds
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }

    entry.count += 1;
    return entry.count > limit;
}

/** Extracts the best available client IP from a Next.js request. */
export function getClientIp(request: Request): string {
    const forwarded = (request.headers as Headers).get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return 'unknown';
}
