import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type Account,
  type Transaction,
  type TransactionType,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { BottomTabInset, WebMaxPageWidth } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';

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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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

  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 24);

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
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
          <View className="flex-row flex-wrap items-center justify-between gap-2 mb-4">
            <View className="flex-1 min-w-[140px]">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Transactions
              </ThemedText>
              <ThemedText
                numeric
                className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                numberOfLines={1}
              >
                {transactions.length} recorded {transactions.length === 1 ? 'entry' : 'entries'}
              </ThemedText>
            </View>

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => router.push('/portability')}
                accessibilityRole="button"
                accessibilityLabel="Export or Import data"
                className="min-h-[44px] py-2 px-3.5 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75 flex-row items-center gap-1.5"
              >
                <AppIcon name="export" size={14} color={theme.textSecondary} />
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Export
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Add fast transaction"
                className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-3.5 py-2 rounded-full flex-row items-center justify-center gap-1.5"
              >
                <AppIcon name="add" size={15} color={theme.onPrimary} />
                <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-xs sm:text-sm">
                  Fast Entry
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Accounts Strip */}
          <View className="mb-5">
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
                return (
                  <View
                    key={account.id}
                    className="min-w-[155px] py-3 px-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark mr-2.5"
                  >
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <ThemedText className="text-base">{account.icon}</ThemedText>
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                        numberOfLines={1}
                      >
                        {account.name}
                      </ThemedText>
                    </View>
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                      {getAccountTypeLabel(account.accountType)}
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-base font-bold"
                      style={{ color: account.color }}
                    >
                      {formatted}
                    </ThemedText>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Filter Pills Row */}
          <View className="flex-row flex-wrap gap-2 mb-5">
            {FILTER_OPTIONS.map((opt) => {
              const isActive = filter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setFilter(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Transactions List, Loading State, Error State, or Empty State */}
          {transactionsQuery.isLoading ? (
            <View className="p-8 items-center justify-center gap-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Loading transactions...
              </ThemedText>
            </View>
          ) : transactionsQuery.isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3 mt-2">
              <AppIcon name="warning" size={24} color={theme.negative} />
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
              <View className="w-12 h-12 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center mb-1">
                <AppIcon name="history" size={22} color={theme.primary} />
              </View>
              <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                No Transactions Found
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[280px] leading-relaxed">
                {filter === 'ALL'
                  ? 'Record your first transaction in seconds using Fast Entry.'
                  : `No ${filter.toLowerCase()} transactions found for this filter.`}
              </ThemedText>
              <Pressable
                onPress={() => router.push('/capture')}
                accessibilityRole="button"
                accessibilityLabel="Capture First Transaction"
                className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-6 py-3 rounded-xl mt-2 flex-row items-center justify-center gap-1.5"
              >
                <AppIcon name="add" size={16} color={theme.onPrimary} />
                <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-sm">
                  Capture First Transaction
                </ThemedText>
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
    </ThemedView>
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
  const theme = useTheme();

  // Find account names
  const fromAccount = accounts.find((a) => a.id === tx.accountId);
  const toAccount = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId) : null;

  // Format amount with prefix & color
  let amountPrefix = '− ';
  let badgeTintClass = 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft';
  let amountColorClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';

  if (tx.type === 'INCOME') {
    amountPrefix = '+ ';
    badgeTintClass = 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
    amountColorClass = 'text-ledger-pine dark:text-ledger-pine-dark';
  } else if (tx.type === 'TRANSFER') {
    amountPrefix = '';
    badgeTintClass = 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft';
    amountColorClass = 'text-ledger-teal dark:text-ledger-teal-dark';
  }

  const formattedAmount = `${amountPrefix}${formatMinorUnits(
    tx.amountMinor,
    tx.currency,
  )}`;

  // Find category or transfer title
  let categoryAvatar: string | null = null;
  let categoryName = 'Uncategorized';
  const isTransfer = tx.type === 'TRANSFER';
  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

  if (isTransfer) {
    categoryName = `Transfer: ${fromAccount?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`;
  } else if (isSplit) {
    categoryName = `Split (${tx.splits?.length} categories)`;
  } else if (tx.categoryId) {
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (cat) {
      categoryAvatar = cat.icon;
      categoryName = cat.name;
    }
  }

  const hasMetadata = Boolean(
    tx.merchant || (tx.tags && tx.tags.length > 0) || tx.note || tx.receiptUri,
  );

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-2.5">
      {/* Top Row: Icon + Name + Formatted Amount */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <View className={`w-11 h-11 rounded-xl items-center justify-center ${badgeTintClass}`}>
            {isTransfer ? (
              <AppIcon name="transfer" size={18} color={theme.info} />
            ) : isSplit ? (
              <AppIcon name="split" size={18} color={theme.primary} />
            ) : categoryAvatar ? (
              <ThemedText className="text-xl">{categoryAvatar}</ThemedText>
            ) : (
              <AppIcon name="tag" size={18} color={theme.textSecondary} />
            )}
          </View>
          <View className="flex-1">
            <ThemedText
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={1}
            >
              {categoryName}
            </ThemedText>
            <ThemedText
              numeric
              className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
              numberOfLines={1}
            >
              {formatTxDate(tx.occurredAt)} · {fromAccount?.name ?? 'Account'}
            </ThemedText>
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          {isTransfer && <AppIcon name="transfer" size={14} color={theme.info} />}
          <ThemedText
            numeric
            className={`text-base font-extrabold tracking-tight ${amountColorClass}`}
          >
            {formattedAmount}
          </ThemedText>
        </View>
      </View>

      {/* Split Details Chips (if split transaction) */}
      {isSplit && tx.splits && tx.splits.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {tx.splits.map((split) => {
            const splitCat = categories.find((c) => c.id === split.categoryId);
            return (
              <View
                key={split.id}
                className="px-2.5 py-1 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1"
              >
                {splitCat?.icon ? (
                  <ThemedText className="text-xs">{splitCat.icon}</ThemedText>
                ) : (
                  <AppIcon name="tag" size={11} color={theme.textSecondary} />
                )}
                <ThemedText
                  numeric
                  className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {splitCat?.name ?? 'Category'}: {formatMinorUnits(split.amountMinor, tx.currency)}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}

      {/* Decluttered Metadata Row (Merchant · Tags · Note · Receipt Badge) */}
      {hasMetadata && (
        <View className="flex-row flex-wrap items-center gap-2 pt-0.5">
          {Boolean(tx.merchant) && (
            <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <AppIcon name="merchant" size={12} color={theme.textSecondary} />
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {tx.merchant}
              </ThemedText>
            </View>
          )}

          {tx.tags && tx.tags.length > 0 && (
            <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <AppIcon name="tag" size={12} color={theme.textSecondary} />
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {tx.tags.map((tag) => `#${tag}`).join(' · ')}
              </ThemedText>
            </View>
          )}

          {Boolean(tx.note) && (
            <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              <AppIcon name="note" size={12} color={theme.textSecondary} />
              <ThemedText
                className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[200px]"
                numberOfLines={1}
              >
                {tx.note}
              </ThemedText>
            </View>
          )}

          {Boolean(tx.receiptUri) && (
            <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark">
              <AppIcon name="receipt" size={12} color={theme.info} />
              <ThemedText className="text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark">
                Receipt
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Bottom Action Row */}
      <View className="border-t border-ledger-border dark:border-ledger-border-dark pt-2.5 flex-row justify-end items-center">
        <Pressable
          onPress={onDelete}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Undo or delete transaction"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft flex-row items-center justify-center gap-1.5 active:opacity-75 ${
            isDeleting ? 'opacity-50' : ''
          }`}
        >
          <AppIcon name="undo" size={13} color={theme.negative} />
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Undo / Delete
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
