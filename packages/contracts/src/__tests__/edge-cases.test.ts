import { describe, expect, it } from 'vitest';
import {
  type ApprovalStatus,
  type JobStatus,
  backupEnvelopeSchema,
  computeDashboardMetrics,
  computeEnvelopeRollovers,
  computeSafeToSpend,
  createCategoryBudgetInputSchema,
  createCategoryInputSchema,
  createQuickPresetInputSchema,
  createRecurringCommitmentInputSchema,
  createSinkingFundInputSchema,
  createTransactionInputSchema,
  createWalletInputSchema,
  evaluateCalculatorExpression,
  isWalletLiquidForSafeToSpend,
  parseDecimalToMinorUnits,
  parseTransactionsFromCsv,
  periodMonthSchema,
  registerInputSchema,
  serializeTransactionsToCsv,
  shiftPeriodMonth,
  splitEvenly,
  updateMonthlyBudgetInputSchema,
  upsertQuickPresetInputSchema,
  type Category,
  type CategoryBudget,
  type RecurringCommitment,
  type SinkingFund,
  type Transaction,
  type Wallet,
} from '../index';

describe('Universal App Testing — Contracts Edge Cases (TC-01..TC-05, TC-18, TC-25, TC-28..TC-32)', () => {
  it('TC-01: enforces auth register trim, lowercase, and length bounds', () => {
    const ok = registerInputSchema.parse({
      name: "  Dana O'Neil  ",
      email: '  DANA+QA@EXAMPLE.COM  ',
      password: 'secret1',
    });
    expect(ok.name).toBe("Dana O'Neil");
    expect(ok.email).toBe('dana+qa@example.com');

    expect(
      registerInputSchema.safeParse({
        name: '   ',
        email: 'dana@example.com',
        password: 'secret1',
      }).success,
    ).toBe(false);

    expect(
      registerInputSchema.safeParse({
        name: 'a'.repeat(81),
        email: 'dana@example.com',
        password: 'secret1',
      }).success,
    ).toBe(false);

    expect(
      registerInputSchema.safeParse({
        name: 'Dana',
        email: 'qa@localhost',
        password: 'secret1',
      }).success,
    ).toBe(false);

    expect(
      registerInputSchema.safeParse({
        name: 'Dana',
        email: 'dana@example.com',
        password: '12345',
      }).success,
    ).toBe(false);
  });

  it('TC-02: enforces minor-unit decimal parsing, division-by-zero safety, and exact splitEvenly', () => {
    expect(parseDecimalToMinorUnits('1250.50')).toBe(125050);
    expect(parseDecimalToMinorUnits('0')).toBe(0);
    expect(parseDecimalToMinorUnits('-5')).toBe(-500);
    expect(parseDecimalToMinorUnits('10.123')).toBeNull();
    expect(parseDecimalToMinorUnits('1,250.50')).toBeNull();
    expect(parseDecimalToMinorUnits('abc')).toBeNull();

    const divZero = evaluateCalculatorExpression('100/0');
    expect(divZero.isValid).toBe(false);
    expect(divZero.error).toBe('DIVIDE_BY_ZERO');
    expect(divZero.previewMinor).toBe(0);

    const precedence = evaluateCalculatorExpression('150.25+49.75*2');
    expect(precedence.isValid).toBe(true);
    expect(precedence.previewMinor).toBe(24975);

    const even = splitEvenly(100, 3);
    expect(even).toEqual([34, 33, 33]);
    expect(even.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('TC-03: rejects invalid transaction currency, amount, lengths, splits, and transfer guards', () => {
    const base = {
      type: 'EXPENSE' as const,
      amountMinor: 1000,
      currency: 'PHP',
      walletId: 'w-1',
      categoryId: 'c-1',
      occurredAt: '2026-11-20T12:00:00.000Z',
    };

    expect(createTransactionInputSchema.safeParse({ ...base, currency: 'USD' }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, amountMinor: -100 }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, amountMinor: 12.5 }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, note: 'a'.repeat(281) }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, merchant: 'm'.repeat(81) }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, tags: ['t'.repeat(33)] }).success).toBe(false);

    // 1 split rejected
    expect(
      createTransactionInputSchema.safeParse({
        ...base,
        categoryId: undefined,
        splits: [{ id: 's-1', categoryId: 'c-1', amountMinor: 1000 }],
      }).success,
    ).toBe(false);

    // Mismatched split sum rejected
    expect(
      createTransactionInputSchema.safeParse({
        ...base,
        categoryId: undefined,
        splits: [
          { id: 's-1', categoryId: 'c-1', amountMinor: 500 },
          { id: 's-2', categoryId: 'c-2', amountMinor: 400 },
        ],
      }).success,
    ).toBe(false);

    // Self-transfer rejected
    expect(
      createTransactionInputSchema.safeParse({
        type: 'TRANSFER',
        amountMinor: 1000,
        currency: 'PHP',
        walletId: 'w-1',
        toWalletId: 'w-1',
        occurredAt: '2026-11-20T12:00:00.000Z',
      }).success,
    ).toBe(false);

    // Transfer with categoryId rejected
    expect(
      createTransactionInputSchema.safeParse({
        type: 'TRANSFER',
        amountMinor: 1000,
        currency: 'PHP',
        walletId: 'w-1',
        toWalletId: 'w-2',
        categoryId: 'c-1',
        occurredAt: '2026-11-20T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('TC-04 & TC-05: enforces wallet, category, monthly budget & planning schema boundaries', () => {
    expect(createWalletInputSchema.safeParse({ name: 'a'.repeat(41) }).success).toBe(false);
    expect(createWalletInputSchema.safeParse({ name: 'USD Account', currency: 'EUR' }).success).toBe(false);
    const validCard = createWalletInputSchema.parse({
      name: 'GCash 💳 <script>alert(1)</script>',
      type: 'CREDIT_CARD',
      openingBalanceMinor: -50000,
    });
    expect(validCard.name).toBe('GCash 💳 <script>alert(1)</script>');
    expect(validCard.openingBalanceMinor).toBe(-50000);

    expect(
      createCategoryInputSchema.safeParse({ name: 'a'.repeat(41), type: 'EXPENSE' }).success,
    ).toBe(false);
    expect(updateMonthlyBudgetInputSchema.safeParse({ monthlyBudgetMinor: 0 }).success).toBe(false);
    expect(updateMonthlyBudgetInputSchema.safeParse({ monthlyBudgetMinor: 5000000 }).success).toBe(true);

    // Planning bounds
    expect(
      createCategoryBudgetInputSchema.safeParse({
        categoryId: 'c-1',
        periodMonth: '2026-11',
        assignedMinor: -1,
      }).success,
    ).toBe(false);
    expect(
      createCategoryBudgetInputSchema.safeParse({
        categoryId: 'c-1',
        periodMonth: '2026-11',
        assignedMinor: 0,
      }).success,
    ).toBe(true);
    expect(
      createCategoryBudgetInputSchema.safeParse({
        categoryId: 'c-1',
        periodMonth: '2026-11',
        assignedMinor: 1000,
        notes: 'n'.repeat(281),
      }).success,
    ).toBe(false);

    expect(
      createRecurringCommitmentInputSchema.safeParse({
        name: 'Rent',
        amountMinor: 1000,
        walletId: 'w-1',
        categoryId: 'c-1',
        dueDay: 0,
      }).success,
    ).toBe(false);
    expect(
      createRecurringCommitmentInputSchema.safeParse({
        name: 'Rent',
        amountMinor: 1000,
        walletId: 'w-1',
        categoryId: 'c-1',
        dueDay: 32,
      }).success,
    ).toBe(false);
    expect(
      createSinkingFundInputSchema.safeParse({
        name: 'Emergency',
        targetAmountMinor: 0,
        targetDate: '2027-06',
        walletId: 'w-1',
      }).success,
    ).toBe(false);
    expect(
      createSinkingFundInputSchema.safeParse({
        name: 'Emergency',
        targetAmountMinor: 100000,
        currentSavedMinor: -1,
        targetDate: '2027-06',
        walletId: 'w-1',
      }).success,
    ).toBe(false);
  });

  it('TC-18: preserves canonical blueprint JobStatus and ApprovalStatus literal unions', () => {
    const jobStatuses: JobStatus[] = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'];
    const approvalStatuses: ApprovalStatus[] = [
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'EXECUTED',
    ];
    expect(jobStatuses).toHaveLength(4);
    expect(approvalStatuses).toHaveLength(4);
  });

  it('TC-25: rejects impossible calendar months and targetDates while supporting leap years and year rollovers', () => {
    expect(periodMonthSchema.safeParse('2026-00').success).toBe(false);
    expect(periodMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(periodMonthSchema.safeParse('2026-01').success).toBe(true);
    expect(periodMonthSchema.safeParse('2026-12').success).toBe(true);

    expect(
      createRecurringCommitmentInputSchema.safeParse({
        name: 'Rent',
        amountMinor: 100000,
        walletId: 'w-1',
        categoryId: 'c-1',
        dueDay: 1,
        lastPaidPeriod: '2026-13',
      }).success,
    ).toBe(false);

    expect(
      createSinkingFundInputSchema.safeParse({
        name: 'Bad Date Fund',
        targetAmountMinor: 100000,
        targetDate: '2026-02-30',
        walletId: 'w-1',
      }).success,
    ).toBe(false);

    expect(
      createSinkingFundInputSchema.safeParse({
        name: 'Leap Year Fund',
        targetAmountMinor: 100000,
        targetDate: '2028-02-29',
        walletId: 'w-1',
      }).success,
    ).toBe(true);

    expect(shiftPeriodMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriodMonth('2026-01', -1)).toBe('2025-12');
  });

  it('TC-28: computes envelope rollovers and Safe-to-Spend liquidity rules accurately', () => {
    const budgets: CategoryBudget[] = [
      {
        id: 'b-oct',
        categoryId: 'c-food',
        periodMonth: '2026-10',
        assignedMinor: 100000,
        rolloverEnabled: true,
      },
      {
        id: 'b-nov',
        categoryId: 'c-food',
        periodMonth: '2026-11',
        assignedMinor: 100000,
        rolloverEnabled: true,
      },
      {
        id: 'b-fun-oct',
        categoryId: 'c-fun',
        periodMonth: '2026-10',
        assignedMinor: 50000,
        rolloverEnabled: false,
      },
      {
        id: 'b-fun-nov',
        categoryId: 'c-fun',
        periodMonth: '2026-11',
        assignedMinor: 50000,
        rolloverEnabled: false,
      },
    ];
    const txs: Transaction[] = [
      {
        id: 't-1',
        type: 'EXPENSE',
        amountMinor: 60000,
        currency: 'PHP',
        walletId: 'w-chk',
        categoryId: 'c-food',
        tags: [],
        occurredAt: '2026-10-15T12:00:00.000Z',
        createdAt: '2026-10-15T12:00:00.000Z',
      },
      {
        id: 't-2',
        type: 'EXPENSE',
        amountMinor: 10000,
        currency: 'PHP',
        walletId: 'w-chk',
        categoryId: 'c-fun',
        tags: [],
        occurredAt: '2026-10-15T12:00:00.000Z',
        createdAt: '2026-10-15T12:00:00.000Z',
      },
    ];

    const novStatuses = computeEnvelopeRollovers({
      budgets,
      transactions: txs,
      periodMonth: '2026-11',
    });
    const foodNov = novStatuses.find((s) => s.categoryId === 'c-food');
    const funNov = novStatuses.find((s) => s.categoryId === 'c-fun');
    expect(foodNov?.carriedOverMinor).toBe(40000);
    expect(foodNov?.effectiveBudgetMinor).toBe(140000);
    expect(funNov?.carriedOverMinor).toBe(0);
    expect(funNov?.effectiveBudgetMinor).toBe(50000);

    const allWallets: Wallet[] = [
      {
        id: 'w-chk',
        name: 'Checking',
        type: 'CHECKING',
        icon: '🏦',
        color: '#2563EB',
        currency: 'PHP',
        openingBalanceMinor: 500000,
        balanceMinor: 500000,
      },
      {
        id: 'w-sav-hidden',
        name: 'Savings Locked',
        type: 'SAVINGS',
        icon: '🐷',
        color: '#10B981',
        currency: 'PHP',
        openingBalanceMinor: 300000,
        balanceMinor: 300000,
      },
      {
        id: 'w-sav-liquid',
        name: 'Savings Opt-In',
        type: 'SAVINGS',
        icon: '🐷',
        color: '#10B981',
        currency: 'PHP',
        openingBalanceMinor: 100000,
        balanceMinor: 100000,
        includeInSafeToSpend: true,
      },
      {
        id: 'w-cc',
        name: 'Credit Card',
        type: 'CREDIT_CARD',
        icon: '💳',
        color: '#EF4444',
        currency: 'PHP',
        openingBalanceMinor: -50000,
        balanceMinor: -50000,
      },
    ];
    const liquidWallets = allWallets.filter(isWalletLiquidForSafeToSpend);
    expect(liquidWallets.map((w) => w.id)).toEqual(['w-chk', 'w-sav-liquid']);

    const commitments: RecurringCommitment[] = [
      {
        id: 'rc-unpaid',
        name: 'Internet',
        type: 'EXPENSE',
        amountMinor: 50000,
        currency: 'PHP',
        walletId: 'w-chk',
        categoryId: 'c-bills',
        frequency: 'MONTHLY',
        dueDay: 25,
        isAutoPaid: false,
        isActive: true,
      },
      {
        id: 'rc-paid',
        name: 'Rent',
        type: 'EXPENSE',
        amountMinor: 100000,
        currency: 'PHP',
        walletId: 'w-chk',
        categoryId: 'c-bills',
        frequency: 'MONTHLY',
        dueDay: 5,
        isAutoPaid: false,
        isActive: true,
        lastPaidPeriod: '2026-11',
      },
    ];
    const funds: SinkingFund[] = [];

    const sts = computeSafeToSpend({
      liquidWallets,
      commitments,
      categoryBudgets: novStatuses,
      sinkingFunds: funds,
      currentDate: new Date(2026, 10, 20, 12, 0, 0),
    });
    // Liquid = Checking (500000) + Savings Opt-In (100000) = 600000; excludes Savings Locked & Credit Card
    expect(sts.totalLiquidBalanceMinor).toBe(600000);
    // Paid commitment excluded; unpaid Internet (50000) reserved
    expect(sts.upcomingFixedBillsMinor).toBe(50000);
  });

  it('TC-29: attributes split expenses accurately, excludes transfers from cashflow, and avoids NaN at 0 income', () => {
    const wallets: Wallet[] = [
      {
        id: 'w-1',
        name: 'Checking',
        type: 'CHECKING',
        icon: '🏦',
        color: '#2563EB',
        currency: 'PHP',
        openingBalanceMinor: 100000,
        balanceMinor: 80000,
      },
      {
        id: 'w-2',
        name: 'Savings',
        type: 'SAVINGS',
        icon: '🐷',
        color: '#10B981',
        currency: 'PHP',
        openingBalanceMinor: 50000,
        balanceMinor: 60000,
      },
    ];
    const categories: Category[] = [
      {
        id: 'c-food',
        name: 'Food',
        type: 'EXPENSE',
        icon: '🍔',
        color: '#F97316',
        usageCount: 1,
        defaultOrder: 1,
        isCustom: false,
      },
      {
        id: 'c-home',
        name: 'Home',
        type: 'EXPENSE',
        icon: '🏠',
        color: '#3B82F6',
        usageCount: 1,
        defaultOrder: 2,
        isCustom: false,
      },
    ];
    const txs: Transaction[] = [
      {
        id: 'tx-split',
        type: 'EXPENSE',
        amountMinor: 20000,
        currency: 'PHP',
        walletId: 'w-1',
        splits: [
          { id: 'sp-1', categoryId: 'c-food', amountMinor: 12000 },
          { id: 'sp-2', categoryId: 'c-home', amountMinor: 8000 },
        ],
        tags: ['shared'],
        occurredAt: '2026-11-18T10:00:00.000Z',
        createdAt: '2026-11-18T10:00:00.000Z',
      },
      {
        id: 'tx-transfer',
        type: 'TRANSFER',
        amountMinor: 10000,
        currency: 'PHP',
        walletId: 'w-1',
        toWalletId: 'w-2',
        tags: ['savings'],
        occurredAt: '2026-11-19T10:00:00.000Z',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
    ];

    const metrics = computeDashboardMetrics({
      transactions: txs,
      wallets,
      categories,
      monthlyBudgetMinor: 100000,
      period: 'MONTH',
      now: new Date(2026, 10, 20, 12, 0, 0),
      selectedMonth: '2026-11',
    });

    expect(metrics.incomeMinor).toBe(0);
    expect(metrics.expenseMinor).toBe(20000);
    expect(metrics.transferVolumeMinor).toBe(10000);
    expect(metrics.savingsRatePercent).toBeNull();
    expect(metrics.categoryBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: 'c-food', amountMinor: 12000 }),
        expect.objectContaining({ categoryId: 'c-home', amountMinor: 8000 }),
      ]),
    );
  });

  it('TC-30: handles RFC 4180 CSV escaping, missing header, malformed rows, partial recovery & round-trip', () => {
    const wallets: Wallet[] = [
      {
        id: 'w-1',
        name: 'Checking',
        type: 'CHECKING',
        icon: '🏦',
        color: '#2563EB',
        currency: 'PHP',
        openingBalanceMinor: 0,
        balanceMinor: 0,
      },
    ];
    const categories: Category[] = [
      {
        id: 'c-food',
        name: 'Food',
        type: 'EXPENSE',
        icon: '🍔',
        color: '#F97316',
        usageCount: 1,
        defaultOrder: 1,
        isCustom: false,
      },
    ];

    const noHeader = parseTransactionsFromCsv('Date,Merchant\n2026-11-20,Cafe', wallets, categories);
    expect(noHeader.valid).toHaveLength(0);
    expect(noHeader.errors[0]).toMatch(/Amount/i);

    const mixedCsv = [
      'Date,Type,Amount,Currency,Wallet,Category,Merchant,Note,Tags',
      '2026-11-20,EXPENSE,125.50,PHP,Checking,Food,"Bean, ""Roast""","Coffee, ""Iced""","coffee;daily"',
      '',
      'not-a-date,EXPENSE,50.00,PHP,Checking,Food,Cafe,Bad date,tag',
      '2026-11-20,EXPENSE,12.345,PHP,Checking,Food,Cafe,Too many decimals,tag',
    ].join('\n');

    const parsed = parseTransactionsFromCsv(mixedCsv, wallets, categories);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0]?.amountMinor).toBe(12550);
    expect(parsed.valid[0]?.merchant).toBe('Bean, "Roast"');
    expect(parsed.valid[0]?.note).toBe('Coffee, "Iced"');
    expect(parsed.valid[0]?.tags).toEqual(['coffee', 'daily']);
    expect(parsed.errors).toHaveLength(2);

    const serialized = serializeTransactionsToCsv(
      [
        {
          id: 'tx-1',
          type: 'EXPENSE',
          amountMinor: 12550,
          currency: 'PHP',
          walletId: 'w-1',
          categoryId: 'c-food',
          merchant: 'Bean, "Roast"',
          note: 'Coffee, "Iced"',
          tags: ['coffee', 'daily'],
          occurredAt: '2026-11-20T10:00:00.000Z',
          createdAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      categories,
      wallets,
    );
    const roundTripped = parseTransactionsFromCsv(serialized, wallets, categories);
    expect(roundTripped.errors).toHaveLength(0);
    expect(roundTripped.valid).toHaveLength(1);
    expect(roundTripped.valid[0]?.amountMinor).toBe(12550);
    expect(roundTripped.valid[0]?.note).toBe('Coffee, "Iced"');

    // Reject backup v2
    expect(
      backupEnvelopeSchema.safeParse({
        version: 2,
        exportedAt: '2026-11-20T00:00:00.000Z',
        appName: 'Budget Tracker',
        data: {
          wallets: [],
          categories: [],
          transactions: [],
          settings: {
            currency: 'PHP',
            monthlyBudgetMinor: 3000000,
            recentMerchants: [],
            knownTags: [],
          },
          categoryBudgets: [],
          recurringCommitments: [],
          sinkingFunds: [],
          quickPresets: [],
          reconciliations: [],
        },
      }).success,
    ).toBe(false);
  });

  it('TC-32: enforces cross-field validation on quick presets (TRANSFER vs EXPENSE/INCOME)', () => {
    expect(
      createQuickPresetInputSchema.safeParse({
        label: 'Bad Transfer',
        icon: '🔄',
        type: 'TRANSFER',
        amountMinor: 50000,
        walletId: 'w-1',
      }).success,
    ).toBe(false);

    expect(
      upsertQuickPresetInputSchema.safeParse({
        label: 'Self Transfer',
        icon: '🔄',
        type: 'TRANSFER',
        amountMinor: 50000,
        walletId: 'w-1',
        toWalletId: 'w-1',
      }).success,
    ).toBe(false);

    expect(
      upsertQuickPresetInputSchema.safeParse({
        label: 'Cat Transfer',
        icon: '🔄',
        type: 'TRANSFER',
        amountMinor: 50000,
        walletId: 'w-1',
        toWalletId: 'w-2',
        categoryId: 'c-1',
      }).success,
    ).toBe(false);

    expect(
      upsertQuickPresetInputSchema.safeParse({
        label: 'Bad Expense',
        icon: '☕',
        type: 'EXPENSE',
        amountMinor: 15000,
        walletId: 'w-1',
        toWalletId: 'w-2',
        categoryId: 'c-1',
      }).success,
    ).toBe(false);

    expect(
      upsertQuickPresetInputSchema.safeParse({
        label: 'Quick Coffee',
        icon: '☕',
        type: 'EXPENSE',
        amountMinor: 15000,
        walletId: 'w-1',
      }).success,
    ).toBe(true);

    expect(
      upsertQuickPresetInputSchema.safeParse({
        label: 'To Savings',
        icon: '🐷',
        type: 'TRANSFER',
        amountMinor: 50000,
        walletId: 'w-1',
        toWalletId: 'w-2',
      }).success,
    ).toBe(true);
  });
});
