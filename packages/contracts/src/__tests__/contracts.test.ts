import { describe, expect, it } from 'vitest';
import {
  applyCalculatorKey,
  authResponseSchema,
  batchCreateTransactionsInputSchema,
  computeDashboardMetrics,
  computeSplitRemainder,
  createDefaultTransactions,
  createTransactionInputSchema,
  createWalletInputSchema,
  currencyCodeSchema,
  DEFAULT_CATEGORIES,
  DEFAULT_TRANSACTIONS,
  DEFAULT_WALLETS,
  evaluateCalculatorExpression,
  formatMinorUnits,
  importBackupInputSchema,
  isTransactionInPeriod,
  isWalletLiquidForSafeToSpend,
  loginInputSchema,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  rankCategoriesByFrequency,
  rebalanceTwoWaySplit,
  registerInputSchema,
  settleRecurringCommitmentInputSchema,
  splitEvenly,
  smartDefaultsSchema,
  transactionSchema,
  updateMonthlyBudgetInputSchema,
  updateWalletInputSchema,
  walletSchema,
  type Category,
  type Transaction,
  type Wallet,
} from '../index';

describe('Money Math & Helpers', () => {
  it('formats minor units accurately to localized currency', () => {
    expect(formatMinorUnits(1250)).toBe('₱12.50');
    expect(formatMinorUnits(-400)).toBe('-₱4.00');
    expect(formatMinorUnits(0)).toBe('₱0.00');
    expect(formatMinorUnits(100000)).toBe('₱1,000.00');
    expect(formatMinorUnits(5)).toBe('₱0.05');
  });

  it('converts minor units to clean decimal input string', () => {
    expect(minorUnitsToDecimalInput(12000)).toBe('120');
    expect(minorUnitsToDecimalInput(1250)).toBe('12.5');
    expect(minorUnitsToDecimalInput(1205)).toBe('12.05');
    expect(minorUnitsToDecimalInput(0)).toBe('0');
    expect(minorUnitsToDecimalInput(-400)).toBe('-4');
    expect(minorUnitsToDecimalInput(-1250)).toBe('-12.5');
  });

  it('parses decimal string into integer minor units with zero float drift', () => {
    expect(parseDecimalToMinorUnits('12')).toBe(1200);
    expect(parseDecimalToMinorUnits('12.5')).toBe(1250);
    expect(parseDecimalToMinorUnits('12.55')).toBe(1255);
    expect(parseDecimalToMinorUnits('')).toBe(0);
    expect(parseDecimalToMinorUnits('.')).toBe(0);
    expect(parseDecimalToMinorUnits('.5')).toBe(50);
    expect(parseDecimalToMinorUnits('.05')).toBe(5);
    expect(parseDecimalToMinorUnits('-12.5')).toBe(-1250);

    // Invalid inputs
    expect(parseDecimalToMinorUnits('12.555')).toBeNull(); // exceeds 2 decimals
    expect(parseDecimalToMinorUnits('abc')).toBeNull();
    expect(parseDecimalToMinorUnits('1.2.3')).toBeNull();
  });

  it('computes split remainder and rebalances two-way splits', () => {
    expect(computeSplitRemainder(1000, [400, 350])).toBe(250);
    expect(computeSplitRemainder(500, [500])).toBe(0);
    expect(computeSplitRemainder(500, [600])).toBe(-100);

    expect(rebalanceTwoWaySplit(1000, 600)).toEqual([600, 400]);
    expect(rebalanceTwoWaySplit(500, 700)).toEqual([700, 0]);

    // Split evenly divides without losing odd cents
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitEvenly(1000, 2)).toEqual([500, 500]);
    expect(splitEvenly(1001, 3)).toEqual([335, 333, 333]);
    expect(splitEvenly(1001, 3).reduce((a, b) => a + b, 0)).toBe(1001);
    expect(splitEvenly(10, 4)).toEqual([4, 2, 2, 2]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    expect(splitEvenly(500, 0)).toEqual([]);
  });
});

