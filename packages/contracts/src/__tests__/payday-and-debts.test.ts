import { describe, expect, it } from 'vitest';
import {
  applySyncMutations,
  computeCreditCardBillSummary,
  computeDebtOverview,
  computeSafeToSpend,
  createInitialSyncDataState,
  DEFAULT_CURRENCY,
  formatAccountLinkedErrorMessage,
  getAccountLinkedRecords,
  getNextPayday,
  getNextPaydayHorizonDate,
  getScheduledPaydatesForSourceInMonth,
  getUpcomingPaydays,
  incomeSourceSchema,
  recurringCommitmentSchema,
} from '../index';

describe('Payday Calendar & Debts/Credit-Card Math', () => {
  it('clamps 15th & 30th paydays in February (28 days in 2027, 29 in 2028)', () => {
    const job1 = incomeSourceSchema.parse({
      id: 'job-1',
      name: 'Primary Job',
      expectedMonthlyMinor: 6_000_000,
      typicalPayoutMinor: 3_000_000,
      accountId: 'account-bank',
      paySchedule: 'SEMI_MONTHLY',
      payDays: [15, 30],
    });

    expect(getScheduledPaydatesForSourceInMonth(job1, 2027, 1)).toEqual([
      '2027-02-15',
      '2027-02-28',
    ]);
    expect(getScheduledPaydatesForSourceInMonth(job1, 2028, 1)).toEqual([
      '2028-02-15',
      '2028-02-29',
    ]);
  });

  it('computes 2nd & 4th Friday paydays accurately across 5-Friday months and rolls over cleanly', () => {
    const job2 = incomeSourceSchema.parse({
      id: 'job-2',
      name: 'Second Job',
      expectedMonthlyMinor: 4_000_000,
      typicalPayoutMinor: 2_000_000,
      accountId: 'account-bank',
      paySchedule: 'TWICE_MONTHLY_WEEKDAY',
      weekday: 5, // Friday
      weekdayOrdinals: [2, 4],
    });

    // Nov 2026 Fridays: 6, 13, 20, 27 -> 2nd & 4th are 13 and 27
    expect(getScheduledPaydatesForSourceInMonth(job2, 2026, 10)).toEqual([
      '2026-11-13',
      '2026-11-27',
    ]);

    // Jan 2027 has 5 Fridays: 1, 8, 15, 22, 29 -> 2nd & 4th are strictly 8 and 22 (ignores 5th Friday)
    expect(getScheduledPaydatesForSourceInMonth(job2, 2027, 0)).toEqual([
      '2027-01-08',
      '2027-01-22',
    ]);

    // On Nov 28, 2026 (day after Nov 27), next payday rolls over to Dec's 2nd Friday (2026-12-11)
    const next = getNextPayday({
      sources: [job2],
      transactions: [],
      fromDate: new Date(2026, 10, 28, 12, 0, 0, 0),
    });
    expect(next?.date).toBe('2026-12-11');
  });

  it('merges 15th/30th and 2nd/4th Friday paydays chronologically and marks logged paydays received', () => {
    const job1 = incomeSourceSchema.parse({
      id: 'job-1',
      name: 'Job 1',
      expectedMonthlyMinor: 6_000_000,
      accountId: 'account-bank',
      paySchedule: 'SEMI_MONTHLY',
      payDays: [15, 30],
    });
    const job2 = incomeSourceSchema.parse({
      id: 'job-2',
      name: 'Job 2',
      expectedMonthlyMinor: 4_000_000,
      accountId: 'account-bank',
      paySchedule: 'TWICE_MONTHLY_WEEKDAY',
      weekday: 5,
      weekdayOrdinals: [2, 4],
    });

    const upcoming = getUpcomingPaydays({
      sources: [job1, job2],
      transactions: [],
      fromDate: new Date(2026, 10, 26, 12, 0, 0, 0),
      count: 4,
    });
    expect(upcoming.map((p) => [p.source.id, p.date])).toEqual([
      ['job-2', '2026-11-27'],
      ['job-1', '2026-11-30'],
      ['job-2', '2026-12-11'],
      ['job-1', '2026-12-15'],
    ]);

    // After logging Job 2's Nov 27 payday, getNextPayday advances to Job 1's Nov 30
    const nextAfterLog = getNextPayday({
      sources: [job1, job2],
      transactions: [
        {
          id: 'tx-pay-1',
          type: 'INCOME',
          amountMinor: 2_000_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-salary',
          incomeSourceId: 'job-2',
          occurredAt: '2026-11-27T09:00:00.000Z',
          createdAt: '2026-11-27T09:00:00.000Z',
        },
      ],
      fromDate: new Date(2026, 10, 26, 12, 0, 0, 0),
    });
    expect(nextAfterLog?.source.id).toBe('job-1');
    expect(nextAfterLog?.date).toBe('2026-11-30');
  });

  it('pays credit card bill in full (swipes + monthly installment slice) with zero double-counting', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const prepared = applySyncMutations(base, [
      {
        opId: 'op-set-bank',
        clientTimestamp: '2026-11-10T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 2_000_000, // ₱20,000.00
      },
      {
        opId: 'op-swipe-1',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-swipe-1',
          type: 'EXPENSE',
          amountMinor: 200_000, // ₱2,000.00 swipe
          currency: DEFAULT_CURRENCY,
          accountId: 'account-card',
          categoryId: 'cat-daily-living',
          merchant: 'Grocery',
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
      {
        opId: 'op-cc-inst',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-phone',
          name: 'Phone 0% Installment',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 300_000, // ₱3,000.00/mo
          currency: DEFAULT_CURRENCY,
          accountId: 'account-card',
          categoryId: 'cat-loans',
          dueDay: 15,
          totalInstallments: 12,
          paidInstallments: 3, // 9 left = ₱27,000.00 total installments left
        }),
      },
    ]);

    const cardBefore = prepared.accounts.find((a) => a.id === 'account-card')!;
    const summaryBefore = computeCreditCardBillSummary({
      account: cardBefore,
      commitments: prepared.recurringCommitments,
      currentDate: new Date(2026, 10, 12, 12, 0, 0, 0),
    });
    expect(summaryBefore.swipesOwedMinor).toBe(200_000);
    expect(summaryBefore.installmentsDueThisPeriodMinor).toBe(300_000);
    expect(summaryBefore.upcomingBillMinor).toBe(500_000); // ₱5,000.00
    expect(summaryBefore.allInstallmentsRemainingMinor).toBe(2_700_000);
    expect(summaryBefore.totalCardDebtMinor).toBe(2_900_000);

    const paid = applySyncMutations(prepared, [
      {
        opId: 'op-pay-cc',
        clientTimestamp: '2026-11-15T10:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-pay-nov',
        installmentTxPrefix: 'tx-cc-inst-nov',
        paidAtIso: '2026-11-15T10:00:00.000Z',
        periodMonth: '2026-11',
      },
    ]);

    expect(paid.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(1_500_000);
    expect(paid.accounts.find((a) => a.id === 'account-card')!.balanceMinor).toBe(0);

    const updatedInst = paid.recurringCommitments.find((c) => c.id === 'inst-phone')!;
    expect(updatedInst.paidInstallments).toBe(4);
    expect(updatedInst.lastPaidPeriod).toBe('2026-11');
    expect(updatedInst.isActive).toBe(true);

    // Total EXPENSE recorded is ₱2,000 swipe + ₱3,000 installment slice = ₱5,000 (NO double count!)
    const totalExpenses = paid.transactions
      .filter((tx) => tx.type === 'EXPENSE')
      .reduce((sum, tx) => sum + tx.amountMinor, 0);
    expect(totalExpenses).toBe(500_000);

    // Replaying the same mutation is idempotent
    const replayed = applySyncMutations(paid, [
      {
        opId: 'op-pay-cc',
        clientTimestamp: '2026-11-15T10:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-pay-nov',
        installmentTxPrefix: 'tx-cc-inst-nov',
        paidAtIso: '2026-11-15T10:00:00.000Z',
        periodMonth: '2026-11',
      },
    ]);
    expect(replayed.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(1_500_000);
  });

  it('deactivates final credit card installment upon payoff and supports variable utility bills', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));

    const next = applySyncMutations(base, [
      {
        opId: 'op-set-bank',
        clientTimestamp: '2026-11-10T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 2_000_000,
      },
      {
        opId: 'op-final-inst',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-final',
          name: 'Watch (Final Term)',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 150_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-card',
          categoryId: 'cat-loans',
          dueDay: 15,
          totalInstallments: 6,
          paidInstallments: 5,
        }),
      },
      {
        opId: 'op-utility-bill',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'bill-electric',
          name: 'Meralco Electricity',
          kind: 'BILL',
          amountMinor: 350_000, // ₱3,500 expected
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-dues',
          dueDay: 20,
        }),
      },
      {
        opId: 'op-pay-utility',
        clientTimestamp: '2026-11-18T12:00:00.000Z',
        type: 'commitment.pay',
        commitmentId: 'bill-electric',
        transactionId: 'tx-electric-nov',
        paidAtIso: '2026-11-18T12:00:00.000Z',
        periodMonth: '2026-11',
        actualAmountMinor: 412_500, // ₱4,125.00 actual
      },
      {
        opId: 'op-pay-cc-final',
        clientTimestamp: '2026-11-15T10:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-final',
        installmentTxPrefix: 'tx-inst-final',
        paidAtIso: '2026-11-15T10:00:00.000Z',
        periodMonth: '2026-11',
      },
    ]);

    const finalInst = next.recurringCommitments.find((c) => c.id === 'inst-final')!;
    expect(finalInst.paidInstallments).toBe(6);
    expect(finalInst.isActive).toBe(false);

    const utilityBill = next.recurringCommitments.find((c) => c.id === 'bill-electric')!;
    expect(utilityBill.amountMinor).toBe(350_000); // baseline preserved
    expect(utilityBill.lastPaidPeriod).toBe('2026-11');

    const utilityTx = next.transactions.find((tx) => tx.id === 'tx-electric-nov')!;
    expect(utilityTx.amountMinor).toBe(412_500);
    expect(utilityTx.commitmentId).toBe('bill-electric');
  });

  it('computes Safe to Spend until Next Payday and blocks deleting accounts linked to commitments/paydays', () => {
    const base = createInitialSyncDataState(new Date('2026-11-26T12:00:00.000Z'));
    const populated = applySyncMutations(base, [
      {
        opId: 'op-bank-bal',
        clientTimestamp: '2026-11-26T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 1_500_000, // ₱15,000.00
      },
      {
        opId: 'op-job-2',
        clientTimestamp: '2026-11-26T12:00:00.000Z',
        type: 'incomeSource.upsert',
        source: incomeSourceSchema.parse({
          id: 'job-2',
          name: 'Second Job',
          expectedMonthlyMinor: 4_000_000,
          accountId: 'account-bank',
          paySchedule: 'TWICE_MONTHLY_WEEKDAY',
          weekday: 5,
          weekdayOrdinals: [2, 4],
        }),
      },
      {
        opId: 'op-due-soon',
        clientTimestamp: '2026-11-26T12:00:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'bill-internet',
          name: 'Fiber Internet',
          kind: 'BILL',
          amountMinor: 200_000, // ₱2,000 due Nov 27 (<= next payday Nov 27)
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-dues',
          dueDay: 27,
        }),
      },
      {
        opId: 'op-due-later',
        clientTimestamp: '2026-11-26T12:00:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-later',
          name: 'Car Loan',
          kind: 'LOAN',
          amountMinor: 500_000, // ₱5,000 due Nov 30 (after Nov 27 payday)
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 30,
          totalInstallments: 12,
          paidInstallments: 2,
        }),
      },
    ]);

    const now = new Date(2026, 10, 26, 12, 0, 0, 0);
    const horizon = getNextPaydayHorizonDate({
      sources: populated.incomeSources,
      transactions: populated.transactions,
      fromDate: now,
    });
    expect(horizon).toBe('2026-11-27');

    const safe = computeSafeToSpend({
      accounts: populated.accounts,
      commitments: populated.recurringCommitments,
      nextPaydayDate: horizon,
      currentDate: now,
    });
    expect(safe.totalLiquidBalanceMinor).toBe(1_500_000);
    expect(safe.dueBeforeNextPaydayMinor).toBe(200_000);
    expect(safe.dueLaterThisMonthMinor).toBe(500_000);
    expect(safe.safeToSpendMinor).toBe(1_300_000);
    expect(safe.daysUntilNextPayday).toBe(1);

    const overview = computeDebtOverview({
      accounts: populated.accounts,
      commitments: populated.recurringCommitments,
      nextPaydayDate: horizon,
      currentDate: now,
    });
    expect(overview.totalLoansRemainingMinor).toBe(5_000_000);

    const linked = getAccountLinkedRecords(populated, 'account-bank');
    expect(linked.isLinked).toBe(true);
    expect(formatAccountLinkedErrorMessage(linked)).toContain('debts and bills');
    expect(formatAccountLinkedErrorMessage(linked)).toContain('1 payday source');
  });

  it('respects anchorDate first-payment start dates for DobotAI (2nd/4th Fri) and Bloomgarden (15th/30th starting Dec 16)', () => {
    const dobotai = incomeSourceSchema.parse({
      id: 'job-dobotai',
      name: 'DobotAI',
      expectedMonthlyMinor: 4_000_000,
      accountId: 'account-bank',
      paySchedule: 'TWICE_MONTHLY_WEEKDAY',
      weekday: 5,
      weekdayOrdinals: [2, 4],
    });
    const bloomgarden = incomeSourceSchema.parse({
      id: 'job-bloomgarden',
      name: 'Bloomgarden',
      expectedMonthlyMinor: 6_000_000,
      accountId: 'account-bank',
      paySchedule: 'SEMI_MONTHLY',
      payDays: [15, 30],
      anchorDate: '2026-12-16',
    });

    const upcoming = getUpcomingPaydays({
      sources: [dobotai, bloomgarden],
      transactions: [],
      fromDate: new Date(2026, 10, 26, 12, 0, 0, 0),
      count: 6,
    });

    expect(upcoming.map((p) => [p.source.name, p.date, p.daysUntil])).toEqual([
      ['DobotAI', '2026-11-27', 1],
      ['DobotAI', '2026-12-11', 15],
      ['Bloomgarden', '2026-12-16', 20],
      ['DobotAI', '2026-12-25', 29],
      ['Bloomgarden', '2026-12-30', 34],
      ['DobotAI', '2027-01-08', 43],
    ]);
  });

  it('infers weekday paydays for legacy SEMI_MONTHLY sources labeled "2nd & 4th Friday" when payDays is unset', () => {
    const legacyDobotai = incomeSourceSchema.parse({
      id: 'job-legacy-dobotai',
      name: 'DobotAI',
      expectedMonthlyMinor: 4_000_000,
      accountId: 'account-bank',
      paySchedule: 'SEMI_MONTHLY',
      payDaysLabel: '2nd & 4th Friday',
    });

    const next = getNextPayday({
      sources: [legacyDobotai],
      transactions: [],
      fromDate: new Date(2026, 10, 26, 12, 0, 0, 0),
    });

    expect(next?.date).toBe('2026-11-27');
    expect(next?.daysUntil).toBe(1);
  });
});
