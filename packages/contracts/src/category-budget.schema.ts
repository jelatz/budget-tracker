import { z } from 'zod';
import { amountMinorSchema } from './money';
import type { Transaction } from './transactions.schema';

export const periodMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be in YYYY-MM format with month 01-12');

export const categoryBudgetSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  periodMonth: periodMonthSchema,
  assignedMinor: z.number().int().nonnegative(),
  rolloverEnabled: z.boolean().default(false),
  notes: z.string().trim().max(280).optional(),
});
export type CategoryBudget = z.infer<typeof categoryBudgetSchema>;

export const createCategoryBudgetInputSchema = categoryBudgetSchema.omit({ id: true });
export type CreateCategoryBudgetInput = z.infer<typeof createCategoryBudgetInputSchema>;

export const categoryBudgetStatusSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1),
  periodMonth: periodMonthSchema,
  assignedMinor: z.number().int().nonnegative(),
  carriedOverMinor: amountMinorSchema,
  effectiveBudgetMinor: z.number().int().nonnegative(),
  spentMinor: z.number().int().nonnegative(),
  remainingMinor: amountMinorSchema,
  utilizationPercent: z.number().nonnegative(),
  isOverspent: z.boolean(),
  rolloverEnabled: z.boolean(),
  notes: z.string().trim().max(280).optional(),
});
export type CategoryBudgetStatus = z.infer<typeof categoryBudgetStatusSchema>;

/**
 * Returns the local calendar month string in "YYYY-MM" format.
 */
export function getCurrentPeriodMonth(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Shifts a "YYYY-MM" period month string by `delta` months (positive or negative).
 */
export function shiftPeriodMonth(periodMonth: string, delta: number): string {
  const [yearStr, monthStr] = periodMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Formats a "YYYY-MM" period month string into a human-readable label (e.g. "Nov 2026").
 */
export function formatPeriodMonthLabel(periodMonth: string): string {
  const [yearStr, monthStr] = periodMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return periodMonth;
  }
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Computes previous month in "YYYY-MM" format.
 * e.g. "2026-11" -> "2026-10", "2026-01" -> "2025-12"
 */
export function getPreviousPeriodMonth(periodMonth: string): string {
  return shiftPeriodMonth(periodMonth, -1);
}

/**
 * Checks if a transaction occurred within a given local calendar "YYYY-MM" period.
 */
export function isTransactionInMonth(occurredAtIso: string, periodMonth: string): boolean {
  const d = new Date(occurredAtIso);
  if (isNaN(d.getTime())) {
    return false;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}` === periodMonth;
}

/**
 * Computes split-aware total expenses for a category in a given month.
 */
export function calculateCategoryExpenses(
  transactions: readonly Transaction[],
  categoryId: string,
  periodMonth: string,
): number {
  let spentMinor = 0;

  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') {
      continue;
    }
    if (!isTransactionInMonth(tx.occurredAt, periodMonth)) {
      continue;
    }

    if (tx.splits && tx.splits.length > 0) {
      for (const split of tx.splits) {
        if (split.categoryId === categoryId) {
          spentMinor += split.amountMinor;
        }
      }
    } else if (tx.categoryId === categoryId) {
      spentMinor += tx.amountMinor;
    }
  }

  return spentMinor;
}

/**
 * Computes envelope budgeting statuses including positive surplus or negative deficit
 * carryover from previous period.
 */
export function computeEnvelopeRollovers(params: {
  budgets: readonly CategoryBudget[];
  transactions: readonly Transaction[];
  periodMonth: string;
  previousPeriodMonth?: string;
}): CategoryBudgetStatus[] {
  const previousMonth = params.previousPeriodMonth ?? getPreviousPeriodMonth(params.periodMonth);
  const targetBudgets = params.budgets.filter((b) => b.periodMonth === params.periodMonth);

  return targetBudgets.map((budget) => {
    let carriedOverMinor = 0;

    if (budget.rolloverEnabled) {
      const prevBudget = params.budgets.find(
        (b) => b.categoryId === budget.categoryId && b.periodMonth === previousMonth,
      );

      if (prevBudget) {
        // Effective budget of previous period
        // If the previous budget also had rollover, we could calculate recursively, or use its effective budget.
        // For deterministic safety:
        let prevEffectiveBudget = prevBudget.assignedMinor;
        if (prevBudget.rolloverEnabled) {
          const twoMonthsAgo = getPreviousPeriodMonth(previousMonth);
          const prevPrevBudget = params.budgets.find(
            (b) => b.categoryId === budget.categoryId && b.periodMonth === twoMonthsAgo,
          );
          if (prevPrevBudget) {
            const prevPrevSpent = calculateCategoryExpenses(
              params.transactions,
              budget.categoryId,
              twoMonthsAgo,
            );
            const prevPrevRemaining = prevPrevBudget.assignedMinor - prevPrevSpent;
            prevEffectiveBudget = Math.max(0, prevBudget.assignedMinor + prevPrevRemaining);
          }
        }

        const prevSpent = calculateCategoryExpenses(
          params.transactions,
          budget.categoryId,
          previousMonth,
        );
        carriedOverMinor = prevEffectiveBudget - prevSpent;
      }
    }

    const effectiveBudgetMinor = budget.rolloverEnabled
      ? Math.max(0, budget.assignedMinor + carriedOverMinor)
      : budget.assignedMinor;

    const spentMinor = calculateCategoryExpenses(
      params.transactions,
      budget.categoryId,
      params.periodMonth,
    );

    const remainingMinor = effectiveBudgetMinor - spentMinor;
    const utilizationPercent =
      effectiveBudgetMinor > 0
        ? Math.round((spentMinor * 100) / effectiveBudgetMinor)
        : 0;
    const isOverspent = spentMinor > effectiveBudgetMinor;

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      periodMonth: budget.periodMonth,
      assignedMinor: budget.assignedMinor,
      carriedOverMinor,
      effectiveBudgetMinor,
      spentMinor,
      remainingMinor,
      utilizationPercent,
      isOverspent,
      rolloverEnabled: budget.rolloverEnabled,
      notes: budget.notes,
    };
  });
}
