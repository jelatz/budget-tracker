import { Hono } from 'hono';
import { updateMonthlyBudgetInputSchema } from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody } from '../../core/validate';
import { getSettings, updateMonthlyBudget } from './handler';

export function createSettingsRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/settings', async (c) => {
      const { userId } = c.get('auth');
      const settings = await getSettings(db, userId);
      return c.json(settings);
    })
    .patch('/v1/settings/monthly-budget', async (c) => {
      const { userId } = c.get('auth');
      const { monthlyBudgetMinor } = await parseJsonBody(
        c,
        updateMonthlyBudgetInputSchema,
      );
      const updated = await updateMonthlyBudget(db, userId, monthlyBudgetMinor);
      return c.json(updated);
    });
}
