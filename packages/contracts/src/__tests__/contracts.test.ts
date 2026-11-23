import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TYPE_LABELS,
  accountSchema,
  accountTypeSchema,
  applyCalculatorKey,
  computeDashboardMetrics,
  computeSplitRemainder,
  createDefaultTransactions,
  createInitialSyncDataState,
  createTransactionInputSchema,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  DEFAULT_TRANSACTIONS,
  evaluateCalculatorExpression,
  formatMinorUnits,
  getAccountTypeLabel,
  isTransactionInPeriod,
  mapKeyboardKeyToCalculatorKey,
  minorUnitsToDecimalInput,
  normalizeLegacyAccountType,
  normalizeLegacyCategoryId,
  parseDecimalToMinorUnits,
  rankCategoriesByFrequency,
  rebalanceTwoWaySplit,
  splitEvenly,
  smartDefaultsSchema,
  transactionSchema,
  upsertAccountInputSchema,
  type Account,
  type Category,
} from '../index';

describe('Money Math & Helpers', () => {
  it('formats minor units accurately to localized default currency (PHP) and explicit currencies', () => {
    expect(DEFAULT_CURRENCY).toBe('PHP');
    expect(formatMinorUnits(1250)).toBe('₱12.50');
    expect(formatMinorUnits(-400)).toBe('-₱4.00');
    expect(formatMinorUnits(0)).toBe('₱0.00');
    expect(formatMinorUnits(100000)).toBe('₱1,000.00');
    expect(formatMinorUnits(5)).toBe('₱0.05');
    expect(formatMinorUnits(1250, 'USD')).toBe('$12.50');
    expect(formatMinorUnits(-400, 'USD')).toBe('-$4.00');
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

  it('maps physical keyboard keys cleanly to calculator actions', () => {
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      expect(mapKeyboardKeyToCalculatorKey(d)).toBe(d);
    }
    expect(mapKeyboardKeyToCalculatorKey('.')).toBe('.');
    expect(mapKeyboardKeyToCalculatorKey('+')).toBe('+');
    expect(mapKeyboardKeyToCalculatorKey('-')).toBe('-');
    expect(mapKeyboardKeyToCalculatorKey('*')).toBe('×');
    expect(mapKeyboardKeyToCalculatorKey('x')).toBe('×');
    expect(mapKeyboardKeyToCalculatorKey('/')).toBe('÷');
    expect(mapKeyboardKeyToCalculatorKey('=')).toBe('=');
    expect(mapKeyboardKeyToCalculatorKey('Backspace')).toBe('BACKSPACE');
    expect(mapKeyboardKeyToCalculatorKey('Delete')).toBe('CLEAR');
    expect(mapKeyboardKeyToCalculatorKey('Escape')).toBe('CLEAR');
    expect(mapKeyboardKeyToCalculatorKey('c')).toBe('CLEAR');
    expect(mapKeyboardKeyToCalculatorKey('a')).toBeNull();
    expect(mapKeyboardKeyToCalculatorKey('Shift')).toBeNull();
  });
});

describe('Transaction Validation Schemas', () => {
  const validOccurredAt = new Date().toISOString();

  it('validates a correct EXPENSE transaction', () => {
    const input = {
      type: 'EXPENSE',
      amountMinor: 4500,
      accountId: 'account-bank',
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
      accountId: 'account-bank',
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
      accountId: 'account-card',
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
      accountId: 'account-card',
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
      accountId: 'account-bank',
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
      accountId: 'account-bank',
      toAccountId: 'account-savings',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it('rejects TRANSFER with same source and destination account', () => {
    const input = {
      type: 'TRANSFER',
      amountMinor: 50000,
      accountId: 'account-bank',
      toAccountId: 'account-bank',
      occurredAt: validOccurredAt,
    };

    const parsed = createTransactionInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('toAccountId'))).toBe(true);
    }
  });

  it('rejects TRANSFER with splits or category', () => {
    const inputWithCategory = {
      type: 'TRANSFER',
      amountMinor: 50000,
      accountId: 'account-bank',
      toAccountId: 'account-savings',
      categoryId: 'cat-groceries',
      occurredAt: validOccurredAt,
    };

    const parsedCategory = createTransactionInputSchema.safeParse(inputWithCategory);
    expect(parsedCategory.success).toBe(false);

    const inputWithSplits = {
      type: 'TRANSFER',
      amountMinor: 50000,
      accountId: 'account-bank',
      toAccountId: 'account-savings',
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

  it('exposes valid default accounts and categories without Checking and with zero starter data', () => {
    expect(DEFAULT_ACCOUNTS.length).toBe(4);
    expect(DEFAULT_ACCOUNTS.every((a) => a.currency === 'PHP')).toBe(true);
    expect(DEFAULT_ACCOUNTS.every((a) => a.balanceMinor === 0)).toBe(true);
    expect(DEFAULT_ACCOUNTS.some((a) => a.name.toLowerCase() === 'checking')).toBe(false);
    expect(DEFAULT_ACCOUNTS.some((a) => a.id === 'wallet-checking')).toBe(false);

    const initialState = createInitialSyncDataState();
    expect(initialState.transactions).toEqual([]);
    expect(initialState.recurringCommitments).toEqual([]);
    expect(initialState.categoryBudgets).toEqual([]);
    expect(initialState.sinkingFunds).toEqual([]);
    expect(initialState.quickPresets).toEqual([]);
    expect(initialState.reconciliations).toEqual([]);
    expect(initialState.smartDefaults.recentMerchants).toEqual([]);
    expect(initialState.smartDefaults.knownTags).toEqual([]);
    expect(initialState.accounts.every((a) => a.balanceMinor === 0)).toBe(true);
    expect(initialState.categories.every((c) => c.usageCount === 0)).toBe(true);
    expect(DEFAULT_ACCOUNTS.map((a) => a.accountType)).toEqual([
      'BANK',
      'CREDIT_CARD',
      'CASH',
      'BANK',
    ]);
    expect(DEFAULT_CATEGORIES.length).toBe(16);
    const expenseDefaults = DEFAULT_CATEGORIES.filter((c) => c.type === 'EXPENSE');
    expect(expenseDefaults.length).toBe(8);
    expect(expenseDefaults.map((c) => c.name)).toEqual([
      'Home',
      'Daily Living',
      'Transportation',
      'Entertainment',
      'Health',
      'Loans',
      'Dues',
      'Subscription',
    ]);
    expect(DEFAULT_CATEGORIES.filter((c) => c.type === 'INCOME').length).toBe(8);

    expect(normalizeLegacyCategoryId('cat-household')).toBe('cat-home');
    expect(normalizeLegacyCategoryId('cat-groceries')).toBe('cat-daily-living');
    expect(normalizeLegacyCategoryId('cat-dining')).toBe('cat-daily-living');
    expect(normalizeLegacyCategoryId('cat-coffee')).toBe('cat-daily-living');
    expect(normalizeLegacyCategoryId('cat-transport')).toBe('cat-transportation');
    expect(normalizeLegacyCategoryId('cat-travel')).toBe('cat-transportation');
    expect(normalizeLegacyCategoryId('cat-debt')).toBe('cat-loans');
    expect(normalizeLegacyCategoryId('cat-bills')).toBe('cat-dues');
    expect(normalizeLegacyCategoryId('cat-subscriptions')).toBe('cat-subscription');
    expect(normalizeLegacyCategoryId('cat-custom-pets')).toBe('cat-custom-pets');
  });

  it('validates account types, legacy normalization, defaults, and upsertAccountInputSchema', () => {
    expect(accountTypeSchema.options).toEqual(['BANK', 'E_WALLET', 'CASH', 'CREDIT_CARD']);
    expect(ACCOUNT_TYPE_LABELS).toEqual({
      BANK: 'Bank',
      E_WALLET: 'E-Wallet',
      CASH: 'Cash',
      CREDIT_CARD: 'Credit Card',
    });
    expect(getAccountTypeLabel('BANK')).toBe('Bank');
    expect(getAccountTypeLabel('E_WALLET')).toBe('E-Wallet');
    expect(getAccountTypeLabel('CASH')).toBe('Cash');
    expect(getAccountTypeLabel('CREDIT_CARD')).toBe('Credit Card');

    expect(normalizeLegacyAccountType('DEBIT')).toBe('BANK');
    expect(normalizeLegacyAccountType('CREDIT')).toBe('CREDIT_CARD');
    expect(normalizeLegacyAccountType('E_WALLET')).toBe('E_WALLET');
    expect(normalizeLegacyAccountType('CASH')).toBe('CASH');

    const legacyAccount = accountSchema.parse({
      id: 'account-legacy',
      name: 'Legacy Bank',
      icon: '🏦',
      color: '#208AEF',
      currency: 'PHP',
      balanceMinor: 10000,
    });
    expect(legacyAccount.accountType).toBe('BANK');

    const gcashInput = upsertAccountInputSchema.parse({
      name: '  GCash  ',
      accountType: 'E_WALLET',
      icon: '📱',
    });
    expect(gcashInput.name).toBe('GCash');
    expect(gcashInput.accountType).toBe('E_WALLET');
    expect(gcashInput.currency).toBe('PHP');
    expect(gcashInput.balanceMinor).toBe(0);

    expect(() =>
      upsertAccountInputSchema.parse({
        name: '   ',
        accountType: 'BANK',
      }),
    ).toThrow();
  });
});

describe('Dashboard Starter Seeds & Period Filtering', () => {
  const fixedNow = new Date('2026-10-31T12:00:00Z');

  it('validates smart defaults schema including default monthly budget of $2,500.00', () => {
    const parsed = smartDefaultsSchema.parse({
      lastAccountId: 'account-bank',
    });
    expect(parsed.monthlyBudgetMinor).toBe(250000);
    expect(parsed.recentMerchants).toEqual([]);
    expect(parsed.knownTags).toEqual([]);
  });

  it('exposes exactly 6 schema-valid default starter transactions', () => {
    expect(DEFAULT_TRANSACTIONS.length).toBe(6);

    for (const tx of DEFAULT_TRANSACTIONS) {
      expect(() => transactionSchema.parse(tx)).not.toThrow();
      expect(tx.currency).toBe('PHP');
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
  const sampleAccounts: Account[] = [
    { ...DEFAULT_ACCOUNTS[0]!, balanceMinor: 245000 },
    { ...DEFAULT_ACCOUNTS[1]!, balanceMinor: 0 },
    { ...DEFAULT_ACCOUNTS[2]!, balanceMinor: 18000 },
    { ...DEFAULT_ACCOUNTS[3]!, balanceMinor: 850000 },
  ];

  it('computes accurate high-level net worth and cashflow metrics', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: sampleAccounts,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 250000,
      now: fixedNow,
    });

    // Net worth = 245000 (bank) + 0 (card) + 18000 (cash) + 850000 (savings) = 1113000
    expect(metrics.netWorthMinor).toBe(1113000);

    // Income = Salary (420000)
    expect(metrics.incomeMinor).toBe(420000);

    // Expense = Whole Foods (12000) + Delta (34000) + Starbucks (675) + City Power (14520) = 61195
    expect(metrics.expenseMinor).toBe(61195);

    // Net Cashflow = 420000 - 61195 = 358805
    expect(metrics.netCashflowMinor).toBe(358805);

    // Transfer Volume = Savings Transfer (50000)
    expect(metrics.transferVolumeMinor).toBe(50000);

    // Transaction Count
    expect(metrics.transactionCount).toBe(6);

    // Recent Transactions: Top 5 sorted descending by occurredAt
    expect(metrics.recentTransactions.length).toBe(5);
    expect(metrics.recentTransactions[0].merchant).toBe('Acme Corp Payroll');
    expect(metrics.recentTransactions[1].merchant).toBe('Whole Foods');
    expect(metrics.recentTransactions[2].merchant).toBe('Delta Airlines');
    expect(metrics.recentTransactions[3].merchant).toBe('Starbucks');
    expect(metrics.recentTransactions[4].merchant).toBe('City Power & Light');
  });

  it('computes split-aware category breakdown accurately', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: DEFAULT_ACCOUNTS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 250000,
      now: fixedNow,
    });

    const categoryBreakdown = metrics.categoryBreakdown;

    // Expected categories:
    // Transportation ($340.00), Dues ($145.20), Daily Living ($85.00 split + $6.75 coffee = $91.75), Home ($35.00 split)
    expect(categoryBreakdown.length).toBe(4);

    // Top item: Transportation
    expect(categoryBreakdown[0].categoryId).toBe('cat-transportation');
    expect(categoryBreakdown[0].name).toBe('Transportation');
    expect(categoryBreakdown[0].amountMinor).toBe(34000);
    expect(categoryBreakdown[0].percentage).toBe(56); // 34000 / 61195 = 55.56% -> 56%

    // Second: Dues
    expect(categoryBreakdown[1].categoryId).toBe('cat-dues');
    expect(categoryBreakdown[1].name).toBe('Dues');
    expect(categoryBreakdown[1].amountMinor).toBe(14520);
    expect(categoryBreakdown[1].percentage).toBe(24);

    // Third: Daily Living (split + coffee)
    expect(categoryBreakdown[2].categoryId).toBe('cat-daily-living');
    expect(categoryBreakdown[2].name).toBe('Daily Living');
    expect(categoryBreakdown[2].amountMinor).toBe(9175);
    expect(categoryBreakdown[2].percentage).toBe(15);

    // Fourth: Home (from split!)
    expect(categoryBreakdown[3].categoryId).toBe('cat-home');
    expect(categoryBreakdown[3].name).toBe('Home');
    expect(categoryBreakdown[3].amountMinor).toBe(3500);
    expect(categoryBreakdown[3].percentage).toBe(6);

    // Total of splits + non-splits equals total expense
    const totalCategorySpend = categoryBreakdown.reduce((sum, item) => sum + item.amountMinor, 0);
    expect(totalCategorySpend).toBe(metrics.expenseMinor);
  });

  it('computes tag breakdown for expense transactions', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: DEFAULT_ACCOUNTS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 250000,
      now: fixedNow,
    });

    const tagBreakdown = metrics.tagBreakdown;

    // Delta ($340): ['vacation', 'reimbursable']
    // Whole Foods ($120): ['shared']
    // City Power ($145.20): ['recurring', 'shared']
    // Starbucks ($6.75): ['work']
    // Note: Savings transfer 'recurring' and Salary 'work' do not count as they are not EXPENSE
    const tagMap = new Map(tagBreakdown.map((t) => [t.tag, t]));

    expect(tagMap.get('vacation')).toEqual({
      tag: 'vacation',
      amountMinor: 34000,
      transactionCount: 1,
    });
    expect(tagMap.get('reimbursable')).toEqual({
      tag: 'reimbursable',
      amountMinor: 34000,
      transactionCount: 1,
    });
    expect(tagMap.get('shared')).toEqual({
      tag: 'shared',
      amountMinor: 26520, // 12000 + 14520
      transactionCount: 2,
    });
    expect(tagMap.get('recurring')).toEqual({
      tag: 'recurring',
      amountMinor: 14520,
      transactionCount: 1,
    });
    expect(tagMap.get('work')).toEqual({
      tag: 'work',
      amountMinor: 675,
      transactionCount: 1,
    });
  });

  it('computes budget utilization and over-budget state', () => {
    // Normal budget scenario ($2,500 budget, $611.95 spent)
    const normal = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: DEFAULT_ACCOUNTS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 250000,
      now: fixedNow,
    });

    expect(normal.budget.budgetMinor).toBe(250000);
    expect(normal.budget.spentMinor).toBe(61195);
    expect(normal.budget.remainingMinor).toBe(188805);
    expect(normal.budget.utilizationPercent).toBe(24);
    expect(normal.budget.isOverBudget).toBe(false);

    // Over budget scenario ($500 budget, $611.95 spent)
    const overBudget = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: DEFAULT_ACCOUNTS,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 50000,
      now: fixedNow,
    });

    expect(overBudget.budget.budgetMinor).toBe(50000);
    expect(overBudget.budget.spentMinor).toBe(61195);
    expect(overBudget.budget.remainingMinor).toBe(-11195);
    expect(overBudget.budget.utilizationPercent).toBe(122);
    expect(overBudget.budget.isOverBudget).toBe(true);
  });
});
