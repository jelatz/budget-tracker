import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  getAccountTypeLabel,
  isTransactionInPeriod,
  type Account,
  type BalanceReconciliation,
  type Category,
  type DashboardPeriod,
  type Transaction,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { BottomTabInset, WebMaxPageWidth } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useAllCategories,
  useReconciliations,
  useTransactions,
} from '@/features/transactions/hooks/use-transactions';

export type HistoryKindFilter =
  | 'ALL'
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'RECONCILIATION';

export interface HistoryScreenProps {
  initialAccountId?: string;
  initialKind?: HistoryKindFilter;
}

const PERIOD_OPTIONS: readonly { key: DashboardPeriod; label: string }[] = [
  { key: 'ALL_TIME', label: 'All Time' },
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
] as const;

const KIND_OPTIONS: readonly { key: HistoryKindFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'INCOME', label: 'Incoming' },
  { key: 'EXPENSE', label: 'Outgoing' },
  { key: 'TRANSFER', label: 'Transfers' },
  { key: 'RECONCILIATION', label: 'Reconciliations' },
] as const;

type HistoryEntry =
  | {
      entryKey: string;
      kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
      occurredAt: string;
      timestampMs: number;
      accountId: string;
      toAccountId?: string;
      transaction: Transaction;
      title: string;
      monogram: string;
      searchIndex: string;
    }
  | {
      entryKey: string;
      kind: 'RECONCILIATION';
      occurredAt: string;
      timestampMs: number;
      accountId: string;
      reconciliation: BalanceReconciliation;
      title: string;
      monogram: string;
      linkedNote?: string;
      searchIndex: string;
    };

