import { z } from 'zod';
import {
  amountMinorSchema,
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  positiveAmountMinorSchema,
} from './money';
import type { Account, AccountType, Transaction } from './transactions.schema';

export const periodMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period month must be in YYYY-MM format');
export type PeriodMonth = z.infer<typeof periodMonthSchema>;

/**
 * Returns true if the ISO timestamp falls in the given YYYY-MM period month (UTC).
 */
export function isTransactionInMonth(occurredAtIso: string, periodMonth: string): boolean {
  const parsed = new Date(occurredAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}` === periodMonth;
}

export const commitmentFrequencySchema = z.enum([
  'MONTHLY',
  'WEEKLY',
  'BIWEEKLY',
  'QUARTERLY',
  'YEARLY',
]);
export type CommitmentFrequency = z.infer<typeof commitmentFrequencySchema>;

export const commitmentKindSchema = z.enum(['BILL', 'LOAN', 'CREDIT_CARD_INSTALLMENT']);
export type CommitmentKind = z.infer<typeof commitmentKindSchema>;

/**
 * Normalizes legacy ('RECURRING' | 'INSTALLMENT') and canonical commitment kinds.
 */
export function normalizeCommitmentKind(
  raw: unknown,
  accountType?: AccountType,
): CommitmentKind {
  if (raw === 'CREDIT_CARD_INSTALLMENT') return 'CREDIT_CARD_INSTALLMENT';
  if (raw === 'LOAN') return 'LOAN';
  if (raw === 'BILL' || raw === 'RECURRING') return 'BILL';
  if (raw === 'INSTALLMENT') {
    return accountType === 'CREDIT_CARD' ? 'CREDIT_CARD_INSTALLMENT' : 'LOAN';
  }
  return 'BILL';
}

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

const normalizedKindSchema = z.preprocess((raw) => {
  if (raw === 'RECURRING') return 'BILL';
  if (raw === 'INSTALLMENT') return 'LOAN';
  return raw;
}, commitmentKindSchema.default('BILL'));

export const recurringCommitmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: normalizedKindSchema,
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

/**
 * Resolves the YYYY-MM-DD due date for a commitment within the reference month.
 */
export function resolveCommitmentDueDate(
  commitment: RecurringCommitment,
  referenceDate = new Date(),
): string {
  const nextDue = commitment.nextDueDate?.trim();
  if (nextDue && parseCalendarDate(nextDue)) {
    return nextDue;
  }
  const daysInMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
  ).getDate();
  const day = Math.min(commitment.dueDay, daysInMonth);
  return formatCalendarDateString(
    new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day, 12, 0, 0, 0),
  );
}

const FULL_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const ORDINAL_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

/**
 * Returns the local noon Date for the Nth weekday (1=1st..4=4th, weekday 0=Sun..6=Sat) in a given month.
 */
export function getNthWeekdayOfMonth(
  year: number,
  monthIndex0: number,
  weekday: number,
  ordinal: number,
): Date {
  const firstOfMonth = new Date(year, monthIndex0, 1, 12, 0, 0, 0);
  const firstWeekday = firstOfMonth.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  return new Date(year, monthIndex0, day, 12, 0, 0, 0);
}

/**
 * Formats a human-readable credit card due schedule label (e.g. "Every 4th Friday" or "Due day 5").
 */
export function formatCreditCardDueScheduleLabel(
  account: Pick<Account, 'dueDay' | 'dueWeekday' | 'dueWeekdayOrdinal'>,
): string | null {
  if (
    typeof account.dueWeekday === 'number' &&
    account.dueWeekday >= 0 &&
    account.dueWeekday <= 6 &&
    typeof account.dueWeekdayOrdinal === 'number' &&
    account.dueWeekdayOrdinal >= 1 &&
    account.dueWeekdayOrdinal <= 4
  ) {
    const ord = ORDINAL_LABELS[account.dueWeekdayOrdinal] ?? `${account.dueWeekdayOrdinal}th`;
    const dayName = FULL_WEEKDAY_NAMES[account.dueWeekday] ?? 'Friday';
    return `Every ${ord} ${dayName}`;
  }
  if (typeof account.dueDay === 'number' && account.dueDay >= 1 && account.dueDay <= 31) {
    return `Due day ${account.dueDay}`;
  }
  return null;
}

/**
 * Resolves the YYYY-MM-DD due date for a credit card's dueDay.
 */
export function resolveCreditCardDueDate(
  dueDay: number | undefined,
  upcomingBillMinor: number,
  referenceDate = new Date(),
): string | null {
  if (typeof dueDay !== 'number' || dueDay < 1 || dueDay > 31) {
    return null;
  }
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(dueDay, daysInMonth);
  const thisMonthDue = formatCalendarDateString(
    new Date(year, month, clampedDay, 12, 0, 0, 0),
  );
  const todayStr = formatCalendarDateString(referenceDate);

  if (thisMonthDue < todayStr && upcomingBillMinor === 0) {
    const nextMonthDays = new Date(year, month + 2, 0).getDate();
    const nextMonthDay = Math.min(dueDay, nextMonthDays);
    return formatCalendarDateString(new Date(year, month + 1, nextMonthDay, 12, 0, 0, 0));
  }
  return thisMonthDue;
}

/**
 * Resolves the next YYYY-MM-DD due date for a credit card supporting day-of-month,
 * Nth-weekday (e.g. 4th Friday), optional first due date (`dueStartDate`), and paid-this-month rollover.
 */
export function resolveCreditCardDueDateForAccount(
  account: Pick<Account, 'dueDay' | 'dueWeekday' | 'dueWeekdayOrdinal' | 'dueStartDate'>,
  options: {
    upcomingBillMinor: number;
    isPaidForCurrentMonth?: boolean;
    referenceDate?: Date;
  },
): string | null {
  const now = options.referenceDate ?? new Date();
  const todayStr = formatCalendarDateString(now);
  const startStr =
    account.dueStartDate && parseCalendarDate(account.dueStartDate)
      ? account.dueStartDate.trim()
      : null;

  const hasWeekdaySchedule =
    typeof account.dueWeekday === 'number' &&
    account.dueWeekday >= 0 &&
    account.dueWeekday <= 6 &&
    typeof account.dueWeekdayOrdinal === 'number' &&
    account.dueWeekdayOrdinal >= 1 &&
    account.dueWeekdayOrdinal <= 4;

  const hasDayOfMonth =
    typeof account.dueDay === 'number' && account.dueDay >= 1 && account.dueDay <= 31;

  if (!hasWeekdaySchedule && !hasDayOfMonth) {
    return startStr;
  }

  const getDueDateInMonth = (year: number, monthIndex0: number): string | null => {
    if (hasWeekdaySchedule) {
      return formatCalendarDateString(
        getNthWeekdayOfMonth(
          year,
          monthIndex0,
          account.dueWeekday!,
          account.dueWeekdayOrdinal!,
        ),
      );
    }
    if (hasDayOfMonth) {
      const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
      const clampedDay = Math.min(account.dueDay!, daysInMonth);
      return formatCalendarDateString(new Date(year, monthIndex0, clampedDay, 12, 0, 0, 0));
    }
    return null;
  };

  for (let monthOffset = 0; monthOffset <= 12; monthOffset += 1) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 12, 0, 0, 0);
    const candidate = getDueDateInMonth(targetMonth.getFullYear(), targetMonth.getMonth());
    if (!candidate) {
      return null;
    }
    if (startStr && candidate < startStr) {
      continue;
    }
    if (monthOffset === 0) {
      if (options.isPaidForCurrentMonth) {
        continue;
      }
      if (candidate < todayStr && options.upcomingBillMinor === 0) {
        continue;
      }
    }
    return candidate;
  }

  return null;
}

export interface CreditCardBillSummary {
  account: Account;
  swipesOwedMinor: number;
  unpaidInstallmentsThisPeriod: RecurringCommitment[];
  installmentsDueThisPeriodMinor: number;
  upcomingBillMinor: number;
  allInstallmentsRemainingMinor: number;
  futureInstallmentsRemainingMinor: number;
  totalCardDebtMinor: number;
  creditLimitMinor: number | null;
  availableCreditMinor: number | null;
  utilizationPercent: number | null;
  isPaydownPlan: boolean;
  monthlyPaymentTargetMinor: number | null;
  paidThisPeriodMinor: number;
  isPaidForCurrentMonth: boolean;
  remainingPaymentsCount: number | null;
  finalPaymentMinor: number | null;
  dueScheduleLabel: string | null;
  dueDate: string | null;
  isDueBeforeNextPayday: boolean;
  installments: RecurringCommitment[];
}

/**
 * Computes upcoming payment/bill, credit limit utilization, paydown progress,
 * and total debt (swipes + installments) for a credit card account.
 */
export function computeCreditCardBillSummary(params: {
  account: Account;
  commitments: readonly RecurringCommitment[];
  transactions?: readonly Transaction[];
  currentDate?: Date;
  nextPaydayDate?: string | null;
}): CreditCardBillSummary {
  const now = params.currentDate ?? new Date();
  const currentPeriod = formatCalendarDateString(now).slice(0, 7);
  const swipesOwedMinor = Math.max(0, -params.account.balanceMinor);

  const installments = params.commitments.filter(
    (c) =>
      c.accountId === params.account.id &&
      normalizeCommitmentKind(c.kind, params.account.accountType) ===
        'CREDIT_CARD_INSTALLMENT',
  );

  const unpaidInstallmentsThisPeriod = installments.filter(
    (c) =>
      c.isActive &&
      !isCommitmentPaidOff(c) &&
      c.lastPaidPeriod !== currentPeriod,
  );

  const installmentsDueThisPeriodMinor = unpaidInstallmentsThisPeriod.reduce(
    (sum, c) => sum + c.amountMinor,
    0,
  );

  const fullCycleBillMinor = swipesOwedMinor + installmentsDueThisPeriodMinor;

  const allInstallmentsRemainingMinor = installments
    .filter((c) => c.isActive && !isCommitmentPaidOff(c))
    .reduce((sum, c) => sum + computeInstallmentProgress(c).remainingBalanceMinor, 0);

  const futureInstallmentsRemainingMinor = Math.max(
    0,
    allInstallmentsRemainingMinor - installmentsDueThisPeriodMinor,
  );

  const totalCardDebtMinor = swipesOwedMinor + allInstallmentsRemainingMinor;

  let paidThisPeriodMinor = 0;
  for (const tx of params.transactions ?? []) {
    if (tx.type !== 'TRANSFER' || tx.toAccountId !== params.account.id) {
      continue;
    }
    const txDate = new Date(tx.occurredAt);
    if (
      !Number.isNaN(txDate.getTime()) &&
      formatCalendarDateString(txDate).slice(0, 7) === currentPeriod
    ) {
      paidThisPeriodMinor += tx.amountMinor;
    }
  }

  const isPaydownPlan =
    typeof params.account.monthlyPaymentTargetMinor === 'number' &&
    params.account.monthlyPaymentTargetMinor > 0;
  const monthlyPaymentTargetMinor = isPaydownPlan
    ? params.account.monthlyPaymentTargetMinor!
    : null;
  const isPaidForCurrentMonth = Boolean(
    isPaydownPlan &&
      monthlyPaymentTargetMinor &&
      totalCardDebtMinor > 0 &&
      paidThisPeriodMinor >= monthlyPaymentTargetMinor,
  );

  const scheduledCycleAmountMinor = isPaydownPlan
    ? Math.min(fullCycleBillMinor, monthlyPaymentTargetMinor!)
    : fullCycleBillMinor;

  const dueDate = resolveCreditCardDueDateForAccount(params.account, {
    upcomingBillMinor: scheduledCycleAmountMinor,
    isPaidForCurrentMonth,
    referenceDate: now,
  });

  let upcomingBillMinor: number;
  if (!isPaydownPlan) {
    upcomingBillMinor = fullCycleBillMinor;
  } else if (fullCycleBillMinor === 0) {
    upcomingBillMinor = 0;
  } else if (dueDate && dueDate.slice(0, 7) > currentPeriod) {
    upcomingBillMinor = Math.min(fullCycleBillMinor, monthlyPaymentTargetMinor!);
  } else {
    upcomingBillMinor = Math.min(
      fullCycleBillMinor,
      Math.max(0, monthlyPaymentTargetMinor! - paidThisPeriodMinor),
    );
  }

  const isFutureMonthDue = Boolean(dueDate && dueDate.slice(0, 7) > currentPeriod);
  const isDueBeforeNextPayday =
    upcomingBillMinor > 0 &&
    (params.nextPaydayDate
      ? Boolean(!dueDate || dueDate <= params.nextPaydayDate)
      : !isFutureMonthDue);

  const creditLimitMinor =
    typeof params.account.creditLimitMinor === 'number' &&
    params.account.creditLimitMinor > 0
      ? params.account.creditLimitMinor
      : null;
  const availableCreditMinor =
    creditLimitMinor !== null
      ? Math.max(0, creditLimitMinor - totalCardDebtMinor)
      : null;
  const utilizationPercent =
    creditLimitMinor !== null
      ? Math.min(100, Math.round((totalCardDebtMinor * 100) / creditLimitMinor))
      : null;

  const remainingPaymentsCount =
    isPaydownPlan && monthlyPaymentTargetMinor
      ? totalCardDebtMinor > 0
        ? Math.ceil(totalCardDebtMinor / monthlyPaymentTargetMinor)
        : 0
      : null;
  const finalPaymentMinor =
    isPaydownPlan && monthlyPaymentTargetMinor && totalCardDebtMinor > 0
      ? totalCardDebtMinor % monthlyPaymentTargetMinor || monthlyPaymentTargetMinor
      : null;

  const dueScheduleLabel = formatCreditCardDueScheduleLabel(params.account);

  return {
    account: params.account,
    swipesOwedMinor,
    unpaidInstallmentsThisPeriod,
    installmentsDueThisPeriodMinor,
    upcomingBillMinor,
    allInstallmentsRemainingMinor,
    futureInstallmentsRemainingMinor,
    totalCardDebtMinor,
    creditLimitMinor,
    availableCreditMinor,
    utilizationPercent,
    isPaydownPlan,
    monthlyPaymentTargetMinor,
    paidThisPeriodMinor,
    isPaidForCurrentMonth,
    remainingPaymentsCount,
    finalPaymentMinor,
    dueScheduleLabel,
    dueDate,
    isDueBeforeNextPayday,
    installments,
  };
}

export interface DebtOverview {
  creditCards: CreditCardBillSummary[];
  loans: RecurringCommitment[];
  bills: RecurringCommitment[];
  totalCreditCardUpcomingBillMinor: number;
  totalCreditCardInstallmentsRemainingMinor: number;
  totalLoansRemainingMinor: number;
  totalDebtRemainingMinor: number;
  dueBeforeNextPaydayMinor: number;
  dueLaterThisMonthMinor: number;
  dueBeforeNextPaydayCount: number;
}

/**
 * Computes a unified debt & monthly obligation overview across credit cards, loans, and home/utility bills.
 */
export function computeDebtOverview(params: {
  accounts: readonly Account[];
  commitments: readonly RecurringCommitment[];
  transactions?: readonly Transaction[];
  nextPaydayDate?: string | null;
  currentDate?: Date;
}): DebtOverview {
  const now = params.currentDate ?? new Date();
  const todayStr = formatCalendarDateString(now);
  const currentPeriod = todayStr.slice(0, 7);

  const accountById = new Map<string, Account>();
  const creditCardAccounts: Account[] = [];
  for (const acc of params.accounts) {
    accountById.set(acc.id, acc);
    if (acc.accountType === 'CREDIT_CARD') {
      creditCardAccounts.push(acc);
    }
  }

  const creditCards = creditCardAccounts.map((account) =>
    computeCreditCardBillSummary({
      account,
      commitments: params.commitments,
      transactions: params.transactions,
      currentDate: now,
      nextPaydayDate: params.nextPaydayDate,
    }),
  );

  const loans: RecurringCommitment[] = [];
  const bills: RecurringCommitment[] = [];

  for (const c of params.commitments) {
    const acc = accountById.get(c.accountId);
    const resolvedKind = normalizeCommitmentKind(c.kind, acc?.accountType);
    if (resolvedKind === 'CREDIT_CARD_INSTALLMENT') {
      continue;
    }
    if (resolvedKind === 'LOAN') {
      loans.push(c);
    } else {
      bills.push(c);
    }
  }

  const totalCreditCardUpcomingBillMinor = creditCards.reduce(
    (sum, cc) => sum + cc.upcomingBillMinor,
    0,
  );
  const totalCreditCardInstallmentsRemainingMinor = creditCards.reduce(
    (sum, cc) => sum + cc.allInstallmentsRemainingMinor,
    0,
  );
  const totalCreditCardSwipesMinor = creditCards.reduce(
    (sum, cc) => sum + cc.swipesOwedMinor,
    0,
  );

  const totalLoansRemainingMinor = loans
    .filter((l) => l.isActive && !isCommitmentPaidOff(l))
    .reduce((sum, l) => {
      const progress = computeInstallmentProgress(l);
      if (progress.totalCount > 0) {
        return sum + progress.remainingBalanceMinor;
      }
      return sum + (l.lastPaidPeriod === currentPeriod ? 0 : l.amountMinor);
    }, 0);

  const totalDebtRemainingMinor =
    totalCreditCardSwipesMinor +
    totalCreditCardInstallmentsRemainingMinor +
    totalLoansRemainingMinor;

  let dueBeforeNextPaydayMinor = 0;
  let dueLaterThisMonthMinor = 0;
  let dueBeforeNextPaydayCount = 0;

  for (const cc of creditCards) {
    if (cc.upcomingBillMinor <= 0) {
      continue;
    }
    if (cc.isDueBeforeNextPayday) {
      dueBeforeNextPaydayMinor += cc.upcomingBillMinor;
      dueBeforeNextPaydayCount += 1;
    } else if (cc.dueDate && cc.dueDate.slice(0, 7) === currentPeriod) {
      dueLaterThisMonthMinor += cc.upcomingBillMinor;
    }
  }

  for (const c of [...loans, ...bills]) {
    if (!c.isActive || isCommitmentPaidOff(c) || c.lastPaidPeriod === currentPeriod) {
      continue;
    }
    const status = getCommitmentDueStatus(c, now);
    if (!status.isDueThisMonth) {
      continue;
    }
    const dueDate = resolveCommitmentDueDate(c, now);
    if (!params.nextPaydayDate || dueDate <= params.nextPaydayDate) {
      dueBeforeNextPaydayMinor += c.amountMinor;
      dueBeforeNextPaydayCount += 1;
    } else {
      dueLaterThisMonthMinor += c.amountMinor;
    }
  }

  return {
    creditCards,
    loans,
    bills,
    totalCreditCardUpcomingBillMinor,
    totalCreditCardInstallmentsRemainingMinor,
    totalLoansRemainingMinor,
    totalDebtRemainingMinor,
    dueBeforeNextPaydayMinor,
    dueLaterThisMonthMinor,
    dueBeforeNextPaydayCount,
  };
}

export const safeToSpendMetricsSchema = z.object({
  totalLiquidBalanceMinor: amountMinorSchema,
  dueBeforeNextPaydayMinor: z.number().int().nonnegative(),
  dueLaterThisMonthMinor: z.number().int().nonnegative(),
  safeToSpendMinor: amountMinorSchema,
  nextPaydayDate: calendarDateStringSchema.nullable(),
  daysUntilNextPayday: z.number().int().positive(),
  dailyDiscretionaryBudgetMinor: z.number().int().nonnegative(),
});
export type SafeToSpendMetrics = z.infer<typeof safeToSpendMetricsSchema>;

/**
 * Computes real-time "Safe to Spend until Next Payday" liquidity:
 * Safe to Spend = Liquid Cash - Obligations Due Before Next Payday (including credit card bills, loans, and home/utility bills).
 */
export function computeSafeToSpend(params: {
  accounts: readonly Account[];
  commitments: readonly RecurringCommitment[];
  transactions?: readonly Transaction[];
  nextPaydayDate?: string | null;
  currentDate?: Date;
}): SafeToSpendMetrics {
  const now = params.currentDate ?? new Date();
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);

  const liquidAccounts = params.accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const totalLiquidBalanceMinor = liquidAccounts.reduce(
    (acc, a) => acc + a.balanceMinor,
    0,
  );

  const debtOverview = computeDebtOverview({
    accounts: params.accounts,
    commitments: params.commitments,
    transactions: params.transactions,
    nextPaydayDate: params.nextPaydayDate ?? null,
    currentDate: now,
  });

  const safeToSpendMinor =
    totalLiquidBalanceMinor - debtOverview.dueBeforeNextPaydayMinor;

  let daysUntilNextPayday = 1;
  const parsedPayday = params.nextPaydayDate
    ? parseCalendarDate(params.nextPaydayDate)
    : null;
  if (parsedPayday) {
    const diffDays = Math.round(
      (parsedPayday.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000),
    );
    daysUntilNextPayday = Math.max(1, diffDays);
  } else {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    daysUntilNextPayday = Math.max(1, daysInMonth - now.getDate() + 1);
  }

  const dailyDiscretionaryBudgetMinor = Math.max(
    0,
    Math.floor(Math.max(0, safeToSpendMinor) / daysUntilNextPayday),
  );

  return {
    totalLiquidBalanceMinor,
    dueBeforeNextPaydayMinor: debtOverview.dueBeforeNextPaydayMinor,
    dueLaterThisMonthMinor: debtOverview.dueLaterThisMonthMinor,
    safeToSpendMinor,
    nextPaydayDate: parsedPayday ? formatCalendarDateString(parsedPayday) : null,
    daysUntilNextPayday,
    dailyDiscretionaryBudgetMinor,
  };
}
