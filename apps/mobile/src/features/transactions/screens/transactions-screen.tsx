import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatMinorUnits,
  formatPeriodMonthLabel,
  getCurrentPeriodMonth,
  isTransactionInMonth,
  shiftPeriodMonth,
  type Transaction,
  type TransactionType,
} from '@repo/contracts';

import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { confirmAction } from '@/common/lib/confirm';

import {
  TRANSACTION_KEYS,
  useAllCategories,
  useDeleteTransaction,
  useTransactions,
  useWallets,
} from '../hooks/use-transactions';

type FilterType = 'ALL' | TransactionType;

export interface TransactionsScreenProps {
  initialType?: FilterType;
  initialCategoryId?: string;
  initialWalletId?: string;
  initialTag?: string;
  initialMonth?: string;
}

const FILTER_OPTIONS: readonly { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'EXPENSE', label: 'Expense' },
  { key: 'INCOME', label: 'Income' },
  { key: 'TRANSFER', label: 'Transfer' },
] as const;

function formatTxDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}, ${d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error: unknown) {
    return isoString;
  }
}

export function TransactionsScreen({
  initialType,
  initialCategoryId,
  initialWalletId,
  initialTag,
  initialMonth,
}: TransactionsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    } finally {
      setIsRefreshing(false);
    }
  };

  const [filter, setFilter] = useState<FilterType>(initialType ?? 'ALL');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialCategoryId ?? null,
  );
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    initialWalletId ?? null,
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(
    initialTag ?? null,
  );
  const [selectedMonth, setSelectedMonth] = useState<string | null>(
    initialMonth ?? null,
  );
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setFilter(initialType ?? 'ALL');
  }, [initialType]);

  useEffect(() => {
    setSelectedCategoryId(initialCategoryId ?? null);
  }, [initialCategoryId]);

  useEffect(() => {
    setSelectedWalletId(initialWalletId ?? null);
  }, [initialWalletId]);

  useEffect(() => {
    setSelectedTag(initialTag ?? null);
  }, [initialTag]);

  useEffect(() => {
    setSelectedMonth(initialMonth ?? null);
  }, [initialMonth]);

  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];

  const { categories } = useAllCategories();
  const transactionsQuery = useTransactions();
  const transactions = transactionsQuery.data ?? [];

  const deleteTransactionMutation = useDeleteTransaction();

  const currentMonth = getCurrentPeriodMonth();

  const filterableCategories = useMemo(() => {
    if (filter === 'EXPENSE' || filter === 'INCOME') {
      return categories.filter((c) => c.type === filter);
    }
    return categories;
  }, [categories, filter]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const normalizedTagFilter = selectedTag?.trim().toLowerCase() ?? null;

    return transactions.filter((tx) => {
      // Type filter
      if (filter !== 'ALL' && tx.type !== filter) {
        return false;
      }

      // Month filter
      if (selectedMonth && !isTransactionInMonth(tx.occurredAt, selectedMonth)) {
        return false;
      }

      // Wallet filter (source or destination for transfers)
      if (
        selectedWalletId &&
        tx.walletId !== selectedWalletId &&
        tx.toWalletId !== selectedWalletId
      ) {
        return false;
      }

      // Category filter (split-aware)
      if (selectedCategoryId) {
        const matchesDirect = tx.categoryId === selectedCategoryId;
        const matchesSplit =
          tx.splits?.some((s) => s.categoryId === selectedCategoryId) ?? false;
        if (!matchesDirect && !matchesSplit) {
          return false;
        }
      }

      // Tag filter
      if (normalizedTagFilter) {
        const hasTag =
          tx.tags?.some((t) => t.toLowerCase() === normalizedTagFilter) ?? false;
        if (!hasTag) {
          return false;
        }
      }

      // Search query filter
      if (!query) {
        return true;
      }

      const merchantMatch = tx.merchant?.toLowerCase().includes(query) ?? false;
      const noteMatch = tx.note?.toLowerCase().includes(query) ?? false;
      const tagMatch = tx.tags?.some((tag) => tag.toLowerCase().includes(query)) ?? false;

      const wallet = wallets.find((w) => w.id === tx.walletId);
      const toWallet = tx.toWalletId ? wallets.find((w) => w.id === tx.toWalletId) : null;
      const walletMatch =
        (wallet?.name.toLowerCase().includes(query) ?? false) ||
        (toWallet?.name.toLowerCase().includes(query) ?? false);

      const category = tx.categoryId ? categories.find((c) => c.id === tx.categoryId) : null;
      const categoryMatch = category?.name.toLowerCase().includes(query) ?? false;

      const splitCategoryMatch =
        tx.splits?.some((split) => {
          const sc = categories.find((c) => c.id === split.categoryId);
          return sc?.name.toLowerCase().includes(query) ?? false;
        }) ?? false;

      return (
        merchantMatch ||
        noteMatch ||
        tagMatch ||
        walletMatch ||
        categoryMatch ||
        splitCategoryMatch
      );
    });
  }, [
    transactions,
    filter,
    selectedMonth,
    selectedWalletId,
    selectedCategoryId,
    selectedTag,
    searchQuery,
    wallets,
    categories,
  ]);

  // Summary Strip computations
  const { totalIncomeMinor, totalExpenseMinor, netCashflowMinor } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filteredTransactions) {
      if (tx.type === 'INCOME') {
        income += tx.amountMinor;
      } else if (tx.type === 'EXPENSE') {
        expense += tx.amountMinor;
      }
    }
    return {
      totalIncomeMinor: income,
      totalExpenseMinor: expense,
      netCashflowMinor: income - expense,
    };
  }, [filteredTransactions]);

  const hasActiveFilters =
    filter !== 'ALL' ||
    selectedMonth !== null ||
    selectedWalletId !== null ||
    selectedCategoryId !== null ||
    selectedTag !== null ||
    searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setFilter('ALL');
    setSelectedMonth(null);
    setSelectedWalletId(null);
    setSelectedCategoryId(null);
    setSelectedTag(null);
    setSearchQuery('');
  };

  const handleShiftMonth = (delta: number) => {
    const base = selectedMonth ?? currentMonth;
    const next = shiftPeriodMonth(base, delta);
    if (next > currentMonth) {
      return;
    }
    setSelectedMonth(next);
  };

  const handleDelete = async (tx: Transaction) => {
    const label = tx.merchant || (tx.type === 'TRANSFER' ? 'Transfer' : 'Transaction');
    const confirmed = await confirmAction({
      title: 'Delete Transaction',
      message: `Delete this ${tx.type.toLowerCase()} (${label}, ${formatMinorUnits(tx.amountMinor, tx.currency)}) and reverse its wallet balance?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      deleteTransactionMutation.mutate(tx.id);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const activeCategoryObj = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : undefined;
  const activeWalletObj = selectedWalletId
    ? wallets.find((w) => w.id === selectedWalletId)
    : undefined;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handlePullRefresh()}
              tintColor="#208AEF"
              colors={['#208AEF']}
            />
          }
          contentContainerStyle={{
            width: '100%',
            maxWidth: isDesktop ? 1200 : 720,
            alignSelf: 'center',
            paddingHorizontal: isDesktop ? 28 : 16,
            paddingTop: isDesktop ? 24 : 16,
            paddingBottom: 80,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Bar */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 mb-5">
            <View className="flex-1 min-w-[140px]">
              <Text className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Transactions
              </Text>
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                {hasActiveFilters
                  ? `${filteredTransactions.length} of ${transactions.length} entries`
                  : `${transactions.length} recorded ${transactions.length === 1 ? 'entry' : 'entries'}`}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => router.navigate('/portability')}
                accessibilityRole="button"
                accessibilityLabel="Export or Import data"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className="min-h-[44px] py-2 px-3.5 rounded-full bg-slate-100 dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 active:opacity-75 flex-row items-center gap-1.5"
              >
                <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Export
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.navigate('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Add fast transaction"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className="min-h-[44px] bg-brand-500 active:bg-brand-600 px-4 py-2 rounded-full shadow-md shadow-brand-500/25 flex-row items-center justify-center"
              >
                <Text className="text-white font-bold text-xs sm:text-sm">+ Fast Entry</Text>
              </Pressable>
            </View>
          </View>

          {/* Summary Strip (Inflow, Outflow, Net Cashflow) */}
          {isDesktop ? (
            <View className="mb-5 flex-row gap-4">
              {/* Metric 1: Matching Entries */}
              <View className="flex-1 min-w-[140px] p-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Matching Entries
                </Text>
                <Text className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">
                  {filteredTransactions.length}
                </Text>
              </View>

              {/* Metric 2: Total Inflow */}
              <View className="flex-1 min-w-[140px] p-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Total Inflow
                </Text>
                <Text className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatMinorUnits(totalIncomeMinor)}
                </Text>
              </View>

              {/* Metric 3: Total Outflow */}
              <View className="flex-1 min-w-[140px] p-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Total Outflow
                </Text>
                <Text className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400 mt-1">
                  {formatMinorUnits(totalExpenseMinor)}
                </Text>
              </View>

              {/* Metric 4: Net Cashflow */}
              <View className="flex-1 min-w-[140px] p-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Net Cashflow
                </Text>
                <Text
                  className={`text-2xl font-extrabold font-mono mt-1 ${
                    netCashflowMinor >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {netCashflowMinor >= 0 ? '+' : ''}
                  {formatMinorUnits(netCashflowMinor)}
                </Text>
              </View>
            </View>
          ) : (
            /* Single-row 3-column compact Stitch KPI bar: Inflow | Outflow | Net */
            <View className="rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-3 flex-row items-center justify-between mb-4">
              <View className="flex-1 items-center">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Inflow
                </Text>
                <Text
                  className="text-sm sm:text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatMinorUnits(totalIncomeMinor)}
                </Text>
              </View>

              <View className="h-6 w-px bg-slate-200/80 dark:bg-slate-800/90" />

              <View className="flex-1 items-center">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Outflow
                </Text>
                <Text
                  className="text-sm sm:text-base font-extrabold font-mono text-rose-600 dark:text-rose-400 mt-0.5"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatMinorUnits(totalExpenseMinor)}
                </Text>
              </View>

              <View className="h-6 w-px bg-slate-200/80 dark:bg-slate-800/90" />

              <View className="flex-1 items-center">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Net
                </Text>
                <Text
                  className={`text-sm sm:text-base font-extrabold font-mono mt-0.5 ${
                    netCashflowMinor >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {netCashflowMinor >= 0 ? '+' : ''}
                  {formatMinorUnits(netCashflowMinor)}
                </Text>
              </View>
            </View>
          )}

          {/* Search & Filter Command Bar */}
          <View className="gap-3 mb-5">
            {/* Search Input Box */}
            <View className="flex-row items-center bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-2xl px-3.5 min-h-[44px]">
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search merchant, notes, tags, wallet..."
                placeholderTextColor="#94a3b8"
                accessibilityLabel="Search transactions"
                accessibilityRole="search"
                className="flex-1 py-2 text-sm text-slate-900 dark:text-slate-100 min-h-[44px]"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search query"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="p-1.5 rounded-full active:opacity-70"
                >
                  <Text className="text-xs font-bold text-slate-400 dark:text-slate-500">✕</Text>
                </Pressable>
              )}
            </View>

            {/* Type Filter Pills + Month Stepper */}
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {FILTER_OPTIONS.map((opt) => {
                  const isActive = filter === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setFilter(opt.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Filter by ${opt.label}`}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      className={`min-h-[44px] px-4 py-2.5 rounded-full justify-center active:opacity-80 ${
                        isActive
                          ? 'bg-brand-500 shadow-sm shadow-brand-500/25'
                          : 'bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isActive
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Month Filter Stepper */}
              <View className="flex-row items-center gap-1 bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 rounded-full px-1.5 py-0.5">
                <Pressable
                  onPress={() => setSelectedMonth(null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMonth === null }}
                  accessibilityLabel="Show all dates"
                  className={`min-h-[44px] px-3 rounded-full items-center justify-center ${
                    selectedMonth === null ? 'bg-slate-900 dark:bg-white' : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selectedMonth === null
                        ? 'text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    All Dates
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleShiftMonth(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-75"
                >
                  <Text className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    ‹
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setSelectedMonth((prev) => (prev === null ? currentMonth : prev))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedMonth
                      ? `Filtering by ${formatPeriodMonthLabel(selectedMonth)}`
                      : 'Filter by current month'
                  }
                  className={`min-h-[44px] px-2.5 rounded-full items-center justify-center ${
                    selectedMonth !== null ? 'bg-brand-500' : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selectedMonth !== null
                        ? 'text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {selectedMonth ? formatPeriodMonthLabel(selectedMonth) : 'This Month'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleShiftMonth(1)}
                  disabled={selectedMonth === null || selectedMonth >= currentMonth}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-full ${
                    selectedMonth === null || selectedMonth >= currentMonth
                      ? 'opacity-30'
                      : 'active:opacity-75'
                  }`}
                >
                  <Text className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    ›
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Category Quick-Filter Pills */}
            {filterableCategories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Pressable
                  onPress={() => setSelectedCategoryId(null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedCategoryId === null }}
                  accessibilityLabel="All categories"
                  className={`min-h-[44px] px-3.5 py-2 rounded-full items-center justify-center border ${
                    selectedCategoryId === null
                      ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-[#131b2e] border-slate-200/80 dark:border-slate-800/90'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selectedCategoryId === null
                        ? 'text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    All Categories
                  </Text>
                </Pressable>

                {filterableCategories.map((cat) => {
                  const isActive = selectedCategoryId === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() =>
                        setSelectedCategoryId((prev) => (prev === cat.id ? null : cat.id))
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Filter by category ${cat.name}`}
                      className={`min-h-[44px] px-3.5 py-2 rounded-full flex-row items-center gap-1.5 border ${
                        isActive
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-white dark:bg-[#131b2e] border-slate-200/80 dark:border-slate-800/90'
                      }`}
                    >
                      <Text className="text-xs">{cat.icon}</Text>
                      <Text
                        className={`text-xs font-semibold ${
                          isActive
                            ? 'text-white'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Active Drill-Down Filter Chips */}
            {(activeCategoryObj || selectedTag || activeWalletObj || selectedMonth) && (
              <View className="flex-row flex-wrap items-center gap-2">
                {activeWalletObj && (
                  <Pressable
                    onPress={() => setSelectedWalletId(null)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove wallet filter ${activeWalletObj.name}`}
                    className="min-h-[44px] px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex-row items-center gap-1.5"
                  >
                    <Text className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                      {activeWalletObj.icon} {activeWalletObj.name} ✕
                    </Text>
                  </Pressable>
                )}

                {activeCategoryObj && (
                  <Pressable
                    onPress={() => setSelectedCategoryId(null)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove category filter ${activeCategoryObj.name}`}
                    className="min-h-[44px] px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex-row items-center gap-1.5"
                  >
                    <Text className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                      {activeCategoryObj.icon} {activeCategoryObj.name} ✕
                    </Text>
                  </Pressable>
                )}

                {selectedTag && (
                  <Pressable
                    onPress={() => setSelectedTag(null)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove tag filter ${selectedTag}`}
                    className="min-h-[44px] px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex-row items-center gap-1.5"
                  >
                    <Text className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                      #{selectedTag} ✕
                    </Text>
                  </Pressable>
                )}

                {selectedMonth && (
                  <Pressable
                    onPress={() => setSelectedMonth(null)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove month filter ${formatPeriodMonthLabel(selectedMonth)}`}
                    className="min-h-[44px] px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex-row items-center gap-1.5"
                  >
                    <Text className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                      {formatPeriodMonthLabel(selectedMonth)} ✕
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={handleClearFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                  className="min-h-[44px] px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center"
                >
                  <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Clear All
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Wallets & Accounts Strip (Tap to filter by wallet) */}
          <View className="mb-5">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Wallets & Accounts (Tap to filter)
            </Text>
            {isDesktop ? (
              <View className="flex-row flex-wrap gap-3">
                {wallets.map((wallet) => {
                  const formatted = formatMinorUnits(
                    wallet.balanceMinor,
                    wallet.currency,
                  );
                  const isSelected = selectedWalletId === wallet.id;
                  return (
                    <Pressable
                      key={wallet.id}
                      onPress={() =>
                        setSelectedWalletId((prev) =>
                          prev === wallet.id ? null : wallet.id,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Filter by wallet ${wallet.name}, balance ${formatted}`}
                      className={`flex-1 min-w-[160px] max-w-[280px] min-h-[44px] py-3 px-4 rounded-2xl shadow-sm ${
                        isSelected
                          ? 'bg-brand-50/60 dark:bg-brand-950/40 border-2 border-brand-500'
                          : 'bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90'
                      }`}
                    >
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Text className="text-base">{wallet.icon}</Text>
                        <Text
                          className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                          numberOfLines={1}
                        >
                          {wallet.name}
                        </Text>
                      </View>
                      <Text
                        className="text-base font-bold font-mono"
                        style={{ color: wallet.color }}
                      >
                        {formatted}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="py-1"
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {wallets.map((wallet) => {
                  const formatted = formatMinorUnits(
                    wallet.balanceMinor,
                    wallet.currency,
                  );
                  const isSelected = selectedWalletId === wallet.id;
                  return (
                    <Pressable
                      key={wallet.id}
                      onPress={() =>
                        setSelectedWalletId((prev) =>
                          prev === wallet.id ? null : wallet.id,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Filter by wallet ${wallet.name}, balance ${formatted}`}
                      className={`min-w-[145px] min-h-[44px] py-3 px-4 rounded-2xl shadow-sm mr-2.5 ${
                        isSelected
                          ? 'bg-brand-50/60 dark:bg-brand-950/40 border-2 border-brand-500'
                          : 'bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90'
                      }`}
                    >
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Text className="text-base">{wallet.icon}</Text>
                        <Text
                          className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                          numberOfLines={1}
                        >
                          {wallet.name}
                        </Text>
                      </View>
                      <Text
                        className="text-base font-bold font-mono"
                        style={{ color: wallet.color }}
                      >
                        {formatted}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Transactions List, Loading State, Error State, or Empty State */}
          {transactionsQuery.isLoading ? (
            <View className="p-8 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#208AEF" />
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Loading transactions...
              </Text>
            </View>
          ) : transactionsQuery.isError ? (
            <View className="p-8 rounded-3xl bg-white dark:bg-[#131b2e] border border-rose-200 dark:border-rose-900/60 items-center gap-3 mt-2 shadow-sm">
              <Text className="text-lg font-bold text-slate-900 dark:text-white text-center">
                Failed to Load Transactions
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-[300px]">
                There was an issue reading your local transactions. Please try again.
              </Text>
              <Pressable
                onPress={() => void transactionsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading transactions"
                className="min-h-[44px] bg-brand-500 active:bg-brand-600 px-6 py-3 rounded-2xl mt-1 justify-center items-center"
              >
                <Text className="text-white font-bold text-sm">Retry</Text>
              </Pressable>
            </View>
          ) : filteredTransactions.length === 0 ? (
            transactions.length === 0 ? (
              <View className="p-8 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 items-center gap-3 mt-2 shadow-sm">
                <Text className="text-lg font-bold text-slate-900 dark:text-white text-center">
                  No Transactions Found
                </Text>
                <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center max-w-[280px] leading-relaxed">
                  Get started by recording your first transaction in seconds.
                </Text>
                <Pressable
                  onPress={() => router.navigate('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Capture First Transaction"
                  className="min-h-[44px] bg-brand-500 active:bg-brand-600 px-6 py-3 rounded-2xl mt-2 shadow-md shadow-brand-500/25 justify-center items-center"
                >
                  <Text className="text-white font-bold text-sm">
                    Capture First Transaction
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="p-8 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 items-center gap-3 mt-2 shadow-sm">
                <Text className="text-lg font-bold text-slate-900 dark:text-white text-center">
                  No Matching Transactions
                </Text>
                <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center max-w-[320px] leading-relaxed">
                  No transactions match {searchQuery ? `"${searchQuery}"` : ''}
                  {searchQuery && filter !== 'ALL' ? ' with ' : ''}
                  {filter !== 'ALL' ? `${filter.toLowerCase()} filter` : ''}.
                </Text>
                <Pressable
                  onPress={handleClearFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search and filters"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="min-h-[44px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 active:opacity-75 px-5 py-2.5 rounded-2xl mt-2 justify-center items-center"
                >
                  <Text className="text-slate-700 dark:text-slate-200 font-bold text-sm">
                    Clear Search & Filters
                  </Text>
                </Pressable>
              </View>
            )
          ) : (
            <View className="gap-3">
              {filteredTransactions.map((tx) => (
                <TransactionItemCard
                  key={tx.id}
                  transaction={tx}
                  categories={categories}
                  wallets={wallets}
                  onEdit={() =>
                    router.push({ pathname: '/capture', params: { editId: tx.id } })
                  }
                  onDelete={() => void handleDelete(tx)}
                  isDeleting={deleteTransactionMutation.isPending}
                />
              ))}
            </View>
          )}

          {/* Subtle bottom spacer */}
          <View className="h-6" />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

interface TransactionItemCardProps {
  transaction: Transaction;
  categories: readonly { id: string; name: string; icon: string }[];
  wallets: readonly { id: string; name: string; icon: string }[];
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function TransactionItemCard({
  transaction: tx,
  categories,
  wallets,
  onEdit,
  onDelete,
  isDeleting,
}: TransactionItemCardProps) {
  // Find wallet names
  const fromWallet = wallets.find((w) => w.id === tx.walletId);
  const toWallet = tx.toWalletId ? wallets.find((w) => w.id === tx.toWalletId) : null;

  // Format amount with prefix & color
  let amountPrefix = '- ';
  let badgeTintClass = 'bg-rose-50 dark:bg-rose-950/60';
  let amountColorClass = 'text-rose-600 dark:text-rose-400';

  if (tx.type === 'INCOME') {
    amountPrefix = '+ ';
    badgeTintClass = 'bg-emerald-50 dark:bg-emerald-950/60';
    amountColorClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (tx.type === 'TRANSFER') {
    amountPrefix = '⇄ ';
    badgeTintClass = 'bg-blue-50 dark:bg-blue-950/60';
    amountColorClass = 'text-brand-500';
  }

  const formattedAmount = `${amountPrefix}${formatMinorUnits(
    tx.amountMinor,
    tx.currency,
  )}`;

  // Find category or transfer title
  let categoryIcon = '🏷️';
  let categoryName = 'Uncategorized';
  const isTransfer = tx.type === 'TRANSFER';
  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

  if (isTransfer) {
    categoryIcon = '⇄';
    categoryName = `Transfer: ${fromWallet?.name ?? 'Wallet'} → ${toWallet?.name ?? 'Wallet'}`;
  } else if (isSplit) {
    categoryIcon = '🔀';
    categoryName = `Split (${tx.splits?.length} categories)`;
  } else if (tx.categoryId) {
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (cat) {
      categoryIcon = cat.icon;
      categoryName = cat.name;
    }
  }

  return (
    <View className="rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-4 mb-3 shadow-sm gap-3">
      {/* Top Row: Icon + Name + Formatted Amount */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <View className={`w-11 h-11 rounded-2xl items-center justify-center ${badgeTintClass}`}>
            <Text className="text-xl">{categoryIcon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-slate-900 dark:text-white" numberOfLines={1}>
              {categoryName}
            </Text>
            <Text className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {formatTxDate(tx.occurredAt)} • {fromWallet?.name ?? 'Wallet'}
            </Text>
          </View>
        </View>

        <Text className={`text-base font-extrabold font-mono tracking-tight ${amountColorClass}`}>
          {formattedAmount}
        </Text>
      </View>

      {/* Split Details Chips (if split transaction) */}
      {isSplit && tx.splits && tx.splits.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {tx.splits.map((split) => {
            const splitCat = categories.find((c) => c.id === split.categoryId);
            return (
              <View
                key={split.id}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60"
              >
                <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {splitCat?.icon ?? '🏷️'} {splitCat?.name ?? 'Category'}:{' '}
                  <Text className="font-mono font-semibold">
                    {formatMinorUnits(split.amountMinor, tx.currency)}
                  </Text>
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Metadata Pills Row (Merchant, Tags, Note, Receipt) */}
      {(tx.merchant || (tx.tags && tx.tags.length > 0) || tx.note || tx.receiptUri) && (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {Boolean(tx.merchant) && (
            <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300" numberOfLines={1}>
                {tx.merchant}
              </Text>
            </View>
          )}

          {tx.tags?.map((tag) => (
            <View key={tag} className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">#{tag}</Text>
            </View>
          ))}

          {Boolean(tx.note) && (
            <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300" numberOfLines={1}>
                {tx.note}
              </Text>
            </View>
          )}

          {Boolean(tx.receiptUri) && (
            <View className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60">
              <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Receipt
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Bottom Action Row */}
      <View className="border-t border-slate-100 dark:border-slate-800/80 pt-2.5 flex-row justify-end items-center gap-2">
        <Pressable
          onPress={onEdit}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Edit transaction"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="min-h-[44px] px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 justify-center items-center active:opacity-75"
        >
          <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Edit
          </Text>
        </Pressable>

        <Pressable
          onPress={onDelete}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Undo or delete transaction"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 justify-center items-center active:opacity-75 ${
            isDeleting ? 'opacity-50' : ''
          }`}
        >
          <Text className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            Undo / Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
