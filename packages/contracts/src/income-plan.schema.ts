import { z } from 'zod';
import {
  isTransactionInMonth,
  periodMonthSchema,
  type CategoryBudgetStatus,
} from './category-budget.schema';
import {
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  MAX_SAFE_MONEY_MINOR,
} from './money';
import {
  isCommitmentPaidOff,
  type RecurringCommitment,
} from './recurring.schema';
import type { SinkingFund } from './sinking-funds.schema';
import type { Transaction } from './transactions.schema';

export const payScheduleSchema = z.enum([
  'MONTHLY',
  'SEMI_MONTHLY',
  'BIWEEKLY',
  'WEEKLY',
  'VARIABLE',
]);
export type PaySchedule = z.infer<typeof payScheduleSchema>;

export const PAY_SCHEDULE_LABELS: Record<PaySchedule, string> = {
  MONTHLY: 'Monthly',
  SEMI_MONTHLY: 'Semi-Monthly',
  BIWEEKLY: 'Bi-Weekly',
  WEEKLY: 'Weekly',
  VARIABLE: 'Variable / Per Payout',
};

/**
 * Returns the human-readable pay schedule label.
 */
export function getPayScheduleLabel(schedule: PaySchedule): string {
  return PAY_SCHEDULE_LABELS[schedule] ?? 'Monthly';
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

export interface CategoryAllocationRow {
  categoryId: string;
  assignedMinor: number;
  effectiveBudgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  billsInCategoryMinor: number;
  shareOfIncomePercent: number;
  isOverspent: boolean;
  envelopeId?: string;
  rolloverEnabled: boolean;
  notes?: string;
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
  envelopesAssignedMinor: number;
  totalScheduledBillsMinor: number;
  coveredByEnvelopeBillsMinor: number;
  standaloneBillsMinor: number;
  plannedSavingsMinor: number;
  totalAllocatedMinor: number;
  unallocatedMinor: number;
  allocationPercent: number;
  isOverAllocated: boolean;
  actualSpentMinor: number;
  actualNetCashflowMinor: number;
  categoryAllocations: CategoryAllocationRow[];
  paydaysInMonth: Transaction[];
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
 * Computes a zero-double-count monthly salary & pay allocation plan in integer minor units.
 *
 * Bills that share a category with a monthly Category Envelope are covered up to the envelope's
 * assigned amount (`min(billsInCategory, envelopeAssigned)`), while any remainder or bills in
 * categories without an envelope count as `standaloneBillsMinor`.
 */
export function computeMonthlySalaryPlan(params: {
  periodMonth: string;
  basis: SalaryPlanBasis;
  incomeSources: readonly IncomeSource[];
  transactions: readonly Transaction[];
  categoryBudgets: readonly CategoryBudgetStatus[];
  recurringCommitments: readonly RecurringCommitment[];
  sinkingFunds: readonly SinkingFund[];
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

  // Group relevant scheduled bills & loans by category
  const billsByCategory = new Map<string, number>();
  let totalScheduledBillsMinor = 0;

  for (const commitment of params.recurringCommitments) {
    if (!isCommitmentRelevantForPeriod(commitment, params.periodMonth)) {
      continue;
    }
    totalScheduledBillsMinor += commitment.amountMinor;
    billsByCategory.set(
      commitment.categoryId,
      (billsByCategory.get(commitment.categoryId) ?? 0) + commitment.amountMinor,
    );
  }

  const periodEnvelopes = params.categoryBudgets.filter(
    (b) => b.periodMonth === params.periodMonth,
  );
  const envelopeByCategory = new Map<string, CategoryBudgetStatus>();
  let envelopesAssignedMinor = 0;

  for (const env of periodEnvelopes) {
    envelopeByCategory.set(env.categoryId, env);
    envelopesAssignedMinor += env.assignedMinor;
  }

  let coveredByEnvelopeBillsMinor = 0;
  let standaloneBillsMinor = 0;

  for (const [categoryId, categoryBillsMinor] of billsByCategory.entries()) {
    const envelopeAssigned = envelopeByCategory.get(categoryId)?.assignedMinor ?? 0;
    const covered = Math.min(categoryBillsMinor, envelopeAssigned);
    coveredByEnvelopeBillsMinor += covered;
    standaloneBillsMinor += Math.max(0, categoryBillsMinor - envelopeAssigned);
  }

  let plannedSavingsMinor = 0;
  for (const fund of params.sinkingFunds) {
    if (!fund.isCompleted) {
      plannedSavingsMinor += fund.monthlyContributionMinor;
    }
  }

  const totalAllocatedMinor =
    envelopesAssignedMinor + standaloneBillsMinor + plannedSavingsMinor;
  const unallocatedMinor = planningIncomeMinor - totalAllocatedMinor;
  const allocationPercent =
    planningIncomeMinor > 0
      ? Math.round((totalAllocatedMinor * 100) / planningIncomeMinor)
      : 0;
  const isOverAllocated =
    totalAllocatedMinor > planningIncomeMinor && totalAllocatedMinor > 0;

  const actualNetCashflowMinor = totalReceivedIncomeMinor - actualSpentMinor;

  const categoryAllocations: CategoryAllocationRow[] = periodEnvelopes.map((env) => ({
    categoryId: env.categoryId,
    assignedMinor: env.assignedMinor,
    effectiveBudgetMinor: env.effectiveBudgetMinor,
    spentMinor: env.spentMinor,
    remainingMinor: env.remainingMinor,
    billsInCategoryMinor: billsByCategory.get(env.categoryId) ?? 0,
    shareOfIncomePercent:
      planningIncomeMinor > 0
        ? Math.round((env.assignedMinor * 100) / planningIncomeMinor)
        : 0,
    isOverspent: env.isOverspent,
    envelopeId: env.id,
    rolloverEnabled: env.rolloverEnabled,
    notes: env.notes,
  }));

  return {
    periodMonth: params.periodMonth,
    basis: params.basis,
    sources,
    unlinkedIncomeMinor,
    unlinkedIncomeCount,
    totalExpectedIncomeMinor,
    totalReceivedIncomeMinor,
    planningIncomeMinor,
    envelopesAssignedMinor,
    totalScheduledBillsMinor,
    coveredByEnvelopeBillsMinor,
    standaloneBillsMinor,
    plannedSavingsMinor,
    totalAllocatedMinor,
    unallocatedMinor,
    allocationPercent,
    isOverAllocated,
    actualSpentMinor,
    actualNetCashflowMinor,
    categoryAllocations,
    paydaysInMonth,
  };
}
