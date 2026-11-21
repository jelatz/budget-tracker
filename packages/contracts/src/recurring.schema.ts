import { z } from 'zod';
import {
  amountMinorSchema,
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  positiveAmountMinorSchema,
} from './money';
import type { Account } from './transactions.schema';
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

export const commitmentKindSchema = z.enum(['RECURRING', 'INSTALLMENT']);
export type CommitmentKind = z.infer<typeof commitmentKindSchema>;

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Parses a strict YYYY-MM-DD calendar date string into a local noon Date.
 * Returns null if the format or calendar day is invalid (e.g. 2026-02-31).
 */
export function parseCalendarDate(dateStr: string): Date | null {
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const constructed = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    constructed.getFullYear() !== year ||
    constructed.getMonth() !== month - 1 ||
    constructed.getDate() !== day
  ) {
    return null;
  }

  return constructed;
}

/**
 * Formats a Date into local YYYY-MM-DD without UTC timezone shift.
 */
export function formatCalendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a YYYY-MM-DD calendar date into a compact display label (e.g. "Nov 28" or "Apr 25, 2027").
 */
export function formatCalendarDateShort(dateStr: string, referenceYear?: number): string {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return dateStr;

  const monthName = SHORT_MONTH_NAMES[parsed.getMonth()] ?? 'Jan';
  const day = parsed.getDate();
  const year = parsed.getFullYear();
  const compareYear = referenceYear ?? new Date().getFullYear();
  return year === compareYear ? `${monthName} ${day}` : `${monthName} ${day}, ${year}`;
}

export const calendarDateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
  .refine((val) => parseCalendarDate(val) !== null, 'Must be a valid calendar date');

export const recurringCommitmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: commitmentKindSchema.default('RECURRING'),
  amountMinor: positiveAmountMinorSchema,
  currency: currencyCodeSchema.default(DEFAULT_CURRENCY),
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  frequency: commitmentFrequencySchema.default('MONTHLY'),
  dueDay: z.number().int().min(1).max(31),
  dueLabel: z.string().trim().min(1).max(40).optional(),
  nextDueDate: calendarDateStringSchema.optional(),
  previousNextDueDate: calendarDateStringSchema.optional(),
  isAutoPaid: z.boolean().default(false),
  isActive: z.boolean().default(true),
  totalInstallments: z.number().int().positive().optional(),
  paidInstallments: z.number().int().nonnegative().default(0),
  lastPaidPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Must be in YYYY-MM format')
    .optional(),
  lastPaidTransactionId: z.string().min(1).optional(),
  notes: z.string().trim().max(280).optional(),
});
export type RecurringCommitment = z.infer<typeof recurringCommitmentSchema>;
export type RecurringCommitmentInput = z.input<typeof recurringCommitmentSchema>;

export const createRecurringCommitmentInputSchema = recurringCommitmentSchema.omit({ id: true });
export type CreateRecurringCommitmentInput = z.infer<
  typeof createRecurringCommitmentInputSchema
>;

export interface InstallmentProgress {
  paidCount: number;
  totalCount: number;
  remainingCount: number;
  remainingBalanceMinor: number;
  progressPercent: number;
  isPaidOff: boolean;
}

/**
 * Returns true when a termed commitment has reached or exceeded its Total Terms.
 */
export function isCommitmentPaidOff(commitment: RecurringCommitment): boolean {
  return (
    typeof commitment.totalInstallments === 'number' &&
    commitment.totalInstallments > 0 &&
    commitment.paidInstallments >= commitment.totalInstallments
  );
}

/**
 * Computes integer minor-unit payoff progress for any commitment with Total Terms (`totalInstallments`).
 */
export function computeInstallmentProgress(
  commitment: RecurringCommitment,
): InstallmentProgress {
  const totalCount = commitment.totalInstallments ?? 0;
  const paidCount =
    totalCount > 0
      ? Math.min(commitment.paidInstallments, totalCount)
      : commitment.paidInstallments;
  const remainingCount = totalCount > 0 ? Math.max(0, totalCount - paidCount) : 0;
  const remainingBalanceMinor = remainingCount * commitment.amountMinor;
  const progressPercent =
    totalCount > 0 ? Math.min(100, Math.round((paidCount * 100) / totalCount)) : 0;
  const isPaidOff = totalCount > 0 && paidCount >= totalCount;

  return {
    paidCount,
    totalCount,
    remainingCount,
    remainingBalanceMinor,
    progressPercent,
    isPaidOff,
  };
}

/**
 * Advances a YYYY-MM-DD due date by one billing cycle according to frequency,
 * clamping month-end days against `anchorDueDay` (e.g. Jan 31 -> Feb 28 -> Mar 31).
 */
export function advanceNextDueDate(
  dateStr: string,
  frequency: CommitmentFrequency,
  anchorDueDay?: number,
): string {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return dateStr;

  if (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') {
    const stepDays = frequency === 'WEEKLY' ? 7 : 14;
    return formatCalendarDateString(
      new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + stepDays, 12, 0, 0, 0),
    );
  }

  const monthsToAdd = frequency === 'YEARLY' ? 12 : frequency === 'QUARTERLY' ? 3 : 1;
  const targetMonthStart = new Date(
    parsed.getFullYear(),
    parsed.getMonth() + monthsToAdd,
    1,
    12,
    0,
    0,
    0,
  );
  const daysInTargetMonth = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const targetDay = Math.min(anchorDueDay ?? parsed.getDate(), daysInTargetMonth);

  return formatCalendarDateString(
    new Date(
      targetMonthStart.getFullYear(),
      targetMonthStart.getMonth(),
      targetDay,
      12,
      0,
      0,
      0,
    ),
  );
}

