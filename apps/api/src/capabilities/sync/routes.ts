import { syncPushRequestSchema } from '@repo/contracts';
import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthEnvVariables } from '../../core/auth/middleware';
import { AppError } from '../../core/errors';
import { parseJsonBody } from '../../core/validation';
import { handleSyncPull, handleSyncPush } from './handler';
import type { SyncRepository } from './repository';

export function createSyncRoutes(
  syncRepo: SyncRepository,
  requireAuth: MiddlewareHandler<{ Variables: AuthEnvVariables }>,
) {
  return new Hono<{ Variables: AuthEnvVariables }>()
    .get('/v1/sync', requireAuth, async (c) => {
      const session = c.get('authSession');
      const rawSince = c.req.query('sinceRevision');
      let sinceRevision: number | undefined;
      if (rawSince !== undefined && rawSince !== '') {
        const parsed = Number(rawSince);
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'sinceRevision must be a non-negative safe integer.',
          );
        }
        sinceRevision = parsed;
      }

      const response = await handleSyncPull(syncRepo, {
        userId: session.user.id,
        sinceRevision,
      });
      return c.json(response);
    })
    .post('/v1/sync', requireAuth, async (c) => {
      const session = c.get('authSession');
      const body = await parseJsonBody(c, syncPushRequestSchema);
      const response = await handleSyncPush(syncRepo, {
        userId: session.user.id,
        body,
      });
      return c.json(response);
    });
}
