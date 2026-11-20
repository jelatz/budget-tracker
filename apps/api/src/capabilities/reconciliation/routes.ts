import { Hono } from 'hono';
import { z } from 'zod';
import { applyReconciliationInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody, parseQuery } from '../../core/validate';
import { applyReconciliation, listReconciliations } from './handler';

const reconciliationQuerySchema = z.object({
  walletId: z.string().min(1).optional(),
});

export function createReconciliationRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/reconciliations', async (c) => {
      const { userId } = c.get('auth');
      const query = parseQuery(c, reconciliationQuerySchema);
      const items = await listReconciliations(db, userId, query.walletId);
      return c.json(items);
    })
    .post('/v1/reconciliations', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, applyReconciliationInputSchema);
      const result = await applyReconciliation(db, userId, input);
      return c.json(result, 201);
    });
}
