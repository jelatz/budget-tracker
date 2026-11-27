import { z } from 'zod';
import {
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  MAX_SAFE_MONEY_MINOR,
} from './money';
import {
  calendarDateStringSchema,
  formatCalendarDateString,
  getNthWeekdayOfMonth,
  isCommitmentPaidOff,
  isTransactionInMonth,
  parseCalendarDate,
  periodMonthSchema,
  type RecurringCommitment,
} from './recurring.schema';
export { getNthWeekdayOfMonth };
import type { Transaction } from './transactions.schema';

export const payScheduleSchema = z.enum([
  'SEMI_MONTHLY',
  'TWICE_MONTHLY_WEEKDAY',
  'MONTHLY',
  'BIWEEKLY',
  'WEEKLY',
  'VARIABLE',
]);
export type PaySchedule = z.infer<typeof payScheduleSchema>;

export const PAY_SCHEDULE_LABELS: Record<PaySchedule, string> = {
  SEMI_MONTHLY: 'Twice a month (e.g. 15th & 30th)',
  TWICE_MONTHLY_WEEKDAY: '2nd & 4th Weekday (e.g. 2nd & 4th Fri)',
  MONTHLY: 'Monthly',
  BIWEEKLY: 'Every 2 Weeks',
  WEEKLY: 'Weekly',
  VARIABLE: 'Variable / Per Payout',
};

/**
 * Returns the human-readable pay schedule label.
 */
export function getPayScheduleLabel(schedule: PaySchedule): string {
  return PAY_SCHEDULE_LABELS[schedule] ?? 'Twice a month';
}

export const incomeSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Job or source name is required').max(60),
  expectedMonthlyMinor: z.number().int().nonnegative().max(MAX_SAFE_MONEY_MINOR),
  typicalPayoutMinor: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_SAFE_MONEY_MINOR)
    .optional(),
  currency: currencyCodeSchema.default(DEFAULT_CURRENCY),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).default('cat-salary'),
  paySchedule: payScheduleSchema.default('SEMI_MONTHLY'),
  payDays: z
    .tuple([z.number().int().min(1).max(31), z.number().int().min(1).max(31)])
    .optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  weekdayOrdinals: z
    .tuple([z.number().int().min(1).max(4), z.number().int().min(1).max(4)])
    .optional(),
  monthlyPayDay: z.number().int().min(1).max(31).optional(),
  anchorDate: calendarDateStringSchema.optional(),
  payDaysLabel: z.string().trim().max(40).optional(),
  color: z.string().min(1).default('#1B4332'),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(280).optional(),
});
export type IncomeSource = z.infer<typeof incomeSourceSchema>;
export type IncomeSourceInput = z.input<typeof incomeSourceSchema>;

export const createIncomeSourceInputSchema = incomeSourceSchema.omit({ id: true });
export type CreateIncomeSourceInput = z.infer<typeof createIncomeSourceInputSchema>;

export const salaryPlanBasisSchema = z.enum(['EXPECTED', 'RECEIVED']);
export type SalaryPlanBasis = z.infer<typeof salaryPlanBasisSchema>;

export interface IncomeSourceMonthlySummary {
  source: IncomeSource;
  expectedMonthlyMinor: number;
  receivedMinor: number;
  payoutCount: number;
  remainingExpectedMinor: number;
  progressPercent: number;
}

export interface MonthlySalaryPlan {
  periodMonth: string;
  basis: SalaryPlanBasis;
  sources: IncomeSourceMonthlySummary[];
  unlinkedIncomeMinor: number;
  unlinkedIncomeCount: number;
  totalExpectedIncomeMinor: number;
  totalReceivedIncomeMinor: number;
  planningIncomeMinor: number;
  totalScheduledBillsMinor: number;
  actualSpentMinor: number;
  actualNetCashflowMinor: number;
  paydaysInMonth: Transaction[];
}

export interface UpcomingPayday {
  source: IncomeSource;
  date: string;
  expectedAmountMinor: number;
  daysUntil: number;
  isToday: boolean;
  isReceived: boolean;
}

// getNthWeekdayOfMonth is imported from ./recurring.schema and re-exported above.

const WEEKDAY_NAME_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Parses legacy weekday schedules stored in `payDaysLabel` (e.g. "2nd & 4th Friday")
 * when an older `SEMI_MONTHLY` row has not yet been migrated to `TWICE_MONTHLY_WEEKDAY`.
 */
