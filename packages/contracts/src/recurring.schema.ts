import { z } from 'zod';
import { amountMinorSchema, currencyCodeSchema, positiveAmountMinorSchema } from './money';
import type { Wallet } from './transactions.schema';
import { periodMonthSchema, type CategoryBudgetStatus } from './category-budget.schema';
import type { SinkingFund } from './sinking-funds.schema';

export const commitmentTypeSchema = z.enum(['EXPENSE', 'INCOME']);
export type CommitmentType = z.infer<typeof commitmentTypeSchema>;

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
  type: commitmentTypeSchema.default('EXPENSE'),
  amountMinor: positiveAmountMinorSchema,
  currency: currencyCodeSchema.default('PHP'),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  frequency: commitmentFrequencySchema.default('MONTHLY'),
  dueDay: z.number().int().min(1).max(31),
  isAutoPaid: z.boolean().default(false),
  isActive: z.boolean().default(true),
  lastPaidPeriod: periodMonthSchema.optional(),
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
  overdueFixedBillsMinor: z.number().int().nonnegative().default(0),
  expectedRemainingIncomeMinor: z.number().int().nonnegative().default(0),
  remainingCategoryBudgetsMinor: z.number().int().nonnegative(),
  isolatedSinkingFundsMinor: z.number().int().nonnegative(),
  safeToSpendMinor: amountMinorSchema,
  daysRemainingInMonth: z.number().int().positive(),
  dailyDiscretionaryBudgetMinor: z.number().int().nonnegative(),
});
export type SafeToSpendMetrics = z.infer<typeof safeToSpendMetricsSchema>;

/**
 * Computes real-time "Safe to Spend" liquidity:
 * Safe to Spend = totalLiquidBalance - (isolatedSinkingFunds + unpaidFixedBills + sum(max(0, remainingCategoryBudgets)))
 * Overdue unpaid bills remain reserved until settled; recurring income is informational only.
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

  const unpaidExpenseCommitments = params.commitments.filter(
    (c) =>
      c.isActive &&
      (c.type ?? 'EXPENSE') === 'EXPENSE' &&
      c.lastPaidPeriod !== currentPeriod,
  );

  const overdueFixedBillsMinor = unpaidExpenseCommitments
    .filter((c) => c.dueDay < currentDay)
    .reduce((acc, c) => acc + c.amountMinor, 0);

  const upcomingFixedBillsMinor = unpaidExpenseCommitments.reduce(
    (acc, c) => acc + c.amountMinor,
    0,
  );

  const expectedRemainingIncomeMinor = params.commitments
    .filter(
      (c) =>
        c.isActive &&
        c.type === 'INCOME' &&
        c.lastPaidPeriod !== currentPeriod,
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
    overdueFixedBillsMinor,
    expectedRemainingIncomeMinor,
    remainingCategoryBudgetsMinor,
    isolatedSinkingFundsMinor,
    safeToSpendMinor,
    daysRemainingInMonth,
    dailyDiscretionaryBudgetMinor,
  };
}
