import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import {
  formatMinorUnits,
  getPayScheduleLabel,
  type Account,
  type IncomeSource,
  type IncomeSourceMonthlySummary,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';

export interface IncomeSourcesSectionProps {
  sources: readonly IncomeSourceMonthlySummary[];
  unlinkedIncomeMinor: number;
  unlinkedIncomeCount: number;
  accounts: readonly Account[];
  onAddSource: () => void;
  onEditSource: (source: IncomeSource) => void;
  onLogPayday: (source: IncomeSource) => void;
  onPressUnlinkedIncome?: () => void;
}

export function IncomeSourcesSection({
  sources,
  unlinkedIncomeMinor,
  unlinkedIncomeCount,
  accounts,
  onAddSource,
  onEditSource,
  onLogPayday,
  onPressUnlinkedIncome,
}: IncomeSourcesSectionProps) {
  const { width } = useWindowDimensions();
  const isTwoColumns = width >= 768 && sources.length > 1;
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-2 flex-wrap">
        <View className="flex-1 min-w-[160px] gap-0.5">
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            My Jobs &amp; Income Sources
          </ThemedText>
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Tap Log Payday whenever a paycheck or payout arrives
          </ThemedText>
        </View>

        <Pressable
          onPress={onAddSource}
          accessibilityRole="button"
          accessibilityLabel="Add Job or Income Source"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center active:opacity-75"
        >
          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
            + Add Job
          </ThemedText>
        </Pressable>
      </View>

      {sources.length === 0 ? (
        <View className="py-6 px-4 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark items-center gap-2.5">
          <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark text-center">
            No jobs added yet
          </ThemedText>
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[290px] leading-5">
            Add Job 1 and Job 2 with your schedule and expected monthly pay for 1-tap payday tracking.
          </ThemedText>
          <Pressable
            onPress={onAddSource}
            accessibilityRole="button"
            accessibilityLabel="Add your first job"
            className="mt-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
              Add First Job
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className={isTwoColumns ? 'flex-row flex-wrap gap-3' : 'gap-3'}>
          {sources.map((summary) => {
            const { source, receivedMinor, expectedMonthlyMinor, payoutCount, progressPercent } =
              summary;
            const clampedPercent = Math.min(100, Math.max(0, progressPercent));
            const accountName = accountMap.get(source.accountId) ?? 'Account';
            const scheduleText = source.payDaysLabel?.trim()
              ? `${getPayScheduleLabel(source.paySchedule)} · ${source.payDaysLabel}`
              : getPayScheduleLabel(source.paySchedule);

            return (
              <View
                key={source.id}
                className={`${
                  isTwoColumns ? 'flex-1 min-w-[280px]' : 'w-full'
                } p-4 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-3 justify-between`}
              >
                <View className="gap-2.5">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-row items-center gap-2 flex-1 min-w-0">
                      <View
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: source.color }}
                      />
                      <View className="flex-1 min-w-0">
                        <ThemedText
                          className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                          numberOfLines={1}
                        >
                          {source.name}
                        </ThemedText>
                        <ThemedText
                          className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                          numberOfLines={1}
                        >
                          {`${scheduleText} · ${accountName}`}
                        </ThemedText>
                      </View>
                    </View>

                    {!source.isActive && (
                      <View className="px-2 py-0.5 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                        <ThemedText className="text-[11px] font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                          Paused
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-baseline justify-between gap-2">
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="text-base font-extrabold text-ledger-pine dark:text-ledger-pine-dark"
                    >
                      {formatMinorUnits(receivedMinor, source.currency)}
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {expectedMonthlyMinor > 0
                        ? `of ${formatMinorUnits(expectedMonthlyMinor, source.currency)} expected`
                        : 'Variable target'}
                    </ThemedText>
                  </View>

                  <View className="h-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
                    <View
                      className="h-full rounded-full bg-ledger-pine dark:bg-ledger-pine-dark"
                      style={{ width: `${clampedPercent}%` }}
                    />
                  </View>

                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                  >
                    {`${payoutCount} ${payoutCount === 1 ? 'payday' : 'paydays'} logged${
                      typeof source.typicalPayoutMinor === 'number' && source.typicalPayoutMinor > 0
                        ? ` · Typical ${formatMinorUnits(source.typicalPayoutMinor, source.currency)}`
                        : ''
                    }`}
                  </ThemedText>
                </View>

                <View className="flex-row items-center gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                  <Pressable
                    onPress={() => onLogPayday(source)}
                    accessibilityRole="button"
                    accessibilityLabel={`Log payday for ${source.name}`}
                    className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      Log Payday
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => onEditSource(source)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${source.name}`}
                    className="min-h-[44px] min-w-[64px] px-3.5 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                      Edit
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {unlinkedIncomeMinor > 0 && (
        <Pressable
          onPress={onPressUnlinkedIncome}
          disabled={!onPressUnlinkedIncome}
          accessibilityRole={onPressUnlinkedIncome ? 'link' : 'text'}
          accessibilityLabel={`Other unlinked income ${formatMinorUnits(unlinkedIncomeMinor)}`}
          className="px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2 active:opacity-80"
        >
          <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            {`Other Income (${unlinkedIncomeCount} unlinked ${
              unlinkedIncomeCount === 1 ? 'entry' : 'entries'
            })`}
          </ThemedText>
          <ThemedText
            numeric
            className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
          >
            {`+${formatMinorUnits(unlinkedIncomeMinor)}`}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}
