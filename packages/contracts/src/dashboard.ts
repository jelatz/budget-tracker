import { z } from 'zod';
import {
  getCurrentPeriodMonth,
  isTransactionInMonth,
  shiftPeriodMonth,
} from './category-budget.schema';
import type { Category, CategoryType, Transaction, Wallet } from './transactions.schema';

export const dashboardPeriodSchema = z.enum([
  'THIS_MONTH',
  'LAST_7_DAYS',
  'ALL_TIME',
  'MONTH',
]);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

export interface CategorySpendItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amountMinor: number;
  percentage: number;
  transactionCount: number;
}

export interface TagSpendItem {
  tag: string;
  amountMinor: number;
  transactionCount: number;
}

export interface BudgetSummary {
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationPercent: number;
  isOverBudget: boolean;
}

export interface MonthlyCashflowPoint {
  periodMonth: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  savingsRatePercent: number | null;
}

export interface DashboardMetrics {
  period: DashboardPeriod;
  selectedMonth?: string;
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  savingsRatePercent: number | null;
  transferVolumeMinor: number;
  transactionCount: number;
  budget: BudgetSummary;
  categoryBreakdown: CategorySpendItem[];
  incomeCategoryBreakdown: CategorySpendItem[];
  tagBreakdown: TagSpendItem[];
  monthlyTrend: MonthlyCashflowPoint[];
  recentTransactions: Transaction[];
}

/**
 * Determines whether a transaction ISO timestamp falls within the specified dashboard period.
 */
export function isTransactionInPeriod(
  occurredAtIso: string,
  period: DashboardPeriod,
  now = new Date(),
  selectedMonth?: string,
): boolean {
  if (period === 'ALL_TIME') {
    return true;
  }

  if (period === 'MONTH') {
    return isTransactionInMonth(occurredAtIso, selectedMonth ?? getCurrentPeriodMonth(now));
  }

  const d = new Date(occurredAtIso);
  if (isNaN(d.getTime())) {
    return false;
  }

  if (period === 'THIS_MONTH') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  if (period === 'LAST_7_DAYS') {
    const diff = now.getTime() - d.getTime();
    return diff <= 7 * 24 * 60 * 60 * 1000 && d.getTime() <= now.getTime() + 60 * 1000;
  }

  return false;
}

function buildCategoryBreakdown(
  transactions: readonly Transaction[],
  categoryLookup: ReadonlyMap<string, Category>,
  targetType: CategoryType,
  totalMinor: number,
): CategorySpendItem[] {
  const categoryMap = new Map<string, { amountMinor: number; transactionCount: number }>();

  for (const tx of transactions) {
    if (tx.type !== targetType) {
      continue;
    }

    if (tx.splits && tx.splits.length > 0) {
      for (const split of tx.splits) {
        const current = categoryMap.get(split.categoryId) ?? { amountMinor: 0, transactionCount: 0 };
        current.amountMinor += split.amountMinor;
        current.transactionCount += 1;
        categoryMap.set(split.categoryId, current);
      }
    } else if (tx.categoryId) {
      const current = categoryMap.get(tx.categoryId) ?? { amountMinor: 0, transactionCount: 0 };
      current.amountMinor += tx.amountMinor;
      current.transactionCount += 1;
      categoryMap.set(tx.categoryId, current);
    }
  }

  return Array.from(categoryMap.entries())
    .map(([categoryId, data]) => {
      const cat = categoryLookup.get(categoryId);
      const percentage =
        totalMinor > 0 ? Math.round((data.amountMinor * 100) / totalMinor) : 0;
      return {
        categoryId,
        name: cat?.name ?? 'Uncategorized',
        icon: cat?.icon ?? '🏷️',
        color: cat?.color ?? '#64748B',
        amountMinor: data.amountMinor,
        percentage,
        transactionCount: data.transactionCount,
      };
    })
    .sort((a, b) => {
      if (b.amountMinor !== a.amountMinor) {
        return b.amountMinor - a.amountMinor;
      }
      return b.transactionCount - a.transactionCount;
    });
}

function formatShortMonthLabel(periodMonth: string): string {
  const [yearStr, monthStr] = periodMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return periodMonth;
  }
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Computes comprehensive financial metrics, split-aware category distributions
 * for expenses and income, tag breakdowns, monthly trend, and monthly budget progress.
 */
