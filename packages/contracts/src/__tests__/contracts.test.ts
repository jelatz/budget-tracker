import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TYPE_LABELS,
  accountSchema,
  accountTypeSchema,
  applyCalculatorKey,
  computeDashboardMetrics,
  createDefaultTransactions,
  createInitialSyncDataState,
  createTransactionInputSchema,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  DEFAULT_TRANSACTIONS,
  evaluateCalculatorExpression,
  filterAccountsByListFilter,
  formatMinorUnits,
  getAccountTypeLabel,
  isLiquidCashAccountType,
  isTransactionInPeriod,
  mapKeyboardKeyToCalculatorKey,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  normalizeLegacyAccountType,
  normalizeLegacyCategoryId,
  parseDecimalToMinorUnits,
  rankCategoriesByFrequency,
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

    expect(parseDecimalToMinorUnits('12.555')).toBeNull();
    expect(parseDecimalToMinorUnits('abc')).toBeNull();
    expect(parseDecimalToMinorUnits('1.2.3')).toBeNull();
  });

  it('normalizes live decimal input across dot/comma locales and thousands separators', () => {
    expect(normalizeDecimalInput('')).toBe('');
    expect(normalizeDecimalInput('0')).toBe('0');
    expect(normalizeDecimalInput('12.')).toBe('12.');
    expect(normalizeDecimalInput('12.5')).toBe('12.5');
    expect(normalizeDecimalInput('12.50')).toBe('12.50');
    expect(normalizeDecimalInput('-12.50')).toBe('-12.50');
    expect(normalizeDecimalInput('.')).toBe('.');
    expect(normalizeDecimalInput('-.')).toBe('-.');
    expect(normalizeDecimalInput(',')).toBe('.');
    expect(normalizeDecimalInput('-,')).toBe('-.');
    expect(normalizeDecimalInput('12,')).toBe('12.');
    expect(normalizeDecimalInput('12,5')).toBe('12.5');
    expect(normalizeDecimalInput('12,50')).toBe('12.50');
    expect(normalizeDecimalInput('1,234.56')).toBe('1234.56');
    expect(normalizeDecimalInput('1,234,567')).toBe('1234567');
    expect(normalizeDecimalInput('1,234')).toBe('1234');
    expect(normalizeDecimalInput(' 12.50 ')).toBe('12.50');
    expect(normalizeDecimalInput('12.345')).toBe('12.345');
    expect(normalizeDecimalInput('abc')).toBe('abc');
  });
});

