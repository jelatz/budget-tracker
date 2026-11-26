import { describe, expect, it } from 'vitest';
import {
  backupEnvelopeSchema,
  commitmentFrequencySchema,
  commitmentKindSchema,
  computeInstallmentProgress,
  computeSafeToSpend,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  parseTransactionsFromCsv,
  recurringCommitmentSchema,
  safeToSpendMetricsSchema,
  serializeTransactionsToCsv,
  type Account,
  type Category,
  type RecurringCommitment,
  type Transaction,
} from '../index';

describe('Recurring Commitments, Debts & Safe-to-Spend', () => {
  const accounts: Account[] = [
    {
      id: 'account-bank',
      name: 'Main Bank',
      accountType: 'BANK',
      icon: '🏦',
      color: '#1B4332',
      currency: 'PHP',
      balanceMinor: 200000,
    },
    {
      id: 'account-cash',
      name: 'Cash',
      accountType: 'CASH',
      icon: '💵',
      color: '#A16207',
      currency: 'PHP',
      balanceMinor: 15000,
    },
  ];

  const commitments: RecurringCommitment[] = [
    {
      id: 'rc-rent',
      name: 'Rent',
      kind: 'BILL',
      amountMinor: 80000,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-home',
      frequency: 'MONTHLY',
      dueDay: 25,
      isAutoPaid: false,
      isActive: true,
      paidInstallments: 0,
    },
    {
      id: 'rc-electric',
      name: 'Electric Bill',
      kind: 'BILL',
      amountMinor: 7000,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      frequency: 'MONTHLY',
      dueDay: 20,
      isAutoPaid: false,
      isActive: true,
      paidInstallments: 0,
    },
    {
      id: 'rc-netflix',
      name: 'Netflix',
      kind: 'BILL',
      amountMinor: 1500,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-subscription',
      frequency: 'MONTHLY',
      dueDay: 5,
      isAutoPaid: true,
      isActive: true,
      paidInstallments: 0,
      lastPaidPeriod: '2026-11',
    },
  ];

  it('validates commitmentFrequencySchema', () => {
    expect(commitmentFrequencySchema.parse('MONTHLY')).toBe('MONTHLY');
    expect(commitmentFrequencySchema.parse('BIWEEKLY')).toBe('BIWEEKLY');
    expect(() => commitmentFrequencySchema.parse('DAILY')).toThrow();
  });

  it('computes Safe to Spend until Next Payday and clamps daily discretionary to 0 on deficit', () => {
    const testDate = new Date(2026, 10, 15, 12, 0, 0, 0);
    const metrics = computeSafeToSpend({
      accounts,
      commitments,
      nextPaydayDate: '2026-11-30',
      currentDate: testDate,
    });

    expect(metrics.totalLiquidBalanceMinor).toBe(215000);
    expect(metrics.dueBeforeNextPaydayMinor).toBe(87000);
    expect(metrics.safeToSpendMinor).toBe(128000);
    expect(metrics.daysUntilNextPayday).toBe(15);
    expect(metrics.dailyDiscretionaryBudgetMinor).toBe(Math.floor(128000 / 15));
    expect(safeToSpendMetricsSchema.parse(metrics)).toBeDefined();

    const deficit = computeSafeToSpend({
      accounts,
      commitments: [
        {
          ...commitments[0]!,
          amountMinor: 300000,
        },
      ],
      nextPaydayDate: '2026-11-30',
      currentDate: testDate,
    });
    expect(deficit.safeToSpendMinor).toBe(-85000);
    expect(deficit.dailyDiscretionaryBudgetMinor).toBe(0);
  });

  it('normalizes legacy commitment kinds and calculates installment progress', () => {
    expect(commitmentKindSchema.parse('BILL')).toBe('BILL');
    expect(commitmentKindSchema.parse('LOAN')).toBe('LOAN');
    expect(commitmentKindSchema.parse('CREDIT_CARD_INSTALLMENT')).toBe(
      'CREDIT_CARD_INSTALLMENT',
    );

    const legacyParsed = recurringCommitmentSchema.parse({
      id: 'rc-legacy',
      name: 'Legacy Bill',
      kind: 'RECURRING',
      amountMinor: 5000,
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      dueDay: 20,
    });
    expect(legacyParsed.kind).toBe('BILL');

    const activeLoan = recurringCommitmentSchema.parse({
      id: 'loan-car',
      name: 'Car Loan',
      kind: 'INSTALLMENT',
      amountMinor: 150000,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-loans',
      dueDay: 25,
      totalInstallments: 12,
      paidInstallments: 3,
    });
    expect(activeLoan.kind).toBe('LOAN');
    expect(computeInstallmentProgress(activeLoan).remainingBalanceMinor).toBe(1350000);
    expect(isCommitmentPaidOff(activeLoan)).toBe(false);
  });
});

