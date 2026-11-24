import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type DashboardPeriod,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { SyncStatusBadge } from '@/common/components/sync-status-badge';
import { ThemedText } from '@/common/components/themed-text';
import { BottomTabInset, WebMaxPageWidth } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';

import {
  useClearAllTransactions,
  useDashboardMetrics,
  useDeleteTransaction,
  useUpdateMonthlyBudget,
} from '@/features/transactions/hooks/use-transactions';

import { SafeToSpendCard } from '../components/safe-to-spend-card';
import { NetWorthCard } from '../components/net-worth-card';
import { BudgetProgressCard } from '../components/budget-progress-card';
import { EnvelopeBudgetsCard } from '../components/envelope-budgets-card';
import { SinkingFundsCard } from '../components/sinking-funds-card';
import { CategoryBreakdownCard } from '../components/category-breakdown-card';
import { TagInsightsCard } from '../components/tag-insights-card';

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

export function DashboardScreen() {
  const theme = useTheme();
  const { isAuthenticated, user, logout } = useRequireAuth();
  const { width } = useWindowDimensions();
  const isMobileWebView = Platform.OS === 'web' && width < 768;
  const isDesktopBento = width >= 1024;
  const showNativeSignOut = isAuthenticated && Platform.OS !== 'web';
  const showAccountMeta = isAuthenticated && (Platform.OS !== 'web' || !isMobileWebView);

  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearAllError, setClearAllError] = useState<string | null>(null);
  const [txActionError, setTxActionError] = useState<string | null>(null);

  const { metrics, accounts, categories } = useDashboardMetrics(period);
  const updateBudgetMutation = useUpdateMonthlyBudget();
  const deleteTransactionMutation = useDeleteTransaction();
  const clearAllMutation = useClearAllTransactions();

  if (!isAuthenticated) {
    return null;
  }

  const handleUndoTransaction = async (transactionId: string) => {
    try {
      setTxActionError(null);
      await deleteTransactionMutation.mutateAsync(transactionId);
    } catch (error: unknown) {
      setTxActionError(
        error instanceof Error ? error.message : 'Failed to undo transaction.',
      );
    }
  };

  const handleConfirmResetData = async () => {
    try {
      setClearAllError(null);
      await clearAllMutation.mutateAsync();
      setConfirmingClearAll(false);
    } catch (error: unknown) {
      setClearAllError(
        error instanceof Error ? error.message : 'Failed to reset entries. Please try again.',
      );
    }
  };

  const recentActivityCard = (
    <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
      <View className="flex-row justify-between items-center mb-3 gap-2">
        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
          Recent Activity
        </ThemedText>
        <Pressable
          onPress={() => router.push('/transactions')}
          accessibilityRole="button"
          accessibilityLabel="See all transactions"
          className="min-h-[44px] px-2.5 py-2 rounded-xl flex-row items-center gap-1 active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
            See All
          </ThemedText>
          <AppIcon name="arrowRight" size={14} color={theme.primary} />
        </Pressable>
      </View>

      {txActionError && (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="mb-3 p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2"
        >
          <View className="flex-row items-center gap-2 flex-1">
            <AppIcon name="error" size={15} color={theme.negative} />
            <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1">
              {txActionError}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => setTxActionError(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss transaction error"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="p-1 active:opacity-75"
          >
            <AppIcon name="close" size={14} color={theme.negative} />
          </Pressable>
        </View>
      )}

      {metrics.recentTransactions.length === 0 ? (
        <View className="items-center py-6 px-4 gap-2.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <View className="w-11 h-11 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
            <AppIcon name="note" size={20} color={theme.textMuted} />
          </View>
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            No activity yet
          </ThemedText>
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[280px] leading-5">
            Capture an expense, income, or transfer to see insights here.
          </ThemedText>
          <Pressable
            onPress={() => router.push('/capture')}
            accessibilityRole="button"
            accessibilityLabel="Record transaction"
            className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 px-4 py-2.5 rounded-xl mt-1 flex-row items-center gap-1.5"
          >
            <AppIcon name="add" size={15} color={theme.onPrimary} />
            <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-xs">
              Record Transaction
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="mt-1">
          {metrics.recentTransactions.map((tx, idx) => {
            const isSplit = Boolean(tx.splits && tx.splits.length > 0);
            const matchedCategory = tx.categoryId
              ? categories.find((c) => c.id === tx.categoryId)
              : undefined;

            let categoryName = 'Uncategorized';
            if (tx.type === 'TRANSFER') {
              categoryName = 'Transfer';
            } else if (isSplit) {
              categoryName = `Split (${tx.splits?.length ?? 0})`;
            } else if (matchedCategory) {
              categoryName = matchedCategory.name;
            }

            let formattedAmount = formatMinorUnits(tx.amountMinor, tx.currency);
            let amountColorClass =
              'text-ledger-terracotta dark:text-ledger-terracotta-dark';
            if (tx.type === 'INCOME') {
              formattedAmount = `+${formattedAmount}`;
              amountColorClass = 'text-ledger-pine dark:text-ledger-pine-dark';
            } else if (tx.type === 'TRANSFER') {
              amountColorClass = 'text-ledger-teal dark:text-ledger-teal-dark';
            } else {
              formattedAmount = `-${formattedAmount}`;
            }

            const fromAccount = accounts.find((a) => a.id === tx.accountId);
            const subtitleParts: string[] = [];
            if (tx.merchant) {
              subtitleParts.push(tx.merchant);
            }
            if (fromAccount) {
              subtitleParts.push(fromAccount.name);
            }
            subtitleParts.push(formatTxDate(tx.occurredAt));
            const subtitle = subtitleParts.join(' · ');

            const isLast = idx === metrics.recentTransactions.length - 1;

            return (
              <View
                key={tx.id}
                className={`flex-row items-center justify-between py-3 gap-3 ${
                  !isLast ? 'border-b border-ledger-border dark:border-ledger-border-dark' : ''
                }`}
              >
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View className="w-10 h-10 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
                    {tx.type === 'TRANSFER' ? (
                      <AppIcon name="transfer" size={18} color={theme.info} />
                    ) : isSplit ? (
                      <AppIcon name="split" size={18} color={theme.textSecondary} />
                    ) : matchedCategory ? (
                      <ThemedText className="text-base">{matchedCategory.icon}</ThemedText>
                    ) : (
                      <AppIcon name="tag" size={18} color={theme.textSecondary} />
                    )}
                  </View>
                  <View className="flex-1 min-w-0 gap-0.5">
                    <ThemedText
                      className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                      numberOfLines={1}
                    >
                      {categoryName}
                    </ThemedText>
                    <ThemedText
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      numberOfLines={1}
                    >
                      {subtitle}
                    </ThemedText>
                  </View>
                </View>

                <View className="items-end gap-1.5 shrink-0">
                  <ThemedText numeric className={`text-sm font-bold ${amountColorClass}`}>
                    {formattedAmount}
                  </ThemedText>
                  <Pressable
                    onPress={() => void handleUndoTransaction(tx.id)}
                    disabled={deleteTransactionMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Undo ${categoryName} transaction`}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    className="min-h-[32px] px-2.5 py-1 rounded-full bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft flex-row items-center gap-1 active:opacity-75"
                  >
                    <AppIcon name="undo" size={12} color={theme.negative} />
                    <ThemedText className="text-[11px] font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      Undo
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom:
              Platform.OS === 'web' ? 64 : Math.max(96, BottomTabInset + 32),
            gap: 20,
            ...(Platform.OS === 'web'
              ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
              : {}),
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Header Bar */}
          <View className="py-1 gap-2.5">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-1 min-w-[160px] gap-0.5">
                <ThemedText
                  accessibilityRole="header"
                  className="text-2xl sm:text-[28px] font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Overview
                </ThemedText>
                <ThemedText
                  className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  numberOfLines={1}
                >
                  Personal Ledger
                </ThemedText>
              </View>

              <View className="flex-row flex-wrap items-center gap-2">
                <Pressable
                  onPress={() => router.push('/portability')}
                  accessibilityRole="button"
                  accessibilityLabel="Backup or Export data"
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:bg-ledger-subtle dark:active:bg-ledger-subtle-dark flex-row items-center gap-1.5"
                >
                  <AppIcon name="export" size={16} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Export
                  </ThemedText>
                </Pressable>

                {showNativeSignOut && (
                  <Pressable
                    onPress={async () => {
                      await logout();
                      router.replace('/');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Sign Out"
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5 active:opacity-75"
                  >
                    <AppIcon name="logout" size={15} color={theme.negative} />
                    <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      Sign Out
                    </ThemedText>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Add fast transaction"
                  className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 px-4 py-2 rounded-xl flex-row items-center justify-center gap-1.5"
                >
                  <AppIcon name="add" size={16} color={theme.onPrimary} />
                  <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-xs sm:text-sm">
                    Fast Entry
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {showAccountMeta && (
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="min-h-[32px] px-3 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5">
                  <AppIcon name="shield" size={13} color={theme.primary} />
                  <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {user?.email ?? 'Authenticated'}
                  </ThemedText>
                </View>
                <SyncStatusBadge />
              </View>
            )}
          </View>

          {/* 2. Row 1 Top Hero (2-col 7:5 on Desktop >= 1024, stacked on Mobile) */}
          <View className={isDesktopBento ? 'flex-row gap-5 items-start' : 'gap-5'}>
            <View className={isDesktopBento ? 'flex-[7] min-w-0' : 'w-full'}>
              <SafeToSpendCard />
            </View>
            <View className={isDesktopBento ? 'flex-[5] min-w-0' : 'w-full'}>
              <NetWorthCard
                period={period}
                onPeriodChange={setPeriod}
                netWorthMinor={metrics.netWorthMinor}
                incomeMinor={metrics.incomeMinor}
                expenseMinor={metrics.expenseMinor}
                netCashflowMinor={metrics.netCashflowMinor}
                transactionCount={metrics.transactionCount}
              />
            </View>
          </View>

          {/* 3. Full-Width Accounts Horizontal Strip */}
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Accounts
              </ThemedText>
              <View className="flex-row items-center gap-1">
                <Pressable
                  onPress={() => router.push('/accounts')}
                  accessibilityRole="button"
                  accessibilityLabel="Manage accounts"
                  className="min-h-[44px] px-2.5 py-2 rounded-xl flex-row items-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Manage
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/reconciliation')}
                  accessibilityRole="button"
                  accessibilityLabel="Reconcile account balance"
                  className="min-h-[44px] px-2.5 py-2 rounded-xl flex-row items-center gap-1 active:opacity-75"
                >
                  <AppIcon name="reconcile" size={14} color={theme.positive} />
                  <ThemedText className="text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                    Reconcile
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Transfer funds"
                  className="min-h-[44px] px-2.5 py-2 rounded-xl flex-row items-center gap-1 active:opacity-75"
                >
                  <AppIcon name="transfer" size={14} color={theme.primary} />
                  <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                    Transfer
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 py-0.5"
            >
              {accounts.map((account) => {
                const formatted = formatMinorUnits(account.balanceMinor, account.currency);
                return (
                  <View
                    key={account.id}
                    className="min-w-[164px] p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark"
                  >
                    <View className="flex-row items-center gap-2 mb-1">
                      <ThemedText className="text-base">{account.icon}</ThemedText>
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                        numberOfLines={1}
                      >
                        {account.name}
                      </ThemedText>
                    </View>
                    <View className="flex-row items-center gap-1.5 mb-1.5">
                      <View
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: account.color }}
                      />
                      <ThemedText className="text-[11px] font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        {getAccountTypeLabel(account.accountType)}
                      </ThemedText>
                    </View>
                    <ThemedText
                      numeric
                      className={`text-base font-bold ${
                        account.balanceMinor < 0
                          ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                          : 'text-ledger-ink dark:text-ledger-ink-dark'
                      }`}
                      numberOfLines={1}
                    >
                      {formatted}
                    </ThemedText>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* 4. Row 2 Bento Grid (2-col on Desktop >= 1024, stacked on Mobile) */}
          <View className={isDesktopBento ? 'flex-row gap-5 items-start' : 'gap-5'}>
            {/* Left Column: Planning & Budgets */}
            <View className={isDesktopBento ? 'flex-1 min-w-0 gap-5' : 'gap-5'}>
              <BudgetProgressCard
                budget={metrics.budget}
                onUpdateBudget={(minor) => updateBudgetMutation.mutateAsync(minor)}
                isUpdating={updateBudgetMutation.isPending}
              />
              <EnvelopeBudgetsCard />
              <SinkingFundsCard />
            </View>

            {/* Right Column: Insights & Ledger Activity */}
            <View className={isDesktopBento ? 'flex-1 min-w-0 gap-5' : 'gap-5'}>
              <CategoryBreakdownCard
                items={metrics.categoryBreakdown}
                totalExpenseMinor={metrics.expenseMinor}
                onCategoryPress={(item) =>
                  router.push({
                    pathname: '/expenses',
                    params: { categoryId: item.categoryId },
                  })
                }
              />
              <TagInsightsCard
                items={metrics.tagBreakdown}
                onTagPress={(item) =>
                  router.push({
                    pathname: '/expenses',
                    params: { search: item.tag },
                  })
                }
              />
              {recentActivityCard}
            </View>
          </View>

          {/* 5. Data Controls Footer (2-Step Inline Reset) */}
          <View className="py-2 items-center">
            {!confirmingClearAll ? (
              <Pressable
                onPress={() => {
                  setClearAllError(null);
                  setConfirmingClearAll(true);
                }}
                disabled={clearAllMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Reset all data"
                className="w-full max-w-[420px] min-h-[44px] py-3 px-4 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-2 active:bg-ledger-subtle dark:active:bg-ledger-subtle-dark"
              >
                <AppIcon name="delete" size={16} color={theme.negative} />
                <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  Reset All Data
                </ThemedText>
              </Pressable>
            ) : (
              <View className="w-full max-w-[480px] p-4 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3">
                <View className="flex-row items-start gap-2">
                  <AppIcon name="warning" size={16} color={theme.negative} />
                  <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark leading-4">
                    Clear all recorded entries? This removes your transactions and cannot be undone.
                  </ThemedText>
                </View>

                {clearAllError && (
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    className="p-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark"
                  >
                    <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      {clearAllError}
                    </ThemedText>
                  </View>
                )}

                <View className="flex-row gap-2.5">
                  <Pressable
                    onPress={() => {
                      setConfirmingClearAll(false);
                      setClearAllError(null);
                    }}
                    disabled={clearAllMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel resetting all data"
                    className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Cancel
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => void handleConfirmResetData()}
                    disabled={clearAllMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm reset all data"
                    className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center ${
                      clearAllMutation.isPending ? 'opacity-60' : ''
                    }`}
                  >
                    {clearAllMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.background} />
                    ) : (
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                        Confirm Reset
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