describe('Calculator Engine', () => {
  it('evaluates basic expressions and handles operator precedence (10 + 5 × 2 = 20)', () => {
    const res = evaluateCalculatorExpression('10 + 5 × 2');
    expect(res.isValid).toBe(true);
    expect(res.hasOperator).toBe(true);
    expect(res.endsWithOperator).toBe(false);
    expect(res.previewMinor).toBe(2000); // $20.00
    expect(res.error).toBeNull();
  });

  it('normalizes * to × and / to ÷', () => {
    const res = evaluateCalculatorExpression('10 + 5 * 2');
    expect(res.isValid).toBe(true);
    expect(res.previewMinor).toBe(2000);
  });

  it('handles division rounding (100 ÷ 3 = 33.33)', () => {
    const res = evaluateCalculatorExpression('100 ÷ 3');
    expect(res.isValid).toBe(true);
    expect(res.previewMinor).toBe(3333); // $33.33
    expect(res.error).toBeNull();
  });

  it('supports trailing operator live preview smoothly (12.5 + -> 1250)', () => {
    const res = evaluateCalculatorExpression('12.5 +');
    expect(res.endsWithOperator).toBe(true);
    expect(res.hasOperator).toBe(true);
    expect(res.isValid).toBe(false);
    expect(res.previewMinor).toBe(1250);
    expect(res.error).toBeNull();
  });

  it('detects division by zero error', () => {
    const res = evaluateCalculatorExpression('10 ÷ 0');
    expect(res.isValid).toBe(false);
    expect(res.previewMinor).toBe(0);
    expect(res.error).toBe('DIVIDE_BY_ZERO');
  });

  it('detects non-positive evaluation results', () => {
    const zeroRes = evaluateCalculatorExpression('10 - 10');
    expect(zeroRes.isValid).toBe(false);
    expect(zeroRes.error).toBe('NON_POSITIVE');

    const negRes = evaluateCalculatorExpression('5 - 15');
    expect(negRes.isValid).toBe(false);
    expect(negRes.error).toBe('NON_POSITIVE');
  });

  it('detects invalid syntax', () => {
    const res = evaluateCalculatorExpression('10 + + 5');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('INVALID_SYNTAX');
  });

  it('applies calculator keys correctly: typing, decimals, operators, backspace, clear, =', () => {
    let expr = '0';

    // Type 12.50
    expr = applyCalculatorKey(expr, '1');
    expect(expr).toBe('1');
    expr = applyCalculatorKey(expr, '2');
    expect(expr).toBe('12');
    expr = applyCalculatorKey(expr, '.');
    expect(expr).toBe('12.');
    expr = applyCalculatorKey(expr, '5');
    expect(expr).toBe('12.5');
    expr = applyCalculatorKey(expr, '0');
    expect(expr).toBe('12.50');

    // Attempting 3rd decimal is prevented
    expr = applyCalculatorKey(expr, '9');
    expect(expr).toBe('12.50');

    // Add operator +
    expr = applyCalculatorKey(expr, '+');
    expect(expr).toBe('12.50 +');

    // Replace trailing operator with ×
    expr = applyCalculatorKey(expr, '×');
    expect(expr).toBe('12.50 ×');

    // Press . after operator inserts 0.
    expr = applyCalculatorKey(expr, '.');
    expect(expr).toBe('12.50 × 0.');

    // Press 5 -> 12.50 × 0.5
    expr = applyCalculatorKey(expr, '5');
    expect(expr).toBe('12.50 × 0.5');

    // Press = collapses expression to 6.25 ($12.50 * 0.5 = $6.25)
    expr = applyCalculatorKey(expr, '=');
    expect(expr).toBe('6.25');

    // Backspace
    expr = applyCalculatorKey(expr, 'BACKSPACE');
    expect(expr).toBe('6.2');

    // Clear
    expr = applyCalculatorKey(expr, 'CLEAR');
    expect(expr).toBe('0');
  });

  it('collapses trailing operator on = if preview is positive', () => {
    const collapsed = applyCalculatorKey('12.5 +', '=');
    expect(collapsed).toBe('12.5');
  });
});

