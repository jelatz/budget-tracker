import { z } from 'zod';
import {
  formatCalendarDateString,
  getCommitmentDueStatus,
  isCommitmentPaidOff,
  parseCalendarDate,
  type CommitmentDueState,
  type RecurringCommitment,
} from './recurring.schema';
import type { Account, Category, Transaction } from './transactions.schema';

export type AccountsRouteTab = 'ACCOUNTS' | 'PAYDAYS';
export type DebtsRouteTab = 'ALL' | 'CREDIT_CARDS' | 'LOANS' | 'BILLS';

export interface MonthlyPayableItem {
  commitment: RecurringCommitment;
  /** YYYY-MM-DD due date within (or before, if overdue) the current month. */
  dueDate: string;
  state: CommitmentDueState;
}

export interface MonthlyPayablesSummary {
  /** Current month as YYYY-MM. */
  period: string;
  remainingMinor: number;
  remainingCount: number;
  overdueMinor: number;
  overdueCount: number;
  paidMinor: number;
  paidCount: number;
  /** remaining + paid for the current month. */
  totalDueMinor: number;
  /** Share of this month's payables already paid (0-100). */
  paidPercent: number;
  /** Unpaid items due this month, overdue first, then by due date. */
  remainingItems: MonthlyPayableItem[];
}

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
  todayExpenseMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  netCashflowMinor: number;
  transferVolumeMinor: number;
  transactionCount: number;
  budget: BudgetSummary;
  categoryBreakdown: CategorySpendItem[];
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
 * Computes financial metrics, category spend distributions, and today's spending for the dashboard & Spending screen.
 */
export function computeDashboardMetrics(params: {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categories: readonly Category[];
  period: DashboardPeriod;
  monthlyBudgetMinor: number;
  now?: Date;
}): DashboardMetrics {
  const now = params.now ?? new Date();
  const todayStr = formatCalendarDateString(now);

  // 1. Net worth: sum of all account balances (including negative credit card balances)
  const netWorthMinor = params.accounts.reduce((acc, a) => acc + a.balanceMinor, 0);

  // 2. Filter transactions for the active period + today's spending
  const periodTransactions = params.transactions.filter((tx) =>
    isTransactionInPeriod(tx.occurredAt, params.period, now),
  );

  let todayExpenseMinor = 0;
  for (const tx of params.transactions) {
    if (tx.type !== 'EXPENSE') continue;
    const d = new Date(tx.occurredAt);
    if (!Number.isNaN(d.getTime()) && formatCalendarDateString(d) === todayStr) {
      todayExpenseMinor += tx.amountMinor;
    }
  }

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

  // 4. Budget summary (monthly target vs current month expenses)
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

  // 5. Category breakdown for EXPENSE transactions in filtered period
  const categoryMap = new Map<string, { amountMinor: number; transactionCount: number }>();

  for (const tx of periodTransactions) {
    if (tx.type !== 'EXPENSE' || !tx.categoryId) {
      continue;
    }
    const current = categoryMap.get(tx.categoryId) ?? { amountMinor: 0, transactionCount: 0 };
    current.amountMinor += tx.amountMinor;
    current.transactionCount += 1;
    categoryMap.set(tx.categoryId, current);
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

  // 6. Recent transactions: top 5 transactions sorted by occurredAt descending
  const recentTransactions = periodTransactions
    .slice()
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);

  return {
    period: params.period,
    netWorthMinor,
    todayExpenseMinor,
    incomeMinor,
    expenseMinor,
    netCashflowMinor,
    transferVolumeMinor,
    transactionCount,
    budget,
    categoryBreakdown,
    recentTransactions,
  };
}

function normalizeRouteTabParam(raw?: string | string[]): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') {
    return undefined;
  }
  return first.trim().toLowerCase();
}

const ACCOUNTS_TAB_MAP: Record<string, AccountsRouteTab> = {
  accounts: 'ACCOUNTS',
  paydays: 'PAYDAYS',
  'income-sources': 'PAYDAYS',
  income_sources: 'PAYDAYS',
  incomesources: 'PAYDAYS',
  income: 'PAYDAYS',
  salary: 'PAYDAYS',
};

const DEBTS_TAB_MAP: Record<string, DebtsRouteTab> = {
  all: 'ALL',
  'credit-cards': 'CREDIT_CARDS',
  credit_cards: 'CREDIT_CARDS',
  creditcards: 'CREDIT_CARDS',
  cards: 'CREDIT_CARDS',
  loans: 'LOANS',
  bills: 'BILLS',
  utilities: 'BILLS',
};

/**
 * Parses and normalizes the Accounts route tab query parameter.
 */
export function parseAccountsTabParam(raw?: string | string[]): AccountsRouteTab | undefined {
  const normalized = normalizeRouteTabParam(raw);
  return normalized ? ACCOUNTS_TAB_MAP[normalized] : undefined;
}

/**
 * Parses and normalizes the Debts & Bills route tab query parameter.
 */
export function parseDebtsTabParam(raw?: string | string[]): DebtsRouteTab | undefined {
  const normalized = normalizeRouteTabParam(raw);
  return normalized ? DEBTS_TAB_MAP[normalized] : undefined;
}

function resolveDueDateThisMonth(commitment: RecurringCommitment, now: Date): string {
  const nextDue = commitment.nextDueDate?.trim();
  if (nextDue && parseCalendarDate(nextDue)) {
    return nextDue;
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(commitment.dueDay, daysInMonth);
  return formatCalendarDateString(new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0));
}

/**
 * Summarizes scheduled commitments (bills, loans, card installments) for the current month.
 */
export function summarizeMonthlyPayables(
  commitments: readonly RecurringCommitment[],
  now = new Date(),
): MonthlyPayablesSummary {
  const period = formatCalendarDateString(now).slice(0, 7);

  let remainingMinor = 0;
  let overdueMinor = 0;
  let overdueCount = 0;
  let paidMinor = 0;
  let paidCount = 0;
  const remainingItems: MonthlyPayableItem[] = [];

  for (const c of commitments) {
    if (c.lastPaidPeriod && c.lastPaidPeriod >= period) {
      paidMinor += c.amountMinor;
      paidCount += 1;
      continue;
    }

    if (!c.isActive || isCommitmentPaidOff(c)) {
      continue;
    }

    const status = getCommitmentDueStatus(c, now);
    if (!status.isDueThisMonth) {
      continue;
    }

    remainingMinor += c.amountMinor;
    if (status.isOverdue) {
      overdueMinor += c.amountMinor;
      overdueCount += 1;
    }
    remainingItems.push({
      commitment: c,
      dueDate: resolveDueDateThisMonth(c, now),
      state: status.state,
    });
  }

  remainingItems.sort((a, b) => {
    const aOverdue = a.state === 'OVERDUE' ? 0 : 1;
    const bOverdue = b.state === 'OVERDUE' ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return b.commitment.amountMinor - a.commitment.amountMinor;
  });

  const totalDueMinor = remainingMinor + paidMinor;
  const paidPercent =
    totalDueMinor > 0 ? Math.min(100, Math.round((paidMinor * 100) / totalDueMinor)) : 0;

  return {
    period,
    remainingMinor,
    remainingCount: remainingItems.length,
    overdueMinor,
    overdueCount,
    paidMinor,
    paidCount,
    totalDueMinor,
    paidPercent,
    remainingItems,
  };
}
