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

import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';

import { TransactionFormModal } from '../components/transaction-form-modal';
import {
  useAccounts,
  useAllCategories,
  useDeleteTransaction,
  useTransactions,
} from '../hooks/use-transactions';

type FilterType = 'ALL' | TransactionType;

const PERIOD_OPTIONS: readonly { key: DashboardPeriod; label: string }[] = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { key: 'ALL_TIME', label: 'All Time' },
] as const;

const FILTER_OPTIONS: readonly { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'INCOME', label: 'Incoming' },
  { key: 'EXPENSE', label: 'Outgoing' },
  { key: 'TRANSFER', label: 'Transfers' },
] as const;

function formatTxDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}, ${d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error: unknown) {
    return isoString;
  }
}

function getTypeLabel(type: TransactionType): string {
  if (type === 'INCOME') return 'Incoming';
  if (type === 'TRANSFER') return 'Transfer';
  return 'Outgoing';
}

export interface TransactionsScreenProps {
  initialAccountId?: string;
  initialType?: TransactionType;
}

export function TransactionsScreen({
  initialAccountId,
  initialType,
}: TransactionsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');
  const [filter, setFilter] = useState<FilterType>(initialType ?? 'ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    if (!toastMessage) {
      return;
    }
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

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

  const periodAndAccountTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!isTransactionInPeriod(tx.occurredAt, period)) {
        return false;
      }
      if (
        accountFilter !== 'ALL' &&
        tx.accountId !== accountFilter &&
        tx.toAccountId !== accountFilter
      ) {
        return false;
      }
      return true;
    });
  }, [transactions, period, accountFilter]);

  const kpiSummary = useMemo(() => {
    let incomingMinor = 0;
    let outgoingMinor = 0;
    let transferMinor = 0;

    for (const tx of periodAndAccountTransactions) {
      if (tx.type === 'INCOME') {
        incomingMinor += tx.amountMinor;
      } else if (tx.type === 'EXPENSE') {
        outgoingMinor += tx.amountMinor;
      } else if (tx.type === 'TRANSFER') {
        transferMinor += tx.amountMinor;
      }
    }

    return {
      incomingMinor,
      outgoingMinor,
      transferMinor,
      netCashflowMinor: incomingMinor - outgoingMinor,
    };
  }, [periodAndAccountTransactions]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return periodAndAccountTransactions
      .filter((tx) => {
        if (filter !== 'ALL' && tx.type !== filter) {
          return false;
        }

        if (normalizedQuery.length > 0) {
          const fromAccountName = accountLookup.get(tx.accountId)?.name ?? '';
          const toAccountName = tx.toAccountId
            ? (accountLookup.get(tx.toAccountId)?.name ?? '')
            : '';

          const categoryParts: string[] = [];
          if (tx.splits && tx.splits.length > 0) {
            for (const split of tx.splits) {
              const cat = categoryLookup.get(split.categoryId);
              if (cat) categoryParts.push(cat.name);
              if (split.note) categoryParts.push(split.note);
            }
          } else if (tx.categoryId) {
            const cat = categoryLookup.get(tx.categoryId);
            if (cat) categoryParts.push(cat.name);
          }

          const tagParts = tx.tags.map((tag) => `${tag} #${tag}`);
          const haystack = [
            getTypeLabel(tx.type),
            tx.merchant ?? '',
            tx.note ?? '',
            fromAccountName,
            toAccountName,
            ...categoryParts,
            ...tagParts,
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
    searchQuery,
    accountLookup,
    categoryLookup,
  ]);

  const handleOpenAdd = () => {
    setActionError(null);
    setConfirmingDeleteId(null);
    setEditingTransaction(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
    setActionError(null);
    setConfirmingDeleteId(null);
    setEditingTransaction(tx);
    setModalVisible(true);
  };

  const handleConfirmDelete = async (transactionId: string) => {
    setActionError(null);
    try {
      await deleteTransactionMutation.mutateAsync(transactionId);
      setConfirmingDeleteId(null);
      setToastMessage('Transaction deleted.');
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Could not delete transaction. Please try again.',
      );
    }
  };

  const handleResetFilters = () => {
    setPeriod('THIS_MONTH');
    setFilter('ALL');
    setAccountFilter('ALL');
    setSearchQuery('');
  };

  if (!isAuthenticated) {
    return null;
  }

  const hasActiveFilters =
    period !== 'THIS_MONTH' ||
    filter !== 'ALL' ||
    accountFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const summaryCurrency = selectedAccount?.currency ?? DEFAULT_CURRENCY;
  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 24);
  const netCashflowFormatted =
    kpiSummary.netCashflowMinor > 0
      ? `+${formatMinorUnits(kpiSummary.netCashflowMinor, summaryCurrency)}`
      : formatMinorUnits(kpiSummary.netCashflowMinor, summaryCurrency);

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
                Transactions
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                Incoming, outgoing, and account transfers
              </ThemedText>
            </View>

            <Pressable
              onPress={handleOpenAdd}
              accessibilityRole="button"
              accessibilityLabel="Add Transaction"
              className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-4 py-2.5 rounded-full items-center justify-center"
            >
              <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-xs sm:text-sm">
                Add Transaction
              </ThemedText>
            </Pressable>
          </View>

          {/* Toast Banner */}
          {toastMessage ? (
            <View
              accessibilityRole="status"
              className="mb-4 p-3.5 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
            >
              <ThemedText className="flex-1 text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                {toastMessage}
              </ThemedText>
              <Pressable
                onPress={() => setToastMessage(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                className="min-h-[44px] px-3 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark">
                  Dismiss
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* Inline Error Alert */}
          {actionError ? (
            <View
              accessibilityRole="alert"
              className="mb-4 p-3.5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
            >
              <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                {actionError}
              </ThemedText>
              <Pressable
                onPress={() => setActionError(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                className="min-h-[44px] px-3 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  Dismiss
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

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
                  className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl items-center justify-center ${
                    isSelected
                      ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      : 'active:opacity-75'
                  }`}
                >
                  <ThemedText
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

          {/* 4 Summary KPI Cards */}
          <View className="flex-row flex-wrap gap-3 mb-5">
            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Incoming
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-pine dark:text-ledger-pine-dark mt-1"
                numberOfLines={1}
              >
                +{formatMinorUnits(kpiSummary.incomingMinor, summaryCurrency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Outgoing
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-terracotta dark:text-ledger-terracotta-dark mt-1"
                numberOfLines={1}
              >
                -{formatMinorUnits(kpiSummary.outgoingMinor, summaryCurrency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Transfers
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-teal dark:text-ledger-teal-dark mt-1"
                numberOfLines={1}
              >
                {formatMinorUnits(kpiSummary.transferMinor, summaryCurrency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Net Cashflow
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className={`text-base sm:text-lg font-extrabold mt-1 ${
                  kpiSummary.netCashflowMinor >= 0
                    ? 'text-ledger-pine dark:text-ledger-pine-dark'
                    : 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                }`}
                numberOfLines={1}
              >
                {netCashflowFormatted}
              </ThemedText>
            </View>
          </View>

          {/* Search Bar */}
          <View className="flex-row items-center gap-2 mb-4">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search merchant, category, account, note, or tag..."
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Search transactions"
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
              Accounts
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
              Ledger Entries
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
                Loading transactions...
              </ThemedText>
            </View>
          ) : transactionsQuery.isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-2">
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
              >
                Could not load transaction history right now.
              </ThemedText>
              <Pressable
                onPress={() => transactionsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading transactions"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View className="p-8 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-2">
              <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                No Transactions Found
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[300px] leading-relaxed">
                {transactions.length === 0
                  ? 'Add your first incoming, outgoing, or transfer entry to get started.'
                  : 'No recorded transactions match your current period, account, type, or search filters.'}
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
                  accessibilityLabel="Add First Transaction"
                  className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-6 py-3 rounded-xl mt-2 items-center justify-center"
                >
                  <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-sm">
                    Add First Transaction
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
          onSaved={(message) => setToastMessage(message)}
          onDeleted={(message) => setToastMessage(message)}
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
  let badgeClass =
    'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-border dark:border-ledger-border-dark';
  let badgeTextClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
  let amountColorClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';

  if (tx.type === 'INCOME') {
    amountPrefix = '+ ';
    badgeClass =
      'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-border dark:border-ledger-border-dark';
    badgeTextClass = 'text-ledger-pine dark:text-ledger-pine-dark';
    amountColorClass = 'text-ledger-pine dark:text-ledger-pine-dark';
  } else if (tx.type === 'TRANSFER') {
    amountPrefix = '';
    badgeClass =
      'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border-ledger-border dark:border-ledger-border-dark';
    badgeTextClass = 'text-ledger-teal dark:text-ledger-teal-dark';
    amountColorClass = 'text-ledger-teal dark:text-ledger-teal-dark';
  }

  const formattedAmount = `${amountPrefix}${formatMinorUnits(
    tx.amountMinor,
    tx.currency,
  )}`;

  const isTransfer = tx.type === 'TRANSFER';
  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

  let title = 'Uncategorized';
  if (isTransfer) {
    title = `Transfer: ${fromAccount?.name ?? 'Account'} -> ${
      toAccount?.name ?? 'Account'
    }`;
  } else if (isSplit) {
    title = `Split (${tx.splits?.length ?? 0})`;
  } else if (tx.categoryId) {
    title = categoryLookup.get(tx.categoryId)?.name ?? 'Uncategorized';
  }

  const hasMetadata = Boolean(
    tx.merchant || (tx.tags && tx.tags.length > 0) || tx.note,
  );

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-2.5">
      {/* Top Row: Type Badge + Title / Date+Account + Signed Amount */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0 gap-1">
          <View className="flex-row items-center gap-2 flex-wrap">
            <View className={`px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
              <ThemedText className={`text-[11px] font-bold ${badgeTextClass}`}>
                {getTypeLabel(tx.type)}
              </ThemedText>
            </View>
            <ThemedText
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark flex-shrink"
              numberOfLines={1}
            >
              {title}
            </ThemedText>
          </View>

          <ThemedText
            numeric
            className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            numberOfLines={1}
          >
            {formatTxDate(tx.occurredAt)} · {fromAccount?.name ?? 'Account'}
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

      {/* Optional Split Breakdown Rows */}
      {isSplit && tx.splits && tx.splits.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {tx.splits.map((split) => {
            const splitCat = categoryLookup.get(split.categoryId);
            return (
              <View
                key={split.id}
                className="px-2.5 py-1 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark"
              >
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {splitCat?.name ?? 'Category'}:{' '}
                  {formatMinorUnits(split.amountMinor, tx.currency)}
                  {split.note ? ` · ${split.note}` : ''}
                </ThemedText>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Optional Metadata Tags */}
      {hasMetadata ? (
        <View className="flex-row flex-wrap items-center gap-2 pt-0.5">
          {tx.merchant ? (
            <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                Merchant: {tx.merchant}
              </ThemedText>
            </View>
          ) : null}

          {tx.tags && tx.tags.length > 0
            ? tx.tags.map((tag) => (
                <View
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText
                    className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    numberOfLines={1}
                  >
                    #{tag}
                  </ThemedText>
                </View>
              ))
            : null}

          {tx.note ? (
            <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[240px]"
                numberOfLines={1}
              >
                Note: {tx.note}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Action Row: Edit & Inline Two-Step Delete */}
      <View className="border-t border-ledger-border dark:border-ledger-border-dark pt-2.5 flex-row justify-end items-center gap-2">
        <Pressable
          onPress={onEdit}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel={`Edit transaction ${title}`}
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
            accessibilityLabel={`Delete transaction ${title}`}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
              Delete
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}