function parseLegacyWeekdayOrdinalsFromLabel(
  label?: string,
): { weekday: number; ordinals: number[] } | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  let matchedWeekday: number | null = null;
  for (const [name, dayNum] of Object.entries(WEEKDAY_NAME_MAP)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      matchedWeekday = dayNum;
      break;
    }
  }
  if (matchedWeekday === null) return null;

  const ordinals: number[] = [];
  for (const match of lower.matchAll(/\b([1-4])(?:st|nd|rd|th)\b/g)) {
    const ord = Number.parseInt(match[1], 10);
    if (!ordinals.includes(ord)) {
      ordinals.push(ord);
    }
  }
  if (ordinals.length === 0) return null;
  return {
    weekday: matchedWeekday,
    ordinals: ordinals.sort((a, b) => a - b),
  };
}

/**
 * Computes sorted YYYY-MM-DD paydates for an income source within the specified year and 0-indexed month.
 */
export function getScheduledPaydatesForSourceInMonth(
  source: IncomeSource,
  year: number,
  monthIndex0: number,
): string[] {
  if (!source.isActive || source.paySchedule === 'VARIABLE') {
    return [];
  }

  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  if (source.paySchedule === 'SEMI_MONTHLY') {
    if (!source.payDays) {
      const legacyWeekday = parseLegacyWeekdayOrdinalsFromLabel(source.payDaysLabel);
      if (legacyWeekday) {
        return legacyWeekday.ordinals.map((ord) =>
          formatCalendarDateString(
            getNthWeekdayOfMonth(year, monthIndex0, legacyWeekday.weekday, ord),
          ),
        );
      }
    }
    const [d1, d2] = source.payDays ?? [15, 30];
    const clamped = [Math.min(d1, daysInMonth), Math.min(d2, daysInMonth)];
    const uniqueSorted = Array.from(new Set(clamped)).sort((a, b) => a - b);
    return uniqueSorted.map((day) =>
      formatCalendarDateString(new Date(year, monthIndex0, day, 12, 0, 0, 0)),
    );
  }

  if (source.paySchedule === 'TWICE_MONTHLY_WEEKDAY') {
    const weekday = source.weekday ?? 5; // Default Friday
    const [ord1, ord2] = source.weekdayOrdinals ?? [2, 4];
    const uniqueOrdinals = Array.from(new Set([ord1, ord2])).sort((a, b) => a - b);
    return uniqueOrdinals.map((ord) =>
      formatCalendarDateString(getNthWeekdayOfMonth(year, monthIndex0, weekday, ord)),
    );
  }

  if (source.paySchedule === 'MONTHLY') {
    const day = Math.min(source.monthlyPayDay ?? 30, daysInMonth);
    return [formatCalendarDateString(new Date(year, monthIndex0, day, 12, 0, 0, 0))];
  }

  // WEEKLY or BIWEEKLY
  const stepDays = source.paySchedule === 'WEEKLY' ? 7 : 14;
  const anchor = source.anchorDate ? parseCalendarDate(source.anchorDate) : null;
  const monthStart = new Date(year, monthIndex0, 1, 12, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex0, daysInMonth, 12, 0, 0, 0);

  let cursor: Date;
  if (anchor) {
    cursor = new Date(anchor.getTime());
    while (cursor.getTime() > monthStart.getTime()) {
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() - stepDays,
        12,
        0,
        0,
        0,
      );
    }
    while (cursor.getTime() < monthStart.getTime()) {
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + stepDays,
        12,
        0,
        0,
        0,
      );
    }
  } else {
    // Default to Fridays starting from the first Friday of the month
    cursor = getNthWeekdayOfMonth(year, monthIndex0, 5, 1);
  }

  const dates: string[] = [];
  while (cursor.getTime() <= monthEnd.getTime()) {
    dates.push(formatCalendarDateString(cursor));
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + stepDays,
      12,
      0,
      0,
      0,
    );
  }
  return dates;
}

function getExpectedPayoutMinor(source: IncomeSource): number {
  if (typeof source.typicalPayoutMinor === 'number' && source.typicalPayoutMinor > 0) {
    return source.typicalPayoutMinor;
  }
  if (
    source.paySchedule === 'SEMI_MONTHLY' ||
    source.paySchedule === 'TWICE_MONTHLY_WEEKDAY' ||
    source.paySchedule === 'BIWEEKLY'
  ) {
    return Math.round(source.expectedMonthlyMinor / 2);
  }
  if (source.paySchedule === 'WEEKLY') {
    return Math.round(source.expectedMonthlyMinor / 4);
  }
  return source.expectedMonthlyMinor;
}