describe('Transaction Validation Schemas', () => {
  const validOccurredAt = new Date().toISOString();

  it('validates a correct EXPENSE transaction', () => {
    const input = {
      type: 'EXPENSE',
      amountMinor: 4500,
      walletId: 'wallet-checking',
      categoryId: 'cat-groceries',
      occurredAt: validOccurredAt,
      merchant: 'Trader Joe’s',
      tags: ['groceries', 'food'],
      note: 'Weekly essentials',
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('validates a correct INCOME transaction', () => {
    const input = {
      type: 'INCOME',
      amountMinor: 250000,
      walletId: 'wallet-checking',
      categoryId: 'cat-salary',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('validates a correct split EXPENSE when splits sum to total', () => {
    const input = {
      type: 'EXPENSE',
      amountMinor: 10000,
      walletId: 'wallet-card',
      splits: [
        { id: 'split-1', categoryId: 'cat-groceries', amountMinor: 6000 },
        { id: 'split-2', categoryId: 'cat-household', amountMinor: 4000 },
      ],
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('rejects split transaction when splits do not equal total amount', () => {
    const input = {
      type: 'EXPENSE',
      amountMinor: 10000,
      walletId: 'wallet-card',
      splits: [
        { id: 'split-1', categoryId: 'cat-groceries', amountMinor: 6000 },
        { id: 'split-2', categoryId: 'cat-household', amountMinor: 3000 },
      ],
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('splits'))).toBe(true);
    }
  });

  it('rejects EXPENSE transaction when neither category nor splits are provided', () => {
    const input = {
      type: 'EXPENSE',
      amountMinor: 5000,
      walletId: 'wallet-checking',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('categoryId'))).toBe(true);
    }
  });

  it('validates a correct TRANSFER transaction', () => {
    const input = {
      type: 'TRANSFER',
      amountMinor: 50000,
      walletId: 'wallet-checking',
      toWalletId: 'wallet-savings',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('rejects TRANSFER with same source and destination wallet', () => {
    const input = {
      type: 'TRANSFER',
      amountMinor: 50000,
      walletId: 'wallet-checking',
      toWalletId: 'wallet-checking',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('toWalletId'))).toBe(true);
    }
  });

  it('rejects TRANSFER with splits or category', () => {
    const inputWithCategory = {
      type: 'TRANSFER',
      amountMinor: 50000,
      walletId: 'wallet-checking',
      toWalletId: 'wallet-savings',
      categoryId: 'cat-groceries',
      occurredAt: validOccurredAt,
    };

    const parsedCategory = createTransactionInputSchema.safeParse(inputWithCategory);
    expect(parsedCategory.success).toBe(false);

    const inputWithSplits = {
      type: 'TRANSFER',
      amountMinor: 50000,
      walletId: 'wallet-checking',
      toWalletId: 'wallet-savings',
      splits: [
        { id: 's1', categoryId: 'cat-groceries', amountMinor: 25000 },
        { id: 's2', categoryId: 'cat-dining', amountMinor: 25000 },
      ],
      occurredAt: validOccurredAt,
    };

    const parsedSplits = createTransactionInputSchema.safeParse(inputWithSplits);
    expect(parsedSplits.success).toBe(false);
  });
});

describe('Category Ranking & Defaults', () => {
  it('ranks categories by frequency descending, then defaultOrder ascending', () => {
    const sampleCategories: Category[] = [
      {
        id: 'c1',
        name: 'Groceries',
        type: 'EXPENSE',
        icon: '🛒',
        color: '#10B981',
        usageCount: 5,
        defaultOrder: 0,
        isCustom: false,
      },
      {
        id: 'c2',
        name: 'Dining',
        type: 'EXPENSE',
        icon: '🍽️',
        color: '#F97316',
        usageCount: 12,
        defaultOrder: 1,
        isCustom: false,
      },
      {
        id: 'c3',
        name: 'Coffee',
        type: 'EXPENSE',
        icon: '☕',
        color: '#A855F7',
        usageCount: 5,
        defaultOrder: 2,
        isCustom: false,
      },
      {
        id: 'c4',
        name: 'Salary',
        type: 'INCOME',
        icon: '💰',
        color: '#10B981',
        usageCount: 20,
        defaultOrder: 0,
        isCustom: false,
      },
    ];

    const ranked = rankCategoriesByFrequency(sampleCategories, 'EXPENSE');
    expect(ranked.map((c) => c.id)).toEqual(['c2', 'c1', 'c3']);
  });

  it('exposes valid default wallets and categories', () => {
    expect(DEFAULT_WALLETS.length).toBe(4);
    expect(DEFAULT_CATEGORIES.length).toBe(21);
    expect(DEFAULT_CATEGORIES.filter((c) => c.type === 'EXPENSE').length).toBe(13);
    expect(DEFAULT_CATEGORIES.filter((c) => c.type === 'INCOME').length).toBe(8);
  });

  it('classifies wallet Safe-to-Spend liquidity accurately with optional override', () => {
    const base = {
      name: 'W',
      icon: '🏦',
      color: '#208AEF',
      currency: 'PHP',
      balanceMinor: 10000,
    };
    const checking: Wallet = { id: 'w1', type: 'CHECKING', ...base };
    const cash: Wallet = { id: 'w2', type: 'CASH', ...base };
    const ewallet: Wallet = { id: 'w3', type: 'EWALLET', ...base };
    const savings: Wallet = { id: 'w4', type: 'SAVINGS', ...base };
    const card: Wallet = { id: 'w5', type: 'CREDIT_CARD', ...base };
    const savingsIncluded: Wallet = {
      id: 'w6',
      type: 'SAVINGS',
      includeInSafeToSpend: true,
      ...base,
    };
    const checkingExcluded: Wallet = {
      id: 'w7',
      type: 'CHECKING',
      includeInSafeToSpend: false,
      ...base,
    };

    expect(isWalletLiquidForSafeToSpend(checking)).toBe(true);
    expect(isWalletLiquidForSafeToSpend(cash)).toBe(true);
    expect(isWalletLiquidForSafeToSpend(ewallet)).toBe(true);
    expect(isWalletLiquidForSafeToSpend(savings)).toBe(false);
    expect(isWalletLiquidForSafeToSpend(card)).toBe(false);
    expect(isWalletLiquidForSafeToSpend(savingsIncluded)).toBe(true);
    expect(isWalletLiquidForSafeToSpend(checkingExcluded)).toBe(false);
  });
});

describe('Dashboard Starter Seeds & Period Filtering', () => {
  const fixedNow = new Date('2026-10-31T12:00:00Z');

  it('validates smart defaults schema including default monthly budget of ₱30,000.00', () => {
    const parsed = smartDefaultsSchema.parse({
      lastWalletId: 'wallet-checking',
    });
    expect(parsed.monthlyBudgetMinor).toBe(3000000);
    expect(parsed.recentMerchants).toEqual([]);
    expect(parsed.knownTags).toEqual([]);
  });

  it('exposes exactly 6 schema-valid default starter transactions', () => {
    expect(DEFAULT_TRANSACTIONS.length).toBe(6);

    for (const tx of DEFAULT_TRANSACTIONS) {
      expect(() => transactionSchema.parse(tx)).not.toThrow();
    }

    const types = DEFAULT_TRANSACTIONS.map((tx) => tx.type);
    expect(types.filter((t) => t === 'INCOME').length).toBe(1);
    expect(types.filter((t) => t === 'EXPENSE').length).toBe(4);
    expect(types.filter((t) => t === 'TRANSFER').length).toBe(1);
  });

  it('correctly filters transactions by period', () => {
    const now = fixedNow;
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const previousMonth = new Date('2026-09-15T12:00:00Z').toISOString();

    // ALL_TIME
    expect(isTransactionInPeriod(oneHourAgo, 'ALL_TIME', now)).toBe(true);
    expect(isTransactionInPeriod(previousMonth, 'ALL_TIME', now)).toBe(true);

    // THIS_MONTH
    expect(isTransactionInPeriod(oneHourAgo, 'THIS_MONTH', now)).toBe(true);
    expect(isTransactionInPeriod(previousMonth, 'THIS_MONTH', now)).toBe(false);

    // LAST_7_DAYS
    expect(isTransactionInPeriod(oneHourAgo, 'LAST_7_DAYS', now)).toBe(true);
    expect(isTransactionInPeriod(sixDaysAgo, 'LAST_7_DAYS', now)).toBe(true);
    expect(isTransactionInPeriod(tenDaysAgo, 'LAST_7_DAYS', now)).toBe(false);

    // Invalid string
    expect(isTransactionInPeriod('invalid-date', 'LAST_7_DAYS', now)).toBe(false);
  });
});

describe('Dashboard Aggregation Engine (computeDashboardMetrics)', () => {
  const fixedNow = new Date('2026-10-31T12:00:00Z');
  const starterTransactions = createDefaultTransactions(fixedNow);

  it('computes accurate high-level net worth and cashflow metrics', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 3000000,
      now: fixedNow,
    });

    // Net worth = 4500000 (checking) + 0 (card) + 350000 (cash) + 12000000 (savings) = 16850000
    expect(metrics.netWorthMinor).toBe(16850000);

    // Income = Salary (5500000)
    expect(metrics.incomeMinor).toBe(5500000);

    // Expense = SM Supermarket (450000) + PAL (850000) + Starbucks (18000) + Meralco (450000) = 1768000
    expect(metrics.expenseMinor).toBe(1768000);

    // Net Cashflow = 5500000 - 1768000 = 3732000
    expect(metrics.netCashflowMinor).toBe(3732000);

    // Savings Rate = Math.round((3732000 * 100) / 5500000) = 68%
    expect(metrics.savingsRatePercent).toBe(68);

    // Transfer Volume = Savings Transfer (1000000)
    expect(metrics.transferVolumeMinor).toBe(1000000);

    // Transaction Count
    expect(metrics.transactionCount).toBe(6);

    // Recent Transactions: Top 5 sorted descending by occurredAt
    expect(metrics.recentTransactions.length).toBe(5);
    expect(metrics.recentTransactions[0].merchant).toBe('Acme Corp Payroll');
    expect(metrics.recentTransactions[1].merchant).toBe('SM Supermarket');
    expect(metrics.recentTransactions[2].merchant).toBe('Philippine Airlines');
    expect(metrics.recentTransactions[3].merchant).toBe('Starbucks');
    expect(metrics.recentTransactions[4].merchant).toBe('Meralco');
  });

  it('computes split-aware category breakdown accurately', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 3000000,
      now: fixedNow,
    });

    const categoryBreakdown = metrics.categoryBreakdown;

    // Expected categories:
    // Travel (850000), Bills (450000), Groceries (320000 split), Household (130000 split), Coffee (18000)
    expect(categoryBreakdown.length).toBe(5);

    // Top item: Travel
    expect(categoryBreakdown[0].categoryId).toBe('cat-travel');
    expect(categoryBreakdown[0].name).toBe('Travel');
    expect(categoryBreakdown[0].amountMinor).toBe(850000);
    expect(categoryBreakdown[0].percentage).toBe(48); // 850000 / 1768000 = 48.08%

    // Second: Bills & Utilities
    expect(categoryBreakdown[1].categoryId).toBe('cat-bills');
    expect(categoryBreakdown[1].name).toBe('Bills & Utilities');
    expect(categoryBreakdown[1].amountMinor).toBe(450000);
    expect(categoryBreakdown[1].percentage).toBe(25);

    // Third: Groceries (from split!)
    expect(categoryBreakdown[2].categoryId).toBe('cat-groceries');
    expect(categoryBreakdown[2].name).toBe('Groceries');
    expect(categoryBreakdown[2].amountMinor).toBe(320000);
    expect(categoryBreakdown[2].percentage).toBe(18);

    // Fourth: Household (from split!)
    expect(categoryBreakdown[3].categoryId).toBe('cat-household');
    expect(categoryBreakdown[3].name).toBe('Household');
    expect(categoryBreakdown[3].amountMinor).toBe(130000);
    expect(categoryBreakdown[3].percentage).toBe(7);

    // Fifth: Coffee
    expect(categoryBreakdown[4].categoryId).toBe('cat-coffee');
    expect(categoryBreakdown[4].name).toBe('Coffee & Drinks');
    expect(categoryBreakdown[4].amountMinor).toBe(18000);
    expect(categoryBreakdown[4].percentage).toBe(1);

    // Total of splits + non-splits equals total expense
    const totalCategorySpend = categoryBreakdown.reduce((sum, item) => sum + item.amountMinor, 0);
    expect(totalCategorySpend).toBe(metrics.expenseMinor);
  });

  it('computes tag breakdown for expense transactions', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 3000000,
      now: fixedNow,
    });

    const tagBreakdown = metrics.tagBreakdown;

    // PAL (850000): ['vacation', 'reimbursable']
    // SM Supermarket (450000): ['shared']
    // Meralco (450000): ['recurring', 'shared']
    // Starbucks (18000): ['work']
    // Note: Savings transfer 'recurring' and Salary 'work' do not count as they are not EXPENSE
    const tagMap = new Map(tagBreakdown.map((t) => [t.tag, t]));

    expect(tagMap.get('vacation')).toEqual({
      tag: 'vacation',
      amountMinor: 850000,
      transactionCount: 1,
    });
    expect(tagMap.get('reimbursable')).toEqual({
      tag: 'reimbursable',
      amountMinor: 850000,
      transactionCount: 1,
    });
    expect(tagMap.get('shared')).toEqual({
      tag: 'shared',
      amountMinor: 900000, // 450000 + 450000
      transactionCount: 2,
    });
    expect(tagMap.get('recurring')).toEqual({
      tag: 'recurring',
      amountMinor: 450000,
      transactionCount: 1,
    });
    expect(tagMap.get('work')).toEqual({
      tag: 'work',
      amountMinor: 18000,
      transactionCount: 1,
    });
  });

  it('computes budget utilization and over-budget state', () => {
    // Normal budget scenario (₱30,000 budget, ₱17,680 spent)
    const normal = computeDashboardMetrics({
      transactions: starterTransactions,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 3000000,
      now: fixedNow,
    });

    expect(normal.budget.budgetMinor).toBe(3000000);
    expect(normal.budget.spentMinor).toBe(1768000);
    expect(normal.budget.remainingMinor).toBe(1232000);
    expect(normal.budget.utilizationPercent).toBe(59);
    expect(normal.budget.isOverBudget).toBe(false);

    // Over budget scenario (₱10,000 budget, ₱17,680 spent)
    const overBudget = computeDashboardMetrics({
      transactions: starterTransactions,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 1000000,
      now: fixedNow,
    });

    expect(overBudget.budget.budgetMinor).toBe(1000000);
    expect(overBudget.budget.spentMinor).toBe(1768000);
    expect(overBudget.budget.remainingMinor).toBe(-768000);
    expect(overBudget.budget.utilizationPercent).toBe(177);
    expect(overBudget.budget.isOverBudget).toBe(true);
  });

  it('supports MONTH period selection, split-aware incomeCategoryBreakdown, savingsRatePercent, and 6-month trend', () => {
    const txs: Transaction[] = [
      {
        id: 'tx-sep-inc',
        type: 'INCOME',
        amountMinor: 100000,
        currency: 'PHP',
        walletId: 'wallet-checking',
        splits: [
          { id: 'si-1', categoryId: 'cat-salary', amountMinor: 70000 },
          { id: 'si-2', categoryId: 'cat-freelance', amountMinor: 30000 },
        ],
        tags: [],
        occurredAt: '2026-09-15T12:00:00.000Z',
        createdAt: '2026-09-15T12:00:00.000Z',
      },
      {
        id: 'tx-sep-exp',
        type: 'EXPENSE',
        amountMinor: 120000,
        currency: 'PHP',
        walletId: 'wallet-checking',
        categoryId: 'cat-groceries',
        tags: [],
        occurredAt: '2026-09-20T12:00:00.000Z',
        createdAt: '2026-09-20T12:00:00.000Z',
      },
      {
        id: 'tx-aug-exp',
        type: 'EXPENSE',
        amountMinor: 50000,
        currency: 'PHP',
        walletId: 'wallet-checking',
        categoryId: 'cat-dining',
        tags: [],
        occurredAt: '2026-08-10T12:00:00.000Z',
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ];

    const sepMetrics = computeDashboardMetrics({
      transactions: txs,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'MONTH',
      selectedMonth: '2026-09',
      monthlyBudgetMinor: 300000,
      now: new Date('2026-11-15T12:00:00Z'),
    });

    expect(sepMetrics.selectedMonth).toBe('2026-09');
    expect(sepMetrics.incomeMinor).toBe(100000);
    expect(sepMetrics.expenseMinor).toBe(120000);
    expect(sepMetrics.netCashflowMinor).toBe(-20000);
    expect(sepMetrics.savingsRatePercent).toBe(-20);
    expect(sepMetrics.incomeCategoryBreakdown).toHaveLength(2);
    expect(sepMetrics.incomeCategoryBreakdown[0]).toMatchObject({
      categoryId: 'cat-salary',
      amountMinor: 70000,
      percentage: 70,
    });
    expect(sepMetrics.incomeCategoryBreakdown[1]).toMatchObject({
      categoryId: 'cat-freelance',
      amountMinor: 30000,
      percentage: 30,
    });
    expect(sepMetrics.monthlyTrend.map((p) => p.periodMonth)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(sepMetrics.monthlyTrend[4]).toMatchObject({
      periodMonth: '2026-08',
      incomeMinor: 0,
      expenseMinor: 50000,
      savingsRatePercent: null,
    });
    expect(sepMetrics.monthlyTrend[5]).toMatchObject({
      periodMonth: '2026-09',
      incomeMinor: 100000,
      expenseMinor: 120000,
      netCashflowMinor: -20000,
      savingsRatePercent: -20,
    });

    // ALL_TIME when current month has 0 expenses must NOT substitute all-time expense into monthly budget
    const allTimeWithEmptyNov = computeDashboardMetrics({
      transactions: txs,
      wallets: DEFAULT_WALLETS,
      categories: DEFAULT_CATEGORIES,
      period: 'ALL_TIME',
      monthlyBudgetMinor: 300000,
      now: new Date('2026-11-15T12:00:00Z'),
    });
    expect(allTimeWithEmptyNov.expenseMinor).toBe(170000);
    expect(allTimeWithEmptyNov.budget.spentMinor).toBe(0);
    expect(allTimeWithEmptyNov.budget.remainingMinor).toBe(300000);
  });
});

