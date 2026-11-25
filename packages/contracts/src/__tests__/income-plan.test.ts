import { describe, expect, it } from 'vitest';
import {
  applySyncMutations,
  backupEnvelopeSchema,
  computeEnvelopeRollovers,
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
  type SinkingFund,
} from '../index';

describe('Income Sources & Monthly Salary Plan', () => {
  it('validates incomeSourceSchema including variable 0-expected jobs and rejects incomeSourceId on expenses/transfers', () => {
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

    const badExpense = createTransactionInputSchema.safeParse({
      type: 'EXPENSE',
      amountMinor: 5000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-daily-living',
      incomeSourceId: 'job-2',
      tags: [],
      occurredAt: '2026-11-15T12:00:00.000Z',
    });
    expect(badExpense.success).toBe(false);

    const validIncome = createTransactionInputSchema.safeParse({
      type: 'INCOME',
      amountMinor: 2500000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      incomeSourceId: 'job-2',
      tags: ['salary'],
      occurredAt: '2026-11-15T12:00:00.000Z',
    });
    expect(validIncome.success).toBe(true);
  });

  it('computes 2-job salary tracking, zero-double-count bills, savings, and unallocated pay accurately', () => {
    const base = createInitialSyncDataState(new Date('2026-11-01T10:00:00.000Z'));

    const job1: IncomeSource = incomeSourceSchema.parse({
      id: 'job-1',
      name: 'Job 1 — Primary Tech',
      expectedMonthlyMinor: 5000000, // 50,000.00
      typicalPayoutMinor: 2500000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      paySchedule: 'SEMI_MONTHLY',
      payDaysLabel: '15th & 30th',
    });

    const job2: IncomeSource = incomeSourceSchema.parse({
      id: 'job-2',
      name: 'Job 2 — Side Retainer',
      expectedMonthlyMinor: 2000000, // 20,000.00
      typicalPayoutMinor: 1000000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-savings',
      categoryId: 'cat-freelance',
      paySchedule: 'VARIABLE',
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
      // Log 1st payday for Job 1 (25,000.00)
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
      // Log variable payday for Job 2 (12,500.00)
      {
        opId: 'op-pay-2',
        clientTimestamp: '2026-11-18T14:00:00.000Z',
        type: 'incomeSource.logPayday',
        sourceId: 'job-2',
        transactionId: 'tx-pay-job2-1',
        amountMinor: 1250000,
        occurredAt: '2026-11-18T14:00:00.000Z',
      },
      // Unlinked bonus income (5,000.00)
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
          tags: [],
          occurredAt: '2026-11-19T12:00:00.000Z',
          createdAt: '2026-11-19T12:00:00.000Z',
        },
      },
      // Actual expense in Daily Living (4,000.00)
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
          tags: [],
          occurredAt: '2026-11-20T12:00:00.000Z',
          createdAt: '2026-11-20T12:00:00.000Z',
        },
      },
      // Category Envelopes: Home = 15,000.00, Daily Living = 12,000.00
      {
        opId: 'op-env-home',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'categoryBudget.upsert',
        budget: {
          id: 'env-home-nov',
          categoryId: 'cat-home',
          periodMonth: '2026-11',
          assignedMinor: 1500000,
          rolloverEnabled: false,
        },
      },
      {
        opId: 'op-env-daily',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'categoryBudget.upsert',
        budget: {
          id: 'env-daily-nov',
          categoryId: 'cat-daily-living',
          periodMonth: '2026-11',
          assignedMinor: 1200000,
          rolloverEnabled: false,
        },
      },
    ]);

    const commitments: RecurringCommitment[] = [
      // Rent in cat-home (12,000.00) -> completely covered by Home envelope (15,000.00)
      {
        id: 'bill-rent',
        name: 'Rent',
        kind: 'RECURRING',
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
      // Internet in cat-dues (2,000.00) -> no envelope in cat-dues => standalone bill
      {
        id: 'bill-net',
        name: 'Fiber Internet',
        kind: 'RECURRING',
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

    const sinkingFunds: SinkingFund[] = [
      {
        id: 'sf-ef',
        name: 'Emergency Fund',
        icon: '🎯',
        color: '#1E6F4E',
        targetAmountMinor: 10000000,
        currentSavedMinor: 2000000,
        targetDate: '2027-12',
        accountId: 'account-savings',
        monthlyContributionMinor: 1000000, // 10,000.00
        isCompleted: false,
      },
    ];

    const categoryBudgets = computeEnvelopeRollovers({
      budgets: stateWithJobsAndData.categoryBudgets,
      transactions: stateWithJobsAndData.transactions,
      periodMonth: '2026-11',
    });

    const expectedPlan = computeMonthlySalaryPlan({
      periodMonth: '2026-11',
      basis: 'EXPECTED',
      incomeSources: stateWithJobsAndData.incomeSources,
      transactions: stateWithJobsAndData.transactions,
      categoryBudgets,
      recurringCommitments: commitments,
      sinkingFunds,
    });

    expect(expectedPlan.totalExpectedIncomeMinor).toBe(7000000);
    expect(expectedPlan.totalReceivedIncomeMinor).toBe(4250000); // 25k + 12.5k + 5k
    expect(expectedPlan.unlinkedIncomeMinor).toBe(500000);
    expect(expectedPlan.sources[0].receivedMinor).toBe(2500000);
    expect(expectedPlan.sources[0].progressPercent).toBe(50);
    expect(expectedPlan.sources[1].receivedMinor).toBe(1250000);
    expect(expectedPlan.sources[1].progressPercent).toBe(63);

    // Zero-double-count verification:
    // Envelopes: 15k + 12k = 27k
    // Bills: 12k (covered by Home) + 2k (standalone in Dues) = 14k total, 12k covered, 2k standalone
    // Savings: 10k
    // Total Allocated = 27k + 2k + 10k = 39k (3,900,000 minor)
    expect(expectedPlan.envelopesAssignedMinor).toBe(2700000);
    expect(expectedPlan.totalScheduledBillsMinor).toBe(1400000);
    expect(expectedPlan.coveredByEnvelopeBillsMinor).toBe(1200000);
    expect(expectedPlan.standaloneBillsMinor).toBe(200000);
    expect(expectedPlan.plannedSavingsMinor).toBe(1000000);
    expect(expectedPlan.totalAllocatedMinor).toBe(3900000);
    expect(expectedPlan.unallocatedMinor).toBe(7000000 - 3900000);
    expect(expectedPlan.isOverAllocated).toBe(false);
    expect(expectedPlan.actualSpentMinor).toBe(400000);
    expect(expectedPlan.actualNetCashflowMinor).toBe(4250000 - 400000);

    // RECEIVED basis: 42.5k received - 39k allocated = 3.5k unallocated
    const receivedPlan = computeMonthlySalaryPlan({
      periodMonth: '2026-11',
      basis: 'RECEIVED',
      incomeSources: stateWithJobsAndData.incomeSources,
      transactions: stateWithJobsAndData.transactions,
      categoryBudgets,
      recurringCommitments: commitments,
      sinkingFunds,
    });
    expect(receivedPlan.planningIncomeMinor).toBe(4250000);
    expect(receivedPlan.unallocatedMinor).toBe(350000);
  });

  it('handles payday idempotency, currency checks, copyMonth, account link guards, and legacy backups', () => {
    const base = createInitialSyncDataState(new Date('2026-11-01T10:00:00.000Z'));

    const job: IncomeSource = incomeSourceSchema.parse({
      id: 'job-main',
      name: 'Main Job',
      expectedMonthlyMinor: 4000000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      paySchedule: 'MONTHLY',
    });

    const stateAfterUpsert = applySyncMutations(base, [
      {
        opId: 'op-1',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'incomeSource.upsert',
        source: job,
      },
      {
        opId: 'op-2',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'categoryBudget.upsert',
        budget: {
          id: 'env-1',
          categoryId: 'cat-daily-living',
          periodMonth: '2026-10',
          assignedMinor: 800000,
          rolloverEnabled: true,
        },
      },
      {
        opId: 'op-3',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'categoryBudget.upsert',
        budget: {
          id: 'env-2',
          categoryId: 'cat-home',
          periodMonth: '2026-10',
          assignedMinor: 1500000,
          rolloverEnabled: false,
        },
      },
      {
        opId: 'op-4',
        clientTimestamp: '2026-11-01T10:00:00.000Z',
        type: 'categoryBudget.upsert',
        budget: {
          id: 'env-nov-existing',
          categoryId: 'cat-home',
          periodMonth: '2026-11',
          assignedMinor: 1600000,
          rolloverEnabled: false,
        },
      },
    ]);

    // Replay same logPayday twice -> idempotent
    const payMutation = {
      opId: 'op-pay',
      clientTimestamp: '2026-11-15T10:00:00.000Z',
      type: 'incomeSource.logPayday' as const,
      sourceId: 'job-main',
      transactionId: 'tx-pay-idem',
      amountMinor: 4000000,
      occurredAt: '2026-11-15T10:00:00.000Z',
    };
    const afterPay = applySyncMutations(stateAfterUpsert, [payMutation, payMutation]);
    expect(afterPay.transactions.filter((t) => t.id === 'tx-pay-idem')).toHaveLength(1);
    expect(afterPay.accounts.find((a) => a.id === 'account-bank')?.balanceMinor).toBe(4000000);

    // Copy 2026-10 -> 2026-11 preserves existing cat-home (1,600,000) and copies cat-daily-living (800,000)
    const afterCopy = applySyncMutations(afterPay, [
      {
        opId: 'op-copy',
        clientTimestamp: '2026-11-15T10:05:00.000Z',
        type: 'categoryBudget.copyMonth',
        fromPeriodMonth: '2026-10',
        toPeriodMonth: '2026-11',
        idPrefix: 'budget-copy-1',
      },
    ]);
    const novBudgets = afterCopy.categoryBudgets.filter((b) => b.periodMonth === '2026-11');
    expect(novBudgets).toHaveLength(2);
    expect(novBudgets.find((b) => b.categoryId === 'cat-home')?.assignedMinor).toBe(1600000);
    expect(novBudgets.find((b) => b.categoryId === 'cat-daily-living')?.assignedMinor).toBe(
      800000,
    );

    // Linked records prevent deleting account-bank when linked to job-main
    const linked = getAccountLinkedRecords(afterCopy, 'account-bank');
    expect(linked.incomeSources).toHaveLength(1);
    expect(formatAccountLinkedErrorMessage(linked)).toContain('income source (Main Job)');

    // Delete income source keeps historical payday transaction intact
    const afterDelete = applySyncMutations(afterCopy, [
      {
        opId: 'op-del-job',
        clientTimestamp: '2026-11-20T10:00:00.000Z',
        type: 'incomeSource.delete',
        id: 'job-main',
      },
    ]);
    expect(afterDelete.incomeSources).toHaveLength(0);
    expect(afterDelete.transactions.some((t) => t.id === 'tx-pay-idem')).toBe(true);

    // Legacy backup without incomeSources normalizes and parses cleanly
    const legacyBackup = {
      version: 1,
      exportedAt: '2026-11-20T10:00:00.000Z',
      data: {
        accounts: base.accounts,
        categories: DEFAULT_CATEGORIES,
        transactions: [],
        categoryBudgets: [],
        recurringCommitments: [],
        sinkingFunds: [],
        quickPresets: [],
      },
    };
    const parsedBackup = backupEnvelopeSchema.parse(normalizeBackupEnvelope(legacyBackup));
    expect(parsedBackup.data.incomeSources).toEqual([]);
  });
});