describe('Calculator Engine', () => {
  it('evaluates basic expressions and handles operator precedence (10 + 5 × 2 = 20)', () => {
    const res = evaluateCalculatorExpression('10 + 5 × 2');
    expect(res.isValid).toBe(true);
    expect(res.hasOperator).toBe(true);
    expect(res.endsWithOperator).toBe(false);
    expect(res.previewMinor).toBe(2000);
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
    expect(res.previewMinor).toBe(3333);
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
    expect(res.error).toBe('DIVIDE_BY_ZERO');
  });

  it('applies calculator keys and maps keyboard shortcuts accurately', () => {
    let expr = '0';
    expr = applyCalculatorKey(expr, '5');
    expr = applyCalculatorKey(expr, '0');
    expr = applyCalculatorKey(expr, '+');
    expr = applyCalculatorKey(expr, '2');
    expr = applyCalculatorKey(expr, '5');
    expect(expr).toBe('50 + 25');
    expr = applyCalculatorKey(expr, '=');
    expect(expr).toBe('75');
    expect(mapKeyboardKeyToCalculatorKey('*')).toBe('×');
    expect(mapKeyboardKeyToCalculatorKey('/')).toBe('÷');
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
      categoryId: 'cat-daily-living',
      occurredAt: validOccurredAt,
      merchant: 'Supermarket',
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

  it('rejects EXPENSE transaction when categoryId is missing', () => {
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

  it('validates a correct TRANSFER transaction and rejects invalid transfers', () => {
    expect(
      createTransactionInputSchema.safeParse({
        type: 'TRANSFER',
        amountMinor: 50000,
        accountId: 'account-bank',
        toAccountId: 'account-savings',
        occurredAt: validOccurredAt,
      }).success,
    ).toBe(true);

    expect(
      createTransactionInputSchema.safeParse({
        type: 'TRANSFER',
        amountMinor: 50000,
        accountId: 'account-bank',
        toAccountId: 'account-bank',
        occurredAt: validOccurredAt,
      }).success,
    ).toBe(false);

    expect(
      createTransactionInputSchema.safeParse({
        type: 'TRANSFER',
        amountMinor: 50000,
        accountId: 'account-bank',
        toAccountId: 'account-savings',
        categoryId: 'cat-daily-living',
        occurredAt: validOccurredAt,
      }).success,
    ).toBe(false);
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
    ];

    const ranked = rankCategoriesByFrequency(sampleCategories, 'EXPENSE');
    expect(ranked.map((c) => c.id)).toEqual(['c2', 'c1', 'c3']);
  });

  it('exposes valid default accounts and categories with zero starter data', () => {
    expect(DEFAULT_ACCOUNTS.length).toBe(4);
    expect(DEFAULT_ACCOUNTS.every((a) => a.currency === 'PHP')).toBe(true);
    expect(DEFAULT_ACCOUNTS.every((a) => a.balanceMinor === 0)).toBe(true);

    const initialState = createInitialSyncDataState();
    expect(initialState.transactions).toEqual([]);
    expect(initialState.recurringCommitments).toEqual([]);
    expect(initialState.incomeSources).toEqual([]);
    expect(initialState.smartDefaults.recentMerchants).toEqual([]);
    expect(initialState.accounts.every((a) => a.balanceMinor === 0)).toBe(true);
    expect(initialState.categories.every((c) => c.usageCount === 0)).toBe(true);
    expect(DEFAULT_CATEGORIES.length).toBe(16);

    expect(normalizeLegacyCategoryId('cat-household')).toBe('cat-home');
    expect(normalizeLegacyCategoryId('cat-groceries')).toBe('cat-daily-living');
    expect(normalizeLegacyCategoryId('cat-custom-pets')).toBe('cat-custom-pets');
  });

  it('validates account types, legacy normalization, defaults, and filters', () => {
    expect(accountTypeSchema.options).toEqual(['BANK', 'E_WALLET', 'CASH', 'CREDIT_CARD']);
    expect(ACCOUNT_TYPE_LABELS).toEqual({
      BANK: 'Bank',
      E_WALLET: 'E-Wallet',
      CASH: 'Cash',
      CREDIT_CARD: 'Credit Card',
    });
    expect(getAccountTypeLabel('BANK')).toBe('Bank');
    expect(normalizeLegacyAccountType('DEBIT')).toBe('BANK');
    expect(normalizeLegacyAccountType('CREDIT')).toBe('CREDIT_CARD');

    const legacyAccount = accountSchema.parse({
      id: 'account-legacy',
      name: 'Legacy Bank',
      icon: '🏦',
      color: '#1B4332',
      currency: 'PHP',
      balanceMinor: 10000,
    });
    expect(legacyAccount.accountType).toBe('BANK');

    const cardInput = upsertAccountInputSchema.parse({
      name: '  BPI Visa  ',
      accountType: 'CREDIT_CARD',
      dueDay: 15,
    });
    expect(cardInput.name).toBe('BPI Visa');
    expect(cardInput.dueDay).toBe(15);

    expect(isLiquidCashAccountType('BANK')).toBe(true);
    expect(isLiquidCashAccountType('CREDIT_CARD')).toBe(false);

    const sampleAccounts: Account[] = [
      { ...DEFAULT_ACCOUNTS[0]!, balanceMinor: 500000 },
      { ...DEFAULT_ACCOUNTS[1]!, balanceMinor: -45000 },
      { ...DEFAULT_ACCOUNTS[2]!, balanceMinor: 35000 },
    ];
    expect(filterAccountsByListFilter(sampleAccounts, 'LIQUID_CASH')).toHaveLength(2);
    expect(filterAccountsByListFilter(sampleAccounts, 'CREDIT_CARD')).toHaveLength(1);
  });
});

describe('Dashboard Starter Seeds & Period Filtering', () => {
  const fixedNow = new Date('2026-10-31T12:00:00Z');

  it('validates smart defaults schema', () => {
    const parsed = smartDefaultsSchema.parse({
      lastAccountId: 'account-bank',
    });
    expect(parsed.monthlyBudgetMinor).toBe(250000);
    expect(parsed.recentMerchants).toEqual([]);
  });

  it('exposes 6 schema-valid default starter transactions', () => {
    expect(DEFAULT_TRANSACTIONS.length).toBe(6);
    for (const tx of DEFAULT_TRANSACTIONS) {
      expect(() => transactionSchema.parse(tx)).not.toThrow();
      expect(tx.currency).toBe('PHP');
    }
  });

  it('correctly filters transactions by period', () => {
    const now = fixedNow;
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const previousMonth = new Date('2026-09-15T12:00:00Z').toISOString();

    expect(isTransactionInPeriod(oneHourAgo, 'ALL_TIME', now)).toBe(true);
    expect(isTransactionInPeriod(oneHourAgo, 'THIS_MONTH', now)).toBe(true);
    expect(isTransactionInPeriod(previousMonth, 'THIS_MONTH', now)).toBe(false);
    expect(isTransactionInPeriod(tenDaysAgo, 'LAST_7_DAYS', now)).toBe(false);
    expect(isTransactionInPeriod('invalid-date', 'LAST_7_DAYS', now)).toBe(false);
  });
});

describe('Dashboard Aggregation Engine (computeDashboardMetrics)', () => {
  const fixedNow = new Date('2026-10-31T12:00:00Z');
  const starterTransactions = createDefaultTransactions(fixedNow);
  const sampleAccounts: Account[] = [
    { ...DEFAULT_ACCOUNTS[0]!, balanceMinor: 245000 },
    { ...DEFAULT_ACCOUNTS[1]!, balanceMinor: -12000 },
    { ...DEFAULT_ACCOUNTS[2]!, balanceMinor: 18000 },
    { ...DEFAULT_ACCOUNTS[3]!, balanceMinor: 850000 },
  ];

  it('computes net worth, todayExpenseMinor, cashflow, and category breakdown', () => {
    const metrics = computeDashboardMetrics({
      transactions: starterTransactions,
      accounts: sampleAccounts,
      categories: DEFAULT_CATEGORIES,
      period: 'THIS_MONTH',
      monthlyBudgetMinor: 250000,
      now: fixedNow,
    });

    expect(metrics.netWorthMinor).toBe(245000 - 12000 + 18000 + 850000);
    expect(metrics.incomeMinor).toBe(420000);
    expect(metrics.expenseMinor).toBe(61195);
    expect(metrics.netCashflowMinor).toBe(420000 - 61195);
    expect(metrics.transferVolumeMinor).toBe(50000);
    expect(metrics.todayExpenseMinor).toBe(12000); // tx-seed-2 is 4 hours before fixedNow
    expect(metrics.recentTransactions.length).toBe(5);
    expect(metrics.categoryBreakdown[0].categoryId).toBe('cat-transportation');
    expect(
      metrics.categoryBreakdown.reduce((sum, item) => sum + item.amountMinor, 0),
    ).toBe(metrics.expenseMinor);
  });
});
