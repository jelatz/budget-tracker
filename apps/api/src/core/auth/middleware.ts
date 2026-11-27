import type { AuthUser } from '@repo/contracts';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../errors';
import { SESSION_COOKIE_NAME } from './cookie';
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

export const OAUTH_ACCESS_TOKEN_PREFIX = 'bt_at_';
export const OAUTH_REFRESH_TOKEN_PREFIX = 'bt_rt_';
export const OAUTH_CODE_TOKEN_PREFIX = 'bt_code_';

export function isNonAccessToken(token: string): boolean {
  return (
    token.startsWith(OAUTH_REFRESH_TOKEN_PREFIX) ||
    token.startsWith(OAUTH_CODE_TOKEN_PREFIX)
  );
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createRequireAuthMiddleware(
  verifySessionTokenHash: SessionVerifier,
): MiddlewareHandler<{ Variables: AuthEnvVariables }> {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    let token: string | undefined;
    let usingCookieAuth = false;

    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const candidate = authHeader.slice(7).trim();
      if (candidate) {
        token = candidate;
      }
    }

    if (!token) {
      const cookieToken = getCookie(c, SESSION_COOKIE_NAME)?.trim();
      if (cookieToken) {
        token = cookieToken;
        usingCookieAuth = true;
      }
    }

    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Authentication token is required.');
    }

    if (isNonAccessToken(token)) {
      throw new AppError('UNAUTHORIZED', 'Invalid access token.');
    }

    if (usingCookieAuth && STATE_CHANGING_METHODS.has(c.req.method.toUpperCase())) {
      const requestedWith = c.req.header('x-requested-with')?.trim();
      if (!requestedWith) {
        throw new AppError('FORBIDDEN', 'Missing required CSRF protection header.');
      }
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
