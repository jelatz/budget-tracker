import { and, eq, gt, isNull } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import type { AppDb } from '../db/client';
import { sessions, users } from '../db/schema';
import { AppError } from '../errors';
import { hashSessionToken } from './token';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
}

export interface AppEnv {
  Variables: {
    auth: AuthContext;
  };
}

/**
 * Hono middleware requiring a valid, non-revoked, unexpired Bearer session token.
 */
export function createRequireAuth(db: AppDb): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Authentication required');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Authentication required');
    }

    const tokenHash = hashSessionToken(token);
    const now = new Date();

    const rows = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        name: users.name,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    const match = rows[0];
    if (!match) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired session token');
    }

    c.set('auth', {
      userId: match.userId,
      email: match.email,
      name: match.name,
      sessionId: match.sessionId,
    });

    await next();
  };
}
