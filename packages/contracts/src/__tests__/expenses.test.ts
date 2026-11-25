import { describe, expect, it } from 'vitest';
import {
  classifyRecordedExpense,
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
      categoryId: 'cat-groceries',
      merchant: 'Puregold',
      tags: ['weekly'],
      note: 'Restock',
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(true);
  });

  it('validates a valid split expense update', () => {
    const parsed = updateTransactionInputSchema.safeParse({
      id: 'tx-split-123',
      type: 'EXPENSE',
      amountMinor: 10000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-card',
      splits: [
        { id: 's1', categoryId: 'cat-groceries', amountMinor: 6500 },
        { id: 's2', categoryId: 'cat-household', amountMinor: 3500 },
      ],
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects update payload without id', () => {
    const parsed = updateTransactionInputSchema.safeParse({
      type: 'EXPENSE',
      amountMinor: 5000,
      accountId: 'account-bank',
      categoryId: 'cat-coffee',
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('id'))).toBe(true);
    }
  });

  it('rejects split expense update when split sum mismatches amountMinor', () => {
    const parsed = updateTransactionInputSchema.safeParse({
      id: 'tx-split-bad',
      type: 'EXPENSE',
      amountMinor: 10000,
      accountId: 'account-card',
      splits: [
        { id: 's1', categoryId: 'cat-groceries', amountMinor: 6000 },
        { id: 's2', categoryId: 'cat-household', amountMinor: 2000 },
      ],
      occurredAt: validOccurredAt,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('splits'))).toBe(true);
    }
  });
});

describe('Date Input Helpers', () => {
  it('formats valid ISO strings to local YYYY-MM-DD and uses fallback on invalid input', () => {
    const sample = new Date(2026, 10, 5, 9, 15, 0); // Nov 5, 2026 local
    expect(formatDateInputValue(sample.toISOString())).toBe('2026-11-05');

    const fallback = new Date(2026, 0, 9, 12, 0, 0); // Jan 9, 2026 local
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

    const defaultTimeIso = parseDateInputToIso('2026-03-01');
    expect(defaultTimeIso).not.toBeNull();
    const dDefault = new Date(defaultTimeIso!);
    expect(dDefault.getHours()).toBe(12);
    expect(dDefault.getMinutes()).toBe(0);
  });

  it('rejects malformed or nonexistent calendar dates', () => {
    expect(parseDateInputToIso('2026-02-30')).toBeNull();
    expect(parseDateInputToIso('2026-02-29')).toBeNull(); // 2026 is not a leap year
    expect(parseDateInputToIso('2024-02-29')).not.toBeNull(); // 2024 is a leap year
    expect(parseDateInputToIso('2026-13-01')).toBeNull();
    expect(parseDateInputToIso('11/20/2026')).toBeNull();
    expect(parseDateInputToIso('')).toBeNull();
  });
});

