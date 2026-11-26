import { describe, expect, it } from 'vitest';
import { summarizeMonthlyPayables } from '../dashboard';
import { recurringCommitmentSchema, type RecurringCommitment } from '../recurring.schema';

// Nov 15, 2026 local noon
const NOW = new Date(2026, 10, 15, 12, 0, 0, 0);

function commitment(overrides: Partial<RecurringCommitment> & { id: string }): RecurringCommitment {
  return recurringCommitmentSchema.parse({
    name: overrides.id,
    amountMinor: 10_000,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    dueDay: 20,
    ...overrides,
  });
}

describe('summarizeMonthlyPayables', () => {
  it('returns zeros for no commitments', () => {
    const summary = summarizeMonthlyPayables([], NOW);
    expect(summary).toMatchObject({
      period: '2026-11',
      remainingMinor: 0,
      remainingCount: 0,
      overdueMinor: 0,
      paidMinor: 0,
      totalDueMinor: 0,
      paidPercent: 0,
      remainingItems: [],
    });
  });

  it('sums unpaid upcoming and overdue items, and counts paid this month separately', () => {
    const summary = summarizeMonthlyPayables(
      [
        commitment({ id: 'upcoming', amountMinor: 50_000, dueDay: 25 }),
        commitment({ id: 'overdue', amountMinor: 20_000, dueDay: 5 }),
        commitment({ id: 'today', amountMinor: 5_000, dueDay: 15 }),
        commitment({ id: 'paid', amountMinor: 25_000, dueDay: 1, lastPaidPeriod: '2026-11' }),
      ],
      NOW,
    );

    expect(summary.remainingMinor).toBe(75_000);
    expect(summary.remainingCount).toBe(3);
    expect(summary.overdueMinor).toBe(20_000);
    expect(summary.overdueCount).toBe(1);
    expect(summary.paidMinor).toBe(25_000);
    expect(summary.paidCount).toBe(1);
    expect(summary.totalDueMinor).toBe(100_000);
    expect(summary.paidPercent).toBe(25);
  });

  it('sorts overdue first, then by due date', () => {
    const summary = summarizeMonthlyPayables(
      [
        commitment({ id: 'late-month', dueDay: 28 }),
        commitment({ id: 'mid-month', dueDay: 18 }),
        commitment({ id: 'overdue', dueDay: 3 }),
      ],
      NOW,
    );

    expect(summary.remainingItems.map((i) => i.commitment.id)).toEqual([
      'overdue',
      'mid-month',
      'late-month',
    ]);
    expect(summary.remainingItems.map((i) => i.dueDate)).toEqual([
      '2026-11-03',
      '2026-11-18',
      '2026-11-28',
    ]);
    expect(summary.remainingItems[0]?.state).toBe('OVERDUE');
  });

  it('excludes inactive, paid-off, and next-month commitments', () => {
    const summary = summarizeMonthlyPayables(
      [
        commitment({ id: 'inactive', isActive: false }),
        commitment({ id: 'paid-off', totalInstallments: 6, paidInstallments: 6 }),
        commitment({ id: 'next-month', nextDueDate: '2026-12-20' }),
      ],
      NOW,
    );

    expect(summary.remainingMinor).toBe(0);
    expect(summary.remainingItems).toHaveLength(0);
  });

  it('counts the final installment paid this month as paid', () => {
    const summary = summarizeMonthlyPayables(
      [
        commitment({
          id: 'final-term',
          amountMinor: 30_000,
          totalInstallments: 3,
          paidInstallments: 3,
          lastPaidPeriod: '2026-11',
        }),
      ],
      NOW,
    );

    expect(summary.paidMinor).toBe(30_000);
    expect(summary.remainingMinor).toBe(0);
    expect(summary.paidPercent).toBe(100);
  });

  it('uses an explicit nextDueDate within the month and treats past ones as overdue', () => {
    const summary = summarizeMonthlyPayables(
      [
        commitment({ id: 'explicit', nextDueDate: '2026-11-22', dueDay: 1 }),
        commitment({ id: 'carried-over', nextDueDate: '2026-10-30', amountMinor: 7_500 }),
      ],
      NOW,
    );

    expect(summary.remainingItems.map((i) => [i.commitment.id, i.dueDate, i.state])).toEqual([
      ['carried-over', '2026-10-30', 'OVERDUE'],
      ['explicit', '2026-11-22', 'UPCOMING_THIS_MONTH'],
    ]);
    expect(summary.overdueMinor).toBe(7_500);
  });

  it('clamps dueDay to the last day of short months', () => {
    const feb = new Date(2027, 1, 10, 12, 0, 0, 0);
    const summary = summarizeMonthlyPayables([commitment({ id: 'eom', dueDay: 31 })], feb);
    expect(summary.remainingItems[0]?.dueDate).toBe('2027-02-28');
  });
});