describe('Auth & API Contract Schemas', () => {
  it('validates registerInputSchema, loginInputSchema, and authResponseSchema', () => {
    const reg = registerInputSchema.parse({
      name: '  Jane Doe ',
      email: '  Jane@Example.COM ',
      password: 'password123',
    });
    expect(reg).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
    });

    expect(() =>
      registerInputSchema.parse({
        name: 'Jane',
        email: 'not-an-email',
        password: '123',
      }),
    ).toThrow();

    const login = loginInputSchema.parse({
      email: ' User@Example.com ',
      password: 'secret',
    });
    expect(login.email).toBe('user@example.com');

    const authRes = authResponseSchema.parse({
      token: 'tok-123',
      user: {
        id: 'usr-1',
        email: 'user@example.com',
        name: 'User',
      },
    });
    expect(authRes.user.id).toBe('usr-1');
  });

  it('validates API request contracts', () => {
    expect(
      updateMonthlyBudgetInputSchema.parse({ monthlyBudgetMinor: 3000000 })
        .monthlyBudgetMinor,
    ).toBe(3000000);

    expect(() =>
      updateMonthlyBudgetInputSchema.parse({ monthlyBudgetMinor: -100 }),
    ).toThrow();

    expect(
      settleRecurringCommitmentInputSchema.parse({
        periodMonth: '2026-11',
        recordTransaction: true,
      }),
    ).toEqual({ periodMonth: '2026-11', recordTransaction: true });

    const batch = batchCreateTransactionsInputSchema.parse({
      transactions: [
        {
          type: 'EXPENSE',
          amountMinor: 15000,
          walletId: 'wallet-checking',
          categoryId: 'cat-coffee',
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    expect(batch.transactions).toHaveLength(1);

    expect(() => batchCreateTransactionsInputSchema.parse({ transactions: [] })).toThrow();

    const backupReq = importBackupInputSchema.parse({
      mode: 'merge',
      envelope: {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          wallets: [],
          categories: [],
          transactions: [],
          categoryBudgets: [],
          recurringCommitments: [],
          sinkingFunds: [],
          quickPresets: [],
        },
      },
    });
    expect(backupReq.mode).toBe('merge');
  });

  it('enforces PHP-only currency and openingBalanceMinor ledger invariants', () => {
    expect(currencyCodeSchema.parse(undefined)).toBe('PHP');
    expect(currencyCodeSchema.parse(' php ')).toBe('PHP');
    expect(() => currencyCodeSchema.parse('USD')).toThrow();
    expect(() => currencyCodeSchema.parse('EUR')).toThrow();

    // Legacy wallets without openingBalanceMinor still parse cleanly
    const legacyWallet = walletSchema.parse({
      id: 'w-legacy',
      name: 'Legacy',
      type: 'CASH',
      icon: '💵',
      color: '#10B981',
      currency: 'PHP',
      balanceMinor: 50000,
    });
    expect(legacyWallet.openingBalanceMinor).toBeUndefined();

    const createdInput = createWalletInputSchema.parse({
      name: 'GCash',
      type: 'EWALLET',
      openingBalanceMinor: 125000,
    });
    expect(createdInput.currency).toBe('PHP');
    expect(createdInput.openingBalanceMinor).toBe(125000);

    const updatedInput = updateWalletInputSchema.parse({
      openingBalanceMinor: 200000,
      includeInSafeToSpend: null,
    });
    expect(updatedInput.openingBalanceMinor).toBe(200000);
    expect(updatedInput.includeInSafeToSpend).toBeNull();

    // Verify DEFAULT_WALLETS openingBalanceMinor + createDefaultTransactions() === balanceMinor
    const deltaByWallet = new Map<string, number>();
    for (const tx of createDefaultTransactions()) {
      if (tx.type === 'INCOME') {
        deltaByWallet.set(tx.walletId, (deltaByWallet.get(tx.walletId) ?? 0) + tx.amountMinor);
      } else if (tx.type === 'EXPENSE') {
        deltaByWallet.set(tx.walletId, (deltaByWallet.get(tx.walletId) ?? 0) - tx.amountMinor);
      } else if (tx.type === 'TRANSFER') {
        deltaByWallet.set(tx.walletId, (deltaByWallet.get(tx.walletId) ?? 0) - tx.amountMinor);
        if (tx.toWalletId) {
          deltaByWallet.set(
            tx.toWalletId,
            (deltaByWallet.get(tx.toWalletId) ?? 0) + tx.amountMinor,
          );
        }
      }
    }

    for (const wallet of DEFAULT_WALLETS) {
      expect(wallet.openingBalanceMinor).toBeDefined();
      const expected = (wallet.openingBalanceMinor ?? 0) + (deltaByWallet.get(wallet.id) ?? 0);
      expect(expected).toBe(wallet.balanceMinor);
    }
  });
});
