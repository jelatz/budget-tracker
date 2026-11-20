import { Hono } from 'hono';
import { z } from 'zod';
import {
  contributeSinkingFundInputSchema,
  getCurrentPeriodMonth,
  periodMonthSchema,
  settleRecurringCommitmentInputSchema,
  upsertCategoryBudgetInputSchema,
  upsertQuickPresetInputSchema,
  upsertRecurringCommitmentInputSchema,
  upsertSinkingFundInputSchema,
} from '@repo/contracts';
import type { AppEnv } from '../../core/auth/middleware';
import type { AppDb } from '../../core/db/client';
import { parseJsonBody, parseQuery } from '../../core/validate';
import {
  contributeToSinkingFund,
  deleteCategoryBudget,
  deleteQuickPreset,
  deleteRecurringCommitment,
  deleteSinkingFund,
  getSafeToSpend,
  listCategoryBudgetStatuses,
  listQuickPresets,
  listRecurringCommitments,
  listSinkingFunds,
  settleRecurringCommitment,
  unmarkRecurringCommitmentPaid,
  upsertCategoryBudget,
  upsertQuickPreset,
  upsertRecurringCommitment,
  upsertSinkingFund,
} from './handler';

const periodQuerySchema = z.object({
  periodMonth: periodMonthSchema.optional(),
});

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

const safeToSpendQuerySchema = z.object({
  date: z
    .string()
    .refine(isValidCalendarDate, 'date must be a valid calendar date in YYYY-MM-DD format')
    .optional(),
});

export function createPlanningRoutes(db: AppDb) {
  return new Hono<AppEnv>()
    .get('/v1/category-budgets', async (c) => {
      const { userId } = c.get('auth');
      const query = parseQuery(c, periodQuerySchema);
      const periodMonth = query.periodMonth ?? getCurrentPeriodMonth();
      const items = await listCategoryBudgetStatuses(db, userId, periodMonth);
      return c.json(items);
    })
    .post('/v1/category-budgets', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, upsertCategoryBudgetInputSchema);
      const saved = await upsertCategoryBudget(db, userId, input);
      return c.json(saved);
    })
    .delete('/v1/category-budgets/:id', async (c) => {
      const { userId } = c.get('auth');
      await deleteCategoryBudget(db, userId, c.req.param('id'));
      return c.json({ ok: true as const });
    })
    .get('/v1/recurring-commitments', async (c) => {
      const { userId } = c.get('auth');
      const items = await listRecurringCommitments(db, userId);
      return c.json(items);
    })
    .post('/v1/recurring-commitments', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, upsertRecurringCommitmentInputSchema);
      const saved = await upsertRecurringCommitment(db, userId, input);
      return c.json(saved);
    })
    .delete('/v1/recurring-commitments/:id', async (c) => {
      const { userId } = c.get('auth');
      await deleteRecurringCommitment(db, userId, c.req.param('id'));
      return c.json({ ok: true as const });
    })
    .post('/v1/recurring-commitments/:id/settle', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, settleRecurringCommitmentInputSchema);
      const result = await settleRecurringCommitment(
        db,
        userId,
        c.req.param('id'),
        input,
      );
      return c.json(result);
    })
    .post('/v1/recurring-commitments/:id/unmark', async (c) => {
      const { userId } = c.get('auth');
      const updated = await unmarkRecurringCommitmentPaid(
        db,
        userId,
        c.req.param('id'),
      );
      return c.json(updated);
    })
    .get('/v1/sinking-funds', async (c) => {
      const { userId } = c.get('auth');
      const items = await listSinkingFunds(db, userId);
      return c.json(items);
    })
    .post('/v1/sinking-funds', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, upsertSinkingFundInputSchema);
      const saved = await upsertSinkingFund(db, userId, input);
      return c.json(saved);
    })
    .delete('/v1/sinking-funds/:id', async (c) => {
      const { userId } = c.get('auth');
      await deleteSinkingFund(db, userId, c.req.param('id'));
      return c.json({ ok: true as const });
    })
    .post('/v1/sinking-funds/:id/contribute', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, contributeSinkingFundInputSchema);
      const result = await contributeToSinkingFund(
        db,
        userId,
        c.req.param('id'),
        input.amountMinor,
        input.sourceWalletId,
      );
      return c.json(result);
    })
    .get('/v1/quick-presets', async (c) => {
      const { userId } = c.get('auth');
      const items = await listQuickPresets(db, userId);
      return c.json(items);
    })
    .post('/v1/quick-presets', async (c) => {
      const { userId } = c.get('auth');
      const input = await parseJsonBody(c, upsertQuickPresetInputSchema);
      const saved = await upsertQuickPreset(db, userId, input);
      return c.json(saved);
    })
    .delete('/v1/quick-presets/:id', async (c) => {
      const { userId } = c.get('auth');
      await deleteQuickPreset(db, userId, c.req.param('id'));
      return c.json({ ok: true as const });
    })
    .get('/v1/safe-to-spend', async (c) => {
      const { userId } = c.get('auth');
      const query = parseQuery(c, safeToSpendQuerySchema);
      let date: Date | undefined;
      if (query.date) {
        const [y, m, d] = query.date.split('-').map((n) => parseInt(n, 10));
        date = new Date(y, m - 1, d, 12, 0, 0);
      }
      const metrics = await getSafeToSpend(db, userId, date);
      return c.json(metrics);
    });
}
