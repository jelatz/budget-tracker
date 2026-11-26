import React from 'react';
import { Pressable, View } from 'react-native';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type CategorySpendItem,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface CategoryBreakdownCardProps {
  todayExpenseMinor: number;
  monthExpenseMinor: number;
  categories: readonly CategorySpendItem[];
  currency?: string;
  onSelectCategory?: (categoryId: string) => void;
  onViewAllSpending: () => void;
}

export function CategoryBreakdownCard({
  todayExpenseMinor,
  monthExpenseMinor,
  categories,
  currency = DEFAULT_CURRENCY,
  onSelectCategory,
  onViewAllSpending,
}: CategoryBreakdownCardProps) {
  const theme = useTheme();
  const topCategories = categories.slice(0, 4);

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <AppIcon name="expenses" size={16} color={theme.primary} />
          <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Day-to-Day Spending
          </ThemedText>
        </View>

        <Pressable
          onPress={onViewAllSpending}
          accessibilityRole="button"
          accessibilityLabel="View full spending ledger"
          className="min-h-[44px] px-2 justify-center"
        >
          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
            Full Ledger
          </ThemedText>
        </Pressable>
      </View>

      {/* Today vs This Month Pair */}
      <View className="flex-row gap-2.5">
        <View className="flex-1 p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            Spent Today
          </ThemedText>
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-lg font-extrabold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
          >
            {formatMinorUnits(todayExpenseMinor, currency)}
          </ThemedText>
        </View>

        <View className="flex-1 p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            Spent This Month
          </ThemedText>
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-lg font-extrabold text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5"
          >
            {formatMinorUnits(monthExpenseMinor, currency)}
          </ThemedText>
        </View>
      </View>

      {/* Top Categories */}
      {topCategories.length === 0 ? (
        <View className="p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
            No expenses logged this month yet. Tap + below to record your first spend.
          </ThemedText>
        </View>
      ) : (
        <View className="gap-2">
          {topCategories.map((cat) => (
            <Pressable
              key={cat.categoryId}
              onPress={() => onSelectCategory?.(cat.categoryId)}
              accessibilityRole="button"
              accessibilityLabel={`${cat.name}: ${formatMinorUnits(
                cat.amountMinor,
                currency,
              )}`}
              className="min-h-[44px] justify-center gap-1 active:opacity-80"
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2 flex-1 min-w-0">
                  <View
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <ThemedText
                    className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                    numberOfLines={1}
                  >
                    {cat.name}
                  </ThemedText>
                </View>

                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {formatMinorUnits(cat.amountMinor, currency)} ({cat.percentage}%)
                </ThemedText>
              </View>

              <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(4, cat.percentage))}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
