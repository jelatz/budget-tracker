import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  type Transaction,
  type TransactionType,
} from '@repo/contracts';

import { useRequireAuth } from '@/common/hooks/use-require-auth';

import {
  useAllCategories,
  useDeleteTransaction,
  useTransactions,
  useWallets,
} from '../hooks/use-transactions';

type FilterType = 'ALL' | TransactionType;

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

export function TransactionsScreen() {
  const { isAuthenticated } = useRequireAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;

  const [filter, setFilter] = useState<FilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];

  const { categories } = useAllCategories();
  const transactionsQuery = useTransactions();
  const transactions = transactionsQuery.data ?? [];

  const deleteTransactionMutation = useDeleteTransaction();

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      // Type filter
      if (filter !== 'ALL' && tx.type !== filter) {
        return false;
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
  }, [transactions, filter, searchQuery, wallets, categories]);

  // 3-Metric Summary Strip computations
  const { totalIncomeMinor, totalExpenseMinor } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filteredTransactions) {
      if (tx.type === 'INCOME') {
        income += tx.amountMinor;
      } else if (tx.type === 'EXPENSE') {
        expense += tx.amountMinor;
      }
    }
    return { totalIncomeMinor: income, totalExpenseMinor: expense };
  }, [filteredTransactions]);

  const handleDelete = (transactionId: string) => {
    deleteTransactionMutation.mutate(transactionId);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
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
                {transactions.length} recorded {transactions.length === 1 ? 'entry' : 'entries'}
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

          {/* 3-Metric Summary Strip */}
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
            </View>
          ) : (
            /* Single-row 3-column compact Stitch KPI bar */
            <View className="rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-3 flex-row items-center justify-between mb-4">
              <View className="flex-1 items-center">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Entries
                </Text>
                <Text
                  className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-white mt-0.5"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {filteredTransactions.length}
                </Text>
              </View>

              <View className="h-6 w-px bg-slate-200/80 dark:bg-slate-800/90" />

              <View className="flex-1 items-center">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Inflow
                </Text>
                <Text
                  className="text-base sm:text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5"
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
                  className="text-base sm:text-lg font-extrabold font-mono text-rose-600 dark:text-rose-400 mt-0.5"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatMinorUnits(totalExpenseMinor)}
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

            {/* Filter Pills */}
            {isDesktop ? (
              <View className="flex-row flex-wrap gap-2">
                {FILTER_OPTIONS.map((opt) => {
                  const isActive = filter === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setFilter(opt.key)}
                      accessibilityRole="button"
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
              </View>
            ) : (
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
            )}
          </View>

          {/* Wallets & Accounts Strip */}
          <View className="mb-5">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Wallets & Accounts
            </Text>
            {isDesktop ? (
              <View className="flex-row flex-wrap gap-3">
                {wallets.map((wallet) => {
                  const formatted = formatMinorUnits(
                    wallet.balanceMinor,
                    wallet.currency,
                  );
                  return (
                    <View
                      key={wallet.id}
                      className="flex-1 min-w-[160px] max-w-[280px] py-3 px-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm"
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
                    </View>
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
                  return (
                    <View
                      key={wallet.id}
                      className="min-w-[145px] py-3 px-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm mr-2.5"
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
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Transactions List, Loading State, or Empty State */}
          {transactionsQuery.isLoading ? (
            <View className="p-8 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#208AEF" />
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Loading transactions...
              </Text>
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
                  onPress={() => {
                    setFilter('ALL');
                    setSearchQuery('');
                  }}
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
                  onDelete={() => handleDelete(tx.id)}
                  isDeleting={deleteTransactionMutation.isPending}
                />
              ))}
            </View>
          )}

          {/* Subtle bottom spacer */}
          <View className="h-6" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface TransactionItemCardProps {
  transaction: Transaction;
  categories: readonly { id: string; name: string; icon: string }[];
  wallets: readonly { id: string; name: string; icon: string }[];
  onDelete: () => void;
  isDeleting: boolean;
}

function TransactionItemCard({
  transaction: tx,
  categories,
  wallets,
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
      <View className="border-t border-slate-100 dark:border-slate-800/80 pt-2.5 flex-row justify-end items-center">
        <Pressable
          onPress={onDelete}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Undo or delete transaction"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className={`min-h-[36px] px-3.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 justify-center items-center active:opacity-75 ${
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
