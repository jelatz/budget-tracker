import { describe, expect, it } from 'vitest';
import {
  applySyncMutations,
  backupEnvelopeSchema,
  computeMonthlySalaryPlan,
  createInitialSyncDataState,
  createTransactionInputSchema,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  incomeSourceSchema,
  normalizeBackupEnvelope,
  type IncomeSource,
  type RecurringCommitment,
} from '../index';

describe('Income Sources & Monthly Salary Plan', () => {
  it('validates incomeSourceSchema and rejects incomeSourceId on expenses', () => {
    const variableJob = incomeSourceSchema.parse({
      id: 'job-2',
      name: 'Job 2 — Freelance Design',
      expectedMonthlyMinor: 0,
      accountId: 'account-bank',
      paySchedule: 'VARIABLE',
      payDaysLabel: 'Per milestone',
    });
    expect(variableJob.expectedMonthlyMinor).toBe(0);
    expect(variableJob.categoryId).toBe('cat-salary');

    expect(
      createTransactionInputSchema.safeParse({
        type: 'EXPENSE',
        amountMinor: 5000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-daily-living',
        incomeSourceId: 'job-2',
        occurredAt: '2026-11-15T12:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      createTransactionInputSchema.safeParse({
        type: 'INCOME',
        amountMinor: 2500000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-salary',
        incomeSourceId: 'job-2',
        occurredAt: '2026-11-15T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('computes 2-job salary tracking and monthly cashflow accurately', () => {
    const base = createInitialSyncDataState(new Date('2026-11-01T10:00:00.000Z'));

    const job1: IncomeSource = incomeSourceSchema.parse({
      id: 'job-1',
      name: 'Job 1 — Primary Tech',
      expectedMonthlyMinor: 5000000,
      typicalPayoutMinor: 2500000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      paySchedule: 'SEMI_MONTHLY',
      payDays: [15, 30],
    });

    const job2: IncomeSource = incomeSourceSchema.parse({
      id: 'job-2',
      name: 'Job 2 — Biweekly Retainer',
      expectedMonthlyMinor: 2000000,
      typicalPayoutMinor: 1000000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-savings',
      categoryId: 'cat-freelance',
      paySchedule: 'TWICE_MONTHLY_WEEKDAY',
      weekday: 5,
      weekdayOrdinals: [2, 4],
    });

    const stateWithJobsAndData = applySyncMutations(base, [
      {
        opId: 'op-job-1',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'incomeSource.upsert',
        source: job1,
      },
      {
        opId: 'op-job-2',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'incomeSource.upsert',
        source: job2,
      },
      {
        opId: 'op-pay-1',
        clientTimestamp: '2026-11-15T09:00:00.000Z',
        type: 'incomeSource.logPayday',
        sourceId: 'job-1',
        transactionId: 'tx-pay-job1-1',
        amountMinor: 2500000,
        occurredAt: '2026-11-15T09:00:00.000Z',
        note: '15th cutoff',
      },
      {
        opId: 'op-pay-2',
        clientTimestamp: '2026-11-13T14:00:00.000Z',
        type: 'incomeSource.logPayday',
        sourceId: 'job-2',
        transactionId: 'tx-pay-job2-1',
        amountMinor: 1250000,
        occurredAt: '2026-11-13T14:00:00.000Z',
      },
      {
        opId: 'op-inc-unlinked',
        clientTimestamp: '2026-11-19T12:00:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-bonus-1',
          type: 'INCOME',
          amountMinor: 500000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-bonus',
          merchant: 'Tax Refund',
          occurredAt: '2026-11-19T12:00:00.000Z',
          createdAt: '2026-11-19T12:00:00.000Z',
        },
      },
      {
        opId: 'op-exp-1',
        clientTimestamp: '2026-11-20T12:00:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-exp-food',
          type: 'EXPENSE',
          amountMinor: 400000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-daily-living',
          merchant: 'Grocery',
          occurredAt: '2026-11-20T12:00:00.000Z',
          createdAt: '2026-11-20T12:00:00.000Z',
        },
      },
    ]);

    const commitments: RecurringCommitment[] = [
      {
        id: 'bill-rent',
        name: 'Rent',
        kind: 'BILL',
        amountMinor: 1200000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-home',
        frequency: 'MONTHLY',
        dueDay: 5,
        isAutoPaid: false,
        isActive: true,
        paidInstallments: 0,
      },
      {
        id: 'bill-net',
        name: 'Fiber Internet',
        kind: 'BILL',
        amountMinor: 200000,
        currency: DEFAULT_CURRENCY,
        accountId: 'account-bank',
        categoryId: 'cat-dues',
        frequency: 'MONTHLY',
        dueDay: 15,
        isAutoPaid: false,
        isActive: true,
        paidInstallments: 0,
      },
    ];

    const expectedPlan = computeMonthlySalaryPlan({
      periodMonth: '2026-11',
      basis: 'EXPECTED',
      incomeSources: stateWithJobsAndData.incomeSources,
      transactions: stateWithJobsAndData.transactions,
      recurringCommitments: commitments,
    });

    expect(expectedPlan.totalExpectedIncomeMinor).toBe(7000000);
    expect(expectedPlan.totalReceivedIncomeMinor).toBe(4250000);
    expect(expectedPlan.unlinkedIncomeMinor).toBe(500000);
    expect(expectedPlan.totalScheduledBillsMinor).toBe(1400000);
    expect(expectedPlan.actualSpentMinor).toBe(400000);
    expect(expectedPlan.actualNetCashflowMinor).toBe(3850000);

    const linked = getAccountLinkedRecords(stateWithJobsAndData, 'account-savings');
    expect(linked.incomeSources).toHaveLength(1);
    expect(formatAccountLinkedErrorMessage(linked)).toContain('payday source');

    const legacyBackup = {
      version: 1,
      exportedAt: '2026-11-20T10:00:00.000Z',
      data: {
        accounts: base.accounts,
        categories: DEFAULT_CATEGORIES,
        transactions: [],
        recurringCommitments: [],
      },
    };
    const parsedBackup = backupEnvelopeSchema.parse(normalizeBackupEnvelope(legacyBackup));
    expect(parsedBackup.data.incomeSources).toEqual([]);
  });
});
