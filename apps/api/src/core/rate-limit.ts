import type { Context, MiddlewareHandler } from 'hono';
import { AppError } from './errors';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  keyGenerator?: (c: Context) => string;
  skip?: (c: Context) => boolean;
  maxEntries?: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Extracts the client IP from standard proxy headers without trusting arbitrary
 * extra header chains beyond the first forwarded hop.
 */
export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first.slice(0, 64);
    }
  }
  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp) {
    return realIp.slice(0, 64);
  }
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfIp) {
    return cfIp.slice(0, 64);
  }
  return 'local';
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler {
  const buckets = new Map<string, RateLimitBucket>();
  const maxEntries = options.maxEntries ?? 10_000;

  return async (c, next) => {
    if (options.skip?.(c)) {
      await next();
      return;
    }

    const now = Date.now();
    if (buckets.size >= maxEntries) {
      for (const [k, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(k);
        }
      }
      if (buckets.size >= maxEntries) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) {
          buckets.delete(oldestKey);
        }
      }
    }

    const identity = options.keyGenerator
      ? options.keyGenerator(c)
      : getClientIp(c);
    const key = `${options.keyPrefix}:${identity}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      await next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      c.header('Retry-After', String(retryAfterSeconds));
      throw new AppError(
        'RATE_LIMITED',
        'Too many requests. Please try again later.',
      );
    }

    await next();
  };
}
