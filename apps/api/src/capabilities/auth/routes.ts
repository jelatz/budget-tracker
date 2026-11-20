import { Hono } from 'hono';
import { loginInputSchema, registerInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import { loginUser, logoutSession, registerUser } from './handler';

export function createPublicAuthRoutes(db: AppDb) {
  return new Hono()
    .post('/v1/auth/register', async (c) => {
      const input = await parseJsonBody(c, registerInputSchema);
      const result = await registerUser(db, input);
      return c.json(result, 201);
    })
    .post('/v1/auth/login', async (c) => {
      const input = await parseJsonBody(c, loginInputSchema);
      const result = await loginUser(db, input);
      return c.json(result, 200);
    });
}

export function createProtectedAuthRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/auth/me', (c) => {
      const auth = c.get('auth');
      return c.json({
        user: {
          id: auth.userId,
          email: auth.email,
          name: auth.name,
        },
      });
    })
    .post('/v1/auth/logout', async (c) => {
      const auth = c.get('auth');
      await logoutSession(db, auth.sessionId);
      return c.json({ ok: true as const });
    });
}
