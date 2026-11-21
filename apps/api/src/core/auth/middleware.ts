import type { AuthUser } from '@repo/contracts';
import type { MiddlewareHandler } from 'hono';
import { AppError } from '../errors';
import { hashSessionToken } from './crypto';

export type AuthenticatedSession = {
  sessionId: string;
  user: AuthUser;
};

export type AuthEnvVariables = {
  authSession: AuthenticatedSession;
};

export type SessionVerifier = (
  tokenHash: string,
) => Promise<AuthenticatedSession | null>;

export function createRequireAuthMiddleware(
  verifySessionTokenHash: SessionVerifier,
): MiddlewareHandler<{ Variables: AuthEnvVariables }> {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Authentication token is required.');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Authentication token is required.');
    }

    const tokenHash = hashSessionToken(token);
    const session = await verifySessionTokenHash(tokenHash);
    if (!session) {
      throw new AppError('UNAUTHORIZED', 'Session is invalid or expired.');
    }

    c.set('authSession', session);
    await next();
  };
}
