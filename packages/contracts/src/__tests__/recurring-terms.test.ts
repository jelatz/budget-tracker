import { describe, expect, it } from 'vitest';
import {
  advanceNextDueDate,
  computeInstallmentProgress,
  computeSafeToSpend,
  formatCalendarDateShort,
  getCommitmentDueStatus,
  getNextDueDatePreset,
  isCommitmentPaidOff,
  recurringCommitmentSchema,
  type RecurringCommitment,
} from '../recurring.schema';

const BASE_COMMITMENT: RecurringCommitment = {
  id: 'rec-base',
  name: 'Test Expense',
  kind: 'RECURRING',
  amountMinor: 100_000, // ₱1,000.00
  currency: 'PHP',
  accountId: 'acc-unionbank',
  categoryId: 'cat-dues',
  frequency: 'MONTHLY',
  dueDay: 15,
  isAutoPaid: false,
  isActive: true,
  paidInstallments: 0,
};

describe('recurring commitment terms & due labels', () => {
  it('accepts optional schedule dueLabel values like PAYROLL, Weekly, April 25, and No fixed date', () => {
    for (const label of ['PAYROLL', 'Weekly', 'April 25', 'No fixed date']) {
      const parsed = recurringCommitmentSchema.parse({
        ...BASE_COMMITMENT,
        dueLabel: `  ${label}  `,
      });
      expect(parsed.dueLabel).toBe(label);
    }

    expect(() =>
      recurringCommitmentSchema.parse({
        ...BASE_COMMITMENT,
        dueLabel: '   ',
      }),
    ).toThrow();
  });

  it('tracks Total Terms and Remaining Terms for termed RECURRING schedules as well as INSTALLMENT items', () => {
    const termedRecurring: RecurringCommitment = {
      ...BASE_COMMITMENT,
      name: 'JBL Partybox (6 months)',
      kind: 'RECURRING',
      categoryId: 'cat-entertainment',
      amountMinor: 331_500,
      totalInstallments: 6,
      paidInstallments: 2, // Remaining Terms = 4
    };

    const progress = computeInstallmentProgress(termedRecurring);
    expect(progress.totalCount).toBe(6);
    expect(progress.paidCount).toBe(2);
    expect(progress.remainingCount).toBe(4);
    expect(progress.remainingBalanceMinor).toBe(1_326_000);
    expect(progress.progressPercent).toBe(33);
    expect(progress.isPaidOff).toBe(false);
    expect(isCommitmentPaidOff(termedRecurring)).toBe(false);

    const paidOffRecurring: RecurringCommitment = {
      ...termedRecurring,
      paidInstallments: 6,
    };
    expect(isCommitmentPaidOff(paidOffRecurring)).toBe(true);
    expect(computeInstallmentProgress(paidOffRecurring).remainingCount).toBe(0);
    expect(computeInstallmentProgress(paidOffRecurring).isPaidOff).toBe(true);
  });

  it('allows INSTALLMENT loans without fixed Total Terms and excludes settled termed items from Safe to Spend', () => {
    const openEndedLoan: RecurringCommitment = {
      ...BASE_COMMITMENT,
      id: 'rec-open-loan',
      name: 'Maya Loan',
      kind: 'INSTALLMENT',
      categoryId: 'cat-loans',
      amountMinor: 200_000,
      dueDay: 25,
      dueLabel: 'April 25',
    };

    expect(isCommitmentPaidOff(openEndedLoan)).toBe(false);
    expect(computeInstallmentProgress(openEndedLoan)).toEqual({
      paidCount: 0,
      totalCount: 0,
      remainingCount: 0,
      remainingBalanceMinor: 0,
      progressPercent: 0,
      isPaidOff: false,
    });

    const settledTermedRecurring: RecurringCommitment = {
      ...BASE_COMMITMENT,
      id: 'rec-settled-cc',
      name: 'CC - Airpods pro 3',
      kind: 'RECURRING',
      dueDay: 30,
      totalInstallments: 6,
      paidInstallments: 6,
    };

    const safe = computeSafeToSpend({
      liquidAccounts: [
        {
          id: 'acc-unionbank',
          name: 'Unionbank',
          accountType: 'BANK',
          icon: '🏦',
          color: '#2563eb',
          currency: 'PHP',
          balanceMinor: 1_000_000,
        },
      ],
      commitments: [openEndedLoan, settledTermedRecurring],
      sinkingFunds: [],
      categoryBudgets: [],
      currentDate: new Date(2026, 10, 10),
    });

    // Only openEndedLoan (200_000) counts toward upcomingFixedBillsMinor; settledTermedRecurring is paid off.
    expect(safe.upcomingFixedBillsMinor).toBe(200_000);
    expect(safe.safeToSpendMinor).toBe(800_000);
  });

  it('validates nextDueDate YYYY-MM-DD strings and advances cycles across frequencies', () => {
    const parsed = recurringCommitmentSchema.parse({
      ...BASE_COMMITMENT,
      nextDueDate: ' 2027-04-25 ',
    });
    expect(parsed.nextDueDate).toBe('2027-04-25');
    expect(formatCalendarDateShort('2026-11-28', 2026)).toBe('Nov 28');
    expect(formatCalendarDateShort('2027-04-25', 2026)).toBe('Apr 25, 2027');

    expect(() =>
      recurringCommitmentSchema.parse({
        ...BASE_COMMITMENT,
        nextDueDate: '2026-02-31',
      }),
    ).toThrow();
    expect(() =>
      recurringCommitmentSchema.parse({
        ...BASE_COMMITMENT,
        nextDueDate: '2026/11/21',
      }),
    ).toThrow();

    expect(advanceNextDueDate('2026-11-21', 'WEEKLY', 21)).toBe('2026-11-28');
    expect(advanceNextDueDate('2026-11-21', 'BIWEEKLY', 21)).toBe('2026-12-05');
    // Month-end anchor clamping: Jan 31 -> Feb 28 -> Mar 31
    const febDate = advanceNextDueDate('2026-01-31', 'MONTHLY', 31);
    expect(febDate).toBe('2026-02-28');
    expect(advanceNextDueDate(febDate, 'MONTHLY', 31)).toBe('2026-03-31');
    expect(advanceNextDueDate('2026-11-15', 'QUARTERLY', 15)).toBe('2027-02-15');
    expect(advanceNextDueDate('2024-02-29', 'YEARLY', 29)).toBe('2025-02-28');
  });

  it('classifies commitment due statuses accurately and excludes future-month schedules from Safe to Spend', () => {
    const nov21 = new Date(2026, 10, 21, 12, 0, 0, 0);

    const overdue = getCommitmentDueStatus(
      { ...BASE_COMMITMENT, dueDay: 28, nextDueDate: '2026-11-18' },
      nov21,
    );
    expect(overdue.state).toBe('OVERDUE');
    expect(overdue.isDueThisMonth).toBe(true);
    expect(overdue.isUpcomingInMonth).toBe(false);

    const dueToday = getCommitmentDueStatus(
      { ...BASE_COMMITMENT, dueDay: 15, nextDueDate: '2026-11-21' },
      nov21,
    );
    expect(dueToday.state).toBe('DUE_TODAY');
    expect(dueToday.isDueThisMonth).toBe(true);
    expect(dueToday.isUpcomingInMonth).toBe(true);

    const upcomingThisMonth = getCommitmentDueStatus(
      { ...BASE_COMMITMENT, dueDay: 5, nextDueDate: '2026-11-28' },
      nov21,
    );
    expect(upcomingThisMonth.state).toBe('UPCOMING_THIS_MONTH');
    expect(upcomingThisMonth.isDueThisMonth).toBe(true);
    expect(upcomingThisMonth.isUpcomingInMonth).toBe(true);

    const futureMonthCommitment: RecurringCommitment = {
      ...BASE_COMMITMENT,
      id: 'rec-december',
      name: 'Maya Loan',
      amountMinor: 200_000,
      dueDay: 25,
      nextDueDate: '2026-12-25',
    };
    const futureMonth = getCommitmentDueStatus(futureMonthCommitment, nov21);
    expect(futureMonth.state).toBe('FUTURE_MONTH');
    expect(futureMonth.isDueThisMonth).toBe(false);
    expect(futureMonth.isUpcomingInMonth).toBe(false);

    const paid = getCommitmentDueStatus(
      { ...BASE_COMMITMENT, lastPaidPeriod: '2026-11', nextDueDate: '2026-12-15' },
      nov21,
    );
    expect(paid.state).toBe('PAID');

    const safe = computeSafeToSpend({
      liquidAccounts: [
        {
          id: 'acc-unionbank',
          name: 'Unionbank',
          accountType: 'BANK',
          icon: '🏦',
          color: '#2563eb',
          currency: 'PHP',
          balanceMinor: 1_000_000,
        },
      ],
      commitments: [
        {
          ...BASE_COMMITMENT,
          id: 'rec-nov-28',
          amountMinor: 150_000,
          dueDay: 5,
          nextDueDate: '2026-11-28',
        },
        futureMonthCommitment,
      ],
      sinkingFunds: [],
      categoryBudgets: [],
      currentDate: nov21,
    });

    expect(safe.upcomingFixedBillsMinor).toBe(150_000);
    expect(safe.safeToSpendMinor).toBe(850_000);
  });

  it('generates deterministic Next Due Date presets for TODAY, NEXT_WEEK, and clamped NEXT_MONTH', () => {
    const jan31 = new Date(2026, 0, 31, 12, 0, 0, 0);
    expect(getNextDueDatePreset('TODAY', 31, jan31)).toBe('2026-01-31');
    expect(getNextDueDatePreset('NEXT_WEEK', 31, jan31)).toBe('2026-02-07');
    expect(getNextDueDatePreset('NEXT_MONTH', 31, jan31)).toBe('2026-02-28');
    expect(getNextDueDatePreset('NEXT_MONTH', 15, jan31)).toBe('2026-02-15');
  });
});
