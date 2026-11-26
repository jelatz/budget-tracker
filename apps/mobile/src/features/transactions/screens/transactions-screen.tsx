import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  getAccountTypeLabel,
  isTransactionInPeriod,
  type Account,
  type Category,
  type DashboardPeriod,
  type Transaction,
  type TransactionType,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';

import { TransactionFormModal } from '../components/transaction-form-modal';
import {
  useAccounts,
  useAllCategories,
  useDeleteTransaction,
  useTransactions,
} from '../hooks/use-transactions';

type FilterType = 'ALL' | TransactionType;
type SpendingPeriod = 'TODAY' | DashboardPeriod;

const PERIOD_OPTIONS: readonly { key: SpendingPeriod; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'LAST_7_DAYS', label: '7 Days' },
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'ALL_TIME', label: 'All Time' },
] as const;

const FILTER_OPTIONS: readonly { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'EXPENSE', label: 'Expenses' },
  { key: 'INCOME', label: 'Income' },
  { key: 'TRANSFER', label: 'Transfers' },
] as const;

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTransactionInSpendingPeriod(
  occurredAt: string,
  period: SpendingPeriod,
): boolean {
  if (period === 'TODAY') {
    const d = new Date(occurredAt);
    if (Number.isNaN(d.getTime())) {
      return false;
    }
    return isSameLocalDay(d, new Date());
  }
  return isTransactionInPeriod(occurredAt, period);
}

function formatTxDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch (error: unknown) {
    return isoString;
  }
}

function getTypeLabel(type: TransactionType): string {
  if (type === 'INCOME') return 'Income';
  if (type === 'TRANSFER') return 'Transfer';
  return 'Expense';
}

export interface TransactionsScreenProps {
  initialAccountId?: string;
  initialType?: TransactionType;
  initialCategoryId?: string;
}

