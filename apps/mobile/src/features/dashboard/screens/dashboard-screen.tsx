import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatMinorUnits,
  getCurrentPeriodMonth,
  shiftPeriodMonth,
  type DashboardPeriod,
  type Wallet,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { WebMaxContentWidth } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { confirmAction } from '@/common/lib/confirm';

import {
  TRANSACTION_KEYS,
  useDashboardMetrics,
  useDeleteTransaction,
  useUpdateMonthlyBudget,
} from '@/features/transactions/hooks/use-transactions';

import { SafeToSpendCard } from '../components/safe-to-spend-card';
import { NetWorthCard } from '../components/net-worth-card';
import { BudgetProgressCard } from '../components/budget-progress-card';
import { CashflowTrendCard } from '../components/cashflow-trend-card';
import { EnvelopeBudgetsCard } from '../components/envelope-budgets-card';
import { SinkingFundsCard } from '../components/sinking-funds-card';
import { CategoryBreakdownCard } from '../components/category-breakdown-card';
import { TagInsightsCard } from '../components/tag-insights-card';
import { WalletManagerModal } from '../components/wallet-manager-modal';

const PERIOD_TABS: Array<{ key: DashboardPeriod; label: string }> = [
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_7_DAYS', label: '7 Days' },
  { key: 'ALL_TIME', label: 'All Time' },
];

type MobileSection = 'OVERVIEW' | 'BUDGETS' | 'INSIGHTS';

const MOBILE_SECTIONS: Array<{ key: MobileSection; label: string }> = [
  { key: 'OVERVIEW', label: 'Overview' },
  { key: 'BUDGETS', label: 'Budgets & Vaults' },
  { key: 'INSIGHTS', label: 'Insights' },
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
  } catch (error: unknown) {
    return isoString;
  }
}

