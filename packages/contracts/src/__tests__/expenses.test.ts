import { describe, expect, it } from 'vitest';
import {
  computeExpenseSummary,
  computeRecordedExpenseTypeCounts,
  createDefaultTransactions,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  expenseMatchesCategory,
  filterExpenses,
  formatDateInputValue,
  isScheduledRecordedExpense,
  parseDateInputToIso,
  updateTransactionInputSchema,
  type Transaction,
} from '../index';

describe('Update Transaction Input Schema', () => {
  const validOccurredAt = '2026-11-15T10:30:00.000Z';

  it('validates a valid single-category expense update', () => {
    const parsed = updateTransactionInputSchema.safeParse({
      id: 'tx-123',
      type: 'EXPENSE',
      amountMinor: 15000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-daily-living',
      merchant: 'Puregold',
      note: 'Restock',
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects update payload without id', () => {
    const parsed = updateTransactionInputSchema.safeParse({
      type: 'EXPENSE',
      amountMinor: 5000,
      accountId: 'account-bank',
      categoryId: 'cat-daily-living',
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('id'))).toBe(true);
    }
  });
});

describe('Date Input Helpers', () => {
  it('formats valid ISO strings to local YYYY-MM-DD and uses fallback on invalid input', () => {
    const sample = new Date(2026, 10, 5, 9, 15, 0);
    expect(formatDateInputValue(sample.toISOString())).toBe('2026-11-05');

    const fallback = new Date(2026, 0, 9, 12, 0, 0);
    expect(formatDateInputValue('not-a-date', fallback)).toBe('2026-01-09');
  });

  it('parses valid YYYY-MM-DD strings and preserves time-of-day when given', () => {
    const existing = new Date(2026, 9, 10, 14, 35, 22, 0).toISOString();
    const parsedIso = parseDateInputToIso('2026-11-20', existing);
    expect(parsedIso).not.toBeNull();

    const d = new Date(parsedIso!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(35);
    expect(d.getSeconds()).toBe(22);
  });

  it('rejects malformed or nonexistent calendar dates', () => {
    expect(parseDateInputToIso('2026-02-30')).toBeNull();
    expect(parseDateInputToIso('2026-02-29')).toBeNull();
    expect(parseDateInputToIso('2024-02-29')).not.toBeNull();
    expect(parseDateInputToIso('2026-13-01')).toBeNull();
    expect(parseDateInputToIso('')).toBeNull();
  });
});

describe('Expense Filtering & Summary Engine', () => {
  const fixedNow = new Date(2026, 10, 20, 12, 0, 0);
  const starterTxs = createDefaultTransactions(fixedNow);

  const oldExpense: Transaction = {
    id: 'tx-old-expense',
    type: 'EXPENSE',
    amountMinor: 25000,
    currency: DEFAULT_CURRENCY,
    accountId: 'account-bank',
    categoryId: 'cat-daily-living',
    merchant: 'Jollibee',
    note: 'Dinner last month',
    occurredAt: new Date(2026, 9, 10, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 9, 10, 18, 0, 0).toISOString(),
  };

  const allTxs = [...starterTxs, oldExpense];

  it('matches category in expenseMatchesCategory', () => {
    const coffeeTx = starterTxs.find((t) => t.id === 'tx-seed-4')!;
    expect(expenseMatchesCategory(coffeeTx, 'cat-daily-living')).toBe(true);
    expect(expenseMatchesCategory(coffeeTx, 'cat-transportation')).toBe(false);
  });

  it('excludes INCOME and TRANSFER and filters by period, category, account, and search', () => {
    const thisMonth = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'THIS_MONTH',
      now: fixedNow,
    });
    expect(thisMonth.map((t) => t.id)).toEqual([
      'tx-seed-2',
      'tx-seed-3',
      'tx-seed-4',
      'tx-seed-5',
    ]);

    const dailyLiving = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'ALL_TIME',
      categoryId: 'cat-daily-living',
      now: fixedNow,
    });
    expect(dailyLiving.map((t) => t.id)).toEqual([
      'tx-seed-2',
      'tx-seed-4',
      'tx-old-expense',
    ]);

    expect(
      filterExpenses({
        transactions: allTxs,
        categories: DEFAULT_CATEGORIES,
        accounts: DEFAULT_ACCOUNTS,
        period: 'ALL_TIME',
        searchQuery: 'jollibee',
        now: fixedNow,
      }).map((t) => t.id),
    ).toEqual(['tx-old-expense']);
  });

  it('computes accurate summary metrics for empty and populated expense lists', () => {
    expect(
      computeExpenseSummary({ expenses: [], categories: DEFAULT_CATEGORIES }),
    ).toEqual({
      totalMinor: 0,
      expenseCount: 0,
      averageMinor: 0,
      topCategory: null,
      categoryCounts: {},
    });

    const summary = computeExpenseSummary({
      expenses: starterTxs,
      categories: DEFAULT_CATEGORIES,
    });
    expect(summary.totalMinor).toBe(61195);
    expect(summary.expenseCount).toBe(4);
    expect(summary.topCategory?.categoryId).toBe('cat-transportation');
  });

  it('classifies and filters recorded expenses by One-Time vs Scheduled via commitmentId', () => {
    const loanExpense: Transaction = {
      id: 'tx-loan-payment',
      type: 'EXPENSE',
      amountMinor: 50000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-loans',
      commitmentId: 'loan-auto-1',
      merchant: 'Auto Loan',
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };

    const mixedTxs = [...starterTxs, loanExpense];
    const coffeeTx = starterTxs.find((t) => t.id === 'tx-seed-4')!;

    expect(isScheduledRecordedExpense(coffeeTx)).toBe(false);
    expect(isScheduledRecordedExpense(loanExpense)).toBe(true);

    expect(computeRecordedExpenseTypeCounts(mixedTxs)).toEqual({
      ALL: 5,
      ONE_TIME: 4,
      SCHEDULED: 1,
    });

    expect(
      filterExpenses({
        transactions: mixedTxs,
        categories: DEFAULT_CATEGORIES,
        accounts: DEFAULT_ACCOUNTS,
        period: 'THIS_MONTH',
        expenseType: 'SCHEDULED',
        now: fixedNow,
      }).map((t) => t.id),
    ).toEqual(['tx-loan-payment']);
  });
});
