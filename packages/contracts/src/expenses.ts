import { z } from 'zod';
import { isTransactionInPeriod, type DashboardPeriod } from './dashboard';
import type { Account, Category, Transaction } from './transactions.schema';

export const recordedExpenseTypeFilterSchema = z.enum(['ALL', 'ONE_TIME', 'SCHEDULED']);
export type RecordedExpenseTypeFilter = z.infer<typeof recordedExpenseTypeFilterSchema>;
export type RecordedExpenseOrigin = 'ONE_TIME' | 'SCHEDULED';

/**
 * Returns true if a posted expense originated from a scheduled bill, loan, or installment payment.
 */
export function isScheduledRecordedExpense(
  tx: Pick<Transaction, 'commitmentId'>,
): boolean {
  return Boolean(tx.commitmentId);
}

/**
 * Computes counts for All, One-Time, and Scheduled posted expenses.
 */
export function computeRecordedExpenseTypeCounts(
  expenses: readonly Transaction[],
): Record<RecordedExpenseTypeFilter, number> {
  let oneTime = 0;
  let scheduled = 0;

  for (const tx of expenses) {
    if (tx.type !== 'EXPENSE') {
      continue;
    }
    if (isScheduledRecordedExpense(tx)) {
      scheduled += 1;
    } else {
      oneTime += 1;
    }
  }

  return {
    ALL: oneTime + scheduled,
    ONE_TIME: oneTime,
    SCHEDULED: scheduled,
  };
}

export interface TopExpenseCategory {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amountMinor: number;
  percentage: number;
  count: number;
}

export interface ExpenseSummaryMetrics {
  totalMinor: number;
  expenseCount: number;
  averageMinor: number;
  topCategory: TopExpenseCategory | null;
  categoryCounts: Record<string, number>;
}

/**
 * Formats an ISO timestamp string into local `YYYY-MM-DD`.
 * Falls back to `fallback` (or current Date) when invalid.
 */
export function formatDateInputValue(isoString: string, fallback?: Date): string {
  const parsed = new Date(isoString);
  const target = Number.isNaN(parsed.getTime()) ? (fallback ?? new Date()) : parsed;
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a strict `YYYY-MM-DD` local calendar date string into an ISO 8601 timestamp.
 * Preserves local time-of-day from `preserveTimeFromIso` when valid, otherwise defaults to 12:00:00.
 * Returns null for invalid format or non-existent calendar dates (e.g. `2026-02-31`).
 */
export function parseDateInputToIso(
  dateInput: string,
  preserveTimeFromIso?: string,
): string | null {
  const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  let hours = 12;
  let minutes = 0;
  let seconds = 0;
  let ms = 0;

  if (preserveTimeFromIso) {
    const existing = new Date(preserveTimeFromIso);
    if (!Number.isNaN(existing.getTime())) {
      hours = existing.getHours();
      minutes = existing.getMinutes();
      seconds = existing.getSeconds();
      ms = existing.getMilliseconds();
    }
  }

  const constructed = new Date(year, month - 1, day, hours, minutes, seconds, ms);
  if (
    constructed.getFullYear() !== year ||
    constructed.getMonth() !== month - 1 ||
    constructed.getDate() !== day
  ) {
    return null;
  }

  return constructed.toISOString();
}

/**
 * Returns true if an expense matches `categoryId`.
 */
export function expenseMatchesCategory(tx: Transaction, categoryId: string): boolean {
  return tx.categoryId === categoryId;
}

/**
 * Filters transactions to EXPENSE entries matching period, type, category,
 * account, and case-insensitive search query, sorted by occurredAt desc then createdAt desc.
 */
export function filterExpenses(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  accounts: readonly Account[];
  period: DashboardPeriod;
  expenseType?: RecordedExpenseTypeFilter;
  categoryId?: string;
  accountId?: string;
  searchQuery?: string;
  now?: Date;
}): Transaction[] {
  const now = params.now ?? new Date();
  const normalizedQuery = params.searchQuery?.trim().toLowerCase() ?? '';

  const categoryLookup = new Map<string, Category>();
  for (const cat of params.categories) {
    categoryLookup.set(cat.id, cat);
  }

  const accountLookup = new Map<string, Account>();
  for (const acc of params.accounts) {
    accountLookup.set(acc.id, acc);
  }

  return params.transactions
    .filter((tx) => {
      if (tx.type !== 'EXPENSE') {
        return false;
      }

      if (!isTransactionInPeriod(tx.occurredAt, params.period, now)) {
        return false;
      }

      if (params.expenseType === 'ONE_TIME' && isScheduledRecordedExpense(tx)) {
        return false;
      }
      if (params.expenseType === 'SCHEDULED' && !isScheduledRecordedExpense(tx)) {
        return false;
      }

      if (params.categoryId && params.categoryId !== 'ALL') {
        if (!expenseMatchesCategory(tx, params.categoryId)) {
          return false;
        }
      }

      if (params.accountId && params.accountId !== 'ALL') {
        if (tx.accountId !== params.accountId) {
          return false;
        }
      }

      if (normalizedQuery.length > 0) {
        const accountName = accountLookup.get(tx.accountId)?.name ?? '';
        const categoryName = tx.categoryId
          ? (categoryLookup.get(tx.categoryId)?.name ?? '')
          : '';

        const haystack = [
          tx.merchant ?? '',
          tx.note ?? '',
          accountName,
          categoryName,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    })
    .slice()
    .sort((a, b) => {
      const occurredDiff =
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      if (occurredDiff !== 0) {
        return occurredDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

/**
 * Computes integer minor-unit summary metrics and category counts for expenses.
 */
export function computeExpenseSummary(params: {
  expenses: readonly Transaction[];
  categories: readonly Category[];
}): ExpenseSummaryMetrics {
  const expenses = params.expenses.filter((tx) => tx.type === 'EXPENSE');
  const expenseCount = expenses.length;
  const totalMinor = expenses.reduce((sum, tx) => sum + tx.amountMinor, 0);
  const averageMinor = expenseCount > 0 ? Math.round(totalMinor / expenseCount) : 0;

  const categoryLookup = new Map<string, Category>();
  for (const cat of params.categories) {
    categoryLookup.set(cat.id, cat);
  }

  const totalsMap = new Map<string, { amountMinor: number; count: number }>();
  const categoryCounts: Record<string, number> = {};

  for (const tx of expenses) {
    if (tx.categoryId) {
      const entry = totalsMap.get(tx.categoryId) ?? { amountMinor: 0, count: 0 };
      entry.amountMinor += tx.amountMinor;
      entry.count += 1;
      categoryCounts[tx.categoryId] = (categoryCounts[tx.categoryId] ?? 0) + 1;
      totalsMap.set(tx.categoryId, entry);
    }
  }

  const rankedCategories: TopExpenseCategory[] = Array.from(totalsMap.entries())
    .map(([categoryId, data]) => {
      const cat = categoryLookup.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? 'Uncategorized',
        icon: cat?.icon ?? '🏷️',
        color: cat?.color ?? '#64748B',
        amountMinor: data.amountMinor,
        percentage: totalMinor > 0 ? Math.round((data.amountMinor * 100) / totalMinor) : 0,
        count: data.count,
      };
    })
    .sort((a, b) => {
      if (b.amountMinor !== a.amountMinor) {
        return b.amountMinor - a.amountMinor;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });

  return {
    totalMinor,
    expenseCount,
    averageMinor,
    topCategory: rankedCategories[0] ?? null,
    categoryCounts,
  };
}