function parseTimestampMs(isoString: string): number {
  const ms = new Date(isoString).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function formatEntryDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return `${date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })} · ${date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error: unknown) {
    return error instanceof Error ? isoString : isoString;
  }
}

function getMonogram(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return 'LG';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

export function HistoryScreen({ initialAccountId, initialKind }: HistoryScreenProps = {}) {
  const { isAuthenticated, isHydrating } = useRequireAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [period, setPeriod] = useState<DashboardPeriod>('ALL_TIME');
  const [kindFilter, setKindFilter] = useState<HistoryKindFilter>(initialKind ?? 'ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const transactionsQuery = useTransactions();
  const reconciliationsQuery = useReconciliations();
  const accountsQuery = useAccounts();
  const categoriesQuery = useAllCategories();

  const transactions = transactionsQuery.data ?? [];
  const reconciliations = reconciliationsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.categories;

  useEffect(() => {
    if (initialAccountId && accounts.some((account) => account.id === initialAccountId)) {
      setAccountFilter(initialAccountId);
    }
  }, [initialAccountId, accounts]);

  useEffect(() => {
    if (initialKind) {
      setKindFilter(initialKind);
    }
  }, [initialKind]);

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>();
    for (const account of accounts) {
      map.set(account.id, account);
    }
    return map;
  }, [accounts]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const category of categories) {
      map.set(category.id, category);
    }
    return map;
  }, [categories]);

  const transactionsById = useMemo(() => {
    const map = new Map<string, Transaction>();
    for (const tx of transactions) {
      map.set(tx.id, tx);
    }
    return map;
  }, [transactions]);

  const unifiedEntries = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [];

    for (const tx of transactions) {
      const fromAccount = accountsById.get(tx.accountId);
      const toAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined;
      const isTransfer = tx.type === 'TRANSFER';
      const isSplit = Boolean(tx.splits && tx.splits.length > 0);

      let title = 'Uncategorized';
      let monogram = 'UC';
      const splitCategoryNames: string[] = [];

      if (isTransfer) {
        const fromName = fromAccount?.name ?? 'Account';
        const toName = toAccount?.name ?? 'Account';
        title = `Transfer: ${fromName} -> ${toName}`;
        monogram = 'TR';
      } else if (isSplit && tx.splits) {
        title = `Split (${tx.splits.length} categories)`;
        monogram = 'SP';
        for (const split of tx.splits) {
          const splitCategory = categoriesById.get(split.categoryId);
          if (splitCategory?.name) {
            splitCategoryNames.push(splitCategory.name);
          }
          if (split.note) {
            splitCategoryNames.push(split.note);
          }
        }
      } else if (tx.categoryId) {
        const category = categoriesById.get(tx.categoryId);
        if (category) {
          title = category.name;
          monogram = getMonogram(category.name);
        }
      }

      const searchParts = [
        title,
        tx.type,
        fromAccount?.name ?? '',
        fromAccount ? getAccountTypeLabel(fromAccount.accountType) : '',
        toAccount?.name ?? '',
        toAccount ? getAccountTypeLabel(toAccount.accountType) : '',
        tx.merchant ?? '',
        tx.note ?? '',
        ...(tx.tags ?? []),
        ...splitCategoryNames,
      ];

      entries.push({
        entryKey: `tx-${tx.id}`,
        kind: tx.type,
        occurredAt: tx.occurredAt,
        timestampMs: parseTimestampMs(tx.occurredAt),
        accountId: tx.accountId,
        toAccountId: tx.toAccountId,
        transaction: tx,
        title,
        monogram,
        searchIndex: searchParts.join(' ').toLowerCase(),
      });
    }

    for (const rec of reconciliations) {
      const account = accountsById.get(rec.accountId);
      const accountName = account?.name ?? 'Account';
      const linkedTx = rec.adjustmentTransactionId
        ? transactionsById.get(rec.adjustmentTransactionId)
        : undefined;
      const linkedNote = linkedTx?.note?.trim() || undefined;
      const title = `Balance Adjustment · ${accountName}`;

      const searchParts = [
        'reconciliation',
        'balance adjustment',
        accountName,
        account ? getAccountTypeLabel(account.accountType) : '',
        linkedNote ?? '',
        rec.adjustmentTransactionId ? 'auto-adjusted' : 'matched',
      ];

      entries.push({
        entryKey: `rec-${rec.id}`,
        kind: 'RECONCILIATION',
        occurredAt: rec.reconciledAt,
        timestampMs: parseTimestampMs(rec.reconciledAt),
        accountId: rec.accountId,
        reconciliation: rec,
        title,
        monogram: 'RC',
        linkedNote,
        searchIndex: searchParts.join(' ').toLowerCase(),
      });
    }

    entries.sort((a, b) => {
      if (b.timestampMs !== a.timestampMs) {
        return b.timestampMs - a.timestampMs;
      }
      return b.entryKey.localeCompare(a.entryKey);
    });

    return entries;
  }, [transactions, reconciliations, accountsById, categoriesById, transactionsById]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    return unifiedEntries.filter((entry) => {
      if (!isTransactionInPeriod(entry.occurredAt, period)) {
        return false;
      }
      if (kindFilter !== 'ALL' && entry.kind !== kindFilter) {
        return false;
      }
      if (
        accountFilter !== 'ALL' &&
        entry.accountId !== accountFilter &&
        (entry.kind !== 'TRANSFER' || entry.toAccountId !== accountFilter)
      ) {
        return false;
      }
      if (normalizedSearch.length > 0 && !entry.searchIndex.includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [unifiedEntries, period, kindFilter, accountFilter, normalizedSearch]);

  const hasActiveFilters =
    period !== 'ALL_TIME' ||
    kindFilter !== 'ALL' ||
    accountFilter !== 'ALL' ||
    normalizedSearch.length > 0;

  const handleResetFilters = () => {
    setPeriod('ALL_TIME');
    setKindFilter('ALL');
    setAccountFilter('ALL');
    setSearchQuery('');
  };

  const isLoading =
    transactionsQuery.isLoading ||
    reconciliationsQuery.isLoading ||
    accountsQuery.isLoading ||
    categoriesQuery.isLoading;

  const isError =
    transactionsQuery.isError ||
    reconciliationsQuery.isError ||
    accountsQuery.isError ||
    categoriesQuery.isError;

  const handleRetry = () => {
    if (transactionsQuery.isError) {
      void transactionsQuery.refetch();
    }
    if (reconciliationsQuery.isError) {
      void reconciliationsQuery.refetch();
    }
    if (accountsQuery.isError) {
      void accountsQuery.refetch();
    }
    if (categoriesQuery.isError) {
      void categoriesQuery.refetch();
    }
  };

  if (isHydrating) {
    return (
      <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark items-center justify-center">
        <SafeAreaView style={{ flex: 1 }} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.primary} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 24);
  const selectedAccount = accounts.find((account) => account.id === accountFilter);

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1"
        >
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
            <View className="flex-row flex-wrap items-end justify-between gap-2 mb-4">
              <View className="flex-1 min-w-[180px]">
                <ThemedText
                  accessibilityRole="header"
                  className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  History
                </ThemedText>
                <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                  Read-only chronological ledger audit log
                </ThemedText>
              </View>

              <View className="px-3.5 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                <ThemedText
                  numeric
                  className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
                </ThemedText>
              </View>
            </View>

            {/* Search Input */}
            <View className="mb-4">
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search history by category, account, merchant, note, or tag..."
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel="Search history"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                />
                {searchQuery.length > 0 && (
                  <Pressable
                    onPress={() => setSearchQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search query"
                    className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-80"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Clear
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Period Filter Pills */}
            <View className="mb-3">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2">
                Period
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {PERIOD_OPTIONS.map((option) => {
                  const isActive = period === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setPeriod(option.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter period by ${option.label}`}
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
                            ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                            : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                        }`}
                      >
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Kind Filter Pills */}
            <View className="mb-3">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2">
                Entry Type
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {KIND_OPTIONS.map((option) => {
                  const isActive = kindFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setKindFilter(option.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter entry type by ${option.label}`}
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
                            ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                            : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                        }`}
                      >
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Horizontal Account Filter Bar */}
            <View className="mb-5">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2">
                Account
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                <Pressable
                  onPress={() => setAccountFilter('ALL')}
                  accessibilityRole="button"
                  accessibilityLabel="Filter by All Accounts"
                  accessibilityState={{ selected: accountFilter === 'ALL' }}
                  className={`min-h-[44px] px-4 py-2 rounded-2xl border items-center justify-center active:opacity-80 ${
                    accountFilter === 'ALL'
                      ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                      : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                  }`}
                >
                  <ThemedText
                    className={`text-xs font-bold ${
                      accountFilter === 'ALL'
                        ? 'text-brand-500 dark:text-brand-400'
                        : 'text-ledger-ink dark:text-ledger-ink-dark'
                    }`}
                  >
                    All Accounts
                  </ThemedText>
                </Pressable>

                {accounts.map((account) => {
                  const isSelected = accountFilter === account.id;
                  const typeLabel = getAccountTypeLabel(account.accountType);
                  return (
                    <Pressable
                      key={account.id}
                      onPress={() =>
                        setAccountFilter((prev) => (prev === account.id ? 'ALL' : account.id))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${account.name} (${typeLabel})`}
                      accessibilityState={{ selected: isSelected }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-2xl border justify-center active:opacity-80 ${
                        isSelected
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          isSelected
                            ? 'text-brand-500 dark:text-brand-400'
                            : 'text-ledger-ink dark:text-ledger-ink-dark'
                        }`}
                        numberOfLines={1}
                      >
                        {account.name}
                      </ThemedText>
                      <ThemedText className="text-[11px] font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        {typeLabel}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Content Area: Loading, Error, Empty, or Chronological Feed */}
            {isLoading ? (
              <View className="p-8 items-center justify-center gap-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Loading ledger history...
                </ThemedText>
              </View>
            ) : isError ? (
              <View
                accessibilityRole="alert"
                className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-1"
              >
                <ThemedText className="text-sm font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center">
                  Unable to load ledger history right now.
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                  Please check your connection or local store and try again.
                </ThemedText>
                <Pressable
                  onPress={handleRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading ledger history"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90 items-center justify-center"
                >
                  <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                    Retry
                  </ThemedText>
                </Pressable>
              </View>
            ) : filteredEntries.length === 0 ? (
              <View className="p-8 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-1">
                <View className="px-3 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Audit Log
                  </ThemedText>
                </View>
                <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                  No History Entries Found
                </ThemedText>
                <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[300px] leading-relaxed">
                  {hasActiveFilters
                    ? selectedAccount
                      ? `No entries match your active filters for ${selectedAccount.name}.`
                      : 'No ledger entries match your active period, type, or search filters.'
                    : 'Your recorded transactions and balance reconciliations will appear here in chronological order.'}
                </ThemedText>
                {hasActiveFilters && (
                  <Pressable
                    onPress={handleResetFilters}
                    accessibilityRole="button"
                    accessibilityLabel="Reset Filters"
                    className="min-h-[44px] bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-80 px-6 py-3 rounded-xl mt-1 items-center justify-center"
                  >
                    <ThemedText className="text-ledger-ink dark:text-ledger-ink-dark font-bold text-sm">
                      Reset Filters
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="gap-3">
                {filteredEntries.map((entry) =>
                  entry.kind === 'RECONCILIATION' ? (
                    <ReconciliationHistoryCard
                      key={entry.entryKey}
                      entry={entry}
                      account={accountsById.get(entry.accountId)}
                    />
                  ) : (
                    <TransactionHistoryCard
                      key={entry.entryKey}
                      entry={entry}
                      accountsById={accountsById}
                      categoriesById={categoriesById}
                    />
                  ),
                )}
              </View>
            )}

            <View className="h-6" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

interface TransactionHistoryCardProps {
  entry: Extract<HistoryEntry, { kind: 'INCOME' | 'EXPENSE' | 'TRANSFER' }>;
  accountsById: ReadonlyMap<string, Account>;
  categoriesById: ReadonlyMap<string, Category>;
}

function TransactionHistoryCard({
  entry,
  accountsById,
  categoriesById,
}: TransactionHistoryCardProps) {
  const tx = entry.transaction;
  const fromAccount = accountsById.get(tx.accountId);
  const toAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined;
  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

  let kindLabel = 'Outgoing';
  let amountPrefix = '- ';
  let badgeBgClass = 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft';
  let badgeTextClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
  let amountColorClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';

  if (tx.type === 'INCOME') {
    kindLabel = 'Incoming';
    amountPrefix = '+ ';
    badgeBgClass = 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
    badgeTextClass = 'text-ledger-pine dark:text-ledger-pine-dark';
    amountColorClass = 'text-ledger-pine dark:text-ledger-pine-dark';
  } else if (tx.type === 'TRANSFER') {
    kindLabel = 'Transfer';
    amountPrefix = '';
    badgeBgClass = 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft';
    badgeTextClass = 'text-ledger-teal dark:text-ledger-teal-dark';
    amountColorClass = 'text-ledger-teal dark:text-ledger-teal-dark';
  }

  const formattedAmount = `${amountPrefix}${formatMinorUnits(tx.amountMinor, tx.currency)}`;
  const sourceLabel = fromAccount
    ? `${fromAccount.name} (${getAccountTypeLabel(fromAccount.accountType)})`
    : 'Account';
  const destinationLabel = toAccount ? ` -> ${toAccount.name}` : '';

  const hasMetadata = Boolean(
    tx.merchant || (tx.tags && tx.tags.length > 0) || tx.note || tx.receiptUri,
  );

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-2.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-start gap-3 flex-1 min-w-0">
          <View
            className={`w-11 h-11 rounded-xl items-center justify-center border border-ledger-border dark:border-ledger-border-dark shrink-0 ${badgeBgClass}`}
          >
            <ThemedText className={`text-xs font-extrabold tracking-wider ${badgeTextClass}`}>
              {entry.monogram}
            </ThemedText>
          </View>

          <View className="flex-1 min-w-0 gap-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <View className={`px-2 py-0.5 rounded-full ${badgeBgClass}`}>
                <ThemedText
                  className={`text-[11px] font-bold uppercase tracking-wider ${badgeTextClass}`}
                >
                  {kindLabel}
                </ThemedText>
              </View>
            </View>

            <ThemedText
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={2}
            >
              {entry.title}
            </ThemedText>

            <ThemedText
              numeric
              className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              numberOfLines={2}
            >
              {formatEntryDate(tx.occurredAt)} · {sourceLabel}
              {tx.type === 'TRANSFER' ? destinationLabel : ''}
            </ThemedText>
          </View>
        </View>

        <View className="items-end shrink-0 pt-0.5">
          <ThemedText
            numeric
            className={`text-base font-extrabold tracking-tight ${amountColorClass}`}
          >
            {formattedAmount}
          </ThemedText>
        </View>
      </View>

      {isSplit && tx.splits && tx.splits.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {tx.splits.map((split) => {
            const splitCategory = categoriesById.get(split.categoryId);
            return (
              <View
                key={split.id}
                className="px-2.5 py-1 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark"
              >
                <ThemedText
                  numeric
                  className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {splitCategory?.name ?? 'Category'}: {formatMinorUnits(split.amountMinor, tx.currency)}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}

      {hasMetadata && (
        <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
          {Boolean(tx.merchant) && (
            <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                Merchant: {tx.merchant}
              </ThemedText>
            </View>
          )}

          {tx.tags && tx.tags.length > 0 && (
            <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {tx.tags.map((tag) => `#${tag}`).join(' · ')}
              </ThemedText>
            </View>
          )}

          {Boolean(tx.note) && (
            <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[260px]"
                numberOfLines={2}
              >
                Note: {tx.note}
              </ThemedText>
            </View>
          )}

          {Boolean(tx.receiptUri) && (
            <View className="px-2.5 py-1 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark">
              <ThemedText className="text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark">
                Receipt Attached
              </ThemedText>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

interface ReconciliationHistoryCardProps {
  entry: Extract<HistoryEntry, { kind: 'RECONCILIATION' }>;
  account?: Account;
}

function ReconciliationHistoryCard({ entry, account }: ReconciliationHistoryCardProps) {
  const rec = entry.reconciliation;
  const currency = account?.currency ?? DEFAULT_CURRENCY;
  const isZero = rec.discrepancyMinor === 0;
  const isPositive = rec.discrepancyMinor > 0;

  const deltaPrefix = isPositive ? '+' : rec.discrepancyMinor < 0 ? '-' : '';
  const formattedDelta = `${deltaPrefix}${formatMinorUnits(
    Math.abs(rec.discrepancyMinor),
    currency,
  )}`;

  const deltaColorClass = isZero
    ? 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
    : isPositive
      ? 'text-ledger-pine dark:text-ledger-pine-dark'
      : 'text-ledger-terracotta dark:text-ledger-terracotta-dark';

  const accountSubtitle = account
    ? `${account.name} (${getAccountTypeLabel(account.accountType)})`
    : 'Account';

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-2.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-start gap-3 flex-1 min-w-0">
          <View className="w-11 h-11 rounded-xl items-center justify-center border border-ledger-border dark:border-ledger-border-dark shrink-0 bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft">
            <ThemedText className="text-xs font-extrabold tracking-wider text-ledger-ochre dark:text-ledger-ochre-dark">
              {entry.monogram}
            </ThemedText>
          </View>

          <View className="flex-1 min-w-0 gap-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <View className="px-2 py-0.5 rounded-full bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft">
                <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ochre dark:text-ledger-ochre-dark">
                  Reconciliation
                </ThemedText>
              </View>
              {Boolean(rec.adjustmentTransactionId) && (
                <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft">
                  <ThemedText className="text-[11px] font-semibold text-brand-500 dark:text-brand-400">
                    Auto-Adjusted
                  </ThemedText>
                </View>
              )}
            </View>

            <ThemedText
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={2}
            >
              {entry.title}
            </ThemedText>

            <ThemedText
              numeric
              className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              numberOfLines={2}
            >
              {formatEntryDate(rec.reconciledAt)} · {accountSubtitle}
            </ThemedText>

            <ThemedText
              numeric
              className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
            >
              Expected {formatMinorUnits(rec.appBalanceMinor, currency)} -&gt; Actual{' '}
              {formatMinorUnits(rec.actualBalanceMinor, currency)}
            </ThemedText>
          </View>
        </View>

        <View className="items-end shrink-0 pt-0.5">
          <ThemedText numeric className={`text-base font-extrabold tracking-tight ${deltaColorClass}`}>
            {formattedDelta}
          </ThemedText>
          <ThemedText className="text-[11px] font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-0.5">
            {isZero ? 'Matched' : 'Delta'}
          </ThemedText>
        </View>
      </View>

      {Boolean(entry.linkedNote) && (
        <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
          <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
            <ThemedText
              className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[280px]"
              numberOfLines={2}
            >
              Note: {entry.linkedNote}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}
