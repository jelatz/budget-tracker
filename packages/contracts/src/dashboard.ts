import { z } from 'zod';
import type { Category, Transaction, Wallet } from './transactions.schema';

export const dashboardPeriodSchema = z.enum(['THIS_MONTH', 'LAST_7_DAYS', 'ALL_TIME']);
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

export interface DashboardMetrics {
  period: DashboardPeriod;
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  transferVolumeMinor: number;
  transactionCount: number;
  budget: BudgetSummary;
  categoryBreakdown: CategorySpendItem[];
  tagBreakdown: TagSpendItem[];
  recentTransactions: Transaction[];
}

/**
 * Determines whether a transaction ISO timestamp falls within the specified dashboard period.
 */
export function isTransactionInPeriod(
  occurredAtIso: string,
  period: DashboardPeriod,
  now = new Date(),
): boolean {
  if (period === 'ALL_TIME') {
    return true;
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

/**
 * Computes comprehensive financial metrics, split-aware category distributions,
 * tag spend breakdowns, and monthly budget progress for the dashboard.
 */
export function computeDashboardMetrics(params: {
  transactions: readonly Transaction[];
  wallets: readonly Wallet[];
  categories: readonly Category[];
  period: DashboardPeriod;
  monthlyBudgetMinor: number;
  now?: Date;
}): DashboardMetrics {
  const now = params.now ?? new Date();

  // 1. Net worth: sum of all wallet balances
  const netWorthMinor = params.wallets.reduce((acc, w) => acc + w.balanceMinor, 0);

  // 2. Filter transactions for the active dashboard period
  const periodTransactions = params.transactions.filter((tx) =>
    isTransactionInPeriod(tx.occurredAt, params.period, now),
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
  const transactionCount = periodTransactions.length;

  // 4. Budget summary (monthly budget vs current month expenses)
  const thisMonthExpenses = params.transactions.filter(
    (tx) => tx.type === 'EXPENSE' && isTransactionInPeriod(tx.occurredAt, 'THIS_MONTH', now),
  );
  const thisMonthExpenseMinor = thisMonthExpenses.reduce((acc, tx) => acc + tx.amountMinor, 0);
  const spentMinor =
    params.period === 'THIS_MONTH'
      ? expenseMinor
      : thisMonthExpenseMinor > 0
        ? thisMonthExpenseMinor
        : expenseMinor;

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

  // 5. Category breakdown (split-aware for EXPENSE transactions in filtered period)
  const categoryMap = new Map<string, { amountMinor: number; transactionCount: number }>();

  for (const tx of periodTransactions) {
    if (tx.type !== 'EXPENSE') {
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

  const categoryLookup = new Map<string, Category>();
  for (const cat of params.categories) {
    categoryLookup.set(cat.id, cat);
  }

  const categoryBreakdown: CategorySpendItem[] = Array.from(categoryMap.entries())
    .map(([categoryId, data]) => {
      const cat = categoryLookup.get(categoryId);
      const percentage =
        expenseMinor > 0 ? Math.round((data.amountMinor * 100) / expenseMinor) : 0;
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

  // 7. Recent transactions: top 5 transactions sorted by occurredAt descending
  const recentTransactions = periodTransactions
    .slice()
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);

  return {
    period: params.period,
    netWorthMinor,
    incomeMinor,
    expenseMinor,
    netCashflowMinor,
    transferVolumeMinor,
    transactionCount,
    budget,
    categoryBreakdown,
    tagBreakdown,
    recentTransactions,
  };
}
