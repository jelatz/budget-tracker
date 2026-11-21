import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type DashboardPeriod,
} from '@repo/contracts';

import { SyncStatusBadge } from '@/common/components/sync-status-badge';
import { ThemedText } from '@/common/components/themed-text';
import { useRequireAuth } from '@/common/hooks/use-require-auth';

import {
  useClearAllTransactions,
  useDashboardMetrics,
  useDeleteTransaction,
  useResetDemoData,
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
  const { isAuthenticated, user, logout } = useRequireAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');

  const { metrics, accounts, categories } = useDashboardMetrics(period);
  const updateBudgetMutation = useUpdateMonthlyBudget();
  const deleteTransactionMutation = useDeleteTransaction();
  const resetDemoMutation = useResetDemoData();
  const clearAllMutation = useClearAllTransactions();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="w-full px-4 pt-4 pb-20 gap-5"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Header Bar */}
          <View className="py-1 gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2 py-1">
              <View className="flex-1 min-w-[140px] gap-0.5">
                <ThemedText className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Overview
                </ThemedText>
                <ThemedText className="text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>
                  Financial command center
                </ThemedText>
              </View>

              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => router.push('/portability' as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Backup or Export data"
                  className="px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 active:opacity-75 flex-row items-center gap-1.5"
                >
                  <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Export 💾
                  </ThemedText>
                </Pressable>

                {isAuthenticated && (
                  <Pressable
                    onPress={async () => {
                      await logout();
                      router.replace('/');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Sign Out"
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                    className="px-2.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      Sign Out
                    </ThemedText>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Add fast transaction"
                  className="bg-brand-500 active:bg-brand-600 px-3 py-1.5 rounded-full shadow-md shadow-brand-500/25 flex-row items-center justify-center"
                >
                  <ThemedText className="text-white font-bold text-xs sm:text-sm">
                    + Fast Entry
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {isAuthenticated && (
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                  <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    👤 {user?.email ?? 'Authenticated'}
                  </ThemedText>
                </View>
                <SyncStatusBadge />
              </View>
            )}
          </View>

          {/* 2. Safe to Spend Hero Card */}
          <SafeToSpendCard />

          {/* 3. Net Worth Card */}
          <NetWorthCard
            period={period}
            onPeriodChange={setPeriod}
            netWorthMinor={metrics.netWorthMinor}
            incomeMinor={metrics.incomeMinor}
            expenseMinor={metrics.expenseMinor}
            netCashflowMinor={metrics.netCashflowMinor}
            transactionCount={metrics.transactionCount}
          />

          {/* 4. Budget Progress Card */}
          <BudgetProgressCard
            budget={metrics.budget}
            onUpdateBudget={(minor) => updateBudgetMutation.mutateAsync(minor)}
            isUpdating={updateBudgetMutation.isPending}
          />

          {/* 5. Accounts Horizontal Strip */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between mb-0.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Accounts
              </ThemedText>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => router.push('/accounts')}
                  accessibilityRole="button"
                  accessibilityLabel="Manage accounts"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="py-1 px-1 active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Manage
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/reconciliation')}
                  accessibilityRole="button"
                  accessibilityLabel="Reconcile account balance"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="py-1 px-1 active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Reconcile ⚖️
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Transfer funds"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="py-1 px-1 active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-brand-500">
                    Transfer ⇄
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 py-1"
            >
              {accounts.map((account) => {
                const formatted = formatMinorUnits(account.balanceMinor, account.currency);
                return (
                  <View
                    key={account.id}
                    className="min-w-[155px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm"
                  >
                    <View className="flex-row items-center gap-2 mb-1">
                      <ThemedText className="text-base">{account.icon}</ThemedText>
                      <ThemedText
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1"
                        numberOfLines={1}
                      >
                        {account.name}
                      </ThemedText>
                    </View>
                    <ThemedText className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                      {getAccountTypeLabel(account.accountType)}
                    </ThemedText>
                    <ThemedText
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

          {/* 5. Category Envelopes Card */}
          <EnvelopeBudgetsCard />

          {/* 6. Sinking Funds (Savings Vaults) Card */}
          <SinkingFundsCard />

          {/* 7. Category Breakdown Card */}
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

          {/* 8. Tag Insights Card */}
          <TagInsightsCard
            items={metrics.tagBreakdown}
            onTagPress={(item) =>
              router.push({
                pathname: '/expenses',
                params: { search: item.tag },
              })
            }
          />

          {/* 9. Recent Transactions Preview Card */}
          <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                Recent Activity
              </ThemedText>
              <Pressable
                onPress={() => router.push('/transactions')}
                accessibilityRole="button"
                accessibilityLabel="See all transactions"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="py-1 px-1 active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-brand-500">
                  See All →
                </ThemedText>
              </Pressable>
            </View>

            {metrics.recentTransactions.length === 0 ? (
              <View className="items-center py-6 gap-2">
                <ThemedText className="text-3xl mb-1">📝</ThemedText>
                <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                  No activity yet
                </ThemedText>
                <ThemedText className="text-xs text-center text-slate-500 dark:text-slate-400 max-w-[280px] leading-5">
                  Capture an expense, income, or transfer to see insights here.
                </ThemedText>
                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Record transaction"
                  className="bg-brand-500 active:bg-brand-600 px-4 py-2.5 rounded-xl mt-2"
                >
                  <ThemedText className="text-white font-bold text-xs">
                    + Record Transaction
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View className="mt-1">
                {metrics.recentTransactions.map((tx, idx) => {
                  let categoryIcon = '🏷️';
                  let categoryName = 'Uncategorized';
                  const isSplit = Boolean(tx.splits && tx.splits.length > 0);

                  if (tx.type === 'TRANSFER') {
                    categoryIcon = '⇄';
                    categoryName = 'Transfer';
                  } else if (isSplit) {
                    categoryIcon = '🔀';
                    categoryName = `Split (${tx.splits?.length ?? 0})`;
                  } else if (tx.categoryId) {
                    const cat = categories.find((c) => c.id === tx.categoryId);
                    if (cat) {
                      categoryIcon = cat.icon;
                      categoryName = cat.name;
                    }
                  }

                  let formattedAmount = formatMinorUnits(tx.amountMinor, tx.currency);
                  let amountColorClass = 'text-rose-600 dark:text-rose-400';
                  if (tx.type === 'INCOME') {
                    formattedAmount = `+${formattedAmount}`;
                    amountColorClass = 'text-emerald-600 dark:text-emerald-400';
                  } else if (tx.type === 'TRANSFER') {
                    formattedAmount = `⇄ ${formattedAmount}`;
                    amountColorClass = 'text-brand-500';
                  } else {
                    formattedAmount = `-${formattedAmount}`;
                    amountColorClass = 'text-rose-600 dark:text-rose-400';
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
                  const subtitle = subtitleParts.join(' • ');

                  const isLast = idx === metrics.recentTransactions.length - 1;

                  return (
                    <View
                      key={tx.id}
                      className={`flex-row items-center justify-between py-3 gap-3 ${
                        !isLast ? 'border-b border-slate-100 dark:border-slate-800/80' : ''
                      }`}
                    >
                      <View className="flex-row items-center gap-3 flex-1">
                        <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center">
                          <ThemedText className="text-base">{categoryIcon}</ThemedText>
                        </View>
                        <View className="flex-1 gap-0.5">
                          <ThemedText
                            className="text-sm font-semibold text-slate-900 dark:text-white"
                            numberOfLines={1}
                          >
                            {categoryName}
                          </ThemedText>
                          <ThemedText
                            className="text-xs text-slate-500 dark:text-slate-400"
                            numberOfLines={1}
                          >
                            {subtitle}
                          </ThemedText>
                        </View>
                      </View>

                      <View className="items-end gap-1.5">
                        <ThemedText className={`text-sm font-bold ${amountColorClass}`}>
                          {formattedAmount}
                        </ThemedText>
                        <Pressable
                          onPress={() => deleteTransactionMutation.mutate(tx.id)}
                          disabled={deleteTransactionMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel="Undo transaction"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 active:opacity-75"
                        >
                          <ThemedText className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
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

          {/* 8. Demo Data Controls Footer */}
          <View className="flex-row gap-3 justify-center py-2">
            <Pressable
              onPress={() => resetDemoMutation.mutate()}
              disabled={resetDemoMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Restore demo data"
              className="flex-1 py-3 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {resetDemoMutation.isPending ? 'Restoring...' : '🔄 Restore Demo Data'}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Clear all entries"
              className="flex-1 py-3 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {clearAllMutation.isPending ? 'Clearing...' : '🗑️ Clear All Entries'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
