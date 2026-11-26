import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type RecurringCommitment,
  type UpcomingPayday,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { LogPaydayModal } from '@/features/accounts/components/log-payday-modal';
import { PayObligationModal } from '@/features/debts/components/pay-obligation-modal';
import { TransactionFormModal } from '@/features/transactions/components/transaction-form-modal';
import {
  useAllCategories,
  useDashboardMetrics,
  useDebtOverview,
  useLogPayday,
  useNextPayday,
  useSafeToSpendMetrics,
} from '@/features/transactions/hooks/use-transactions';

import { CategoryBreakdownCard } from '../components/category-breakdown-card';
import { RemainingPayablesCard } from '../components/remaining-payables-card';
import { SafeToSpendCard } from '../components/safe-to-spend-card';

export function DashboardScreen() {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { showSuccess } = useFeedback();
  const insets = useSafeAreaInsets();

  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [payingPayday, setPayingPayday] = useState<UpcomingPayday | null>(null);
  const [payingObligation, setPayingObligation] =
    useState<RecurringCommitment | null>(null);

  const safeToSpendQuery = useSafeToSpendMetrics();
  const {
    metrics,
    accounts,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useDashboardMetrics('THIS_MONTH');
  const { categories } = useAllCategories();
  const { overview, nextPaydayDate } = useDebtOverview();
  const { nextPayday } = useNextPayday();
  const logPaydayMutation = useLogPayday();

  if (!isAuthenticated) {
    return null;
  }

  const currency = accounts[0]?.currency ?? DEFAULT_CURRENCY;
  const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const totalLiquidMinor = liquidAccounts.reduce(
    (sum, a) => sum + a.balanceMinor,
    0,
  );
  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 28);

  const todayDisplay = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const handleLogPayday = async (params: {
    sourceId: string;
    amountMinor: number;
    accountId: string;
    occurredAt: string;
    note?: string;
  }) => {
    const res = await logPaydayMutation.mutateAsync(params);
    showSuccess(
      `Recorded ${res.source.name} payday (+${formatMinorUnits(
        res.transaction.amountMinor,
        res.transaction.currency,
      )}).`,
    );
  };

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: scrollBottomPadding,
            ...(Platform.OS === 'web'
              ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
              : {}),
          }}
        >
          {/* Compact Home Header */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4">
            <View className="flex-1 min-w-[180px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                {todayDisplay}
              </ThemedText>
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Home
              </ThemedText>
            </View>

            <Pressable
              onPress={() => setQuickExpenseOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Log Expense"
              className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-4 py-2.5 rounded-full flex-row items-center gap-1.5"
            >
              <AppIcon name="add" size={16} color={theme.onPrimary} />
              <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-xs sm:text-sm">
                Log Spend
              </ThemedText>
            </Pressable>
          </View>

          <View className="gap-4">
            {/* Block 1: Hero Safe to Spend until Next Payday */}
            <SafeToSpendCard
              metrics={safeToSpendQuery.data}
              currency={currency}
              isLoading={safeToSpendQuery.isLoading || metricsLoading}
              isError={safeToSpendQuery.isError}
              onRetry={() => {
                void Promise.all([safeToSpendQuery.refetch(), refetchMetrics()]);
              }}
              onPressPaydays={() =>
                router.push({
                  pathname: '/accounts',
                  params: { tab: 'PAYDAYS' },
                })
              }
              onPressDebts={() => router.push('/debts')}
            />

            {/* Block 2: Next Payday & Obligations Due Before Payday */}
            <RemainingPayablesCard
              nextPayday={nextPayday}
              nextPaydayDate={nextPaydayDate}
              dueCards={overview.creditCards}
              dueObligations={[...overview.loans, ...overview.bills]}
              currency={currency}
              onReceivePayday={(pd) => setPayingPayday(pd)}
              onSetupPaydays={() =>
                router.push({
                  pathname: '/accounts',
                  params: { tab: 'PAYDAYS' },
                })
              }
              onPayCard={() =>
                router.push({
                  pathname: '/debts',
                  params: { tab: 'CREDIT_CARDS' },
                })
              }
              onPayObligation={(commitment) => setPayingObligation(commitment)}
              onViewAllDebts={() => router.push('/debts')}
            />

            {/* Block 3: Day-to-Day Spending */}
            <CategoryBreakdownCard
              todayExpenseMinor={metrics.todayExpenseMinor}
              monthExpenseMinor={metrics.expenseMinor}
              categories={metrics.categoryBreakdown}
              currency={currency}
              onSelectCategory={(categoryId) =>
                router.push({
                  pathname: '/transactions',
                  params: { type: 'EXPENSE', categoryId },
                })
              }
              onViewAllSpending={() => router.push('/transactions')}
            />

            {/* Block 4: Total Debt & Accounts Strip */}
            <View className="flex-row flex-wrap gap-3">
              <Pressable
                onPress={() => router.push('/accounts')}
                accessibilityRole="button"
                accessibilityLabel="Open Accounts"
                className="flex-1 min-w-[160px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-1 active:opacity-80"
              >
                <View className="flex-row items-center justify-between">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Cash &amp; Banks
                  </ThemedText>
                  <AppIcon name="chevronRight" size={14} color={theme.textMuted} />
                </View>
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-lg font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {formatMinorUnits(totalLiquidMinor, currency)}
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  {liquidAccounts.length}{' '}
                  {liquidAccounts.length === 1 ? 'account' : 'accounts'}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => router.push('/debts')}
                accessibilityRole="button"
                accessibilityLabel="Open Debts"
                className="flex-1 min-w-[160px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-1 active:opacity-80"
              >
                <View className="flex-row items-center justify-between">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Total Debt
                  </ThemedText>
                  <AppIcon name="chevronRight" size={14} color={theme.textMuted} />
                </View>
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-lg font-extrabold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                >
                  {formatMinorUnits(overview.totalDebtRemainingMinor, currency)}
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Card bills:{' '}
                  {formatMinorUnits(overview.totalCreditCardUpcomingBillMinor, currency)}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <TransactionFormModal
          visible={quickExpenseOpen}
          editingTransaction={null}
          initialType="EXPENSE"
          accounts={accounts}
          categories={categories}
          onClose={() => setQuickExpenseOpen(false)}
          onSaved={showSuccess}
          onDeleted={showSuccess}
        />

        <LogPaydayModal
          visible={payingPayday !== null}
          source={payingPayday?.source ?? null}
          accounts={liquidAccounts.length > 0 ? liquidAccounts : accounts}
          isSubmitting={logPaydayMutation.isPending}
          onClose={() => setPayingPayday(null)}
          onSubmit={handleLogPayday}
        />

        <PayObligationModal
          visible={payingObligation !== null}
          commitment={payingObligation}
          accounts={accounts}
          onClose={() => setPayingObligation(null)}
          onPaid={showSuccess}
        />
      </SafeAreaView>
    </ThemedView>
  );
}
