import { describe, expect, it } from 'vitest';
import {
  applyReconciliationInputSchema,
  backupEnvelopeSchema,
  balanceReconciliationSchema,
  categoryBudgetSchema,
  categoryBudgetStatusSchema,
  commitmentFrequencySchema,
  commitmentKindSchema,
  computeEnvelopeRollovers,
  computeInstallmentProgress,
  computeReconciliationDelta,
  computeSafeToSpend,
  computeSinkingFundMonthlyTarget,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_PRESETS,
  isCommitmentPaidOff,
  normalizeBackupEnvelope,
  parseTransactionsFromCsv,
  quickPresetSchema,
  recurringCommitmentSchema,
  safeToSpendMetricsSchema,
  serializeTransactionsToCsv,
  sinkingFundSchema,
  type Account,
  type Category,
  type CategoryBudget,
  type QuickPreset,
  type RecurringCommitment,
  type SinkingFund,
  type Transaction,
} from '../index';

describe('Envelope Budgeting & Rollovers', () => {
  const sampleBudgets: CategoryBudget[] = [
    {
      id: 'budget-groceries-oct',
      categoryId: 'cat-groceries',
      periodMonth: '2026-10',
      assignedMinor: 50000, // $500.00
      rolloverEnabled: true,
    },
    {
      id: 'budget-groceries-nov',
      categoryId: 'cat-groceries',
      periodMonth: '2026-11',
      assignedMinor: 50000, // $500.00
      rolloverEnabled: true,
    },
    {
      id: 'budget-dining-oct',
      categoryId: 'cat-dining',
      periodMonth: '2026-10',
      assignedMinor: 30000, // $300.00
      rolloverEnabled: true,
    },
    {
      id: 'budget-dining-nov',
      categoryId: 'cat-dining',
      periodMonth: '2026-11',
      assignedMinor: 30000, // $300.00
      rolloverEnabled: true,
    },
    {
      id: 'budget-coffee-oct',
      categoryId: 'cat-coffee',
      periodMonth: '2026-10',
      assignedMinor: 10000, // $100.00
      rolloverEnabled: false, // NO ROLLOVER
    },
    {
      id: 'budget-coffee-nov',
      categoryId: 'cat-coffee',
      periodMonth: '2026-11',
      assignedMinor: 10000, // $100.00
      rolloverEnabled: false, // NO ROLLOVER
    },
  ];

  const sampleTransactions: Transaction[] = [
    // Groceries Oct: $350 spent -> $150 surplus
    {
      id: 'tx-1',
      type: 'EXPENSE',
      amountMinor: 35000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-groceries',
      tags: ['groceries'],
      occurredAt: '2026-10-15T12:00:00.000Z',
      createdAt: '2026-10-15T12:00:00.000Z',
    },
    // Groceries Nov: $550 spent
    {
      id: 'tx-2',
      type: 'EXPENSE',
      amountMinor: 55000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-groceries',
      tags: ['groceries'],
      occurredAt: '2026-11-10T12:00:00.000Z',
      createdAt: '2026-11-10T12:00:00.000Z',
    },
    // Dining Oct: $380 spent -> $80 deficit (-8,000)
    {
      id: 'tx-3',
      type: 'EXPENSE',
      amountMinor: 38000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-dining',
      tags: ['dining'],
      occurredAt: '2026-10-20T12:00:00.000Z',
      createdAt: '2026-10-20T12:00:00.000Z',
    },
    // Dining Nov: $150 spent
    {
      id: 'tx-4',
      type: 'EXPENSE',
      amountMinor: 15000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-dining',
      tags: ['dining'],
      occurredAt: '2026-11-05T12:00:00.000Z',
      createdAt: '2026-11-05T12:00:00.000Z',
    },
    // Coffee Oct: $40 spent -> $60 surplus, BUT rollover is false!
    {
      id: 'tx-5',
      type: 'EXPENSE',
      amountMinor: 4000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-coffee',
      tags: ['coffee'],
      occurredAt: '2026-10-08T12:00:00.000Z',
      createdAt: '2026-10-08T12:00:00.000Z',
    },
    // Coffee Nov: $70 spent
    {
      id: 'tx-6',
      type: 'EXPENSE',
      amountMinor: 7000,
      currency: 'USD',
      accountId: 'account-card',
      categoryId: 'cat-coffee',
      tags: ['coffee'],
      occurredAt: '2026-11-12T12:00:00.000Z',
      createdAt: '2026-11-12T12:00:00.000Z',
    },
  ];

  it('correctly validates categoryBudgetSchema', () => {
    const valid = categoryBudgetSchema.parse({
      id: 'budget-1',
      categoryId: 'cat-groceries',
      periodMonth: '2026-11',
      assignedMinor: 45000,
      rolloverEnabled: true,
      notes: 'Holiday grocery allocation',
    });
    expect(valid.assignedMinor).toBe(45000);
    expect(valid.rolloverEnabled).toBe(true);

    expect(() =>
      categoryBudgetSchema.parse({
        id: 'budget-1',
        categoryId: 'cat-groceries',
        periodMonth: '2026-1', // Invalid format
        assignedMinor: 45000,
      }),
    ).toThrow();
  });

  it('computes envelope rollovers with positive surplus carryover', () => {
    const statuses = computeEnvelopeRollovers({
      budgets: sampleBudgets,
      transactions: sampleTransactions,
      periodMonth: '2026-11',
      previousPeriodMonth: '2026-10',
    });

    const groceriesStatus = statuses.find((s) => s.categoryId === 'cat-groceries');
    expect(groceriesStatus).toBeDefined();
    // Oct Groceries: Assigned 50,000, Spent 35,000 -> Surplus +15,000
    expect(groceriesStatus?.carriedOverMinor).toBe(15000);
    // Nov Groceries: Effective = 50,000 + 15,000 = 65,000
    expect(groceriesStatus?.effectiveBudgetMinor).toBe(65000);
    // Nov Spent: 55,000
    expect(groceriesStatus?.spentMinor).toBe(55000);
    // Remaining: 65,000 - 55,000 = 10,000
    expect(groceriesStatus?.remainingMinor).toBe(10000);
    expect(groceriesStatus?.isOverspent).toBe(false);
    expect(groceriesStatus?.utilizationPercent).toBe(85); // 55,000 / 65,000 = ~84.6% -> 85%
  });

  it('computes envelope rollovers with negative deficit carryover', () => {
    const statuses = computeEnvelopeRollovers({
      budgets: sampleBudgets,
      transactions: sampleTransactions,
      periodMonth: '2026-11',
      previousPeriodMonth: '2026-10',
    });

    const diningStatus = statuses.find((s) => s.categoryId === 'cat-dining');
    expect(diningStatus).toBeDefined();
    // Oct Dining: Assigned 30,000, Spent 38,000 -> Deficit -8,000
    expect(diningStatus?.carriedOverMinor).toBe(-8000);
    // Nov Dining: Effective = 30,000 - 8,000 = 22,000
    expect(diningStatus?.effectiveBudgetMinor).toBe(22000);
    // Nov Spent: 15,000
    expect(diningStatus?.spentMinor).toBe(15000);
    // Remaining: 22,000 - 15,000 = 7,000
    expect(diningStatus?.remainingMinor).toBe(7000);
    expect(diningStatus?.isOverspent).toBe(false);
    expect(diningStatus?.utilizationPercent).toBe(68); // 15,000 / 22,000 = 68%
  });

  it('resets carryover to 0 when rollover is disabled', () => {
    const statuses = computeEnvelopeRollovers({
      budgets: sampleBudgets,
      transactions: sampleTransactions,
      periodMonth: '2026-11',
      previousPeriodMonth: '2026-10',
    });

    const coffeeStatus = statuses.find((s) => s.categoryId === 'cat-coffee');
    expect(coffeeStatus).toBeDefined();
    // Even though Oct had $60 surplus, rolloverEnabled is false -> carryover = 0
    expect(coffeeStatus?.carriedOverMinor).toBe(0);
    expect(coffeeStatus?.effectiveBudgetMinor).toBe(10000);
    expect(coffeeStatus?.spentMinor).toBe(7000);
    expect(coffeeStatus?.remainingMinor).toBe(3000);
    expect(coffeeStatus?.isOverspent).toBe(false);
    expect(coffeeStatus?.rolloverEnabled).toBe(false);
  });

  it('accurately incorporates split transactions in envelope spending', () => {
    const splitTx: Transaction = {
      id: 'tx-split-1',
      type: 'EXPENSE',
      amountMinor: 8000,
      currency: 'USD',
      accountId: 'account-card',
      splits: [
        { id: 's-1', categoryId: 'cat-groceries', amountMinor: 5000 },
        { id: 's-2', categoryId: 'cat-dining', amountMinor: 3000 },
      ],
      tags: [],
      occurredAt: '2026-11-20T10:00:00.000Z',
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    const statuses = computeEnvelopeRollovers({
      budgets: sampleBudgets,
      transactions: [...sampleTransactions, splitTx],
      periodMonth: '2026-11',
      previousPeriodMonth: '2026-10',
    });

    const groceriesStatus = statuses.find((s) => s.categoryId === 'cat-groceries');
    // Previous 55,000 + 5,000 split = 60,000
    expect(groceriesStatus?.spentMinor).toBe(60000);
    expect(groceriesStatus?.remainingMinor).toBe(5000);

    const diningStatus = statuses.find((s) => s.categoryId === 'cat-dining');
    // Previous 15,000 + 3,000 split = 18,000
    expect(diningStatus?.spentMinor).toBe(18000);
    expect(diningStatus?.remainingMinor).toBe(4000);
  });
});

describe('Balance Reconciliation Engine', () => {
  it('detects zero discrepancy when actual matches app balance', () => {
    const delta = computeReconciliationDelta(250000, 250000);
    expect(delta.discrepancyMinor).toBe(0);
    expect(delta.needsAdjustment).toBe(false);
    expect(delta.adjustmentType).toBe('NONE');
    expect(delta.adjustmentAmountMinor).toBe(0);
  });

  it('detects positive discrepancy and requires INCOME adjustment', () => {
    // App has $2,000.00, Bank has $2,125.50 -> +$125.50 missing in app
    const delta = computeReconciliationDelta(200000, 212550);
    expect(delta.discrepancyMinor).toBe(12550);
    expect(delta.needsAdjustment).toBe(true);
    expect(delta.adjustmentType).toBe('INCOME');
    expect(delta.adjustmentAmountMinor).toBe(12550);
  });

  it('detects negative discrepancy and requires EXPENSE adjustment', () => {
    // App has $2,500.00, Bank has $2,420.00 -> -$80.00 extra in app
    const delta = computeReconciliationDelta(250000, 242000);
    expect(delta.discrepancyMinor).toBe(-8000);
    expect(delta.needsAdjustment).toBe(true);
    expect(delta.adjustmentType).toBe('EXPENSE');
    expect(delta.adjustmentAmountMinor).toBe(8000);
  });

  it('validates balanceReconciliationSchema and applyReconciliationInputSchema', () => {
    const input = applyReconciliationInputSchema.parse({
      accountId: 'account-bank',
      actualBalanceMinor: 242000,
      createAdjustment: true,
      notes: 'Monthly bank statement check',
    });
    expect(input.createAdjustment).toBe(true);

    const record = balanceReconciliationSchema.parse({
      id: 'rec-123',
      accountId: 'account-bank',
      appBalanceMinor: 250000,
      actualBalanceMinor: 242000,
      discrepancyMinor: -8000,
      reconciledAt: '2026-11-01T10:00:00.000Z',
      adjustmentTransactionId: 'tx-adj-1',
    });
    expect(record.discrepancyMinor).toBe(-8000);
    expect(record.adjustmentTransactionId).toBe('tx-adj-1');
  });
});

describe('Safe-to-Spend & Recurring Commitments', () => {
  const liquidAccounts: Account[] = [
    {
      id: 'account-bank',
      name: 'Main Bank',
      accountType: 'BANK',
      icon: '🏦',
      color: '#208AEF',
      currency: 'USD',
      balanceMinor: 200000, // $2,000.00
    },
    {
      id: 'account-cash',
      name: 'Cash',
      accountType: 'CASH',
      icon: '💵',
      color: '#10B981',
      currency: 'USD',
      balanceMinor: 15000, // $150.00
    },
  ];

  const commitments: RecurringCommitment[] = [
    // Rent: $800 due on day 25 -> UPCOMING
    {
      id: 'rc-rent',
      name: 'Apartment Rent',
      kind: 'RECURRING',
      amountMinor: 80000,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-home',
      frequency: 'MONTHLY',
      dueDay: 25,
      isAutoPaid: true,
      isActive: true,
      paidInstallments: 0,
    },
    // Electric: $70 due on day 20 -> UPCOMING
    {
      id: 'rc-electric',
      name: 'Electric Utility',
      kind: 'RECURRING',
      amountMinor: 7000,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      frequency: 'MONTHLY',
      dueDay: 20,
      isAutoPaid: true,
      isActive: true,
      paidInstallments: 0,
    },
    // Netflix: $15 due on day 5, already paid in 2026-11 -> NOT UPCOMING
    {
      id: 'rc-netflix',
      name: 'Netflix',
      kind: 'RECURRING',
      amountMinor: 1500,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-subscription',
      frequency: 'MONTHLY',
      dueDay: 5,
      isAutoPaid: true,
      isActive: true,
      paidInstallments: 0,
      lastPaidPeriod: '2026-11',
    },
    // Gym: $50 due on day 28, but inactive -> NOT UPCOMING
    {
      id: 'rc-gym',
      name: 'Gym Membership',
      kind: 'RECURRING',
      amountMinor: 5000,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-health',
      frequency: 'MONTHLY',
      dueDay: 28,
      isAutoPaid: false,
      isActive: false,
      paidInstallments: 0,
    },
    // Water bill: $30 due on day 3, today is day 15 and not paid -> past due, not upcoming
    {
      id: 'rc-water',
      name: 'Water Utility',
      kind: 'RECURRING',
      amountMinor: 3000,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      frequency: 'MONTHLY',
      dueDay: 3,
      isAutoPaid: false,
      isActive: true,
      paidInstallments: 0,
    },
  ];

  const categoryBudgets = [
    categoryBudgetStatusSchema.parse({
      categoryId: 'cat-groceries',
      periodMonth: '2026-11',
      assignedMinor: 40000,
      carriedOverMinor: 0,
      effectiveBudgetMinor: 40000,
      spentMinor: 20000,
      remainingMinor: 20000, // $200.00 remaining
      utilizationPercent: 50,
      isOverspent: false,
      rolloverEnabled: false,
    }),
    categoryBudgetStatusSchema.parse({
      categoryId: 'cat-dining',
      periodMonth: '2026-11',
      assignedMinor: 20000,
      carriedOverMinor: 0,
      effectiveBudgetMinor: 20000,
      spentMinor: 10000,
      remainingMinor: 10000, // $100.00 remaining
      utilizationPercent: 50,
      isOverspent: false,
      rolloverEnabled: false,
    }),
    categoryBudgetStatusSchema.parse({
      categoryId: 'cat-coffee',
      periodMonth: '2026-11',
      assignedMinor: 5000,
      carriedOverMinor: 0,
      effectiveBudgetMinor: 5000,
      spentMinor: 8000,
      remainingMinor: -3000, // -$30.00 overspent -> clamped to 0
      utilizationPercent: 160,
      isOverspent: true,
      rolloverEnabled: false,
    }),
  ];

  const sinkingFunds: SinkingFund[] = [
    {
      id: 'sf-vacation',
      name: 'Summer Vacation',
      icon: '✈️',
      color: '#3B82F6',
      targetAmountMinor: 100000,
      currentSavedMinor: 30000, // $300.00 isolated
      targetDate: '2027-06',
      accountId: 'account-bank',
      monthlyContributionMinor: 10000,
      isCompleted: false,
    },
    {
      id: 'sf-car',
      name: 'Car Maintenance',
      icon: '🚗',
      color: '#10B981',
      targetAmountMinor: 50000,
      currentSavedMinor: 10000, // $100.00 isolated
      targetDate: '2026-12',
      accountId: 'account-bank',
      monthlyContributionMinor: 5000,
      isCompleted: false,
    },
  ];

  it('validates commitmentFrequencySchema', () => {
    expect(commitmentFrequencySchema.parse('MONTHLY')).toBe('MONTHLY');
    expect(commitmentFrequencySchema.parse('BIWEEKLY')).toBe('BIWEEKLY');
    expect(() => commitmentFrequencySchema.parse('DAILY')).toThrow();
  });

  it('computes real-time safe to spend and daily discretionary metrics', () => {
    // Current date: November 15, 2026 (November has 30 days -> 30 - 15 + 1 = 16 days remaining)
    const testDate = new Date('2026-11-15T12:00:00Z');

    const metrics = computeSafeToSpend({
      liquidAccounts,
      commitments,
      categoryBudgets,
      sinkingFunds,
      currentDate: testDate,
    });

    // Total liquid balance = 200,000 + 15,000 = 215,000 ($2,150.00)
    expect(metrics.totalLiquidBalanceMinor).toBe(215000);

    // Upcoming fixed bills: rent (80,000) + electric (7,000) = 87,000 ($870.00)
    expect(metrics.upcomingFixedBillsMinor).toBe(87000);

    // Remaining category budgets: groceries (20,000) + dining (10,000) + coffee (0) = 30,000 ($300.00)
    expect(metrics.remainingCategoryBudgetsMinor).toBe(30000);

    // Isolated sinking funds: 30,000 + 10,000 = 40,000 ($400.00)
    expect(metrics.isolatedSinkingFundsMinor).toBe(40000);

    // Safe to spend = 215,000 - (40,000 + 87,000 + 30,000) = 215,000 - 157,000 = 58,000 ($580.00)
    expect(metrics.safeToSpendMinor).toBe(58000);

    // Days remaining in Nov: 16 days
    expect(metrics.daysRemainingInMonth).toBe(16);

    // Daily discretionary = Math.floor(58,000 / 16) = 3,625 ($36.25 / day)
    expect(metrics.dailyDiscretionaryBudgetMinor).toBe(3625);

    // Validates against Zod schema
    expect(safeToSpendMetricsSchema.parse(metrics)).toBeDefined();
  });

  it('clamps daily discretionary budget to 0 when in safe-to-spend deficit', () => {
    // Huge commitment that exceeds funds
    const deficitCommitment: RecurringCommitment = {
      id: 'rc-huge',
      name: 'Unfunded Large Debt',
      kind: 'RECURRING',
      amountMinor: 300000,
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-loans',
      frequency: 'MONTHLY',
      dueDay: 28,
      isAutoPaid: false,
      isActive: true,
      paidInstallments: 0,
    };

    const metrics = computeSafeToSpend({
      liquidAccounts,
      commitments: [deficitCommitment],
      categoryBudgets: [],
      sinkingFunds: [],
      currentDate: new Date('2026-11-15T12:00:00Z'),
    });

    // 215,000 - 300,000 = -85,000
    expect(metrics.safeToSpendMinor).toBe(-85000);
    expect(metrics.dailyDiscretionaryBudgetMinor).toBe(0);
  });

  it('validates installment commitments, computes payoff progress, and excludes paid-off loans from Safe-to-Spend', () => {
    expect(commitmentKindSchema.parse('RECURRING')).toBe('RECURRING');
    expect(commitmentKindSchema.parse('INSTALLMENT')).toBe('INSTALLMENT');

    // Legacy payload without kind/paidInstallments gets safe defaults
    const legacyParsed = recurringCommitmentSchema.parse({
      id: 'rc-legacy',
      name: 'Legacy Bill',
      amountMinor: 5000,
      accountId: 'account-bank',
      categoryId: 'cat-dues',
      dueDay: 20,
    });
    expect(legacyParsed.kind).toBe('RECURRING');
    expect(legacyParsed.paidInstallments).toBe(0);

    const activeLoan = recurringCommitmentSchema.parse({
      id: 'loan-car',
      name: 'Car Loan',
      kind: 'INSTALLMENT',
      amountMinor: 150000,
      currency: 'PHP',
      accountId: 'account-bank',
      categoryId: 'cat-loans',
      frequency: 'MONTHLY',
      dueDay: 25,
      totalInstallments: 12,
      paidInstallments: 3,
    });
    const activeProgress = computeInstallmentProgress(activeLoan);
    expect(activeProgress).toEqual({
      paidCount: 3,
      totalCount: 12,
      remainingCount: 9,
      remainingBalanceMinor: 1350000,
      progressPercent: 25,
      isPaidOff: false,
    });
    expect(isCommitmentPaidOff(activeLoan)).toBe(false);

    const paidOffLoan = recurringCommitmentSchema.parse({
      ...activeLoan,
      id: 'loan-phone',
      name: 'Phone Installment',
      paidInstallments: 12,
      isActive: true,
    });
    expect(isCommitmentPaidOff(paidOffLoan)).toBe(true);
    expect(computeInstallmentProgress(paidOffLoan).remainingBalanceMinor).toBe(0);

    const metrics = computeSafeToSpend({
      liquidAccounts,
      commitments: [activeLoan, paidOffLoan],
      categoryBudgets: [],
      sinkingFunds: [],
      currentDate: new Date('2026-11-15T12:00:00Z'),
    });
    // Only activeLoan (150,000) is upcoming; paidOffLoan is excluded
    expect(metrics.upcomingFixedBillsMinor).toBe(150000);
  });
});

describe('Sinking Funds Target Engine', () => {
  it('calculates monthly contribution needed across multiple months', () => {
    // Target $1,200.00 in 12 months, $0 saved
    const res = computeSinkingFundMonthlyTarget(
      120000,
      0,
      '2027-01',
      new Date('2026-01-15T00:00:00Z'),
    );
    expect(res.remainingMonths).toBe(12);
    expect(res.remainingTargetMinor).toBe(120000);
    expect(res.monthlyTargetMinor).toBe(10000); // $100.00/mo
    expect(res.isTargetReached).toBe(false);
  });

  it('accounts for partial existing savings and fractional rounding', () => {
    // Target $1,000.00 in 3 months, $400.00 already saved -> $600.00 remaining
    const res = computeSinkingFundMonthlyTarget(
      100000,
      40000,
      '2026-04',
      new Date('2026-01-15T00:00:00Z'),
    );
    expect(res.remainingMonths).toBe(3);
    expect(res.remainingTargetMinor).toBe(60000);
    expect(res.monthlyTargetMinor).toBe(20000); // $200.00/mo
    expect(res.isTargetReached).toBe(false);
  });

  it('marks target as reached when currentSaved reaches or exceeds target', () => {
    const res = computeSinkingFundMonthlyTarget(
      50000,
      50000,
      '2026-12',
      new Date('2026-01-15T00:00:00Z'),
    );
    expect(res.isTargetReached).toBe(true);
    expect(res.remainingMonths).toBe(0);
    expect(res.remainingTargetMinor).toBe(0);
    expect(res.monthlyTargetMinor).toBe(0);
  });

  it('clamps remaining months to at least 1 when due in current month or past', () => {
    const res = computeSinkingFundMonthlyTarget(
      30000,
      10000,
      '2026-01',
      new Date('2026-01-20T00:00:00Z'),
    );
    expect(res.remainingMonths).toBe(1);
    expect(res.monthlyTargetMinor).toBe(20000);
  });

  it('validates sinkingFundSchema', () => {
    const fund = sinkingFundSchema.parse({
      id: 'sf-emergency',
      name: 'Emergency Fund',
      icon: '🛡️',
      color: '#10B981',
      targetAmountMinor: 500000,
      currentSavedMinor: 150000,
      targetDate: '2027-12-31',
      accountId: 'account-savings',
      monthlyContributionMinor: 25000,
      isCompleted: false,
    });
    expect(fund.targetAmountMinor).toBe(500000);
    expect(fund.isCompleted).toBe(false);
  });
});

describe('Quick Presets & Defaults', () => {
  it('exposes exactly 4 realistic starter presets matching specs', () => {
    expect(DEFAULT_PRESETS.length).toBe(4);

    const coffee = DEFAULT_PRESETS.find((p) => p.id === 'preset-coffee');
    expect(coffee).toBeDefined();
    expect(coffee?.amountMinor).toBe(450); // $4.50
    expect(coffee?.type).toBe('EXPENSE');

    const transit = DEFAULT_PRESETS.find((p) => p.id === 'preset-transit');
    expect(transit).toBeDefined();
    expect(transit?.amountMinor).toBe(275); // $2.75

    const lunch = DEFAULT_PRESETS.find((p) => p.id === 'preset-lunch');
    expect(lunch).toBeDefined();
    expect(lunch?.amountMinor).toBe(1200); // $12.00

    const savings = DEFAULT_PRESETS.find((p) => p.id === 'preset-savings');
    expect(savings).toBeDefined();
    expect(savings?.amountMinor).toBe(5000); // $50.00
    expect(savings?.type).toBe('TRANSFER');
    expect(savings?.toAccountId).toBe('account-savings');
  });

  it('validates all starter presets against quickPresetSchema', () => {
    for (const preset of DEFAULT_PRESETS) {
      expect(quickPresetSchema.parse(preset)).toBeDefined();
    }
  });
});

describe('CSV Serialization & Round-Trip Portability', () => {
  const testAccounts: Account[] = [
    {
      id: 'account-bank',
      name: 'Main Bank',
      accountType: 'BANK',
      icon: '🏦',
      color: '#208AEF',
      currency: 'USD',
      balanceMinor: 250000,
    },
    {
      id: 'account-savings',
      name: 'Savings',
      accountType: 'BANK',
      icon: '🐷',
      color: '#F59E0B',
      currency: 'USD',
      balanceMinor: 500000,
    },
  ];

  const testCategories: Category[] = [
    {
      id: 'cat-groceries',
      name: 'Groceries',
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
      amountMinor: 4550, // $45.50
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-groceries',
      merchant: 'Supermarket "Fresh, Inc."', // quotes and commas
      note: 'Dinner party supplies, drinks\nand snacks', // newline and comma
      tags: ['groceries', 'dinner'],
      occurredAt: '2026-11-01T15:30:00.000Z',
      createdAt: '2026-11-01T15:30:00.000Z',
    },
    {
      id: 'tx-102',
      type: 'TRANSFER',
      amountMinor: 50000, // $500.00
      currency: 'USD',
      accountId: 'account-bank',
      toAccountId: 'account-savings',
      note: 'Monthly savings transfer',
      tags: ['savings'],
      occurredAt: '2026-11-02T10:00:00.000Z',
      createdAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'tx-103',
      type: 'INCOME',
      amountMinor: 320000, // $3,200.00
      currency: 'USD',
      accountId: 'account-bank',
      categoryId: 'cat-salary',
      merchant: 'Acme Corp',
      tags: ['paycheck'],
      occurredAt: '2026-11-03T09:00:00.000Z',
      createdAt: '2026-11-03T09:00:00.000Z',
    },
  ];

  it('serializes transactions into RFC 4180 CSV with proper escaping', () => {
    const csv = serializeTransactionsToCsv(sampleTxs, testCategories, testAccounts);
    expect(csv).toContain('Date,Type,Amount,Currency,Account,ToAccount,Category,Merchant,Notes,Tags');
    expect(csv).toContain('"Supermarket ""Fresh, Inc."""');
    expect(csv).toContain('"Dinner party supplies, drinks\nand snacks"');
    expect(csv).toContain('45.50');
    expect(csv).toContain('500.00');
    expect(csv).toContain('3200.00');
  });

  it('performs lossless round-trip parse of serialized transactions', () => {
    const csv = serializeTransactionsToCsv(sampleTxs, testCategories, testAccounts);
    const result = parseTransactionsFromCsv(csv, testAccounts, testCategories);

    expect(result.errors).toEqual([]);
    expect(result.valid.length).toBe(3);

    const expense = result.valid[0];
    expect(expense.type).toBe('EXPENSE');
    expect(expense.amountMinor).toBe(4550);
    expect(expense.accountId).toBe('account-bank');
    expect(expense.categoryId).toBe('cat-groceries');
    expect(expense.merchant).toBe('Supermarket "Fresh, Inc."');
    expect(expense.tags).toEqual(['groceries', 'dinner']);

    const transfer = result.valid[1];
    expect(transfer.type).toBe('TRANSFER');
    expect(transfer.amountMinor).toBe(50000);
    expect(transfer.accountId).toBe('account-bank');
    expect(transfer.toAccountId).toBe('account-savings');

    const income = result.valid[2];
    expect(income.type).toBe('INCOME');
    expect(income.amountMinor).toBe(320000);
    expect(income.categoryId).toBe('cat-salary');
  });

  it('accepts legacy Wallet/ToWallet CSV headers seamlessly', () => {
    const legacyCsv = [
      'Date,Type,Amount,Currency,Wallet,ToWallet,Category,Merchant,Notes,Tags',
      '2026-11-01,TRANSFER,100.00,PHP,Main Bank,Savings,,Self transfer,saving,transfer',
    ].join('\r\n');

    const result = parseTransactionsFromCsv(legacyCsv, testAccounts, testCategories);
    expect(result.errors).toEqual([]);
    expect(result.valid.length).toBe(1);
    expect(result.valid[0].accountId).toBe('account-bank');
    expect(result.valid[0].toAccountId).toBe('account-savings');
  });

  it('reports descriptive errors for invalid CSV rows', () => {
    const invalidCsv = [
      'Date,Type,Amount,Currency,Account,ToAccount,Category,Merchant,Notes,Tags',
      'invalid-date,EXPENSE,10.00,USD,Main Bank,,Groceries,,,',
      '2026-11-01,UNKNOWN_TYPE,10.00,USD,Main Bank,,Groceries,,,',
      '2026-11-01,EXPENSE,-5.00,USD,Main Bank,,Groceries,,,',
      '2026-11-01,EXPENSE,10.00,USD,NonexistentAccount,,Groceries,,,',
      '2026-11-01,TRANSFER,10.00,USD,Main Bank,,Groceries,,,', // Missing toAccount
      '2026-11-01,EXPENSE,10.00,USD,Main Bank,,,,,,', // Missing Category
    ].join('\r\n');

    const result = parseTransactionsFromCsv(invalidCsv, testAccounts, testCategories);
    expect(result.valid.length).toBe(0);
    expect(result.errors.length).toBe(6);
    expect(result.errors[0]).toContain('Invalid date');
    expect(result.errors[1]).toContain('Invalid transaction type');
    expect(result.errors[2]).toContain('Invalid amount');
    expect(result.errors[3]).toContain('Account "NonexistentAccount" not found');
    expect(result.errors[4]).toContain('Destination account required');
    expect(result.errors[5]).toContain('Category required');
  });
});

describe('JSON Backup Envelope Schema', () => {
  it('validates a complete v1 backup envelope', () => {
    const envelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        accounts: DEFAULT_ACCOUNTS,
        categories: DEFAULT_CATEGORIES,
        transactions: [],
        categoryBudgets: [
          {
            id: 'cb-1',
            categoryId: 'cat-groceries',
            periodMonth: '2026-11',
            assignedMinor: 50000,
            rolloverEnabled: true,
          },
        ],
        recurringCommitments: [
          {
            id: 'rc-1',
            name: 'Internet',
            amountMinor: 6000,
            currency: 'USD',
            accountId: 'account-bank',
            categoryId: 'cat-utilities',
            frequency: 'MONTHLY',
            dueDay: 15,
            isAutoPaid: true,
            isActive: true,
          },
        ],
        sinkingFunds: [
          {
            id: 'sf-1',
            name: 'Travel',
            icon: '✈️',
            color: '#3B82F6',
            targetAmountMinor: 100000,
            currentSavedMinor: 20000,
            targetDate: '2027-08',
            accountId: 'account-savings',
            monthlyContributionMinor: 10000,
            isCompleted: false,
          },
        ],
        quickPresets: DEFAULT_PRESETS,
        smartDefaults: {
          lastAccountId: 'account-bank',
          recentMerchants: ['Trader Joe', 'Target'],
          knownTags: ['groceries', 'coffee'],
          monthlyBudgetMinor: 250000,
        },
      },
    };

    const parsed = backupEnvelopeSchema.parse(envelope);
    expect(parsed.version).toBe(1);
    expect(parsed.data.accounts.length).toBe(DEFAULT_ACCOUNTS.length);
    expect(parsed.data.quickPresets.length).toBe(4);
    expect(parsed.data.sinkingFunds.length).toBe(1);
  });

  it('normalizes legacy v1 backup envelopes with wallets and walletId references', () => {
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
            color: '#208AEF',
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
            tags: [],
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
        },
      },
    };

    const parsed = backupEnvelopeSchema.parse(normalizeBackupEnvelope(legacyEnvelope));
    expect(parsed.data.accounts[0].id).toBe('account-bank');
    expect(parsed.data.accounts[0].name).toBe('Main Bank');
    expect(parsed.data.accounts[0].accountType).toBe('BANK');
    expect(parsed.data.transactions[0].accountId).toBe('account-bank');
    expect(parsed.data.transactions[0].categoryId).toBe('cat-daily-living');
    expect(parsed.data.smartDefaults?.lastAccountId).toBe('account-bank');
  });

  it('rejects unsupported schema version', () => {
    expect(() =>
      backupEnvelopeSchema.parse({
        version: 2, // Unsupported version
        exportedAt: new Date().toISOString(),
        data: {
          accounts: [],
          categories: [],
          transactions: [],
          categoryBudgets: [],
          recurringCommitments: [],
          sinkingFunds: [],
          quickPresets: [],
        },
      }),
    ).toThrow();
  });
});
