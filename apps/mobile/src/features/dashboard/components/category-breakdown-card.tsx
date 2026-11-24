import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type CategorySpendItem } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CategoryBreakdownCardProps {
  items: readonly CategorySpendItem[];
  totalExpenseMinor: number;
  currency?: string;
  onHeaderPress?: () => void;
  onCategoryPress?: (item: CategorySpendItem) => void;
}

export function CategoryBreakdownCard({
  items,
  totalExpenseMinor,
  currency = DEFAULT_CURRENCY,
  onHeaderPress,
  onCategoryPress,
}: CategoryBreakdownCardProps) {
  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
      {/* Card Header (Sibling Link) */}
      <Pressable
        onPress={onHeaderPress}
        disabled={!onHeaderPress}
        accessibilityRole="link"
        accessibilityLabel="Spending by Category. View all recorded expenses"
        className="min-h-[44px] mb-3 active:opacity-75"
      >
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
      </Pressable>

      {/* Empty State vs Breakdown Content */}
      {items.length === 0 ? (
        <Pressable
          onPress={onHeaderPress}
          disabled={!onHeaderPress}
          accessibilityRole="link"
          accessibilityLabel="No expenses recorded. Open Expenses"
          className="min-h-[44px] items-center justify-center py-6 px-4 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark active:opacity-80"
        >
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
            No expenses recorded in this period. Tap to view Expenses.
          </ThemedText>
        </Pressable>
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

          {/* List of category spend rows (Sibling Links) */}
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
                  accessibilityRole="link"
                  accessibilityLabel={`${item.name}, ${formatMinorUnits(
                    item.amountMinor,
                    currency,
                  )}, ${item.percentage} percent, ${itemCountText}`}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center flex-1 mr-2 min-w-0">
                      <View
                        className="w-3 h-3 rounded-full mr-2.5 shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
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
