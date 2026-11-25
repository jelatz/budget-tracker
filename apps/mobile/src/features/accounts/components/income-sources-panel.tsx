import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  type IncomeSource,
  type IncomeSourceInput,
} from '@repo/contracts';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useDeleteIncomeSource,
  useLogPayday,
  useMonthlySalaryPlan,
  useUpsertIncomeSource,
} from '@/features/transactions/hooks/use-transactions';
import { IncomeSourceModal } from './income-source-modal';
import { IncomeSourcesSection } from './income-sources-section';
import { LogPaydayModal } from './log-payday-modal';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodDisplay(periodMonth: string): string {
  try {
    const [yearStr, monthStr] = periodMonth.split('-');
    const d = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return periodMonth;
  }
}

function shiftPeriodMonth(periodMonth: string, delta: number): string {
  const [yearStr, monthStr] = periodMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatPaydayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function IncomeSourcesPanel() {
  const theme = useTheme();
  const { showSuccess } = useFeedback();

  const [periodMonth, setPeriodMonth] = useState<string>(getCurrentPeriod);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [paydayModalSource, setPaydayModalSource] = useState<IncomeSource | null>(null);

  const {
    plan,
    accounts,
    categories,
    isLoading,
    isError,
    refetch,
  } = useMonthlySalaryPlan(periodMonth, 'EXPECTED');

  const upsertSourceMutation = useUpsertIncomeSource();
  const deleteSourceMutation = useDeleteIncomeSource();
  const logPaydayMutation = useLogPayday();

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'INCOME'),
    [categories],
  );
  const sourceNameMap = useMemo(
    () => new Map(plan.sources.map((s) => [s.source.id, s.source.name])),
    [plan.sources],
  );
  const accountNameMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const activeSourceCount = useMemo(
    () => plan.sources.filter((s) => s.source.isActive).length,
    [plan.sources],
  );

  const handleSaveSource = async (
    input: Omit<IncomeSourceInput, 'id'> & { id?: string },
  ) => {
    const saved = await upsertSourceMutation.mutateAsync(input);
    showSuccess(
      input.id ? `Updated "${saved.name}".` : `Added "${saved.name}" to your income sources.`,
    );
  };

  const handleDeleteSource = async (id: string) => {
    await deleteSourceMutation.mutateAsync(id);
    showSuccess('Removed income source.');
  };

  const handleRecordPayday = async (params: {
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

  const currentPeriod = getCurrentPeriod();
  const isCurrentPeriod = periodMonth === currentPeriod;
  const hasFixedExpected = plan.totalExpectedIncomeMinor > 0;
  const remainingMinor = Math.max(
    0,
    plan.totalExpectedIncomeMinor - plan.totalReceivedIncomeMinor,
  );
  const receivedPercent = hasFixedExpected
    ? Math.round((plan.totalReceivedIncomeMinor * 100) / plan.totalExpectedIncomeMinor)
    : 0;

  return (
    <View className="gap-5">
      {/* Period Switcher */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between p-2 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-2">
          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="min-h-[44px] min-w-[60px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Prev
            </ThemedText>
          </Pressable>

          <View className="flex-row items-center gap-2">
            <ThemedText
              numeric
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
            >
              {formatPeriodDisplay(periodMonth)}
            </ThemedText>
            {isCurrentPeriod && (
              <View className="px-2 py-0.5 rounded-full bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft">
                <ThemedText className="text-[11px] font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                  Current
                </ThemedText>
              </View>
            )}
          </View>

          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="min-h-[44px] min-w-[60px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Next
            </ThemedText>
          </Pressable>
        </View>

        {!isCurrentPeriod && (
          <View className="items-center">
            <Pressable
              onPress={() => setPeriodMonth(currentPeriod)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to current month, ${formatPeriodDisplay(currentPeriod)}`}
              className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                Current Month
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="py-12 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Loading income sources...
          </ThemedText>
        </View>
      ) : isError ? (
        <View
          accessibilityRole="alert"
          className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3"
        >
          <ThemedText className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center">
            Could not load income sources right now.
          </ThemedText>
          <Pressable
            onPress={() => {
              void refetch();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading income sources"
            className="min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Unified Warm Paper 3-Column Monthly Income Summary Strip */}
          <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row overflow-hidden">
            <View className="flex-1 p-3.5 sm:p-4 border-r border-ledger-border dark:border-ledger-border-dark gap-1">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Received
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-base sm:text-xl font-extrabold text-ledger-pine dark:text-ledger-pine-dark"
              >
                {formatMinorUnits(plan.totalReceivedIncomeMinor)}
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {`${plan.paydaysInMonth.length} ${
                  plan.paydaysInMonth.length === 1 ? 'payday' : 'paydays'
                }`}
              </ThemedText>
            </View>

            <View className="flex-1 p-3.5 sm:p-4 border-r border-ledger-border dark:border-ledger-border-dark gap-1">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Expected
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-base sm:text-xl font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
              >
                {formatMinorUnits(plan.totalExpectedIncomeMinor)}
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {`${activeSourceCount} ${
                  activeSourceCount === 1 ? 'active source' : 'active sources'
                }`}
              </ThemedText>
            </View>

            <View className="flex-1 p-3.5 sm:p-4 gap-1">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Remaining
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-base sm:text-xl font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
              >
                {hasFixedExpected ? formatMinorUnits(remainingMinor) : 'Variable'}
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={1}
              >
                {hasFixedExpected ? `${receivedPercent}% received` : 'No fixed target'}
              </ThemedText>
            </View>
          </View>

          <IncomeSourcesSection
            sources={plan.sources}
            unlinkedIncomeMinor={plan.unlinkedIncomeMinor}
            unlinkedIncomeCount={plan.unlinkedIncomeCount}
            accounts={accounts}
            onAddSource={() => {
              setEditingSource(null);
              setSourceModalVisible(true);
            }}
            onEditSource={(source) => {
              setEditingSource(source);
              setSourceModalVisible(true);
            }}
            onLogPayday={(source) => setPaydayModalSource(source)}
            onPressUnlinkedIncome={() =>
              router.push({ pathname: '/transactions', params: { type: 'INCOME' } })
            }
          />

          {/* Paydays Logged This Month */}
          <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                Paydays Logged ({formatPeriodDisplay(periodMonth)})
              </ThemedText>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/transactions', params: { type: 'INCOME' } })
                }
                accessibilityRole="link"
                accessibilityLabel="View all income transactions"
                className="min-h-[44px] min-w-[44px] px-2 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                  View All
                </ThemedText>
              </Pressable>
            </View>

            {plan.paydaysInMonth.length === 0 ? (
              <View className="py-5 px-4 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark items-center">
                <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  No income or paydays recorded in {formatPeriodDisplay(periodMonth)} yet.
                </ThemedText>
              </View>
            ) : (
              <View>
                {plan.paydaysInMonth.slice(0, 8).map((tx, idx) => {
                  const jobLabel = tx.incomeSourceId
                    ? sourceNameMap.get(tx.incomeSourceId) ?? tx.merchant ?? 'Salary'
                    : tx.merchant ?? 'Income';
                  const accountName = accountNameMap.get(tx.accountId) ?? 'Account';
                  const isLast = idx === Math.min(plan.paydaysInMonth.length, 8) - 1;
                  return (
                    <View
                      key={tx.id}
                      className={`flex-row items-center justify-between py-2.5 gap-3 ${
                        !isLast
                          ? 'border-b border-ledger-border dark:border-ledger-border-dark'
                          : ''
                      }`}
                    >
                      <View className="flex-1 min-w-0 gap-0.5">
                        <ThemedText
                          className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                          numberOfLines={1}
                        >
                          {jobLabel}
                        </ThemedText>
                        <ThemedText
                          className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                          numberOfLines={1}
                        >
                          {`${formatPaydayDate(tx.occurredAt)} · ${accountName}${
                            tx.note ? ` · ${tx.note}` : ''
                          }`}
                        </ThemedText>
                      </View>
                      <ThemedText
                        numeric
                        style={TABULAR_NUMS_STYLE}
                        className="text-sm font-bold text-ledger-pine dark:text-ledger-pine-dark shrink-0"
                      >
                        {`+${formatMinorUnits(tx.amountMinor, tx.currency)}`}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </>
      )}

      <IncomeSourceModal
        visible={sourceModalVisible}
        editingSource={editingSource}
        accounts={accounts}
        incomeCategories={incomeCategories}
        isSubmitting={
          upsertSourceMutation.isPending || deleteSourceMutation.isPending
        }
        onClose={() => {
          setSourceModalVisible(false);
          setEditingSource(null);
        }}
        onSave={handleSaveSource}
        onDelete={handleDeleteSource}
      />

      <LogPaydayModal
        visible={Boolean(paydayModalSource)}
        source={paydayModalSource}
        accounts={accounts}
        isSubmitting={logPaydayMutation.isPending}
        onClose={() => setPaydayModalSource(null)}
        onSubmit={handleRecordPayday}
      />
    </View>
  );
}
