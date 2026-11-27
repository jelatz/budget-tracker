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

  it('tracks credit card limit, monthly paydown plan, Nth-weekday due schedule, and rollover after payment', () => {
    const base = createInitialSyncDataState(new Date('2026-11-27T12:00:00.000Z'));

    const prepared = applySyncMutations(base, [
      {
        opId: 'op-bank',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 5_000_000, // ₱50,000.00
      },
      {
        opId: 'op-card-meta',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.updateMetadata',
        account: {
          id: 'account-card',
          name: 'Home Credit',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#8B5CF6',
          currency: DEFAULT_CURRENCY,
          creditLimitMinor: 6_000_000, // ₱60,000.00
          monthlyPaymentTargetMinor: 500_000, // ₱5,000.00 / mo
          dueWeekday: 5, // Friday
          dueWeekdayOrdinal: 4, // 4th Friday
          dueStartDate: '2026-12-25',
        },
      },
      {
        opId: 'op-card-bal',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-card',
        balanceMinor: -3_200_432, // ₱32,004.32 used
      },
    ]);

    const card = prepared.accounts.find((a) => a.id === 'account-card')!;

    // On Nov 27, 2026: first due date is Dec 25, 2026 (not due in Nov, so Safe to Spend in Nov does not deduct Dec's ₱5k)
    const novDate = new Date(2026, 10, 27, 12, 0, 0, 0);
    const novSummary = computeCreditCardBillSummary({
      account: card,
      commitments: prepared.recurringCommitments,
      transactions: prepared.transactions,
      currentDate: novDate,
      nextPaydayDate: '2026-11-30',
    });
    expect(novSummary.dueScheduleLabel).toBe('Every 4th Friday');
    expect(novSummary.dueDate).toBe('2026-12-25');
    expect(novSummary.upcomingBillMinor).toBe(500_000);
    expect(novSummary.totalCardDebtMinor).toBe(3_200_432);
    expect(novSummary.creditLimitMinor).toBe(6_000_000);
    expect(novSummary.availableCreditMinor).toBe(2_799_568);
    expect(novSummary.utilizationPercent).toBe(53);
    expect(novSummary.isPaydownPlan).toBe(true);
    expect(novSummary.remainingPaymentsCount).toBe(7); // 6 x 5,000 + 2,004.32
    expect(novSummary.finalPaymentMinor).toBe(200_432);
    expect(novSummary.isDueBeforeNextPayday).toBe(false);

    const novSafe = computeSafeToSpend({
      accounts: prepared.accounts,
      commitments: prepared.recurringCommitments,
      transactions: prepared.transactions,
      nextPaydayDate: '2026-11-30',
      currentDate: novDate,
    });
    expect(novSafe.dueBeforeNextPaydayMinor).toBe(0);
    expect(novSafe.safeToSpendMinor).toBe(5_000_000);

    // On Dec 20, 2026 with next payday Dec 25, 2026: dueDate <= nextPaydayDate so ₱5,000 (not ₱32,004.32) is reserved
    const decDate = new Date(2026, 11, 20, 12, 0, 0, 0);
    const decSummary = computeCreditCardBillSummary({
      account: card,
      commitments: prepared.recurringCommitments,
      transactions: prepared.transactions,
      currentDate: decDate,
      nextPaydayDate: '2026-12-25',
    });
    expect(decSummary.dueDate).toBe('2026-12-25');
    expect(decSummary.upcomingBillMinor).toBe(500_000);
    expect(decSummary.isDueBeforeNextPayday).toBe(true);

    const decSafe = computeSafeToSpend({
      accounts: prepared.accounts,
      commitments: prepared.recurringCommitments,
      transactions: prepared.transactions,
      nextPaydayDate: '2026-12-25',
      currentDate: decDate,
    });
    expect(decSafe.dueBeforeNextPaydayMinor).toBe(500_000);
    expect(decSafe.safeToSpendMinor).toBe(4_500_000);

    // After paying ₱5,000 on Dec 25, 2026: balance drops to -2,700,432, rolls over to Jan 22, 2027 (4th Fri of Jan 2027)
    const afterDecPay = applySyncMutations(prepared, [
      {
        opId: 'op-pay-dec',
        clientTimestamp: '2026-12-25T10:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-hc-dec',
        installmentTxPrefix: 'tx-hc-inst-dec',
        paidAtIso: '2026-12-25T10:00:00.000Z',
        periodMonth: '2026-12',
        amountOverrideMinor: 500_000,
      },
    ]);

    const cardAfterDecPay = afterDecPay.accounts.find((a) => a.id === 'account-card')!;
    expect(cardAfterDecPay.balanceMinor).toBe(-2_700_432);
    const decPayTx = afterDecPay.transactions.find((t) => t.id === 'tx-hc-dec')!;
    expect(decPayTx.note).toBe('Credit card paydown payment');

    const summaryAfterDecPay = computeCreditCardBillSummary({
      account: cardAfterDecPay,
      commitments: afterDecPay.recurringCommitments,
      transactions: afterDecPay.transactions,
      currentDate: new Date(2026, 11, 26, 12, 0, 0, 0),
      nextPaydayDate: '2026-12-30',
    });
    expect(summaryAfterDecPay.isPaidForCurrentMonth).toBe(true);
    expect(summaryAfterDecPay.paidThisPeriodMinor).toBe(500_000);
    expect(summaryAfterDecPay.availableCreditMinor).toBe(3_299_568);
    expect(summaryAfterDecPay.remainingPaymentsCount).toBe(6);
    expect(summaryAfterDecPay.dueDate).toBe('2027-01-22');
    expect(summaryAfterDecPay.isDueBeforeNextPayday).toBe(false);

    // Final month: when remaining debt is ₱2,004.32 (< ₱5,000 target), upcoming payment caps at ₱2,004.32
    const finalMonthState = applySyncMutations(afterDecPay, [
      {
        opId: 'op-final-bal',
        clientTimestamp: '2027-06-20T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-card',
        balanceMinor: -200_432,
      },
    ]);
    const finalCard = finalMonthState.accounts.find((a) => a.id === 'account-card')!;
    const finalSummary = computeCreditCardBillSummary({
      account: finalCard,
      commitments: finalMonthState.recurringCommitments,
      transactions: finalMonthState.transactions,
      currentDate: new Date(2027, 5, 20, 12, 0, 0, 0),
      nextPaydayDate: '2027-06-25',
    });
    expect(finalSummary.upcomingBillMinor).toBe(200_432);
    expect(finalSummary.remainingPaymentsCount).toBe(1);
    expect(finalSummary.finalPaymentMinor).toBe(200_432);
    expect(finalSummary.isDueBeforeNextPayday).toBe(true);
  });

  it('sorts unpaid credit cards, installments, loans, and bills to the top deterministically', () => {
    const now = new Date(2026, 10, 15, 12, 0, 0, 0); // 2026-11-15
    const base = createInitialSyncDataState(new Date('2026-11-01T12:00:00.000Z'));

    const state = applySyncMutations(base, [
      // Credit card 1 (default 'account-card'): settled (₱0 owed)
      {
        opId: 'op-card-settled',
        clientTimestamp: '2026-11-01T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-card',
        balanceMinor: 0,
      },
      // Credit card 2: paid for current month with remaining balance
      {
        opId: 'op-card-paid-upsert',
        clientTimestamp: '2026-11-01T12:01:00.000Z',
        type: 'account.upsert',
        account: {
          id: 'card-paid-month',
          name: 'Paid Plan Card',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#3B82F6',
          currency: DEFAULT_CURRENCY,
          balanceMinor: -900_000,
          dueDay: 18,
          monthlyPaymentTargetMinor: 300_000,
        },
      },
      {
        opId: 'op-card-paid-tx',
        clientTimestamp: '2026-11-10T12:00:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-pay-plan-nov',
          type: 'TRANSFER',
          amountMinor: 300_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          toAccountId: 'card-paid-month',
          occurredAt: '2026-11-10T12:00:00.000Z',
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      },
      // Credit card 3: unpaid due in future month (Dec 2026)
      {
        opId: 'op-card-future-upsert',
        clientTimestamp: '2026-11-01T12:02:00.000Z',
        type: 'account.upsert',
        account: {
          id: 'card-future',
          name: 'Future Due Card',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#10B981',
          currency: DEFAULT_CURRENCY,
          balanceMinor: -800_000,
          dueDay: 20,
          dueStartDate: '2026-12-20',
          monthlyPaymentTargetMinor: 200_000,
        },
      },
      // Credit card 4: unpaid due Nov 25
      {
        opId: 'op-card-late-upsert',
        clientTimestamp: '2026-11-01T12:03:00.000Z',
        type: 'account.upsert',
        account: {
          id: 'card-unpaid-25',
          name: 'Unpaid Card 25',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#F59E0B',
          currency: DEFAULT_CURRENCY,
          balanceMinor: -400_000,
          dueDay: 25,
        },
      },
      // Credit card 5: unpaid due Nov 18 (earliest due date this month -> first!)
      {
        opId: 'op-card-soon-upsert',
        clientTimestamp: '2026-11-01T12:04:00.000Z',
        type: 'account.upsert',
        account: {
          id: 'card-unpaid-18',
          name: 'Unpaid Card 18',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#EF4444',
          currency: DEFAULT_CURRENCY,
          balanceMinor: -250_000,
          dueDay: 18,
        },
      },
      // Installments on Unpaid Card 18 (inserted paid-off -> paid -> unpaid)
      {
        opId: 'op-inst-paid-off',
        clientTimestamp: '2026-11-01T12:05:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-paid-off',
          name: 'Paid Off Tablet',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 100_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'card-unpaid-18',
          categoryId: 'cat-loans',
          dueDay: 18,
          totalInstallments: 6,
          paidInstallments: 6,
        }),
      },
      {
        opId: 'op-inst-paid-month',
        clientTimestamp: '2026-11-01T12:05:10.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-paid-month',
          name: 'Paid Month Headphones',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 50_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'card-unpaid-18',
          categoryId: 'cat-loans',
          dueDay: 18,
          totalInstallments: 6,
          paidInstallments: 2,
          lastPaidPeriod: '2026-11',
        }),
      },
      {
        opId: 'op-inst-unpaid',
        clientTimestamp: '2026-11-01T12:05:20.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-unpaid',
          name: 'Unpaid Laptop',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 200_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'card-unpaid-18',
          categoryId: 'cat-loans',
          dueDay: 18,
          totalInstallments: 12,
          paidInstallments: 1,
        }),
      },
      // Loans (inserted paid-off -> paid -> future -> upcoming -> due today -> overdue)
      {
        opId: 'op-loan-paid-off',
        clientTimestamp: '2026-11-01T12:06:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-paid-off',
          name: 'Paid Off Loan',
          kind: 'LOAN',
          amountMinor: 300_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 10,
          totalInstallments: 3,
          paidInstallments: 3,
        }),
      },
      {
        opId: 'op-loan-paid',
        clientTimestamp: '2026-11-01T12:06:10.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-paid',
          name: 'Paid Loan',
          kind: 'LOAN',
          amountMinor: 400_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 12,
          lastPaidPeriod: '2026-11',
        }),
      },
      {
        opId: 'op-loan-future',
        clientTimestamp: '2026-11-01T12:06:20.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-future',
          name: 'Future Loan',
          kind: 'LOAN',
          amountMinor: 500_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 5,
          nextDueDate: '2026-12-05',
        }),
      },
      {
        opId: 'op-loan-upcoming',
        clientTimestamp: '2026-11-01T12:06:30.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-upcoming',
          name: 'Upcoming Loan',
          kind: 'LOAN',
          amountMinor: 600_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 22,
        }),
      },
      {
        opId: 'op-loan-today',
        clientTimestamp: '2026-11-01T12:06:40.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-today',
          name: 'Due Today Loan',
          kind: 'LOAN',
          amountMinor: 450_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 15,
        }),
      },
      {
        opId: 'op-loan-overdue',
        clientTimestamp: '2026-11-01T12:06:50.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'loan-overdue',
          name: 'Overdue Loan',
          kind: 'LOAN',
          amountMinor: 350_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-loans',
          dueDay: 5,
        }),
      },
      // Bills (inserted paid -> upcoming -> overdue)
      {
        opId: 'op-bill-paid',
        clientTimestamp: '2026-11-01T12:07:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'bill-paid',
          name: 'Paid Water Bill',
          kind: 'BILL',
          amountMinor: 80_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-dues',
          dueDay: 10,
          lastPaidPeriod: '2026-11',
        }),
      },
      {
        opId: 'op-bill-upcoming',
        clientTimestamp: '2026-11-01T12:07:10.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'bill-upcoming',
          name: 'Upcoming Internet',
          kind: 'BILL',
          amountMinor: 199_900,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-dues',
          dueDay: 24,
        }),
      },
      {
        opId: 'op-bill-overdue',
        clientTimestamp: '2026-11-01T12:07:20.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'bill-overdue',
          name: 'Overdue Electric',
          kind: 'BILL',
          amountMinor: 320_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-bank',
          categoryId: 'cat-dues',
          dueDay: 8,
        }),
      },
    ]);

    const overview = computeDebtOverview({
      accounts: state.accounts,
      commitments: state.recurringCommitments,
      transactions: state.transactions,
      currentDate: now,
    });

    expect(overview.creditCards.map((c) => c.account.id)).toEqual([
      'card-unpaid-18',
      'card-unpaid-25',
      'card-future',
      'card-paid-month',
      'account-card',
    ]);

    const card18 = overview.creditCards.find((c) => c.account.id === 'card-unpaid-18')!;
    expect(card18.installments.map((i) => i.id)).toEqual([
      'inst-unpaid',
      'inst-paid-month',
      'inst-paid-off',
    ]);

    expect(overview.loans.map((l) => l.id)).toEqual([
      'loan-overdue',
      'loan-today',
      'loan-upcoming',
      'loan-future',
      'loan-paid',
      'loan-paid-off',
    ]);

    expect(overview.bills.map((b) => b.id)).toEqual([
      'bill-overdue',
      'bill-upcoming',
      'bill-paid',
    ]);
  });

  it('supports credit card advance pay across paydown plans, due dates, Safe-to-Spend, and full payoff', () => {
    const base = createInitialSyncDataState(new Date('2026-11-27T12:00:00.000Z'));

    const prepared = applySyncMutations(base, [
      {
        opId: 'op-bank',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 5_000_000,
      },
      {
        opId: 'op-card-meta',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.updateMetadata',
        account: {
          id: 'account-card',
          name: 'Home Credit',
          accountType: 'CREDIT_CARD',
          icon: '💳',
          color: '#8B5CF6',
          currency: DEFAULT_CURRENCY,
          creditLimitMinor: 6_000_000,
          monthlyPaymentTargetMinor: 500_000,
          dueWeekday: 5,
          dueWeekdayOrdinal: 4,
          dueStartDate: '2026-12-25',
        },
      },
      {
        opId: 'op-card-bal',
        clientTimestamp: '2026-11-27T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-card',
        balanceMinor: -3_000_000,
      },
    ]);

    // Advance pay 2 months (Dec 2026 + Jan 2027) early on Nov 27, 2026 -> ₱10,000
    const afterAdvance2 = applySyncMutations(prepared, [
      {
        opId: 'op-cc-adv-2',
        clientTimestamp: '2026-11-27T12:05:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-adv-2',
        installmentTxPrefix: 'tx-cc-adv-inst-2',
        paidAtIso: '2026-11-27T12:05:00.000Z',
        periodMonth: '2026-11',
        amountOverrideMinor: 1_000_000,
        advanceMonths: 2,
      },
    ]);

    const cardAdv2 = afterAdvance2.accounts.find((a) => a.id === 'account-card')!;
    expect(cardAdv2.balanceMinor).toBe(-2_000_000);
    expect(cardAdv2.paidThroughPeriod).toBe('2027-01');

    // On Dec 20, 2026 with payday Dec 25, card is already paid through Jan 2027 -> dueDate rolls to Feb 2027 (4th Fri = 2027-02-26)
    const decDate = new Date(2026, 11, 20, 12, 0, 0, 0);
    const decSummary = computeCreditCardBillSummary({
      account: cardAdv2,
      commitments: afterAdvance2.recurringCommitments,
      transactions: afterAdvance2.transactions,
      currentDate: decDate,
      nextPaydayDate: '2026-12-25',
    });
    expect(decSummary.isPaidAhead).toBe(true);
    expect(decSummary.isPaidForCurrentMonth).toBe(true);
    expect(decSummary.paidThroughPeriod).toBe('2027-01');
    expect(decSummary.dueDate).toBe('2027-02-26');
    expect(decSummary.isDueBeforeNextPayday).toBe(false);

    const decSafe = computeSafeToSpend({
      accounts: afterAdvance2.accounts,
      commitments: afterAdvance2.recurringCommitments,
      transactions: afterAdvance2.transactions,
      nextPaydayDate: '2026-12-25',
      currentDate: decDate,
    });
    expect(decSafe.dueBeforeNextPaydayMinor).toBe(0);
    expect(decSafe.safeToSpendMinor).toBe(4_000_000);

    // Paying off the full remaining ₱20,000 clears paidThroughPeriod
    const afterFullPayoff = applySyncMutations(afterAdvance2, [
      {
        opId: 'op-cc-full-payoff',
        clientTimestamp: '2026-12-20T12:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-payoff',
        installmentTxPrefix: 'tx-cc-payoff-inst',
        paidAtIso: '2026-12-20T12:00:00.000Z',
        periodMonth: '2026-12',
        amountOverrideMinor: 2_000_000,
        advanceMonths: 4,
      },
    ]);
    const settledCard = afterFullPayoff.accounts.find((a) => a.id === 'account-card')!;
    expect(settledCard.balanceMinor).toBe(0);
    expect(settledCard.paidThroughPeriod).toBeUndefined();

    // Undo full payoff restores balance (-₱20k) and previous paidThroughPeriod ('2027-01')
    const afterUndoPayoff = applySyncMutations(afterFullPayoff, [
      {
        opId: 'op-cc-undo-payoff',
        clientTimestamp: '2026-12-20T12:05:00.000Z',
        type: 'creditCard.unpayBill',
        creditCardAccountId: 'account-card',
      },
    ]);
    const cardAfterUndoPayoff = afterUndoPayoff.accounts.find(
      (a) => a.id === 'account-card',
    )!;
    expect(cardAfterUndoPayoff.balanceMinor).toBe(-2_000_000);
    expect(cardAfterUndoPayoff.paidThroughPeriod).toBe('2027-01');
    expect(afterUndoPayoff.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      4_000_000,
    );

    // Deleting the transfer transaction directly also rolls back paidThroughPeriod on the card
    const afterDeleteAdvanceTx = applySyncMutations(afterAdvance2, [
      {
        opId: 'op-del-cc-adv',
        clientTimestamp: '2026-11-27T12:10:00.000Z',
        type: 'transaction.delete',
        id: 'tx-cc-adv-2',
      },
    ]);
    const cardAfterDelete = afterDeleteAdvanceTx.accounts.find(
      (a) => a.id === 'account-card',
    )!;
    expect(cardAfterDelete.balanceMinor).toBe(-3_000_000);
    expect(cardAfterDelete.paidThroughPeriod).toBeUndefined();
    expect(cardAfterDelete.lastPaymentTransactionId).toBeUndefined();
  });

  it('reverts transfer and installment slices when running creditCard.unpayBill on a card with installments', () => {
    const base = createInitialSyncDataState(new Date('2026-11-10T12:00:00.000Z'));
    const prepared = applySyncMutations(base, [
      {
        opId: 'op-set-bank-u',
        clientTimestamp: '2026-11-10T12:00:00.000Z',
        type: 'account.setBalance',
        accountId: 'account-bank',
        balanceMinor: 3_000_000,
      },
      {
        opId: 'op-swipe-u',
        clientTimestamp: '2026-11-10T12:01:00.000Z',
        type: 'transaction.create',
        transaction: {
          id: 'tx-swipe-u',
          type: 'EXPENSE',
          amountMinor: 100_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-card',
          categoryId: 'cat-daily-living',
          occurredAt: '2026-11-10T12:01:00.000Z',
          createdAt: '2026-11-10T12:01:00.000Z',
        },
      },
      {
        opId: 'op-inst-u',
        clientTimestamp: '2026-11-10T12:02:00.000Z',
        type: 'commitment.upsert',
        commitment: recurringCommitmentSchema.parse({
          id: 'inst-u',
          name: 'Monitor',
          kind: 'CREDIT_CARD_INSTALLMENT',
          amountMinor: 250_000,
          currency: DEFAULT_CURRENCY,
          accountId: 'account-card',
          categoryId: 'cat-loans',
          dueDay: 15,
          totalInstallments: 6,
          paidInstallments: 1,
        }),
      },
      {
        opId: 'op-pay-cc-u',
        clientTimestamp: '2026-11-15T10:00:00.000Z',
        type: 'creditCard.payBill',
        creditCardAccountId: 'account-card',
        paymentAccountId: 'account-bank',
        transferTransactionId: 'tx-cc-pay-u',
        installmentTxPrefix: 'tx-cc-inst-u',
        paidAtIso: '2026-11-15T10:00:00.000Z',
        periodMonth: '2026-11',
        advanceMonths: 2,
      },
    ]);

    expect(prepared.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      2_400_000,
    );
    expect(prepared.recurringCommitments.find((c) => c.id === 'inst-u')!.paidInstallments).toBe(
      3,
    );

    const undone = applySyncMutations(prepared, [
      {
        opId: 'op-unpay-cc-u',
        clientTimestamp: '2026-11-15T10:05:00.000Z',
        type: 'creditCard.unpayBill',
        creditCardAccountId: 'account-card',
      },
    ]);

    expect(undone.accounts.find((a) => a.id === 'account-bank')!.balanceMinor).toBe(
      3_000_000,
    );
    expect(undone.accounts.find((a) => a.id === 'account-card')!.balanceMinor).toBe(
      -100_000,
    );
    expect(undone.accounts.find((a) => a.id === 'account-card')!.paidThroughPeriod).toBeUndefined();
    const instAfter = undone.recurringCommitments.find((c) => c.id === 'inst-u')!;
    expect(instAfter.paidInstallments).toBe(1);
    expect(instAfter.lastPaidPeriod).toBeUndefined();
    expect(undone.transactions.some((t) => t.id === 'tx-cc-pay-u')).toBe(false);
    expect(undone.transactions.some((t) => t.id === 'tx-cc-inst-u-inst-u')).toBe(false);
  });
});