export function computeDashboardMetrics(params: {
  transactions: readonly Transaction[];
  wallets: readonly Wallet[];
  categories: readonly Category[];
  period: DashboardPeriod;
  monthlyBudgetMinor: number;
  selectedMonth?: string;
  now?: Date;
}): DashboardMetrics {
  const now = params.now ?? new Date();
  const targetMonth =
    params.period === 'MONTH' && params.selectedMonth
      ? params.selectedMonth
      : getCurrentPeriodMonth(now);

  // 1. Net worth: sum of all wallet balances
  const netWorthMinor = params.wallets.reduce((acc, w) => acc + w.balanceMinor, 0);

  // 2. Filter transactions for the active dashboard period
  const periodTransactions = params.transactions.filter((tx) =>
    isTransactionInPeriod(tx.occurredAt, params.period, now, params.selectedMonth),
  );

  // 3. Totals across the active period
  let incomeMinor = 0;
  let expenseMinor = 0;
  let transferVolumeMinor = 0;

  for (const tx of periodTransactions) {
    if (tx.type === 'INCOME') {
      incomeMinor += tx.amountMinor;
    } else if (tx.type === 'EXPENSE') {
      expenseMinor += tx.amountMinor;
    } else if (tx.type === 'TRANSFER') {
      transferVolumeMinor += tx.amountMinor;
    }
  }

  const netCashflowMinor = incomeMinor - expenseMinor;
  const savingsRatePercent =
    incomeMinor > 0 ? Math.round((netCashflowMinor * 100) / incomeMinor) : null;
  const transactionCount = periodTransactions.length;

  // 4. Budget summary (always evaluated against targetMonth expenses)
  const targetMonthExpenses = params.transactions.filter(
    (tx) => tx.type === 'EXPENSE' && isTransactionInMonth(tx.occurredAt, targetMonth),
  );
  const spentMinor = targetMonthExpenses.reduce((acc, tx) => acc + tx.amountMinor, 0);

  const remainingMinor = params.monthlyBudgetMinor - spentMinor;
  const utilizationPercent =
    params.monthlyBudgetMinor > 0
      ? Math.round((spentMinor * 100) / params.monthlyBudgetMinor)
      : 0;
  const isOverBudget = spentMinor > params.monthlyBudgetMinor;

  const budget: BudgetSummary = {
    budgetMinor: params.monthlyBudgetMinor,
    spentMinor,
    remainingMinor,
    utilizationPercent,
    isOverBudget,
  };

  // 5. Split-aware Category Breakdowns (Expense & Income)
  const categoryLookup = new Map<string, Category>();
  for (const cat of params.categories) {
    categoryLookup.set(cat.id, cat);
  }

  const categoryBreakdown = buildCategoryBreakdown(
    periodTransactions,
    categoryLookup,
    'EXPENSE',
    expenseMinor,
  );
  const incomeCategoryBreakdown = buildCategoryBreakdown(
    periodTransactions,
    categoryLookup,
    'INCOME',
    incomeMinor,
  );

  // 6. Tag breakdown (for EXPENSE transactions in filtered period)
  const tagMap = new Map<string, { amountMinor: number; transactionCount: number }>();

  for (const tx of periodTransactions) {
    if (tx.type !== 'EXPENSE') {
      continue;
    }

    for (const tag of tx.tags) {
      const current = tagMap.get(tag) ?? { amountMinor: 0, transactionCount: 0 };
      current.amountMinor += tx.amountMinor;
      current.transactionCount += 1;
      tagMap.set(tag, current);
    }
  }

  const tagBreakdown: TagSpendItem[] = Array.from(tagMap.entries())
    .map(([tag, data]) => ({
      tag,
      amountMinor: data.amountMinor,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => {
      if (b.amountMinor !== a.amountMinor) {
        return b.amountMinor - a.amountMinor;
      }
      return a.tag.localeCompare(b.tag);
    });

  // 7. Trailing 6-month trend ending at targetMonth (oldest -> newest)
  const monthBuckets = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  const trendMonths: string[] = [];
  for (let offset = -5; offset <= 0; offset++) {
    const pm = shiftPeriodMonth(targetMonth, offset);
    trendMonths.push(pm);
    monthBuckets.set(pm, { incomeMinor: 0, expenseMinor: 0 });
  }

  for (const tx of params.transactions) {
    if (tx.type !== 'INCOME' && tx.type !== 'EXPENSE') {
      continue;
    }
    const d = new Date(tx.occurredAt);
    if (isNaN(d.getTime())) {
      continue;
    }
    const txMonth = getCurrentPeriodMonth(d);
    const bucket = monthBuckets.get(txMonth);
    if (!bucket) {
      continue;
    }
    if (tx.type === 'INCOME') {
      bucket.incomeMinor += tx.amountMinor;
    } else {
      bucket.expenseMinor += tx.amountMinor;
    }
  }

  const monthlyTrend: MonthlyCashflowPoint[] = trendMonths.map((periodMonth) => {
    const bucket = monthBuckets.get(periodMonth) ?? { incomeMinor: 0, expenseMinor: 0 };
    const net = bucket.incomeMinor - bucket.expenseMinor;
    return {
      periodMonth,
      label: formatShortMonthLabel(periodMonth),
      incomeMinor: bucket.incomeMinor,
      expenseMinor: bucket.expenseMinor,
      netCashflowMinor: net,
      savingsRatePercent:
        bucket.incomeMinor > 0 ? Math.round((net * 100) / bucket.incomeMinor) : null,
    };
  });

  // 8. Recent transactions: top 5 transactions sorted by occurredAt descending
  const recentTransactions = periodTransactions
    .slice()
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);

  return {
    period: params.period,
    ...(params.period === 'MONTH' ? { selectedMonth: targetMonth } : {}),
    netWorthMinor,
    incomeMinor,
    expenseMinor,
    netCashflowMinor,
    savingsRatePercent,
    transferVolumeMinor,
    transactionCount,
    budget,
    categoryBreakdown,
    incomeCategoryBreakdown,
    tagBreakdown,
    monthlyTrend,
    recentTransactions,
  };
}
