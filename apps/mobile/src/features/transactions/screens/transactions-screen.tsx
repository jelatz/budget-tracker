import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type Account,
  type Transaction,
  type TransactionType,
} from '@repo/contracts';

import { useRequireAuth } from '@/common/hooks/use-require-auth';

import {
  useAccounts,
  useAllCategories,
  useDeleteTransaction,
  useTransactions,
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
  const [filter, setFilter] = useState<FilterType>('ALL');

  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const { categories } = useAllCategories();
  const transactionsQuery = useTransactions();
  const transactions = transactionsQuery.data ?? [];

  const deleteTransactionMutation = useDeleteTransaction();

  const filteredTransactions = useMemo(() => {
    if (filter === 'ALL') return transactions;
    return transactions.filter((t) => t.type === filter);
  }, [transactions, filter]);

  const handleDelete = (transactionId: string) => {
    deleteTransactionMutation.mutate(transactionId);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="w-full px-4 pt-4 pb-20"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Bar */}
          <View className="flex-row flex-wrap items-center justify-between gap-2 mb-4">
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
                onPress={() => router.push('/portability' as any)}
                accessibilityRole="button"
                accessibilityLabel="Export or Import data"
                className="py-1.5 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 active:opacity-75 flex-row items-center gap-1.5"
              >
                <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Export 📥
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Add fast transaction"
                className="bg-brand-500 active:bg-brand-600 px-3 py-1.5 rounded-full shadow-md shadow-brand-500/25 flex-row items-center justify-center"
              >
                <Text className="text-white font-bold text-xs sm:text-sm">+ Fast Entry</Text>
              </Pressable>
            </View>
          </View>

          {/* Accounts Strip */}
          <View className="mb-5">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Accounts
            </Text>
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
                return (
                  <View
                    key={account.id}
                    className="min-w-[155px] py-3 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm mr-2.5"
                  >
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Text className="text-base">{account.icon}</Text>
                      <Text
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1"
                        numberOfLines={1}
                      >
                        {account.name}
                      </Text>
                    </View>
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                      {getAccountTypeLabel(account.accountType)}
                    </Text>
                    <Text
                      className="text-base font-bold"
                      style={{ color: account.color }}
                    >
                      {formatted}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Filter Pills Row */}
          <View className="flex-row gap-2 mb-5">
            {FILTER_OPTIONS.map((opt) => {
              const isActive = filter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setFilter(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${opt.label}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className={`px-4 py-2 rounded-full active:opacity-80 ${
                    isActive
                      ? 'bg-brand-500 shadow-sm shadow-brand-500/25'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
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

          {/* Transactions List, Loading State, or Empty State */}
          {transactionsQuery.isLoading ? (
            <View className="p-8 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#208AEF" />
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Loading transactions...
              </Text>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 items-center gap-3 mt-2 shadow-sm">
              <Text className="text-5xl mb-1">🧾</Text>
              <Text className="text-lg font-bold text-slate-900 dark:text-white text-center">
                No Transactions Found
              </Text>
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center max-w-[280px] leading-relaxed">
                {filter === 'ALL'
                  ? 'Get started by recording your first transaction in seconds.'
                  : `No ${filter.toLowerCase()} transactions found for this filter.`}
              </Text>
              <Pressable
                onPress={() => router.push('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Capture First Transaction"
                className="bg-brand-500 active:bg-brand-600 px-6 py-3 rounded-2xl mt-2 shadow-md shadow-brand-500/25"
              >
                <Text className="text-white font-bold text-sm">
                  Capture First Transaction
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-3">
              {filteredTransactions.map((tx) => (
                <TransactionItemCard
                  key={tx.id}
                  transaction={tx}
                  categories={categories}
                  accounts={accounts}
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
  accounts: readonly Account[];
  onDelete: () => void;
  isDeleting: boolean;
}

function TransactionItemCard({
  transaction: tx,
  categories,
  accounts,
  onDelete,
  isDeleting,
}: TransactionItemCardProps) {
  // Find account names
  const fromAccount = accounts.find((a) => a.id === tx.accountId);
  const toAccount = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId) : null;

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
    categoryName = `Transfer: ${fromAccount?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`;
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
    <View className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 mb-3 shadow-sm gap-3">
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
              {formatTxDate(tx.occurredAt)} • {fromAccount?.name ?? 'Account'}
            </Text>
          </View>
        </View>

        <Text className={`text-base font-extrabold tracking-tight ${amountColorClass}`}>
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
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60"
              >
                <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {splitCat?.icon ?? '🏷️'} {splitCat?.name ?? 'Category'}:{' '}
                  {formatMinorUnits(split.amountMinor, tx.currency)}
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
            <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300" numberOfLines={1}>
                🏪 {tx.merchant}
              </Text>
            </View>
          )}

          {tx.tags?.map((tag) => (
            <View key={tag} className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">#{tag}</Text>
            </View>
          ))}

          {Boolean(tx.note) && (
            <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90">
              <Text className="text-xs font-medium text-slate-600 dark:text-slate-300" numberOfLines={1}>
                📝 {tx.note}
              </Text>
            </View>
          )}

          {Boolean(tx.receiptUri) && (
            <View className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60">
              <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                📷 Receipt ✓
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
          className={`px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 active:opacity-75 ${
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
