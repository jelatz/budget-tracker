import { z } from 'zod';
import { amountMinorSchema, currencyCodeSchema, positiveAmountMinorSchema } from './money';
import type { Wallet } from './transactions.schema';
import type { CategoryBudgetStatus } from './category-budget.schema';
import type { SinkingFund } from './sinking-funds.schema';

export const commitmentFrequencySchema = z.enum([
  'MONTHLY',
  'WEEKLY',
  'BIWEEKLY',
  'QUARTERLY',
  'YEARLY',
]);
export type CommitmentFrequency = z.infer<typeof commitmentFrequencySchema>;

export const recurringCommitmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amountMinor: positiveAmountMinorSchema,
  currency: currencyCodeSchema.default('PHP'),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  frequency: commitmentFrequencySchema.default('MONTHLY'),
  dueDay: z.number().int().min(1).max(31),
  isAutoPaid: z.boolean().default(false),
  isActive: z.boolean().default(true),
  lastPaidPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Must be in YYYY-MM format')
    .optional(),
  notes: z.string().trim().max(280).optional(),
});
export type RecurringCommitment = z.infer<typeof recurringCommitmentSchema>;

export const createRecurringCommitmentInputSchema = recurringCommitmentSchema.omit({ id: true });
export type CreateRecurringCommitmentInput = z.infer<
  typeof createRecurringCommitmentInputSchema
>;

export const safeToSpendMetricsSchema = z.object({
  totalLiquidBalanceMinor: amountMinorSchema,
  upcomingFixedBillsMinor: z.number().int().nonnegative(),
  remainingCategoryBudgetsMinor: z.number().int().nonnegative(),
  isolatedSinkingFundsMinor: z.number().int().nonnegative(),
  safeToSpendMinor: amountMinorSchema,
  daysRemainingInMonth: z.number().int().positive(),
  dailyDiscretionaryBudgetMinor: z.number().int().nonnegative(),
});
export type SafeToSpendMetrics = z.infer<typeof safeToSpendMetricsSchema>;

/**
 * Computes real-time "Safe to Spend" liquidity:
 * Safe to Spend = totalLiquidBalance - (isolatedSinkingFunds + upcomingFixedBills + sum(max(0, remainingCategoryBudgets)))
 * Daily discretionary = max(0, safeToSpend) / daysRemainingInMonth (clamped to at least 1 day).
 */
export function computeSafeToSpend(params: {
  liquidWallets: readonly Wallet[];
  commitments: readonly RecurringCommitment[];
  categoryBudgets: readonly CategoryBudgetStatus[];
  sinkingFunds: readonly SinkingFund[];
  currentDate?: Date;
}): SafeToSpendMetrics {
  const now = params.currentDate ?? new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const currentDay = now.getDate();

  // Days in this month (last day of month)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysRemainingInMonth = Math.max(1, daysInMonth - currentDay + 1);

  const currentPeriod = `${year}-${String(month + 1).padStart(2, '0')}`;

  const totalLiquidBalanceMinor = params.liquidWallets.reduce(
    (acc, w) => acc + w.balanceMinor,
    0,
  );

  const upcomingFixedBillsMinor = params.commitments
    .filter(
      (c) =>
        c.isActive &&
        c.lastPaidPeriod !== currentPeriod &&
        c.dueDay >= currentDay,
    )
    .reduce((acc, c) => acc + c.amountMinor, 0);

  const isolatedSinkingFundsMinor = params.sinkingFunds.reduce(
    (acc, sf) => acc + sf.currentSavedMinor,
    0,
  );

  const remainingCategoryBudgetsMinor = params.categoryBudgets.reduce(
    (acc, b) => acc + Math.max(0, b.remainingMinor),
    0,
  );

  const safeToSpendMinor =
    totalLiquidBalanceMinor -
    (isolatedSinkingFundsMinor + upcomingFixedBillsMinor + remainingCategoryBudgetsMinor);

  const dailyDiscretionaryBudgetMinor = Math.max(
    0,
    Math.floor(Math.max(0, safeToSpendMinor) / daysRemainingInMonth),
  );

  return {
    totalLiquidBalanceMinor,
    upcomingFixedBillsMinor,
    remainingCategoryBudgetsMinor,
    isolatedSinkingFundsMinor,
    safeToSpendMinor,
    daysRemainingInMonth,
    dailyDiscretionaryBudgetMinor,
  };
}
