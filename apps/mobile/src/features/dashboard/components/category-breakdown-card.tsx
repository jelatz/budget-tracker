import React from 'react';
import { Pressable, View } from 'react-native';
import { formatMinorUnits, type CategorySpendItem } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CategoryBreakdownCardProps {
  items: readonly CategorySpendItem[];
  totalExpenseMinor: number;
  currency?: string;
  onCategoryPress?: (item: CategorySpendItem) => void;
}

export function CategoryBreakdownCard({
  items,
  totalExpenseMinor,
  currency = 'PHP',
  onCategoryPress,
}: CategoryBreakdownCardProps) {
  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
      {/* Card Header */}
      <View className="mb-3">
        <View className="flex-row items-center justify-between gap-2 mb-1">
          <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
            Spending by Category
          </ThemedText>
          <ThemedText className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {`Total: ${formatMinorUnits(totalExpenseMinor, currency)}`}
          </ThemedText>
        </View>
        <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
          Includes split transaction allocations
        </ThemedText>
      </View>

      {/* Empty State vs Breakdown Content */}
      {items.length === 0 ? (
        <View className="items-center justify-center py-6 gap-2">
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center">
            No expenses recorded in this period
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Multi-segment stacked horizontal summary bar */}
          <View className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex-row my-3">
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
          <View className="gap-3 mt-1">
            {items.map((item) => {
              const itemCountText = `${item.transactionCount} ${
                item.transactionCount === 1 ? 'item' : 'items'
              }`;
              const fillWidth = `${Math.max(4, Math.min(100, item.percentage))}%` as const;

              return (
                <Pressable
                  key={item.categoryId}
                  className="py-1 active:opacity-75"
                  disabled={!onCategoryPress}
                  onPress={() => onCategoryPress?.(item)}
                  accessibilityRole={onCategoryPress ? 'button' : undefined}
                  accessibilityLabel={`${item.name}, ${formatMinorUnits(
                    item.amountMinor,
                    currency,
                  )}, ${item.percentage} percent, ${itemCountText}`}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View
                        className="w-8 h-8 rounded-full items-center justify-center mr-2.5"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <ThemedText className="text-sm">{item.icon}</ThemedText>
                      </View>
                      <ThemedText
                        className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-shrink mr-2"
                        numberOfLines={1}
                      >
                        {item.name}
                      </ThemedText>
                      <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <ThemedText className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                          {itemCountText}
                        </ThemedText>
                      </View>
                    </View>

                    <View className="items-end flex-shrink-0">
                      <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatMinorUnits(item.amountMinor, currency)}
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {`${item.percentage}%`}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Horizontal progress track */}
                  <View className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
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