function isPaydayReceived(
  sourceId: string,
  scheduledDate: Date,
  transactions: readonly Transaction[],
): boolean {
  const scheduledMs = scheduledDate.getTime();
  const windowMs = 3 * 24 * 60 * 60 * 1000;
  for (const tx of transactions) {
    if (tx.type !== 'INCOME' || tx.incomeSourceId !== sourceId) {
      continue;
    }
    const txDate = new Date(tx.occurredAt);
    if (Number.isNaN(txDate.getTime())) {
      continue;
    }
    const txNoon = new Date(
      txDate.getFullYear(),
      txDate.getMonth(),
      txDate.getDate(),
      12,
      0,
      0,
      0,
    );
    if (Math.abs(txNoon.getTime() - scheduledMs) <= windowMs) {
      return true;
    }
  }
  return false;
}

/**
 * Computes chronological upcoming paydays across all active income sources.
 */
export function getUpcomingPaydays(params: {
  sources: readonly IncomeSource[];
  transactions: readonly Transaction[];
  fromDate?: Date;
  count?: number;
}): UpcomingPayday[] {
  const now = params.fromDate ?? new Date();
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const todayStr = formatCalendarDateString(todayNoon);
  const maxCount = params.count ?? 6;

  const occurrences: UpcomingPayday[] = [];

  for (const source of params.sources) {
    if (!source.isActive || source.paySchedule === 'VARIABLE') {
      continue;
    }

    const expectedAmountMinor = getExpectedPayoutMinor(source);
    const seenDates = new Set<string>();
    const anchorStr = source.anchorDate?.trim();
    const parsedAnchor = anchorStr ? parseCalendarDate(anchorStr) : null;

    if (parsedAnchor && anchorStr && anchorStr >= todayStr) {
      seenDates.add(anchorStr);
      const daysUntil = Math.round(
        (parsedAnchor.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000),
      );
      occurrences.push({
        source,
        date: anchorStr,
        expectedAmountMinor,
        daysUntil,
        isToday: anchorStr === todayStr,
        isReceived: isPaydayReceived(source.id, parsedAnchor, params.transactions),
      });
    }

    for (let monthOffset = 0; monthOffset <= 3; monthOffset += 1) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 12, 0, 0, 0);
      const paydates = getScheduledPaydatesForSourceInMonth(
        source,
        targetMonth.getFullYear(),
        targetMonth.getMonth(),
      );

      for (const dateStr of paydates) {
        if (dateStr < todayStr || (parsedAnchor && anchorStr && dateStr < anchorStr) || seenDates.has(dateStr)) {
          continue;
        }
        seenDates.add(dateStr);
        const parsed = parseCalendarDate(dateStr);
        if (!parsed) continue;
        const daysUntil = Math.round(
          (parsed.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000),
        );
        const isReceived = isPaydayReceived(source.id, parsed, params.transactions);
        occurrences.push({
          source,
          date: dateStr,
          expectedAmountMinor,
          daysUntil,
          isToday: dateStr === todayStr,
          isReceived,
        });
      }
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.source.name.localeCompare(b.source.name);
  });

  return occurrences.slice(0, maxCount);
}

/**
 * Returns the earliest unreceived upcoming payday (for 1-tap Receive Pay CTA).
 */
export function getNextPayday(params: {
  sources: readonly IncomeSource[];
  transactions: readonly Transaction[];
  fromDate?: Date;
}): UpcomingPayday | null {
  const upcoming = getUpcomingPaydays({
    sources: params.sources,
    transactions: params.transactions,
    fromDate: params.fromDate,
    count: 12,
  });
  return upcoming.find((p) => !p.isReceived) ?? upcoming[0] ?? null;
}

/**
 * Returns the next strictly-future payday YYYY-MM-DD (or today if unreceived) used as the horizon for Safe to Spend.
 */
export function getNextPaydayHorizonDate(params: {
  sources: readonly IncomeSource[];
  transactions: readonly Transaction[];
  fromDate?: Date;
}): string | null {
  const now = params.fromDate ?? new Date();
  const todayStr = formatCalendarDateString(now);
  const upcoming = getUpcomingPaydays({
    sources: params.sources,
    transactions: params.transactions,
    fromDate: now,
    count: 12,
  });
  const strictlyFuture = upcoming.find((p) => p.date > todayStr && !p.isReceived);
  if (strictlyFuture) return strictlyFuture.date;
  const anyUnreceived = upcoming.find((p) => !p.isReceived);
  return anyUnreceived?.date ?? upcoming[0]?.date ?? null;
}