export type NextDueDatePreset = 'TODAY' | 'NEXT_WEEK' | 'NEXT_MONTH';

/**
 * Computes a YYYY-MM-DD preset string for Today, +1 Week, or Next Month (clamped to anchorDueDay).
 */
export function getNextDueDatePreset(
  preset: NextDueDatePreset,
  anchorDueDay?: number,
  currentDate?: Date,
): string {
  const now = currentDate ?? new Date();
  if (preset === 'TODAY') {
    return formatCalendarDateString(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0),
    );
  }
  if (preset === 'NEXT_WEEK') {
    return formatCalendarDateString(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12, 0, 0, 0),
    );
  }
  const baseDay =
    typeof anchorDueDay === 'number' && anchorDueDay >= 1 && anchorDueDay <= 31
      ? anchorDueDay
      : now.getDate();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0, 0);
  const daysInNextMonth = new Date(
    nextMonthStart.getFullYear(),
    nextMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const clampedDay = Math.min(baseDay, daysInNextMonth);
  return formatCalendarDateString(
    new Date(
      nextMonthStart.getFullYear(),
      nextMonthStart.getMonth(),
      clampedDay,
      12,
      0,
      0,
      0,
    ),
  );
}

export type CommitmentDueState =
  | 'PAID_OFF'
  | 'PAID'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'UPCOMING_THIS_MONTH'
  | 'FUTURE_MONTH'
  | 'CUSTOM_SCHEDULE';

export interface CommitmentDueInfo {
  state: CommitmentDueState;
  isPaidOff: boolean;
  isPaid: boolean;
  isDueThisMonth: boolean;
  isUpcomingInMonth: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
}

/**
 * Computes consistent due-date status across cards, tables, KPI summaries, and Safe-to-Spend.
 */
export function getCommitmentDueStatus(
  commitment: RecurringCommitment,
  currentDate?: Date,
): CommitmentDueInfo {
  const now = currentDate ?? new Date();
  const todayStr = formatCalendarDateString(now);
  const currentPeriod = todayStr.slice(0, 7);
  const currentDay = now.getDate();
  const isPaidOff = isCommitmentPaidOff(commitment);
  const isPaid = commitment.lastPaidPeriod === currentPeriod;

  if (isPaidOff) {
    return {
      state: 'PAID_OFF',
      isPaidOff: true,
      isPaid,
      isDueThisMonth: false,
      isUpcomingInMonth: false,
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (isPaid) {
    return {
      state: 'PAID',
      isPaidOff: false,
      isPaid: true,
      isDueThisMonth: false,
      isUpcomingInMonth: false,
      isOverdue: false,
      isDueToday: false,
    };
  }

  const nextDue = commitment.nextDueDate?.trim();
  if (nextDue && parseCalendarDate(nextDue)) {
    const nextPeriod = nextDue.slice(0, 7);
    if (nextDue < todayStr) {
      return {
        state: 'OVERDUE',
        isPaidOff: false,
        isPaid: false,
        isDueThisMonth: true,
        isUpcomingInMonth: false,
        isOverdue: true,
        isDueToday: false,
      };
    }
    if (nextDue === todayStr) {
      return {
        state: 'DUE_TODAY',
        isPaidOff: false,
        isPaid: false,
        isDueThisMonth: true,
        isUpcomingInMonth: true,
        isOverdue: false,
        isDueToday: true,
      };
    }
    if (nextPeriod === currentPeriod) {
      return {
        state: 'UPCOMING_THIS_MONTH',
        isPaidOff: false,
        isPaid: false,
        isDueThisMonth: true,
        isUpcomingInMonth: true,
        isOverdue: false,
        isDueToday: false,
      };
    }
    return {
      state: 'FUTURE_MONTH',
      isPaidOff: false,
      isPaid: false,
      isDueThisMonth: false,
      isUpcomingInMonth: false,
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (commitment.dueLabel?.trim()) {
    return {
      state: 'CUSTOM_SCHEDULE',
      isPaidOff: false,
      isPaid: false,
      isDueThisMonth: true,
      isUpcomingInMonth: commitment.dueDay >= currentDay,
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (commitment.dueDay < currentDay) {
    return {
      state: 'OVERDUE',
      isPaidOff: false,
      isPaid: false,
      isDueThisMonth: true,
      isUpcomingInMonth: false,
      isOverdue: true,
      isDueToday: false,
    };
  }

  if (commitment.dueDay === currentDay) {
    return {
      state: 'DUE_TODAY',
      isPaidOff: false,
      isPaid: false,
      isDueThisMonth: true,
      isUpcomingInMonth: true,
      isOverdue: false,
      isDueToday: true,
    };
  }

  return {
    state: 'UPCOMING_THIS_MONTH',
    isPaidOff: false,
    isPaid: false,
    isDueThisMonth: true,
    isUpcomingInMonth: true,
    isOverdue: false,
    isDueToday: false,
  };
}

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
  liquidAccounts: readonly Account[];
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

  const totalLiquidBalanceMinor = params.liquidAccounts.reduce(
    (acc, a) => acc + a.balanceMinor,
    0,
  );

  const upcomingFixedBillsMinor = params.commitments
    .filter(
      (c) =>
        c.isActive &&
        c.lastPaidPeriod !== currentPeriod &&
        getCommitmentDueStatus(c, now).isUpcomingInMonth,
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