export function DashboardScreen() {
  const { isAuthenticated } = useRequireAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentPeriodMonth());
  const [mobileSection, setMobileSection] = useState<'OVERVIEW' | 'BUDGETS' | 'INSIGHTS'>('OVERVIEW');
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    } finally {
      setIsRefreshing(false);
    }
  };

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const { metrics, wallets, categories, isLoading, isError, refetch } = useDashboardMetrics(
    period,
    period === 'MONTH' ? selectedMonth : undefined,
  );
  const updateBudgetMutation = useUpdateMonthlyBudget();
  const deleteTransactionMutation = useDeleteTransaction();

  const currentMonth = getCurrentPeriodMonth();
  const activeMonthParam =
    period === 'THIS_MONTH'
      ? currentMonth
      : period === 'MONTH'
        ? selectedMonth
        : undefined;

  const handlePeriodChange = (nextPeriod: DashboardPeriod) => {
    if (nextPeriod === 'THIS_MONTH') {
      setSelectedMonth(getCurrentPeriodMonth());
    }
    setPeriod(nextPeriod);
  };

  const handleShiftMonth = (delta: number) => {
    const latestMonth = getCurrentPeriodMonth();
    const nextMonth = shiftPeriodMonth(selectedMonth, delta);
    if (nextMonth > latestMonth) {
      return;
    }
    setSelectedMonth(nextMonth);
    setPeriod(nextMonth === latestMonth ? 'THIS_MONTH' : 'MONTH');
  };

  const handleSelectTrendMonth = (periodMonth: string) => {
    const latestMonth = getCurrentPeriodMonth();
    setSelectedMonth(periodMonth);
    setPeriod(periodMonth === latestMonth ? 'THIS_MONTH' : 'MONTH');
  };

  const handleUndoTransaction = async (txId: string, label: string) => {
    const confirmed = await confirmAction({
      title: 'Delete Transaction',
      message: `Remove "${label}" and reverse its wallet balance change?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      deleteTransactionMutation.mutate(txId);
    }
  };

  const handleOpenAddWallet = () => {
    setEditingWallet(null);
    setWalletModalVisible(true);
  };

  const handleOpenEditWallet = (wallet: Wallet) => {
    setEditingWallet(wallet);
    setWalletModalVisible(true);
  };

  if (!isAuthenticated) {
    return null;
  }

  const walletsNode = (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between mb-0.5 flex-wrap gap-2">
        <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Wallets & Accounts
        </ThemedText>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleOpenAddWallet}
            accessibilityRole="button"
            accessibilityLabel="Add new wallet"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[44px] justify-center px-2 active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-brand-500">
              + Add Wallet
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/reconciliation')}
            accessibilityRole="button"
            accessibilityLabel="Reconcile account balance"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[44px] justify-center px-2 active:opacity-75"
          >
            <ThemedText className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Reconcile
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/capture', params: { initialType: 'TRANSFER' } })
            }
            accessibilityRole="button"
            accessibilityLabel="Transfer funds"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[44px] justify-center px-2 active:opacity-75"
          >
            <ThemedText className="text-xs font-semibold text-brand-500">
              Transfer
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {isDesktop ? (
        <View className="flex-row flex-wrap gap-3.5">
          {wallets.map((wallet) => {
            const formatted = formatMinorUnits(wallet.balanceMinor, wallet.currency);
            return (
              <Pressable
                key={wallet.id}
                onPress={() => handleOpenEditWallet(wallet)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${wallet.name} wallet, balance ${formatted}`}
                className="flex-1 min-w-[200px] min-h-[44px] p-4 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm justify-between active:opacity-80"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2 flex-1 mr-2">
                    <ThemedText className="text-xl">{wallet.icon}</ThemedText>
                    <ThemedText
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1"
                      numberOfLines={1}
                    >
                      {wallet.name}
                    </ThemedText>
                  </View>
                  <View className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#171f33] border border-slate-200/60 dark:border-slate-700/60">
                    <ThemedText className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {wallet.type.replace('_', ' ')}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText
                  className="text-lg font-bold font-mono leading-tight"
                  style={{ color: wallet.color }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {formatted}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 py-1"
          contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
        >
          {wallets.map((wallet) => {
            const formatted = formatMinorUnits(wallet.balanceMinor, wallet.currency);
            return (
              <Pressable
                key={wallet.id}
                onPress={() => handleOpenEditWallet(wallet)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${wallet.name} wallet, balance ${formatted}`}
                className="min-w-[156px] min-h-[44px] p-3.5 rounded-2xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm active:opacity-80"
              >
                <View className="flex-row items-center justify-between gap-2 mb-2">
                  <View className="flex-row items-center gap-1.5 flex-1">
                    <ThemedText className="text-base">{wallet.icon}</ThemedText>
                    <ThemedText
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1"
                      numberOfLines={1}
                    >
                      {wallet.name}
                    </ThemedText>
                  </View>
                  <View className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#171f33]">
                    <ThemedText className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                      {wallet.type.replace('_', ' ')}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText
                  className="text-base font-bold font-mono leading-tight"
                  style={{ color: wallet.color }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {formatted}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const recentActivityNode = (
    <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
      <View className="flex-row justify-between items-center mb-3">
        <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
          Recent Activity
        </ThemedText>
        <Pressable
          onPress={() => router.push('/transactions')}
          accessibilityRole="button"
          accessibilityLabel="See all transactions"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="min-h-[36px] justify-center py-1 px-2 active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-brand-500">
            See All →
          </ThemedText>
        </Pressable>
      </View>

      {metrics.recentTransactions.length === 0 ? (
        <View className="items-center py-6 gap-2">
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
            className="min-h-[44px] bg-brand-500 active:bg-brand-600 px-4 py-2.5 rounded-xl mt-2 justify-center items-center"
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

            const fromWallet = wallets.find((w) => w.id === tx.walletId);
            const subtitleParts: string[] = [];
            if (tx.merchant) {
              subtitleParts.push(tx.merchant);
            }
            if (fromWallet) {
              subtitleParts.push(fromWallet.name);
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
                  <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#171f33] items-center justify-center">
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
                  <ThemedText className={`text-sm font-bold font-mono ${amountColorClass}`}>
                    {formattedAmount}
                  </ThemedText>
                  <Pressable
                    onPress={() => void handleUndoTransaction(tx.id, categoryName)}
                    disabled={deleteTransactionMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Undo transaction"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="min-h-[44px] px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 active:opacity-75 items-center justify-center"
                  >
                    <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
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
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
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
            maxWidth: Platform.OS === 'web' ? WebMaxContentWidth : 720,
            alignSelf: 'center',
            paddingHorizontal: isDesktop ? 28 : 16,
            paddingTop: isDesktop ? 24 : 16,
            paddingBottom: 80,
            gap: isDesktop ? 24 : 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Command Header */}
          <View className="py-1 gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-3 py-1">
              <View className="flex-1 min-w-[200px] gap-0.5">
                <ThemedText className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Overview
                </ThemedText>
                <ThemedText className="text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>
                  Financial command center & real-time liquidity
                </ThemedText>
              </View>

              <View className="flex-row items-center gap-2 flex-wrap">
                {/* Desktop Quick Period Selector */}
                {isDesktop && (
                  <View className="flex-row items-center bg-slate-200/70 dark:bg-[#131b2e] p-1 rounded-full border border-slate-300/60 dark:border-slate-800 mr-1">
                    {PERIOD_TABS.map((tab) => {
                      const isActive =
                        period === tab.key ||
                        (tab.key === 'THIS_MONTH' && period === 'MONTH');
                      return (
                        <Pressable
                          key={tab.key}
                          onPress={() => handlePeriodChange(tab.key)}
                          accessibilityRole="button"
                          accessibilityLabel={`Filter by ${tab.label}`}
                          accessibilityState={{ selected: isActive }}
                          className={`min-h-[44px] px-3.5 rounded-full items-center justify-center ${
                            isActive
                              ? 'bg-brand-500 shadow-sm'
                              : 'bg-transparent active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs ${
                              isActive
                                ? 'font-bold text-white'
                                : 'font-semibold text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {tab.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {isDesktop && (
                  <>
                    <Pressable
                      onPress={() => router.push('/reconciliation')}
                      accessibilityRole="button"
                      accessibilityLabel="Reconcile account balance"
                      className="min-h-[44px] px-3.5 py-2 rounded-full bg-slate-100 dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 active:opacity-75 flex-row items-center gap-1.5"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Reconcile
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => router.push('/portability')}
                      accessibilityRole="button"
                      accessibilityLabel="Backup or Export data"
                      className="min-h-[44px] px-3.5 py-2 rounded-full bg-slate-100 dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 active:opacity-75 flex-row items-center gap-1.5"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Backup
                      </ThemedText>
                    </Pressable>
                  </>
                )}

                {isAuthenticated && !isDesktop && (
                  <Pressable
                    onPress={() => router.push('/settings')}
                    accessibilityRole="button"
                    accessibilityLabel="Open Settings"
                    className="min-h-[44px] px-3.5 py-2 rounded-full bg-slate-100 dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 active:opacity-75 items-center justify-center"
                  >
                    <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Settings
                    </ThemedText>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => router.push('/capture')}
                  accessibilityRole="button"
                  accessibilityLabel="Add fast transaction"
                  className="min-h-[44px] bg-brand-500 active:bg-brand-600 px-4 py-2 rounded-full shadow-md shadow-brand-500/25 flex-row items-center justify-center gap-1"
                >
                  <ThemedText className="text-white font-bold text-xs sm:text-sm">
                    + Fast Entry
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Loading / Error Guard */}
          {isLoading ? (
            <View className="py-12 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="#208AEF" />
              <ThemedText className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Loading financial overview...
              </ThemedText>
            </View>
          ) : isError ? (
            <View className="p-6 rounded-3xl bg-white dark:bg-[#131b2e] border border-rose-200 dark:border-rose-900/60 items-center gap-3 shadow-sm">
              <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
                Could not load financial data
              </ThemedText>
              <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[300px]">
                There was an issue reading your local budget records. Please try again.
              </ThemedText>
              <Pressable
                onPress={() => void refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading dashboard"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-white">Retry</ThemedText>
              </Pressable>
            </View>
          ) : isDesktop ? (
            <>
              {/* Row 1 (Hero Row — 7:5 split) */}
              <View className="flex-row gap-6 items-start">
                <View className="flex-[7] min-w-0 gap-6">
                  <SafeToSpendCard />
                  <CashflowTrendCard
                    points={metrics.monthlyTrend}
                    activePeriodMonth={period === 'MONTH' ? selectedMonth : currentMonth}
                    onSelectMonth={handleSelectTrendMonth}
                  />
                </View>
                <View className="flex-[5] min-w-0 gap-6">
                  <NetWorthCard
                    period={period}
                    onPeriodChange={handlePeriodChange}
                    selectedMonth={selectedMonth}
                    onShiftMonth={handleShiftMonth}
                    netWorthMinor={metrics.netWorthMinor}
                    incomeMinor={metrics.incomeMinor}
                    expenseMinor={metrics.expenseMinor}
                    netCashflowMinor={metrics.netCashflowMinor}
                    savingsRatePercent={metrics.savingsRatePercent}
                    transactionCount={metrics.transactionCount}
                  />
                  <BudgetProgressCard
                    budget={metrics.budget}
                    onUpdateBudget={(minor) => updateBudgetMutation.mutateAsync(minor)}
                    isUpdating={updateBudgetMutation.isPending}
                  />
                </View>
              </View>

              {/* Row 2 (Wallets & Accounts Multi-column) */}
              {walletsNode}

              {/* Row 3 (Planning & Vaults — 1:1 split) */}
              <View className="flex-row gap-6 items-start">
                <View className="flex-1 min-w-0">
                  <EnvelopeBudgetsCard />
                </View>
                <View className="flex-1 min-w-0">
                  <SinkingFundsCard />
                </View>
              </View>

              {/* Row 4 (Analytics & Activity — 5:7 split) */}
              <View className="flex-row gap-6 items-start">
                <View className="flex-[5] min-w-0 gap-6">
                  <CategoryBreakdownCard
                    items={metrics.categoryBreakdown}
                    totalExpenseMinor={metrics.expenseMinor}
                    incomeItems={metrics.incomeCategoryBreakdown}
                    totalIncomeMinor={metrics.incomeMinor}
                    onCategoryPress={(item, txType) =>
                      router.push({
                        pathname: '/transactions',
                        params: {
                          categoryId: item.categoryId,
                          type: txType,
                          ...(activeMonthParam ? { month: activeMonthParam } : {}),
                        },
                      })
                    }
                  />
                  <TagInsightsCard
                    items={metrics.tagBreakdown}
                    onTagPress={(item) =>
                      router.push({
                        pathname: '/transactions',
                        params: {
                          tag: item.tag,
                          ...(activeMonthParam ? { month: activeMonthParam } : {}),
                        },
                      })
                    }
                  />
                </View>
                <View className="flex-[7] min-w-0 gap-6">
                  {recentActivityNode}
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Top Hero: Safe to Spend Card */}
              <SafeToSpendCard />

              {/* 3-Segment Stitch Pill Switcher */}
              <View className="flex-row items-center bg-slate-200/70 dark:bg-[#131b2e] p-1 rounded-2xl border border-slate-300/60 dark:border-slate-800">
                {MOBILE_SECTIONS.map((sec) => {
                  const isActive = mobileSection === sec.key;
                  return (
                    <Pressable
                      key={sec.key}
                      onPress={() => setMobileSection(sec.key)}
                      accessibilityRole="tab"
                      accessibilityLabel={`Show ${sec.label}`}
                      accessibilityState={{ selected: isActive }}
                      className={`flex-1 min-h-[44px] px-2 py-2.5 rounded-xl items-center justify-center ${
                        isActive
                          ? 'bg-brand-500 shadow-sm'
                          : 'bg-transparent active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs text-center ${
                          isActive
                            ? 'font-bold text-white'
                            : 'font-semibold text-slate-600 dark:text-slate-300'
                        }`}
                        numberOfLines={1}
                      >
                        {sec.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Mobile Section View */}
              {mobileSection === 'OVERVIEW' && (
                <>
                  <NetWorthCard
                    period={period}
                    onPeriodChange={handlePeriodChange}
                    selectedMonth={selectedMonth}
                    onShiftMonth={handleShiftMonth}
                    netWorthMinor={metrics.netWorthMinor}
                    incomeMinor={metrics.incomeMinor}
                    expenseMinor={metrics.expenseMinor}
                    netCashflowMinor={metrics.netCashflowMinor}
                    savingsRatePercent={metrics.savingsRatePercent}
                    transactionCount={metrics.transactionCount}
                  />
                  {walletsNode}
                  <CashflowTrendCard
                    points={metrics.monthlyTrend}
                    activePeriodMonth={period === 'MONTH' ? selectedMonth : currentMonth}
                    onSelectMonth={handleSelectTrendMonth}
                  />
                  <BudgetProgressCard
                    budget={metrics.budget}
                    onUpdateBudget={(minor) => updateBudgetMutation.mutateAsync(minor)}
                    isUpdating={updateBudgetMutation.isPending}
                  />
                  {recentActivityNode}
                </>
              )}

              {mobileSection === 'BUDGETS' && (
                <>
                  <BudgetProgressCard
                    budget={metrics.budget}
                    onUpdateBudget={(minor) => updateBudgetMutation.mutateAsync(minor)}
                    isUpdating={updateBudgetMutation.isPending}
                  />
                  <EnvelopeBudgetsCard />
                  <SinkingFundsCard />
                </>
              )}

              {mobileSection === 'INSIGHTS' && (
                <>
                  <CashflowTrendCard
                    points={metrics.monthlyTrend}
                    activePeriodMonth={period === 'MONTH' ? selectedMonth : currentMonth}
                    onSelectMonth={handleSelectTrendMonth}
                  />
                  <CategoryBreakdownCard
                    items={metrics.categoryBreakdown}
                    totalExpenseMinor={metrics.expenseMinor}
                    incomeItems={metrics.incomeCategoryBreakdown}
                    totalIncomeMinor={metrics.incomeMinor}
                    onCategoryPress={(item, txType) =>
                      router.push({
                        pathname: '/transactions',
                        params: {
                          categoryId: item.categoryId,
                          type: txType,
                          ...(activeMonthParam ? { month: activeMonthParam } : {}),
                        },
                      })
                    }
                  />
                  <TagInsightsCard
                    items={metrics.tagBreakdown}
                    onTagPress={(item) =>
                      router.push({
                        pathname: '/transactions',
                        params: {
                          tag: item.tag,
                          ...(activeMonthParam ? { month: activeMonthParam } : {}),
                        },
                      })
                    }
                  />
                  {recentActivityNode}
                </>
              )}
            </>
          )}
        </ScrollView>

        <WalletManagerModal
          visible={walletModalVisible}
          editingWallet={editingWallet}
          onClose={() => {
            setWalletModalVisible(false);
            setEditingWallet(null);
          }}
        />
      </SafeAreaView>
    </View>
  );
}