describe('Expense Filtering & Summary Engine', () => {
  const fixedNow = new Date(2026, 10, 20, 12, 0, 0); // Nov 20, 2026 local
  const starterTxs = createDefaultTransactions(fixedNow);

  const oldExpense: Transaction = {
    id: 'tx-old-expense',
    type: 'EXPENSE',
    amountMinor: 25000,
    currency: DEFAULT_CURRENCY,
    accountId: 'account-bank',
    categoryId: 'cat-dining',
    merchant: 'Jollibee',
    tags: ['family'],
    note: 'Dinner last month',
    occurredAt: new Date(2026, 9, 10, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 9, 10, 18, 0, 0).toISOString(),
  };

  const allTxs = [...starterTxs, oldExpense];

  it('matches both single-category and split expenses in expenseMatchesCategory', () => {
    const splitTx = starterTxs.find((t) => t.id === 'tx-seed-2')!;
    const coffeeTx = starterTxs.find((t) => t.id === 'tx-seed-4')!;

    expect(expenseMatchesCategory(splitTx, 'cat-daily-living')).toBe(true);
    expect(expenseMatchesCategory(splitTx, 'cat-home')).toBe(true);
    expect(expenseMatchesCategory(splitTx, 'cat-dues')).toBe(false);

    expect(expenseMatchesCategory(coffeeTx, 'cat-daily-living')).toBe(true);
    expect(expenseMatchesCategory(coffeeTx, 'cat-transportation')).toBe(false);
  });

  it('excludes INCOME and TRANSFER and filters by period, category, account, and search', () => {
    // THIS_MONTH should include the 4 starter expenses and exclude salary, transfer, and October expense
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

    // LAST_7_DAYS includes starter expenses (all within 4 days) and excludes oldExpense
    const last7 = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'LAST_7_DAYS',
      now: fixedNow,
    });
    expect(last7.length).toBe(4);

    // ALL_TIME includes oldExpense sorted last
    const allTime = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'ALL_TIME',
      now: fixedNow,
    });
    expect(allTime.map((t) => t.id)).toEqual([
      'tx-seed-2',
      'tx-seed-3',
      'tx-seed-4',
      'tx-seed-5',
      'tx-old-expense',
    ]);

    // Category filter matches both single-category and split expenses
    const dailyLiving = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'ALL_TIME',
      categoryId: 'cat-daily-living',
      now: fixedNow,
    });
    expect(dailyLiving.map((t) => t.id)).toEqual(['tx-seed-2', 'tx-seed-4']);

    // Account filter
    const cashExpenses = filterExpenses({
      transactions: allTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'ALL_TIME',
      accountId: 'account-cash',
      now: fixedNow,
    });
    expect(cashExpenses.map((t) => t.id)).toEqual(['tx-seed-4']);

    // Search by merchant, tag, note, category name, account name
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

    expect(
      filterExpenses({
        transactions: allTxs,
        categories: DEFAULT_CATEGORIES,
        accounts: DEFAULT_ACCOUNTS,
        period: 'ALL_TIME',
        searchQuery: '#reimbursable',
        now: fixedNow,
      }).map((t) => t.id),
    ).toEqual(['tx-seed-3']);

    expect(
      filterExpenses({
        transactions: allTxs,
        categories: DEFAULT_CATEGORIES,
        accounts: DEFAULT_ACCOUNTS,
        period: 'ALL_TIME',
        searchQuery: 'cleaning supplies',
        now: fixedNow,
      }).map((t) => t.id),
    ).toEqual(['tx-seed-2']);

    expect(
      filterExpenses({
        transactions: allTxs,
        categories: DEFAULT_CATEGORIES,
        accounts: DEFAULT_ACCOUNTS,
        period: 'ALL_TIME',
        searchQuery: 'Credit Card',
        now: fixedNow,
      }).map((t) => t.id),
    ).toEqual(['tx-seed-2', 'tx-seed-3']);
  });

  it('computes accurate summary metrics for empty and populated expense lists', () => {
    const emptySummary = computeExpenseSummary({
      expenses: [],
      categories: DEFAULT_CATEGORIES,
    });
    expect(emptySummary).toEqual({
      totalMinor: 0,
      expenseCount: 0,
      averageMinor: 0,
      topCategory: null,
      categoryCounts: {},
    });

    const summary = computeExpenseSummary({
      expenses: starterTxs, // includes INCOME & TRANSFER, should ignore them defensively
      categories: DEFAULT_CATEGORIES,
    });

    // Starter expenses: 12000 + 34000 + 675 + 14520 = 61195
    expect(summary.totalMinor).toBe(61195);
    expect(summary.expenseCount).toBe(4);
    expect(summary.averageMinor).toBe(Math.round(61195 / 4));
    expect(summary.topCategory).toEqual({
      categoryId: 'cat-transportation',
      name: 'Transportation',
      icon: '🚕',
      color: '#3B82F6',
      amountMinor: 34000,
      percentage: 56,
      count: 1,
    });
    expect(summary.categoryCounts).toEqual({
      'cat-daily-living': 2,
      'cat-home': 1,
      'cat-transportation': 1,
      'cat-dues': 1,
    });
  });

  it('counts split rows sharing the same category once in categoryCounts', () => {
    const doubleSplitTx: Transaction = {
      id: 'tx-double-split',
      type: 'EXPENSE',
      amountMinor: 10000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-cash',
      splits: [
        { id: 's1', categoryId: 'cat-groceries', amountMinor: 7000 },
        { id: 's2', categoryId: 'cat-groceries', amountMinor: 3000 },
      ],
      tags: [],
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };

    const summary = computeExpenseSummary({
      expenses: [doubleSplitTx],
      categories: DEFAULT_CATEGORIES,
    });

    expect(summary.totalMinor).toBe(10000);
    expect(summary.expenseCount).toBe(1);
    expect(summary.categoryCounts['cat-groceries']).toBe(1);
    expect(summary.topCategory?.amountMinor).toBe(10000);
    expect(summary.topCategory?.count).toBe(1);
  });

  it('classifies, counts, and filters recorded expenses by One-Time vs Scheduled type', () => {
    const loanExpense: Transaction = {
      id: 'tx-loan-payment',
      type: 'EXPENSE',
      amountMinor: 50000,
      currency: DEFAULT_CURRENCY,
      accountId: 'account-bank',
      categoryId: 'cat-loans',
      merchant: 'Auto Loan',
      tags: ['Loan', 'Recurring'],
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };

    const mixedTxs = [...starterTxs, loanExpense];
    const coffeeTx = starterTxs.find((t) => t.id === 'tx-seed-4')!;
    const powerTx = starterTxs.find((t) => t.id === 'tx-seed-5')!;

    expect(classifyRecordedExpense(coffeeTx)).toBe('ONE_TIME');
    expect(classifyRecordedExpense(powerTx)).toBe('RECURRING');
    expect(classifyRecordedExpense(loanExpense)).toBe('LOAN');

    expect(isScheduledRecordedExpense(coffeeTx)).toBe(false);
    expect(isScheduledRecordedExpense(powerTx)).toBe(true);
    expect(isScheduledRecordedExpense(loanExpense)).toBe(true);

    // Starter transactions include 3 one-time expenses (tx-seed-2,3,4), 1 recurring (tx-seed-5),
    // plus 1 INCOME and 1 TRANSFER (both ignored), and loanExpense -> 3 ONE_TIME, 2 SCHEDULED.
    expect(computeRecordedExpenseTypeCounts(mixedTxs)).toEqual({
      ALL: 5,
      ONE_TIME: 3,
      SCHEDULED: 2,
    });

    const allFiltered = filterExpenses({
      transactions: mixedTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'THIS_MONTH',
      expenseType: 'ALL',
      now: fixedNow,
    });
    expect(allFiltered.length).toBe(5);

    const oneTimeOnly = filterExpenses({
      transactions: mixedTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'THIS_MONTH',
      expenseType: 'ONE_TIME',
      now: fixedNow,
    });
    expect(oneTimeOnly.map((t) => t.id)).toEqual([
      'tx-seed-2',
      'tx-seed-3',
      'tx-seed-4',
    ]);

    const scheduledOnly = filterExpenses({
      transactions: mixedTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'THIS_MONTH',
      expenseType: 'SCHEDULED',
      now: fixedNow,
    });
    expect(scheduledOnly.map((t) => t.id)).toEqual([
      'tx-loan-payment',
      'tx-seed-5',
    ]);

    // Combined with account filter
    const scheduledCardOnly = filterExpenses({
      transactions: mixedTxs,
      categories: DEFAULT_CATEGORIES,
      accounts: DEFAULT_ACCOUNTS,
      period: 'THIS_MONTH',
      expenseType: 'SCHEDULED',
      accountId: 'account-card',
      now: fixedNow,
    });
    expect(scheduledCardOnly).toEqual([]);
  });
});
