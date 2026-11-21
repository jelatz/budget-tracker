import {
  loginInputSchema,
  logoutResponseSchema,
  meResponseSchema,
  registerInputSchema,
} from '@repo/contracts';
import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthEnvVariables } from '../../core/auth/middleware';
import { AppError } from '../../core/errors';
import { parseJsonBody } from '../../core/validation';
import { handleDemoLogin, handleLogin, handleRegister } from './handler';
import type { AuthRepository } from './repository';

export function createAuthRoutes(
  authRepo: AuthRepository,
  requireAuth: MiddlewareHandler<{ Variables: AuthEnvVariables }>,
  options?: { allowDemoEndpoint?: () => boolean },
) {
  return new Hono<{ Variables: AuthEnvVariables }>()
    .post('/v1/auth/register', async (c) => {
      const body = await parseJsonBody(c, registerInputSchema);
      const session = await handleRegister(authRepo, body);
      return c.json(session, 201);
    })
    .post('/v1/auth/login', async (c) => {
      const body = await parseJsonBody(c, loginInputSchema);
      const session = await handleLogin(authRepo, body);
      return c.json(session);
    })
    .post('/v1/auth/demo', async (c) => {
      if (!options?.allowDemoEndpoint?.()) {
        throw new AppError(
          'FORBIDDEN',
          'Unauthenticated demo endpoint is disabled. Sign in with demo credentials.',
        );
      }
      const session = await handleDemoLogin(authRepo);
      return c.json(session);
    })
    .get('/v1/auth/me', requireAuth, (c) => {
      const session = c.get('authSession');
      return c.json(meResponseSchema.parse({ user: session.user }));
    })
    .post('/v1/auth/logout', requireAuth, async (c) => {
      const session = c.get('authSession');
      await authRepo.revokeSession(session.sessionId, session.user.id);
      return c.json(logoutResponseSchema.parse({ success: true }));
    });
}
