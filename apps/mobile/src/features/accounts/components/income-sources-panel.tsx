import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  formatCalendarDateShort,
  formatMinorUnits,
  getPayScheduleLabel,
  type IncomeSource,
  type IncomeSourceInput,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useDeleteIncomeSource,
  useLogPayday,
  useMonthlySalaryPlan,
  useUpcomingPaydays,
  useUpsertIncomeSource,
} from '@/features/transactions/hooks/use-transactions';
import { IncomeSourceModal } from './income-source-modal';
import { LogPaydayModal } from './log-payday-modal';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function IncomeSourcesPanel() {
  const theme = useTheme();
  const { showSuccess } = useFeedback();

  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [paydayModalSource, setPaydayModalSource] = useState<IncomeSource | null>(null);

  const periodMonth = getCurrentPeriod();
  const { plan, accounts, categories, isLoading, isError, refetch } =
    useMonthlySalaryPlan(periodMonth, 'EXPECTED');
  const { paydays } = useUpcomingPaydays(6);

  const upsertSourceMutation = useUpsertIncomeSource();
  const deleteSourceMutation = useDeleteIncomeSource();
  const logPaydayMutation = useLogPayday();

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'INCOME'),
    [categories],
  );
  const accountNameMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const handleSaveSource = async (
    input: Omit<IncomeSourceInput, 'id'> & { id?: string },
  ) => {
    const saved = await upsertSourceMutation.mutateAsync(input);
    showSuccess(
      input.id ? `Updated "${saved.name}".` : `Added "${saved.name}" payday schedule.`,
    );
  };

  const handleDeleteSource = async (id: string) => {
    await deleteSourceMutation.mutateAsync(id);
    showSuccess('Removed payday schedule.');
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

  return (
    <View className="gap-5">
      {/* Header + Add Job CTA */}
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-1 min-w-[180px]">
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Salary &amp; Payday Schedules
          </ThemedText>
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Supports 15th &amp; 30th, 2nd &amp; 4th Friday, monthly, or custom schedules
          </ThemedText>
        </View>

        <Pressable
          onPress={() => {
            setEditingSource(null);
            setSourceModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add Job or Payday"
          className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 flex-row items-center gap-1.5"
        >
          <AppIcon name="add" size={15} color={theme.onPrimary} />
          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
            Add Job
          </ThemedText>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="p-6 items-center justify-center rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : isError ? (
        <View className="p-5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-2">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load payday schedules.
          </ThemedText>
          <Pressable
            onPress={() => {
              void refetch();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading paydays"
            className="min-h-[44px] px-4 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark justify-center"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Upcoming Paydays Calendar Strip */}
          <View className="gap-2.5">
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Upcoming Paydays
            </ThemedText>

            {paydays.length === 0 ? (
              <View className="p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                  Add a job schedule below to see upcoming paydays automatically.
                </ThemedText>
              </View>
            ) : (
              <View className="gap-2">
                {paydays.map((pd) => (
                  <View
                    key={`${pd.source.id}-${pd.date}`}
                    className="p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-3"
                  >
                    <View className="flex-1 min-w-0 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <View
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: pd.source.color }}
                        />
                        <ThemedText
                          className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                          numberOfLines={1}
                        >
                          {pd.source.name}
                        </ThemedText>
                      </View>
                      <ThemedText
                        numeric
                        className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      >
                        {pd.isToday
                          ? 'Today'
                          : `${formatCalendarDateShort(pd.date)} · in ${pd.daysUntil} ${
                              pd.daysUntil === 1 ? 'day' : 'days'
                            }`}{' '}
                        {pd.expectedAmountMinor > 0
                          ? `· ${formatMinorUnits(
                              pd.expectedAmountMinor,
                              pd.source.currency,
                            )}`
                          : ''}
                      </ThemedText>
                    </View>

                    <Pressable
                      onPress={() => setPaydayModalSource(pd.source)}
                      accessibilityRole="button"
                      accessibilityLabel={`Receive pay for ${pd.source.name}`}
                      className="min-h-[44px] px-3.5 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                        Receive Pay
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Configured Jobs List */}
          <View className="gap-2.5">
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Configured Jobs ({plan.sources.length})
            </ThemedText>

            {plan.sources.length === 0 ? (
              <View className="p-6 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark items-center gap-2">
                <AppIcon name="calendar" size={24} color={theme.textMuted} />
                <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  No Salary Sources Yet
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[280px]">
                  Add Job 1 (15th &amp; 30th) and Job 2 (2nd &amp; 4th Friday) so your
                  payday horizon updates automatically.
                </ThemedText>
              </View>
            ) : (
              <View className="gap-3">
                {plan.sources.map((item) => {
                  const src = item.source;
                  const depositName =
                    accountNameMap.get(src.accountId) ?? 'Deposit Account';
                  return (
                    <View
                      key={src.id}
                      className="p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3"
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 min-w-0 gap-0.5">
                          <View className="flex-row items-center gap-2">
                            <View
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: src.color }}
                            />
                            <ThemedText
                              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                              numberOfLines={1}
                            >
                              {src.name}
                            </ThemedText>
                          </View>
                          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            {src.payDaysLabel?.trim() ||
                              getPayScheduleLabel(src.paySchedule)}{' '}
                            · {depositName}
                          </ThemedText>
                        </View>

                        <View className="items-end shrink-0">
                          <ThemedText
                            numeric
                            style={TABULAR_NUMS_STYLE}
                            className="text-sm font-extrabold text-ledger-pine dark:text-ledger-pine-dark"
                          >
                            {formatMinorUnits(item.receivedMinor, src.currency)}
                          </ThemedText>
                          {item.expectedMonthlyMinor > 0 ? (
                            <ThemedText
                              numeric
                              className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                            >
                              of {formatMinorUnits(item.expectedMonthlyMinor, src.currency)}
                            </ThemedText>
                          ) : null}
                        </View>
                      </View>

                      <View className="flex-row justify-end gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                        <Pressable
                          onPress={() => {
                            setEditingSource(src);
                            setSourceModalVisible(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${src.name}`}
                          className="min-h-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Edit
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={() => setPaydayModalSource(src)}
                          accessibilityRole="button"
                          accessibilityLabel={`Log Payday for ${src.name}`}
                          className="min-h-[44px] px-4 rounded-xl bg-brand-500 dark:bg-brand-400 justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                            Receive Pay
                          </ThemedText>
                        </Pressable>
                      </View>
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
        isSubmitting={upsertSourceMutation.isPending || deleteSourceMutation.isPending}
        onClose={() => {
          setSourceModalVisible(false);
          setEditingSource(null);
        }}
        onSave={handleSaveSource}
        onDelete={handleDeleteSource}
      />

      <LogPaydayModal
        visible={paydayModalSource !== null}
        source={paydayModalSource}
        accounts={accounts.filter((a) => a.accountType !== 'CREDIT_CARD')}
        isSubmitting={logPaydayMutation.isPending}
        onClose={() => setPaydayModalSource(null)}
        onSubmit={handleRecordPayday}
      />
    </View>
  );
}