describe('CSV Serialization & Round-Trip Portability', () => {
  const testAccounts: Account[] = [
    {
      id: 'account-bank',
      name: 'Main Bank',
      accountType: 'BANK',
      icon: '🏦',
      color: '#1B4332',
      currency: 'PHP',
      balanceMinor: 250000,
    },
    {
      id: 'account-savings',
      name: 'Savings',
      accountType: 'BANK',
      icon: '🐷',
      color: '#1E6F4E',
      currency: 'PHP',
      balanceMinor: 500000,
    },
  ];

  const testCategories: Category[] = [
    {
      id: 'cat-daily-living',
      name: 'Daily Living',
      type: 'EXPENSE',
      icon: '🛒',
      color: '#10B981',
      usageCount: 0,
      defaultOrder: 0,
      isCustom: false,
    },
    {
      id: 'cat-salary',
      name: 'Salary',
      type: 'INCOME',
      icon: '💰',
      color: '#10B981',
      usageCount: 0,
      defaultOrder: 1,
      isCustom: false,
    },
  ];

  const sampleTxs: Transaction[] = [
    {
      id: 'tx-101',
      type: 'EXPENSE',
      amountMinor: 4550,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-daily-living',
      merchant: 'Supermarket "Fresh, Inc."',
      note: 'Dinner party supplies, drinks\nand snacks',
      occurredAt: '2026-11-01T15:30:00.000Z',
      createdAt: '2026-11-01T15:30:00.000Z',
    },
    {
      id: 'tx-102',
      type: 'TRANSFER',
      amountMinor: 50000,
      currency: 'PHP',
      accountId: 'account-bank',
      toAccountId: 'account-savings',
      note: 'Monthly savings transfer',
      occurredAt: '2026-11-02T10:00:00.000Z',
      createdAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'tx-103',
      type: 'INCOME',
      amountMinor: 320000,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      merchant: 'Primary Job',
      occurredAt: '2026-11-03T09:00:00.000Z',
      createdAt: '2026-11-03T09:00:00.000Z',
    },
  ];

  it('performs lossless CSV serialization and round-trip parsing', () => {
    const csv = serializeTransactionsToCsv(sampleTxs, testCategories, testAccounts);
    expect(csv).toContain('Date,Type,Amount,Currency,Account,ToAccount,Category,Merchant,Notes');

    const result = parseTransactionsFromCsv(csv, testAccounts, testCategories);
    expect(result.errors).toEqual([]);
    expect(result.valid.length).toBe(3);
    expect(result.valid[0].merchant).toBe('Supermarket "Fresh, Inc."');
    expect(result.valid[1].toAccountId).toBe('account-savings');
    expect(result.valid[2].categoryId).toBe('cat-salary');
  });

  it('normalizes legacy v1 backup envelopes seamlessly', () => {
    const legacyEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        wallets: [
          {
            id: 'wallet-checking',
            name: 'Checking',
            accountType: 'DEBIT',
            icon: '🏦',
            color: '#1B4332',
            currency: 'PHP',
            balanceMinor: 100000,
          },
        ],
        categories: DEFAULT_CATEGORIES,
        transactions: [
          {
            id: 'tx-1',
            type: 'EXPENSE',
            amountMinor: 500,
            currency: 'PHP',
            walletId: 'wallet-checking',
            categoryId: 'cat-coffee',
            tags: ['coffee'],
            occurredAt: '2026-11-01T10:00:00.000Z',
            createdAt: '2026-11-01T10:00:00.000Z',
          },
        ],
        categoryBudgets: [],
        recurringCommitments: [],
        sinkingFunds: [],
        quickPresets: [],
        smartDefaults: {
          lastWalletId: 'wallet-checking',
          knownTags: ['coffee'],
        },
      },
    };

    const parsed = backupEnvelopeSchema.parse(normalizeBackupEnvelope(legacyEnvelope));
    expect(parsed.data.accounts[0].id).toBe('account-bank');
    expect(parsed.data.accounts[0].name).toBe('Main Bank');
    expect(parsed.data.transactions[0].accountId).toBe('account-bank');
    expect(parsed.data.transactions[0].categoryId).toBe('cat-daily-living');
    expect(parsed.data.smartDefaults?.lastAccountId).toBe('account-bank');
  });
});
