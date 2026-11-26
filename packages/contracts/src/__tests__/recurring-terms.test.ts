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
  kind: 'BILL',
  amountMinor: 100_000,
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
  it('accepts optional schedule dueLabel values', () => {
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

  it('tracks Total Terms and Remaining Terms for LOAN and CREDIT_CARD_INSTALLMENT items', () => {
    const termedLoan: RecurringCommitment = {
      ...BASE_COMMITMENT,
      name: 'JBL Partybox (6 months)',
      kind: 'CREDIT_CARD_INSTALLMENT',
      categoryId: 'cat-entertainment',
      amountMinor: 331_500,
      totalInstallments: 6,
      paidInstallments: 2,
    };

    const progress = computeInstallmentProgress(termedLoan);
    expect(progress.totalCount).toBe(6);
    expect(progress.paidCount).toBe(2);
    expect(progress.remainingCount).toBe(4);
    expect(progress.remainingBalanceMinor).toBe(1_326_000);
    expect(progress.progressPercent).toBe(33);
    expect(progress.isPaidOff).toBe(false);
    expect(isCommitmentPaidOff(termedLoan)).toBe(false);

    const paidOff: RecurringCommitment = {
      ...termedLoan,
      paidInstallments: 6,
    };
    expect(isCommitmentPaidOff(paidOff)).toBe(true);
    expect(computeInstallmentProgress(paidOff).remainingCount).toBe(0);
  });

  it('excludes paid-off items from Safe to Spend', () => {
    const openEndedLoan: RecurringCommitment = {
      ...BASE_COMMITMENT,
      id: 'rec-open-loan',
      name: 'Maya Loan',
      kind: 'LOAN',
      categoryId: 'cat-loans',
      amountMinor: 200_000,
      dueDay: 25,
    };

    const settled: RecurringCommitment = {
      ...BASE_COMMITMENT,
      id: 'rec-settled-cc',
      name: 'CC - Airpods pro 3',
      kind: 'CREDIT_CARD_INSTALLMENT',
      dueDay: 30,
      totalInstallments: 6,
      paidInstallments: 6,
    };

    const safe = computeSafeToSpend({
      accounts: [
        {
          id: 'acc-unionbank',
          name: 'Unionbank',
          accountType: 'BANK',
          icon: '🏦',
          color: '#1B4332',
          currency: 'PHP',
          balanceMinor: 1_000_000,
        },
      ],
      commitments: [openEndedLoan, settled],
      nextPaydayDate: '2026-11-30',
      currentDate: new Date(2026, 10, 10, 12, 0, 0, 0),
    });

    expect(safe.dueBeforeNextPaydayMinor).toBe(200_000);
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

    expect(advanceNextDueDate('2026-11-21', 'WEEKLY', 21)).toBe('2026-11-28');
    expect(advanceNextDueDate('2026-11-21', 'BIWEEKLY', 21)).toBe('2026-12-05');
    const febDate = advanceNextDueDate('2026-01-31', 'MONTHLY', 31);
    expect(febDate).toBe('2026-02-28');
    expect(advanceNextDueDate(febDate, 'MONTHLY', 31)).toBe('2026-03-31');
    expect(advanceNextDueDate('2026-11-15', 'QUARTERLY', 15)).toBe('2027-02-15');
    expect(advanceNextDueDate('2024-02-29', 'YEARLY', 29)).toBe('2025-02-28');
  });

  it('classifies commitment due statuses accurately', () => {
    const nov21 = new Date(2026, 10, 21, 12, 0, 0, 0);

    expect(
      getCommitmentDueStatus(
        { ...BASE_COMMITMENT, dueDay: 28, nextDueDate: '2026-11-18' },
        nov21,
      ).state,
    ).toBe('OVERDUE');

    expect(
      getCommitmentDueStatus(
        { ...BASE_COMMITMENT, dueDay: 15, nextDueDate: '2026-11-21' },
        nov21,
      ).state,
    ).toBe('DUE_TODAY');

    expect(
      getCommitmentDueStatus(
        { ...BASE_COMMITMENT, dueDay: 25, nextDueDate: '2026-12-25' },
        nov21,
      ).state,
    ).toBe('FUTURE_MONTH');

    expect(
      getCommitmentDueStatus(
        { ...BASE_COMMITMENT, lastPaidPeriod: '2026-11', nextDueDate: '2026-12-15' },
        nov21,
      ).state,
    ).toBe('PAID');

    const jan31 = new Date(2026, 0, 31, 12, 0, 0, 0);
    expect(getNextDueDatePreset('TODAY', 31, jan31)).toBe('2026-01-31');
    expect(getNextDueDatePreset('NEXT_WEEK', 31, jan31)).toBe('2026-02-07');
    expect(getNextDueDatePreset('NEXT_MONTH', 31, jan31)).toBe('2026-02-28');
  });
});
