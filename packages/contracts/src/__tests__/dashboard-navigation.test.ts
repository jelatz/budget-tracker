import { describe, expect, it } from 'vitest';
import {
  parseAccountsTabParam,
  parseExpensesTabParam,
  summarizeCategoryBudgets,
  summarizeSinkingFunds,
  type CategoryBudgetStatus,
  type SinkingFund,
} from '../index';

describe('Dashboard Route Tab Param Parsers', () => {
  describe('parseExpensesTabParam', () => {
    it('parses canonical lowercase values', () => {
      expect(parseExpensesTabParam('recorded')).toBe('RECORDED');
      expect(parseExpensesTabParam('scheduled')).toBe('SCHEDULED');
      expect(parseExpensesTabParam('budgets')).toBe('BUDGETS');
    });

    it('normalizes uppercase and surrounding whitespace', () => {
      expect(parseExpensesTabParam('  RECORDED  ')).toBe('RECORDED');
      expect(parseExpensesTabParam('\tScheduled\n')).toBe('SCHEDULED');
      expect(parseExpensesTabParam('  BuDgEtS ')).toBe('BUDGETS');
    });

    it('resolves supported route aliases', () => {
      expect(parseExpensesTabParam('recurring')).toBe('SCHEDULED');
      expect(parseExpensesTabParam(' RECURRING ')).toBe('SCHEDULED');
      expect(parseExpensesTabParam('envelopes')).toBe('BUDGETS');
      expect(parseExpensesTabParam(' ENVELOPES ')).toBe('BUDGETS');
    });

    it('handles string arrays by taking the first element', () => {
      expect(parseExpensesTabParam(['budgets', 'recorded'])).toBe('BUDGETS');
      expect(parseExpensesTabParam([' recurring ', 'other'])).toBe('SCHEDULED');
      expect(parseExpensesTabParam([])).toBeUndefined();
    });

    it('returns undefined for undefined or unrecognized values', () => {
      expect(parseExpensesTabParam(undefined)).toBeUndefined();
      expect(parseExpensesTabParam('')).toBeUndefined();
      expect(parseExpensesTabParam('   ')).toBeUndefined();
      expect(parseExpensesTabParam('unknown')).toBeUndefined();
      expect(parseExpensesTabParam(['invalid', 'recorded'])).toBeUndefined();
    });
  });

  describe('parseAccountsTabParam', () => {
    it('parses canonical lowercase values', () => {
      expect(parseAccountsTabParam('accounts')).toBe('ACCOUNTS');
      expect(parseAccountsTabParam('income-sources')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('sinking-funds')).toBe('SINKING_FUNDS');
    });

    it('normalizes uppercase and surrounding whitespace', () => {
      expect(parseAccountsTabParam('  ACCOUNTS  ')).toBe('ACCOUNTS');
      expect(parseAccountsTabParam('  Income-Sources  ')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('\tSinking-Funds\n')).toBe('SINKING_FUNDS');
    });

    it('resolves supported route aliases', () => {
      expect(parseAccountsTabParam('income_sources')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('incomesources')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('income')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('salary')).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam('sinking_funds')).toBe('SINKING_FUNDS');
      expect(parseAccountsTabParam(' SINKING_FUNDS ')).toBe('SINKING_FUNDS');
      expect(parseAccountsTabParam('sinkingfunds')).toBe('SINKING_FUNDS');
      expect(parseAccountsTabParam(' SinkingFunds ')).toBe('SINKING_FUNDS');
    });

    it('handles string arrays by taking the first element', () => {
      expect(parseAccountsTabParam(['income-sources', 'accounts'])).toBe('INCOME_SOURCES');
      expect(parseAccountsTabParam(['sinking-funds', 'accounts'])).toBe('SINKING_FUNDS');
      expect(parseAccountsTabParam([' sinkingfunds ', 'accounts'])).toBe('SINKING_FUNDS');
      expect(parseAccountsTabParam([])).toBeUndefined();
    });

    it('returns undefined for undefined or unrecognized values', () => {
      expect(parseAccountsTabParam(undefined)).toBeUndefined();
      expect(parseAccountsTabParam('')).toBeUndefined();
      expect(parseAccountsTabParam('   ')).toBeUndefined();
      expect(parseAccountsTabParam('cards')).toBeUndefined();
      expect(parseAccountsTabParam(['unknown', 'accounts'])).toBeUndefined();
    });
  });
});

