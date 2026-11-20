import { Hono } from 'hono';
import { importBackupInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import {
  clearUserTransactions,
  exportBackupEnvelope,
  importBackupEnvelope,
  resetDemoWorkspace,
} from './handler';

export function createPortabilityRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/portability/export', async (c) => {
      const { userId } = c.get('auth');
      const envelope = await exportBackupEnvelope(db, userId);
      return c.json(envelope);
    })
    .post('/v1/portability/import', async (c) => {
      const { userId } = c.get('auth');
      const { envelope, mode } = await parseJsonBody(c, importBackupInputSchema);
      const result = await importBackupEnvelope(db, userId, envelope, mode);
      return c.json(result);
    })
    .post('/v1/account/reset-demo', async (c) => {
      const { userId } = c.get('auth');
      await resetDemoWorkspace(db, userId);
      return c.json({ ok: true as const });
    })
    .post('/v1/account/clear-transactions', async (c) => {
      const { userId } = c.get('auth');
      await clearUserTransactions(db, userId);
      return c.json({ ok: true as const });
    });
}
