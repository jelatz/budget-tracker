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

import { SyncStatusBadge } from '@/common/components/sync-status-badge';
import { ThemedText } from '@/common/components/themed-text';
import { BottomTabInset, WebMaxPageWidth } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';

import { useDashboardMetrics } from '@/features/transactions/hooks/use-transactions';

import { BudgetProgressCard } from '../components/budget-progress-card';
import { EnvelopeBudgetsCard } from '../components/envelope-budgets-card';
import { NetWorthCard } from '../components/net-worth-card';
import { RemainingPayablesCard } from '../components/remaining-payables-card';
import { SafeToSpendCard } from '../components/safe-to-spend-card';
import { SalarySummaryCard } from '../components/salary-summary-card';
import { SinkingFundsCard } from '../components/sinking-funds-card';
import { CategoryBreakdownCard } from '../components/category-breakdown-card';
import { TagInsightsCard } from '../components/tag-insights-card';

const PERIOD_OPTIONS: Array<{ key: DashboardPeriod; label: string }> = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { key: 'ALL_TIME', label: 'All Time' },
];

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
  } catch {
    return isoString;
  }
}

export function DashboardScreen() {
  const theme = useTheme();
  const { isAuthenticated, user } = useRequireAuth();
  const { width } = useWindowDimensions();
  const isMobileWebView = Platform.OS === 'web' && width < 768;
  const isDesktopBento = width >= 1024;
  const showAccountMeta = isAuthenticated && (Platform.OS !== 'web' || !isMobileWebView);

  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');

  const { metrics, accounts, categories, isLoading, isError, refetch } =
    useDashboardMetrics(period);

  if (!isAuthenticated) {
    return null;
  }

  const isInitialLoading = isLoading && accounts.length === 0 && metrics.transactionCount === 0;

  const recentActivityCard = (
    <Pressable
      onPress={() => router.push('/history')}
      accessibilityRole="link"
      accessibilityLabel="Recent Activity. View full transaction history"
      className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-85"
    >
      <View className="flex-row justify-between items-center mb-3 gap-2">
        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
          Recent Activity
        </ThemedText>
        <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
          View History
        </ThemedText>
      </View>

      {metrics.recentTransactions.length === 0 ? (
        <View className="items-center py-6 px-4 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[280px] leading-5">
            No activity yet in this period. Tap to view transaction history.
          </ThemedText>
        </View>
      ) : (
        <View className="mt-1">
          {metrics.recentTransactions.map((tx, idx) => {
            const isSplit = Boolean(tx.splits && tx.splits.length > 0);
            const matchedCategory = tx.categoryId
              ? categories.find((c) => c.id === tx.categoryId)
              : undefined;

            let categoryName = 'Uncategorized';
            let monogram = 'TX';
            if (tx.type === 'TRANSFER') {
              categoryName = 'Transfer';
              monogram = 'TR';
            } else if (isSplit) {
              categoryName = `Split (${tx.splits?.length ?? 0})`;
              monogram = 'SP';
            } else if (matchedCategory) {
              categoryName = matchedCategory.name;
              monogram = matchedCategory.name.trim().slice(0, 2).toUpperCase() || 'TX';
            } else {
              monogram = categoryName.slice(0, 2).toUpperCase();
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
                    <ThemedText className="text-xs font-bold tracking-wider text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {monogram}
                    </ThemedText>
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

                <View className="items-end shrink-0">
                  <ThemedText numeric className={`text-sm font-bold ${amountColorClass}`}>
                    {formattedAmount}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
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
          <View className="py-1 gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-1 min-w-[160px] gap-0.5">
                <ThemedText
                  accessibilityRole="header"
                  className="text-2xl sm:text-[28px] font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Dashboard
                </ThemedText>
                <ThemedText
                  className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  numberOfLines={1}
                >
                  Personal Ledger
                </ThemedText>
              </View>

              {showAccountMeta && (
                <View className="flex-row flex-wrap items-center gap-2">
                  <View className="min-h-[32px] px-3 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center">
                    <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {user?.email ?? 'Authenticated'}
                    </ThemedText>
                  </View>
                  <SyncStatusBadge />
                </View>
              )}
            </View>

            {/* Read-only Segmented Period Selector */}
            <View className="flex-row items-center bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark p-1 rounded-xl">
              {PERIOD_OPTIONS.map((option) => {
                const isActive = period === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Select period ${option.label}`}
                    onPress={() => setPeriod(option.key)}
                    className={`flex-1 min-h-[44px] py-2 px-2 rounded-lg items-center justify-center active:opacity-80 ${
                      isActive ? 'bg-brand-500 dark:bg-brand-400' : 'bg-transparent'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs ${
                        isActive
                          ? 'font-bold text-ledger-canvas dark:text-ledger-canvas-dark'
                          : 'font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                      }`}
                      numberOfLines={1}
                    >
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {isInitialLoading ? (
            <View className="py-16 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Loading dashboard...
              </ThemedText>
            </View>
          ) : isError ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="p-5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3 items-start"
            >
              <ThemedText className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                Could not load dashboard metrics.
              </ThemedText>
              <Pressable
                onPress={() => {
                  void refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading dashboard metrics"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* 2. Row 1 Top Hero (2-col 7:5 on Desktop >= 1024, stacked on Mobile) */}
              <View className={isDesktopBento ? 'flex-row gap-5 items-start' : 'gap-5'}>
                <View className={isDesktopBento ? 'flex-[7] min-w-0' : 'w-full'}>
                  <SafeToSpendCard
                    onPress={() =>
                      router.push({ pathname: '/expenses', params: { tab: 'scheduled' } })
                    }
                  />
                </View>
                <View className={isDesktopBento ? 'flex-[5] min-w-0' : 'w-full'}>
                  <NetWorthCard
                    netWorthMinor={metrics.netWorthMinor}
                    incomeMinor={metrics.incomeMinor}
                    expenseMinor={metrics.expenseMinor}
                    netCashflowMinor={metrics.netCashflowMinor}
                    transactionCount={metrics.transactionCount}
                    onPress={() => router.push('/transactions')}
                  />
                </View>
              </View>

              {/* 2b. Remaining Payables This Month (full width glimpse) */}
              <RemainingPayablesCard
                onPress={() =>
                  router.push({ pathname: '/expenses', params: { tab: 'scheduled' } })
                }
              />

              {/* 3. Full-Width Accounts Horizontal Strip */}
              <View className="gap-2">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Accounts
                </ThemedText>

                {accounts.length === 0 ? (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/accounts', params: { tab: 'accounts' } })
                    }
                    accessibilityRole="link"
                    accessibilityLabel="No accounts configured. View Accounts"
                    className="min-h-[44px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark active:opacity-85"
                  >
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      No accounts yet. Tap to set up in Accounts.
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-3 py-0.5"
                  >
                    {accounts.map((account) => {
                      const formatted = formatMinorUnits(account.balanceMinor, account.currency);
                      return (
                        <Pressable
                          key={account.id}
                          onPress={() =>
                            router.push({ pathname: '/accounts', params: { tab: 'accounts' } })
                          }
                          accessibilityRole="link"
                          accessibilityLabel={`${account.name}, ${getAccountTypeLabel(
                            account.accountType,
                          )}, ${formatted}. View Accounts`}
                          className="min-w-[164px] min-h-[44px] p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-85"
                        >
                          <View className="flex-row items-center gap-2 mb-1">
                            <View
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: account.color }}
                            />
                            <ThemedText
                              className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                              numberOfLines={1}
                            >
                              {account.name}
                            </ThemedText>
                          </View>
                          <ThemedText className="text-[11px] font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1.5">
                            {getAccountTypeLabel(account.accountType)}
                          </ThemedText>
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
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* 4. Row 2 Bento Grid (2-col on Desktop >= 1024, stacked on Mobile) */}
              <View className={isDesktopBento ? 'flex-row gap-5 items-start' : 'gap-5'}>
                {/* Left Column: Planning & Budgets */}
                <View className={isDesktopBento ? 'flex-1 min-w-0 gap-5' : 'gap-5'}>
                  <SalarySummaryCard
                    onPress={() =>
                      router.push({ pathname: '/accounts', params: { tab: 'income-sources' } })
                    }
                  />
                  <BudgetProgressCard
                    budget={metrics.budget}
                    onPress={() =>
                      router.push({ pathname: '/expenses', params: { tab: 'budgets' } })
                    }
                  />
                  <EnvelopeBudgetsCard
                    onPress={() =>
                      router.push({ pathname: '/expenses', params: { tab: 'budgets' } })
                    }
                  />
                  <SinkingFundsCard
                    onPress={() =>
                      router.push({ pathname: '/accounts', params: { tab: 'sinking-funds' } })
                    }
                  />
                </View>

                {/* Right Column: Insights & Ledger Activity */}
                <View className={isDesktopBento ? 'flex-1 min-w-0 gap-5' : 'gap-5'}>
                  <CategoryBreakdownCard
                    items={metrics.categoryBreakdown}
                    totalExpenseMinor={metrics.expenseMinor}
                    onHeaderPress={() =>
                      router.push({ pathname: '/expenses', params: { tab: 'recorded' } })
                    }
                    onCategoryPress={(item) =>
                      router.push({
                        pathname: '/expenses',
                        params: { tab: 'recorded', categoryId: item.categoryId },
                      })
                    }
                  />
                  <TagInsightsCard
                    items={metrics.tagBreakdown}
                    onHeaderPress={() =>
                      router.push({ pathname: '/expenses', params: { tab: 'recorded' } })
                    }
                    onTagPress={(item) =>
                      router.push({
                        pathname: '/expenses',
                        params: { tab: 'recorded', search: item.tag },
                      })
                    }
                  />
                  {recentActivityCard}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
