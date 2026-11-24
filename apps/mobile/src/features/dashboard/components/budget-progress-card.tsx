import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type BudgetSummary } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface BudgetProgressCardProps {
  budget: BudgetSummary;
  currency?: string;
  onPress?: () => void;
}

export function BudgetProgressCard({
  budget,
  currency = DEFAULT_CURRENCY,
  onPress,
}: BudgetProgressCardProps) {
  const clampedPercent = Math.min(100, Math.max(0, budget.utilizationPercent));

  const isDanger = budget.isOverBudget || budget.utilizationPercent >= 100;
  const isWarning = !isDanger && budget.utilizationPercent >= 75;

  const barColorClass = isDanger
    ? 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark'
    : isWarning
      ? 'bg-ledger-ochre dark:bg-ledger-ochre-dark'
      : 'bg-ledger-pine dark:bg-ledger-pine-dark';
  const badgeBgClass = isDanger
    ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft'
    : isWarning
      ? 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft'
      : 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
  const badgeTextClass = isDanger
    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
    : isWarning
      ? 'text-ledger-ochre dark:text-ledger-ochre-dark'
      : 'text-ledger-pine dark:text-ledger-pine-dark';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Monthly Spending Target. Manage budgets in Expenses"
      className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-85"
    >
      {/* 1. Header Row */}
      <View className="flex-row justify-between items-center gap-2 mb-3">
        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted flex-1">
          MONTHLY SPENDING TARGET
        </ThemedText>

        <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
          View in Budgets
        </ThemedText>
      </View>

      {/* 2. Main Figures & Percentage Badge */}
      <View className="flex-row justify-between items-center mb-2.5 gap-2">
        <ThemedText
          numeric
          className="flex-1 mr-2 text-sm sm:text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {`Spent ${formatMinorUnits(budget.spentMinor, currency)} of ${formatMinorUnits(budget.budgetMinor, currency)}`}
        </ThemedText>

        <View className={`px-2.5 py-1 rounded-full ${badgeBgClass}`}>
          <ThemedText numeric className={`text-xs font-bold ${badgeTextClass}`}>
            {`${budget.utilizationPercent}%`}
          </ThemedText>
        </View>
      </View>

      {/* 3. Horizontal Progress Bar */}
      <View className="h-2.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden mb-3">
        <View
          className={`h-full rounded-full ${barColorClass}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </View>

      {/* 4. Footer Text */}
      {budget.isOverBudget ? (
        <ThemedText
          numeric
          className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
        >
          {`Over budget by ${formatMinorUnits(Math.abs(budget.remainingMinor), currency)}`}
        </ThemedText>
      ) : (
        <ThemedText
          numeric
          className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
        >
          {`${formatMinorUnits(budget.remainingMinor, currency)} remaining this month`}
        </ThemedText>
      )}
    </Pressable>
  );
}