describe('Dashboard Overview Summarizers', () => {
  describe('summarizeCategoryBudgets', () => {
    const makeEnvelope = (overrides: Partial<CategoryBudgetStatus>): CategoryBudgetStatus => ({
      categoryId: 'cat-default',
      periodMonth: '2026-11',
      assignedMinor: 10000,
      carriedOverMinor: 0,
      effectiveBudgetMinor: 10000,
      spentMinor: 5000,
      remainingMinor: 5000,
      utilizationPercent: 50,
      isOverspent: false,
      rolloverEnabled: false,
      ...overrides,
    });

    it('returns zeroed summary for an empty list', () => {
      expect(summarizeCategoryBudgets([])).toEqual({
        totalAssignedMinor: 0,
        totalEffectiveMinor: 0,
        totalSpentMinor: 0,
        totalRemainingMinor: 0,
        utilizationPercent: 0,
        overspentCount: 0,
      });
    });

    it('aggregates multiple envelopes including rollovers and overspent counts', () => {
      const envelopes: CategoryBudgetStatus[] = [
        // Rollover surplus: assigned 50,000 + 15,000 = 65,000 effective; spent 55,000; remaining 10,000
        makeEnvelope({
          categoryId: 'cat-daily-living',
          assignedMinor: 50000,
          carriedOverMinor: 15000,
          effectiveBudgetMinor: 65000,
          spentMinor: 55000,
          remainingMinor: 10000,
          utilizationPercent: 85,
          isOverspent: false,
          rolloverEnabled: true,
        }),
        // Overspent flagged explicitly
        makeEnvelope({
          categoryId: 'cat-entertainment',
          assignedMinor: 20000,
          carriedOverMinor: -5000,
          effectiveBudgetMinor: 15000,
          spentMinor: 22000,
          remainingMinor: -7000,
          utilizationPercent: 147,
          isOverspent: true,
          rolloverEnabled: true,
        }),
        // Overspent inferred via spentMinor > effectiveBudgetMinor even if isOverspent is false
        makeEnvelope({
          categoryId: 'cat-transportation',
          assignedMinor: 10000,
          carriedOverMinor: 0,
          effectiveBudgetMinor: 10000,
          spentMinor: 13000,
          remainingMinor: -3000,
          utilizationPercent: 130,
          isOverspent: false,
          rolloverEnabled: false,
        }),
      ];

      const summary = summarizeCategoryBudgets(envelopes);
      expect(summary).toEqual({
        totalAssignedMinor: 80000,
        totalEffectiveMinor: 90000,
        totalSpentMinor: 90000,
        totalRemainingMinor: 0,
        utilizationPercent: 100,
        overspentCount: 2,
      });
    });

    it('returns 0 utilization when totalEffectiveMinor is 0 even if spending occurred', () => {
      const envelopes: CategoryBudgetStatus[] = [
        makeEnvelope({
          categoryId: 'cat-home',
          assignedMinor: 0,
          carriedOverMinor: 0,
          effectiveBudgetMinor: 0,
          spentMinor: 4500,
          remainingMinor: -4500,
          utilizationPercent: 0,
          isOverspent: true,
        }),
      ];

      expect(summarizeCategoryBudgets(envelopes)).toEqual({
        totalAssignedMinor: 0,
        totalEffectiveMinor: 0,
        totalSpentMinor: 4500,
        totalRemainingMinor: -4500,
        utilizationPercent: 0,
        overspentCount: 1,
      });
    });
  });

  describe('summarizeSinkingFunds', () => {
    const makeFund = (overrides: Partial<SinkingFund>): SinkingFund => ({
      id: 'sf-1',
      name: 'Emergency Fund',
      icon: '🎯',
      color: '#3B82F6',
      targetAmountMinor: 100000,
      currentSavedMinor: 25000,
      targetDate: '2027-06',
      accountId: 'account-savings',
      monthlyContributionMinor: 10000,
      isCompleted: false,
      ...overrides,
    });

    it('returns zeroed summary for an empty list', () => {
      expect(summarizeSinkingFunds([])).toEqual({
        totalSavedMinor: 0,
        totalTargetMinor: 0,
        utilizationPercent: 0,
        activeCount: 0,
        completedCount: 0,
      });
    });

    it('aggregates partial progress and completed/reached funds accurately', () => {
      const funds: SinkingFund[] = [
        // Active partial progress
        makeFund({
          id: 'sf-vacation',
          targetAmountMinor: 100000,
          currentSavedMinor: 30000,
          isCompleted: false,
        }),
        // Reached target by amount even if isCompleted flag is false
        makeFund({
          id: 'sf-laptop',
          targetAmountMinor: 80000,
          currentSavedMinor: 80000,
          isCompleted: false,
        }),
        // Marked completed explicitly even if saved < target
        makeFund({
          id: 'sf-archived',
          targetAmountMinor: 20000,
          currentSavedMinor: 15000,
          isCompleted: true,
        }),
      ];

      // totalSavedMinor = 125,000; totalTargetMinor = 200,000 -> 62.5% -> rounds to 63%
      expect(summarizeSinkingFunds(funds)).toEqual({
        totalSavedMinor: 125000,
        totalTargetMinor: 200000,
        utilizationPercent: 63,
        activeCount: 1,
        completedCount: 2,
      });
    });

    it('handles zero target and over-target funds cleanly', () => {
      const zeroTargetFund = makeFund({
        id: 'sf-zero',
        targetAmountMinor: 0,
        currentSavedMinor: 0,
        isCompleted: false,
      });
      expect(summarizeSinkingFunds([zeroTargetFund])).toEqual({
        totalSavedMinor: 0,
        totalTargetMinor: 0,
        utilizationPercent: 0,
        activeCount: 0,
        completedCount: 1,
      });

      const overTargetFund = makeFund({
        id: 'sf-over',
        targetAmountMinor: 50000,
        currentSavedMinor: 75000,
        isCompleted: false,
      });
      expect(summarizeSinkingFunds([overTargetFund])).toEqual({
        totalSavedMinor: 75000,
        totalTargetMinor: 50000,
        utilizationPercent: 150,
        activeCount: 0,
        completedCount: 1,
      });
    });
  });
});