export function TransactionsScreen({
  initialAccountId,
  initialType,
  initialCategoryId,
}: TransactionsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { showSuccess, showError } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  const [period, setPeriod] = useState<SpendingPeriod>('THIS_MONTH');
  const [filter, setFilter] = useState<FilterType>(initialType ?? 'ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategoryId ?? 'ALL',
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const { categories } = useAllCategories();
  const transactionsQuery = useTransactions();
  const transactions = transactionsQuery.data ?? [];

  const deleteTransactionMutation = useDeleteTransaction();

  useEffect(() => {
    if (initialType) {
      setFilter(initialType);
    }
  }, [initialType]);

  useEffect(() => {
    if (initialAccountId && accounts.some((a) => a.id === initialAccountId)) {
      setAccountFilter(initialAccountId);
    }
  }, [initialAccountId, accounts]);

  useEffect(() => {
    if (initialCategoryId) {
      setCategoryFilter(initialCategoryId);
      setFilter('EXPENSE');
    }
  }, [initialCategoryId]);

  const accountLookup = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of accounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [accounts]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  const selectedAccount =
    accountFilter !== 'ALL' ? (accountLookup.get(accountFilter) ?? null) : null;
  const selectedAccountName = selectedAccount?.name ?? 'Selected Account';

  const accountScopedTransactions = useMemo(() => {
    if (accountFilter === 'ALL') {
      return transactions;
    }
    return transactions.filter(
      (tx) => tx.accountId === accountFilter || tx.toAccountId === accountFilter,
    );
  }, [transactions, accountFilter]);

  const summaryKpis = useMemo(() => {
    let spentTodayMinor = 0;
    let spentThisMonthMinor = 0;
    let incomeThisMonthMinor = 0;
    const now = new Date();

    for (const tx of accountScopedTransactions) {
      const txDate = new Date(tx.occurredAt);
      if (tx.type === 'EXPENSE') {
        if (!Number.isNaN(txDate.getTime()) && isSameLocalDay(txDate, now)) {
          spentTodayMinor += tx.amountMinor;
        }
        if (isTransactionInPeriod(tx.occurredAt, 'THIS_MONTH')) {
          spentThisMonthMinor += tx.amountMinor;
        }
      } else if (
        tx.type === 'INCOME' &&
        isTransactionInPeriod(tx.occurredAt, 'THIS_MONTH')
      ) {
        incomeThisMonthMinor += tx.amountMinor;
      }
    }

    return {
      spentTodayMinor,
      spentThisMonthMinor,
      incomeThisMonthMinor,
    };
  }, [accountScopedTransactions]);

  const periodAndAccountTransactions = useMemo(() => {
    return accountScopedTransactions.filter((tx) =>
      isTransactionInSpendingPeriod(tx.occurredAt, period),
    );
  }, [accountScopedTransactions, period]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    let totalSpentMinor = 0;

    for (const tx of periodAndAccountTransactions) {
      if (tx.type !== 'EXPENSE') {
        continue;
      }
      const key = tx.categoryId ?? 'uncategorized';
      totals.set(key, (totals.get(key) ?? 0) + tx.amountMinor);
      totalSpentMinor += tx.amountMinor;
    }

    return Array.from(totals.entries())
      .map(([catId, amountMinor]) => {
        const category = categoryLookup.get(catId);
        return {
          categoryId: catId,
          name: category?.name ?? 'Uncategorized',
          color: category?.color ?? theme.primary,
          amountMinor,
          sharePercent:
            totalSpentMinor > 0
              ? Math.round((amountMinor / totalSpentMinor) * 100)
              : 0,
        };
      })
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }, [periodAndAccountTransactions, categoryLookup, theme.primary]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return periodAndAccountTransactions
      .filter((tx) => {
        if (filter !== 'ALL' && tx.type !== filter) {
          return false;
        }
        if (categoryFilter !== 'ALL') {
          if (tx.categoryId !== categoryFilter) {
            return false;
          }
        }

        if (normalizedQuery.length > 0) {
          const fromAccountName = accountLookup.get(tx.accountId)?.name ?? '';
          const toAccountName = tx.toAccountId
            ? (accountLookup.get(tx.toAccountId)?.name ?? '')
            : '';
          const catName = tx.categoryId
            ? (categoryLookup.get(tx.categoryId)?.name ?? '')
            : '';

          const haystack = [
            getTypeLabel(tx.type),
            tx.merchant ?? '',
            tx.note ?? '',
            fromAccountName,
            toAccountName,
            catName,
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
  }, [
    periodAndAccountTransactions,
    filter,
    categoryFilter,
    searchQuery,
    accountLookup,
    categoryLookup,
  ]);

  const handleOpenAdd = () => {
    setConfirmingDeleteId(null);
    setEditingTransaction(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
    setConfirmingDeleteId(null);
    setEditingTransaction(tx);
    setModalVisible(true);
  };

  const handleConfirmDelete = async (transactionId: string) => {
    try {
      await deleteTransactionMutation.mutateAsync(transactionId);
      setConfirmingDeleteId(null);
      showSuccess('Entry deleted and account balance restored.');
    } catch (error: unknown) {
      showError(
        getUserErrorMessage(
          error,
          'Could not delete entry. Please try again.',
        ),
      );
    }
  };

  const handleResetFilters = () => {
    setPeriod('THIS_MONTH');
    setFilter('ALL');
    setAccountFilter('ALL');
    setCategoryFilter('ALL');
    setSearchQuery('');
  };

  if (!isAuthenticated) {
    return null;
  }

  const hasActiveFilters =
    period !== 'THIS_MONTH' ||
    filter !== 'ALL' ||
    accountFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const summaryCurrency = selectedAccount?.currency ?? DEFAULT_CURRENCY;
  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 28);

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: scrollBottomPadding,
            ...(Platform.OS === 'web'
              ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
              : {}),
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Bar */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4">
            <View className="flex-1 min-w-[180px]">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Spending
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                Day-to-day expenses, swipes, income, and transfers
              </ThemedText>
            </View>

            <Pressable
              onPress={handleOpenAdd}
              accessibilityRole="button"
              accessibilityLabel="Add Entry"
              className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-4 py-2.5 rounded-full flex-row items-center gap-1.5"
            >
              <AppIcon name="add" size={16} color={theme.onPrimary} />
              <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-xs sm:text-sm">
                Add Entry
              </ThemedText>
            </Pressable>
          </View>

          {/* Summary Strip: Today, This Month, Income This Month */}
          <View className="flex-row flex-wrap gap-3 mb-4">
            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Spent Today
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-terracotta dark:text-ledger-terracotta-dark mt-1"
                numberOfLines={1}
              >
                {formatMinorUnits(summaryKpis.spentTodayMinor, summaryCurrency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Spent This Month
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-ink dark:text-ledger-ink-dark mt-1"
                numberOfLines={1}
              >
                {formatMinorUnits(summaryKpis.spentThisMonthMinor, summaryCurrency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-full'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Income This Month
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-pine dark:text-ledger-pine-dark mt-1"
                numberOfLines={1}
              >
                +{formatMinorUnits(summaryKpis.incomeThisMonthMinor, summaryCurrency)}
              </ThemedText>
            </View>
          </View>

          {/* Segmented Period Selector */}
          <View
            accessibilityRole="tablist"
            className="flex-row p-1 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark mb-4"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const isSelected = period === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPeriod(opt.key)}
                  accessibilityRole="tab"
                  accessibilityLabel={`Filter period ${opt.label}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-1 min-h-[44px] px-2 py-2 rounded-xl items-center justify-center ${
                    isSelected
                      ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      : 'active:opacity-75'
                  }`}
                >
                  <ThemedText
                    numberOfLines={1}
                    className={`text-xs font-bold ${
                      isSelected
                        ? 'text-ledger-ink dark:text-ledger-ink-dark'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Interactive Category Breakdown Pills */}
          {categoryBreakdown.length > 0 && (
            <View className="p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark mb-4 gap-2.5">
              <View className="flex-row items-center justify-between">
                <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Where Money Went ({PERIOD_OPTIONS.find((p) => p.key === period)?.label})
                </ThemedText>
                {categoryFilter !== 'ALL' ? (
                  <Pressable
                    onPress={() => setCategoryFilter('ALL')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear category filter"
                    className="min-h-[44px] px-2.5 justify-center"
                  >
                    <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                      Show All
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              <View className="flex-row flex-wrap gap-2">
                {categoryBreakdown.map((item) => {
                  const isSelected = categoryFilter === item.categoryId;
                  return (
                    <Pressable
                      key={item.categoryId}
                      onPress={() =>
                        setCategoryFilter((prev) =>
                          prev === item.categoryId ? 'ALL' : item.categoryId,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${item.name}`}
                      accessibilityState={{ selected: isSelected }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-2 ${
                        isSelected
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-80'
                      }`}
                    >
                      <View
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <ThemedText
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-brand-500 dark:text-brand-400'
                            : 'text-ledger-ink dark:text-ledger-ink-dark'
                        }`}
                      >
                        {item.name}
                      </ThemedText>
                      <ThemedText
                        numeric
                        style={TABULAR_NUMS_STYLE}
                        className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      >
                        {formatMinorUnits(item.amountMinor, summaryCurrency)} · {item.sharePercent}%
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Search Bar */}
          <View className="flex-row items-center gap-2 mb-3">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search store, category, account, or note..."
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Search entries"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 h-12 px-4 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
            />
            {searchQuery.trim().length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search query"
                className="min-h-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Clear
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {/* Type Filter Pills */}
          <View className="flex-row flex-wrap gap-2 mb-4">
            {FILTER_OPTIONS.map((opt) => {
              const isActive = filter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setFilter(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                  className={`min-h-[44px] px-4 py-2 rounded-full items-center justify-center active:opacity-80 ${
                    isActive
                      ? 'bg-brand-500 dark:bg-brand-400'
                      : 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                  }`}
                >
                  <ThemedText
                    className={`text-xs font-bold ${
                      isActive
                        ? 'text-ledger-canvas dark:text-brand-900'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Horizontal Accounts Filter Strip */}
          <View className="mb-4">
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2">
              Filter by Account
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="py-1"
            >
              {accounts.map((account) => {
                const formatted = formatMinorUnits(
                  account.balanceMinor,
                  account.currency,
                );
                const isSelected = accountFilter === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() =>
                      setAccountFilter((prev) =>
                        prev === account.id ? 'ALL' : account.id,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Filter by ${account.name} (${getAccountTypeLabel(
                      account.accountType,
                    )}), balance ${formatted}`}
                    className={`min-w-[155px] min-h-[44px] py-3 px-4 rounded-2xl border mr-2.5 active:opacity-80 ${
                      isSelected
                        ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                        : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                    }`}
                  >
                    <ThemedText
                      className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark mb-0.5"
                      numberOfLines={1}
                    >
                      {account.name}
                    </ThemedText>
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1">
                      {getAccountTypeLabel(account.accountType)}
                    </ThemedText>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {formatted}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Active Account Filter Pill */}
          {accountFilter !== 'ALL' ? (
            <View className="flex-row items-center mb-4">
              <Pressable
                onPress={() => setAccountFilter('ALL')}
                accessibilityRole="button"
                accessibilityLabel={`Clear account filter for ${selectedAccountName}`}
                className="min-h-[44px] px-4 py-2 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-500 dark:border-brand-400 active:opacity-80 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-brand-700 dark:text-brand-300">
                  Account: {selectedAccountName} · Clear
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* Transactions List Count Header */}
          <View className="flex-row items-center justify-between mb-3">
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Entries
            </ThemedText>
            <ThemedText
              numeric
              className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {filteredTransactions.length}{' '}
              {filteredTransactions.length === 1 ? 'entry' : 'entries'}
            </ThemedText>
          </View>

          {/* Transactions List, Loading, Error, or Empty State */}
          {transactionsQuery.isLoading ? (
            <View className="p-8 items-center justify-center gap-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Loading spending ledger...
              </ThemedText>
            </View>
          ) : transactionsQuery.isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-2">
              <AppIcon name="warning" size={24} color={theme.negative} />
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
              >
                Could not load your spending entries right now.
              </ThemedText>
              <Pressable
                onPress={() => transactionsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading entries"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View className="p-8 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-2">
              <AppIcon name="expenses" size={28} color={theme.textMuted} />
              <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                No Entries Found
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[300px] leading-relaxed">
                {transactions.length === 0
                  ? 'Tap Add Entry to log your first expense, credit card swipe, or salary payout.'
                  : 'No entries match your active period, category, account, or search filter.'}
              </ThemedText>
              {transactions.length > 0 || hasActiveFilters ? (
                <Pressable
                  onPress={handleResetFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Reset Filters"
                  className="min-h-[44px] bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-80 px-6 py-3 rounded-xl mt-2 items-center justify-center"
                >
                  <ThemedText className="text-ledger-ink dark:text-ledger-ink-dark font-bold text-sm">
                    Reset Filters
                  </ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleOpenAdd}
                  accessibilityRole="button"
                  accessibilityLabel="Add First Entry"
                  className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-6 py-3 rounded-xl mt-2 items-center justify-center"
                >
                  <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-sm">
                    Add First Entry
                  </ThemedText>
                </Pressable>
              )}
            </View>
          ) : (
            <View className="gap-3">
              {filteredTransactions.map((tx) => (
                <TransactionItemCard
                  key={tx.id}
                  transaction={tx}
                  categoryLookup={categoryLookup}
                  accountLookup={accountLookup}
                  isConfirmingDelete={confirmingDeleteId === tx.id}
                  isDeleting={
                    deleteTransactionMutation.isPending && confirmingDeleteId === tx.id
                  }
                  onEdit={() => handleOpenEdit(tx)}
                  onRequestDelete={() => setConfirmingDeleteId(tx.id)}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                  onConfirmDelete={() => handleConfirmDelete(tx.id)}
                />
              ))}
            </View>
          )}

          <View className="h-6" />
        </ScrollView>

        <TransactionFormModal
          visible={modalVisible}
          editingTransaction={editingTransaction}
          initialType={initialType}
          initialAccountId={
            accountFilter !== 'ALL' ? accountFilter : initialAccountId
          }
          accounts={accounts}
          categories={categories}
          onClose={() => {
            setModalVisible(false);
            setEditingTransaction(null);
          }}
          onSaved={showSuccess}
          onDeleted={showSuccess}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

interface TransactionItemCardProps {
  transaction: Transaction;
  categoryLookup: ReadonlyMap<string, Category>;
  accountLookup: ReadonlyMap<string, Account>;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function TransactionItemCard({
  transaction: tx,
  categoryLookup,
  accountLookup,
  isConfirmingDelete,
  isDeleting,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: TransactionItemCardProps) {
  const fromAccount = accountLookup.get(tx.accountId);
  const toAccount = tx.toAccountId ? accountLookup.get(tx.toAccountId) : undefined;

  let amountPrefix = '- ';
  let amountColorClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';

  if (tx.type === 'INCOME') {
    amountPrefix = '+ ';
    amountColorClass = 'text-ledger-pine dark:text-ledger-pine-dark';
  } else if (tx.type === 'TRANSFER') {
    amountPrefix = '';
    amountColorClass = 'text-ledger-teal dark:text-ledger-teal-dark';
  }

  const formattedAmount = `${amountPrefix}${formatMinorUnits(
    tx.amountMinor,
    tx.currency,
  )}`;

  const isTransfer = tx.type === 'TRANSFER';
  const categoryName = tx.categoryId
    ? (categoryLookup.get(tx.categoryId)?.name ?? 'Uncategorized')
    : 'Uncategorized';

  const title = isTransfer
    ? `${fromAccount?.name ?? 'Account'} -> ${toAccount?.name ?? 'Account'}`
    : tx.merchant?.trim() || categoryName;

  const metadataLine = isTransfer
    ? `Transfer · ${formatTxDate(tx.occurredAt)}`
    : `${categoryName} · ${fromAccount?.name ?? 'Account'} · ${formatTxDate(tx.occurredAt)}`;

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0 gap-0.5">
          <ThemedText
            className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
            numberOfLines={1}
          >
            {title}
          </ThemedText>

          <ThemedText
            numeric
            className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            numberOfLines={1}
          >
            {metadataLine}
          </ThemedText>
        </View>

        <ThemedText
          numeric
          style={TABULAR_NUMS_STYLE}
          className={`text-base font-extrabold tracking-tight ${amountColorClass}`}
        >
          {formattedAmount}
        </ThemedText>
      </View>

      {tx.note ? (
        <ThemedText
          className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
          numberOfLines={2}
        >
          {tx.note}
        </ThemedText>
      ) : null}

      {/* Action Row: Edit & Inline Two-Step Delete */}
      <View className="border-t border-ledger-border dark:border-ledger-border-dark pt-2.5 flex-row justify-between items-center gap-2">
        {tx.commitmentId ? (
          <View className="px-2.5 py-0.5 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark">
            <ThemedText className="text-[11px] font-semibold text-ledger-teal dark:text-ledger-teal-dark">
              Obligation Payment
            </ThemedText>
          </View>
        ) : (
          <View />
        )}

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onEdit}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel={`Edit entry ${title}`}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
              Edit
            </ThemedText>
          </Pressable>

          {isConfirmingDelete ? (
            <>
              <Pressable
                onPress={onCancelDelete}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel delete"
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Cancel
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={onConfirmDelete}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete"
                className={`min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85 ${
                  isDeleting ? 'opacity-60' : ''
                }`}
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  {isDeleting ? 'Deleting...' : 'Confirm'}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onRequestDelete}
              accessibilityRole="button"
              accessibilityLabel={`Delete entry ${title}`}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                Delete
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