function isCommitmentRelevantForPeriod(
  commitment: RecurringCommitment,
  periodMonth: string,
): boolean {
  if (commitment.lastPaidPeriod === periodMonth) {
    return true;
  }
  if (!commitment.isActive || isCommitmentPaidOff(commitment)) {
    return false;
  }
  if (
    (commitment.frequency === 'QUARTERLY' || commitment.frequency === 'YEARLY') &&
    commitment.nextDueDate
  ) {
    const dueMonth = commitment.nextDueDate.slice(0, 7);
    return commitment.nextDueDate.startsWith(periodMonth) || dueMonth < periodMonth;
  }
  return true;
}

/**
 * Computes a simplified monthly salary & pay summary in integer minor units.
 */
export function computeMonthlySalaryPlan(params: {
  periodMonth: string;
  basis: SalaryPlanBasis;
  incomeSources: readonly IncomeSource[];
  transactions: readonly Transaction[];
  recurringCommitments: readonly RecurringCommitment[];
}): MonthlySalaryPlan {
  periodMonthSchema.parse(params.periodMonth);

  const knownSourceIds = new Set(params.incomeSources.map((s) => s.id));
  const receivedBySource = new Map<string, { amountMinor: number; count: number }>();
  const paydaysInMonth: Transaction[] = [];

  let unlinkedIncomeMinor = 0;
  let unlinkedIncomeCount = 0;
  let actualSpentMinor = 0;

  for (const tx of params.transactions) {
    if (!isTransactionInMonth(tx.occurredAt, params.periodMonth)) {
      continue;
    }

    if (tx.type === 'INCOME') {
      paydaysInMonth.push(tx);
      if (tx.incomeSourceId && knownSourceIds.has(tx.incomeSourceId)) {
        const entry = receivedBySource.get(tx.incomeSourceId) ?? {
          amountMinor: 0,
          count: 0,
        };
        entry.amountMinor += tx.amountMinor;
        entry.count += 1;
        receivedBySource.set(tx.incomeSourceId, entry);
      } else {
        unlinkedIncomeMinor += tx.amountMinor;
        unlinkedIncomeCount += 1;
      }
    } else if (tx.type === 'EXPENSE') {
      actualSpentMinor += tx.amountMinor;
    }
  }

  paydaysInMonth.sort((a, b) => {
    const occurredDiff =
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    if (occurredDiff !== 0) {
      return occurredDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  let totalExpectedIncomeMinor = 0;
  let totalReceivedIncomeMinor = unlinkedIncomeMinor;

  const sources: IncomeSourceMonthlySummary[] = params.incomeSources.map((source) => {
    const received = receivedBySource.get(source.id) ?? { amountMinor: 0, count: 0 };
    const expectedMonthlyMinor = source.isActive ? source.expectedMonthlyMinor : 0;

    if (source.isActive) {
      totalExpectedIncomeMinor += source.expectedMonthlyMinor;
    }
    totalReceivedIncomeMinor += received.amountMinor;

    const remainingExpectedMinor = Math.max(
      0,
      expectedMonthlyMinor - received.amountMinor,
    );
    const progressPercent =
      expectedMonthlyMinor > 0
        ? Math.round((received.amountMinor * 100) / expectedMonthlyMinor)
        : received.amountMinor > 0
          ? 100
          : 0;

    return {
      source,
      expectedMonthlyMinor,
      receivedMinor: received.amountMinor,
      payoutCount: received.count,
      remainingExpectedMinor,
      progressPercent,
    };
  });

  const planningIncomeMinor =
    params.basis === 'EXPECTED'
      ? totalExpectedIncomeMinor
      : totalReceivedIncomeMinor;

  let totalScheduledBillsMinor = 0;
  for (const commitment of params.recurringCommitments) {
    if (!isCommitmentRelevantForPeriod(commitment, params.periodMonth)) {
      continue;
    }
    totalScheduledBillsMinor += commitment.amountMinor;
  }

  const actualNetCashflowMinor = totalReceivedIncomeMinor - actualSpentMinor;

  return {
    periodMonth: params.periodMonth,
    basis: params.basis,
    sources,
    unlinkedIncomeMinor,
    unlinkedIncomeCount,
    totalExpectedIncomeMinor,
    totalReceivedIncomeMinor,
    planningIncomeMinor,
    totalScheduledBillsMinor,
    actualSpentMinor,
    actualNetCashflowMinor,
    paydaysInMonth,
  };
}
