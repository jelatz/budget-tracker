import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { formatMinorUnits } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';
import { useSafeToSpendMetrics } from '@/features/transactions/hooks/use-transactions';

export interface SafeToSpendCardProps {
  onPress?: () => void;
}

export function SafeToSpendCard({ onPress }: SafeToSpendCardProps) {
  const theme = useTheme();
  const { data: metrics, isLoading, isError } = useSafeToSpendMetrics();

  const safeToSpendMinor = metrics?.safeToSpendMinor ?? 0;
  const dailyDiscretionaryMinor = metrics?.dailyDiscretionaryBudgetMinor ?? 0;
  const daysRemaining = metrics?.daysRemainingInMonth ?? 1;

  const isNegative = safeToSpendMinor < 0;
  const isTight = !isNegative && dailyDiscretionaryMinor < 1000;

  const heroTheme = useMemo(() => {
    if (isNegative) {
      return {
        badgeBg: 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft',
        badgeText: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
        statusText: 'Overcommitted',
        amountColor: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
      };
    }
    if (isTight) {
      return {
        badgeBg: 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft',
        badgeText: 'text-ledger-ochre dark:text-ledger-ochre-dark',
        statusText: 'Tight Liquidity',
        amountColor: 'text-ledger-ochre dark:text-ledger-ochre-dark',
      };
    }
    return {
      badgeBg: 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft',
      badgeText: 'text-ledger-pine dark:text-ledger-pine-dark',
      statusText: 'Safe & On Track',
      amountColor: 'text-ledger-pine dark:text-ledger-pine-dark',
    };
  }, [isNegative, isTight]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Safe to Spend. View recurring obligations in Expenses"
      className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-85"
    >
      {/* Header row with status pill */}
      <View className="flex-row items-center justify-between gap-2 mb-2.5 flex-wrap">
        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
          Safe to Spend
        </ThemedText>

        {!isLoading && !isError && metrics && (
          <View
            className={`px-2.5 py-1 rounded-full border border-ledger-border dark:border-ledger-border-dark ${heroTheme.badgeBg}`}
          >
            <ThemedText className={`text-xs font-semibold ${heroTheme.badgeText}`}>
              {heroTheme.statusText}
            </ThemedText>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="py-6 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Calculating liquidity...
          </ThemedText>
        </View>
      ) : isError || !metrics ? (
        <View className="py-4 px-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load liquidity metrics. Tap to view recurring obligations in Expenses.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Hero Amount & Daily Rate */}
          <View className="my-1">
            <ThemedText
              numeric
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${heroTheme.amountColor}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {formatMinorUnits(safeToSpendMinor)}
            </ThemedText>
            <ThemedText
              numeric
              className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-1"
            >
              {`${formatMinorUnits(dailyDiscretionaryMinor)} / day for next ${daysRemaining} ${
                daysRemaining === 1 ? 'day' : 'days'
              }`}
            </ThemedText>
          </View>

          {/* Compact 4-Row Liquidity Summary */}
          <View className="mt-4 pt-3.5 border-t border-ledger-border dark:border-ledger-border-dark gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                (+) Liquid Cash
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
              >
                {`+${formatMinorUnits(metrics.totalLiquidBalanceMinor)}`}
              </ThemedText>
            </View>

            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                (-) Sinking Fund Reserves
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark"
              >
                {`-${formatMinorUnits(metrics.isolatedSinkingFundsMinor)}`}
              </ThemedText>
            </View>

            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                (-) Upcoming Fixed Bills
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark"
              >
                {`-${formatMinorUnits(metrics.upcomingFixedBillsMinor)}`}
              </ThemedText>
            </View>

            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                (-) Envelope Budgets Left
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-teal dark:text-ledger-teal-dark"
              >
                {`-${formatMinorUnits(metrics.remainingCategoryBudgetsMinor)}`}
              </ThemedText>
            </View>
          </View>

          <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-3">
            Tap to view recurring obligations
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}
