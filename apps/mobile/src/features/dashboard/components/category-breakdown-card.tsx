import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type CategorySpendItem } from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

export interface CategoryBreakdownCardProps {
  items: readonly CategorySpendItem[];
  totalExpenseMinor: number;
  currency?: string;
  onCategoryPress?: (item: CategorySpendItem) => void;
}

export function CategoryBreakdownCard({
  items,
  totalExpenseMinor,
  currency = DEFAULT_CURRENCY,
  onCategoryPress,
}: CategoryBreakdownCardProps) {
  const theme = useTheme();

  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
      {/* Card Header */}
      <View className="mb-3">
        <View className="flex-row items-center justify-between gap-2 mb-1">
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Spending by Category
          </ThemedText>
          <ThemedText
            numeric
            className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
          >
            {`Total: ${formatMinorUnits(totalExpenseMinor, currency)}`}
          </ThemedText>
        </View>
        <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
          Includes split transaction allocations
        </ThemedText>
      </View>

      {/* Empty State vs Breakdown Content */}
      {items.length === 0 ? (
        <View className="items-center justify-center py-6 gap-2.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <View className="w-11 h-11 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
            <AppIcon name="chart" size={20} color={theme.textMuted} />
          </View>
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center px-4">
            No expenses recorded in this period
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Multi-segment stacked horizontal summary bar */}
          <View className="h-2.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden flex-row my-3">
            {items.map((item, index) => {
              const flexWeight =
                item.amountMinor > 0 ? item.amountMinor : (item.percentage || 1);
              return (
                <View
                  key={`stacked-${item.categoryId}-${index}`}
                  className="h-full"
                  style={{
                    flex: flexWeight,
                    backgroundColor: item.color,
                    marginRight: index < items.length - 1 ? 2 : 0,
                  }}
                />
              );
            })}
          </View>

          {/* List of category spend rows */}
          <View className="gap-2.5 mt-1">
            {items.map((item) => {
              const itemCountText = `${item.transactionCount} ${
                item.transactionCount === 1 ? 'item' : 'items'
              }`;
              const fillWidth = `${Math.max(4, Math.min(100, item.percentage))}%` as const;

              return (
                <Pressable
                  key={item.categoryId}
                  className="min-h-[44px] py-1.5 active:opacity-75"
                  disabled={!onCategoryPress}
                  onPress={() => onCategoryPress?.(item)}
                  accessibilityRole={onCategoryPress ? 'button' : undefined}
                  accessibilityLabel={`${item.name}, ${formatMinorUnits(
                    item.amountMinor,
                    currency,
                  )}, ${item.percentage} percent, ${itemCountText}`}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center flex-1 mr-2 min-w-0">
                      <View
                        className="w-8 h-8 rounded-xl items-center justify-center mr-2.5 shrink-0"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <ThemedText className="text-sm">{item.icon}</ThemedText>
                      </View>
                      <ThemedText
                        className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-shrink mr-2"
                        numberOfLines={1}
                      >
                        {item.name}
                      </ThemedText>
                      <View className="px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark shrink-0">
                        <ThemedText
                          numeric
                          className="text-[11px] font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                        >
                          {itemCountText}
                        </ThemedText>
                      </View>
                    </View>

                    <View className="items-end flex-shrink-0">
                      <ThemedText
                        numeric
                        className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                      >
                        {formatMinorUnits(item.amountMinor, currency)}
                      </ThemedText>
                      <ThemedText
                        numeric
                        className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                      >
                        {`${item.percentage}%`}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Horizontal progress track */}
                  <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: fillWidth,
                        backgroundColor: item.color,
                      }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
