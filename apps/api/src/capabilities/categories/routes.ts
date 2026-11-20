import { Hono } from 'hono';
import { createCategoryInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import { createCustomCategory, listCategories } from './handler';

export function createCategoryRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/categories', async (c) => {
      const { userId } = c.get('auth');
      const items = await listCategories(db, userId);
      return c.json(items);
    })
    .post('/v1/categories', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, createCategoryInputSchema);
      const created = await createCustomCategory(db, userId, input);
      return c.json(created, 201);
    });
}
