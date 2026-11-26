import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  DEFAULT_CURRENCY,
  formatCalendarDateShort,
  formatMinorUnits,
  type SafeToSpendMetrics,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface SafeToSpendCardProps {
  metrics: SafeToSpendMetrics | undefined;
  currency?: string;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onPressPaydays?: () => void;
  onPressDebts?: () => void;
}

export function SafeToSpendCard({
  metrics,
  currency = DEFAULT_CURRENCY,
  isLoading,
  isError,
  onRetry,
  onPressPaydays,
  onPressDebts,
}: SafeToSpendCardProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center min-h-[168px]">
        <ActivityIndicator size="small" color={theme.primary} />
        <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-2">
          Calculating safe-to-spend...
        </ThemedText>
      </View>
    );
  }

  if (isError || !metrics) {
    return (
      <View className="p-5 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-2.5">
        <AppIcon name="warning" size={20} color={theme.negative} />
        <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center">
          Unable to compute safe-to-spend liquidity right now.
        </ThemedText>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry safe-to-spend calculation"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark justify-center"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
              Retry
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const isNegative = metrics.safeToSpendMinor < 0;
  const isTight =
    !isNegative &&
    metrics.totalLiquidBalanceMinor > 0 &&
    metrics.safeToSpendMinor < metrics.totalLiquidBalanceMinor * 0.15;

  const headlineLabel = metrics.nextPaydayDate
    ? `Safe to Spend until ${formatCalendarDateShort(metrics.nextPaydayDate)}`
    : 'Safe to Spend this Month';

  const heroColorClass = isNegative
    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
    : isTight
      ? 'text-ledger-ochre dark:text-ledger-ochre-dark'
      : 'text-ledger-pine dark:text-ledger-pine-dark';

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-5 gap-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View className="flex-1 min-w-[200px] gap-1">
          <View className="flex-row items-center gap-1.5">
            <AppIcon name="shield" size={14} color={theme.primary} />
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              {headlineLabel}
            </ThemedText>
          </View>

          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${heroColorClass}`}
          >
            {formatMinorUnits(metrics.safeToSpendMinor, currency)}
          </ThemedText>
        </View>

        <View className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark">
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-xs font-bold text-brand-500 dark:text-brand-400"
          >
            {metrics.daysUntilNextPayday}{' '}
            {metrics.daysUntilNextPayday === 1 ? 'day left' : 'days left'} ·{' '}
            {formatMinorUnits(metrics.dailyDiscretionaryBudgetMinor, currency)}/day
          </ThemedText>
        </View>
      </View>

      {/* Plain 2-Line Formula Breakdown */}
      <View className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2">
        <Pressable
          onPress={onPressPaydays}
          disabled={!onPressPaydays}
          accessibilityRole={onPressPaydays ? 'button' : 'text'}
          accessibilityLabel="Liquid Cash"
          className="flex-row items-center justify-between gap-2"
        >
          <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Liquid cash (Bank, E-Wallet, Cash)
          </ThemedText>
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
          >
            +{formatMinorUnits(metrics.totalLiquidBalanceMinor, currency)}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={onPressDebts}
          disabled={!onPressDebts}
          accessibilityRole={onPressDebts ? 'button' : 'text'}
          accessibilityLabel="Obligations due before next payday"
          className="flex-row items-center justify-between gap-2"
        >
          <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Due before payday (Cards, Loans, Bills)
          </ThemedText>
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark"
          >
            -{formatMinorUnits(metrics.dueBeforeNextPaydayMinor, currency)}
          </ThemedText>
        </Pressable>

        {metrics.dueLaterThisMonthMinor > 0 ? (
          <View className="flex-row items-center justify-between gap-2 pt-1.5 border-t border-ledger-border dark:border-ledger-border-dark">
            <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Due later after next payday
            </ThemedText>
            <ThemedText
              numeric
              style={TABULAR_NUMS_STYLE}
              className="text-[11px] font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {formatMinorUnits(metrics.dueLaterThisMonthMinor, currency)}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
