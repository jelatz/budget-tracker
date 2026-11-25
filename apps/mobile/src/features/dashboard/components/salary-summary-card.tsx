import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { formatMinorUnits } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { useMonthlySalaryPlan } from '@/features/transactions/hooks/use-transactions';

export interface SalarySummaryCardProps {
  onPress?: () => void;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function SalarySummaryCard({ onPress }: SalarySummaryCardProps) {
  const theme = useTheme();
  const currentPeriod = useMemo(() => getCurrentPeriod(), []);
  const { plan, isLoading, isError } = useMonthlySalaryPlan(currentPeriod, 'EXPECTED');

  const activeSources = plan.sources.filter(
    (s) => s.source.isActive || s.receivedMinor > 0,
  );
  const hasJobs = activeSources.length > 0;
  const visibleSources = activeSources.slice(0, 3);
  const receivedPercent =
    plan.totalExpectedIncomeMinor > 0
      ? Math.round((plan.totalReceivedIncomeMinor * 100) / plan.totalExpectedIncomeMinor)
      : 0;
  const headerBadgeText =
    plan.totalExpectedIncomeMinor > 0
      ? `${receivedPercent}% received`
      : `${plan.paydaysInMonth.length} ${
          plan.paydaysInMonth.length === 1 ? 'payday' : 'paydays'
        }`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Income Sources. Manage income sources in Accounts"
      className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5 active:opacity-85"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between gap-2 flex-wrap">
        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
          Income Sources
        </ThemedText>

        {hasJobs && !isLoading && !isError && (
          <View className="px-2.5 py-1 rounded-full bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft">
            <ThemedText
              numeric
              className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
            >
              {headerBadgeText}
            </ThemedText>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="py-5 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Loading income sources...
          </ThemedText>
        </View>
      ) : isError ? (
        <View className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load income sources. Tap to open Accounts.
          </ThemedText>
        </View>
      ) : !hasJobs ? (
        <View className="py-5 px-4 items-center justify-center rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark gap-1">
          <ThemedText className="text-xs font-semibold text-center text-ledger-ink dark:text-ledger-ink-dark">
            Set up your income sources
          </ThemedText>
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary leading-5">
            Add your jobs or income streams to log paydays directly into your accounts.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Received, Expected, and Paydays Summary */}
          <View className="flex-row gap-2 bg-ledger-subtle dark:bg-ledger-subtle-dark p-3 rounded-xl border border-ledger-border dark:border-ledger-border-dark">
            <View className="flex-1 min-w-0">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Received
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark mt-0.5"
                numberOfLines={1}
              >
                {formatMinorUnits(plan.totalReceivedIncomeMinor)}
              </ThemedText>
            </View>

            <View className="flex-1 min-w-0 items-center">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Expected
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
                numberOfLines={1}
              >
                {formatMinorUnits(plan.totalExpectedIncomeMinor)}
              </ThemedText>
            </View>

            <View className="flex-1 min-w-0 items-end">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Paydays
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-xs font-bold text-brand-500 dark:text-brand-400 mt-0.5"
                numberOfLines={1}
              >
                {`${plan.paydaysInMonth.length} logged`}
              </ThemedText>
            </View>
          </View>

          {/* Per-job mini breakdown */}
          <View className="gap-2">
            {visibleSources.map((item) => {
              const clamped = Math.min(100, Math.max(0, item.progressPercent));
              return (
                <View key={item.source.id} className="gap-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-row items-center gap-2 flex-1 min-w-0">
                      <View
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.source.color }}
                      />
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                        numberOfLines={1}
                      >
                        {item.source.name}
                      </ThemedText>
                    </View>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary shrink-0"
                    >
                      {item.expectedMonthlyMinor > 0
                        ? `${formatMinorUnits(item.receivedMinor)} / ${formatMinorUnits(
                            item.expectedMonthlyMinor,
                          )}`
                        : formatMinorUnits(item.receivedMinor)}
                    </ThemedText>
                  </View>
                  <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
                    <View
                      className="h-full rounded-full bg-ledger-pine dark:bg-ledger-pine-dark"
                      style={{ width: `${clamped}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
        Tap to manage in Accounts
      </ThemedText>
    </Pressable>
  );
}
