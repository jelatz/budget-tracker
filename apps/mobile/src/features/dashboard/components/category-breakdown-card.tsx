import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatMinorUnits, type CategorySpendItem } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface CategoryBreakdownCardProps {
  items: readonly CategorySpendItem[];
  totalExpenseMinor: number;
  incomeItems?: readonly CategorySpendItem[];
  totalIncomeMinor?: number;
  currency?: string;
  onCategoryPress?: (item: CategorySpendItem, type: 'EXPENSE' | 'INCOME') => void;
}

export function CategoryBreakdownCard({
  items,
  totalExpenseMinor,
  incomeItems = [],
  totalIncomeMinor = 0,
  currency = 'PHP',
  onCategoryPress,
}: CategoryBreakdownCardProps) {
  const [activeType, setActiveType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  const activeItems = activeType === 'EXPENSE' ? items : incomeItems;
  const activeTotalMinor =
    activeType === 'EXPENSE' ? totalExpenseMinor : totalIncomeMinor;

  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
      {/* Card Header + Expenses/Income Segmented Switcher */}
      <View className="mb-3 gap-2.5">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1 min-w-[140px]">
            <ThemedText className="text-base font-bold text-slate-900 dark:text-white">
              {activeType === 'EXPENSE' ? 'Spending by Category' : 'Income by Category'}
            </ThemedText>
            <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
              {activeType === 'EXPENSE'
                ? 'Includes split transaction allocations'
                : 'Includes split income allocations'}
            </ThemedText>
          </View>
          <ThemedText
            className={`text-xs font-bold font-mono ${
              activeType === 'EXPENSE'
                ? 'text-slate-700 dark:text-slate-200'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {`Total: ${formatMinorUnits(activeTotalMinor, currency)}`}
          </ThemedText>
        </View>

        <View className="flex-row items-center bg-slate-100 dark:bg-[#171f33] p-1 rounded-2xl border border-slate-200/70 dark:border-slate-800">
          <Pressable
            onPress={() => setActiveType('EXPENSE')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeType === 'EXPENSE' }}
            accessibilityLabel="Show expense category breakdown"
            className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
              activeType === 'EXPENSE'
                ? 'bg-white dark:bg-[#131b2e] shadow-sm'
                : 'bg-transparent active:opacity-75'
            }`}
          >
            <ThemedText
              className={`text-xs ${
                activeType === 'EXPENSE'
                  ? 'font-bold text-slate-900 dark:text-white'
                  : 'font-semibold text-slate-500 dark:text-slate-400'
              }`}
            >
              Expenses
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveType('INCOME')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeType === 'INCOME' }}
            accessibilityLabel="Show income category breakdown"
            className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
              activeType === 'INCOME'
                ? 'bg-white dark:bg-[#131b2e] shadow-sm'
                : 'bg-transparent active:opacity-75'
            }`}
          >
            <ThemedText
              className={`text-xs ${
                activeType === 'INCOME'
                  ? 'font-bold text-emerald-600 dark:text-emerald-400'
                  : 'font-semibold text-slate-500 dark:text-slate-400'
              }`}
            >
              Income
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Empty State vs Breakdown Content */}
      {activeItems.length === 0 ? (
        <View className="items-center justify-center py-6 gap-2">
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center">
            {activeType === 'EXPENSE'
              ? 'No expenses recorded in this period'
              : 'No income recorded in this period'}
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Multi-segment stacked horizontal summary bar */}
          <View className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex-row my-3">
            {activeItems.map((item, index) => {
              const flexWeight =
                item.amountMinor > 0 ? item.amountMinor : (item.percentage || 1);
              return (
                <View
                  key={`stacked-${activeType}-${item.categoryId}-${index}`}
                  className="h-full"
                  style={{
                    flex: flexWeight,
                    backgroundColor: item.color,
                    marginRight: index < activeItems.length - 1 ? 2 : 0,
                  }}
                />
              );
            })}
          </View>

          {/* List of category spend rows */}
          <View className="gap-3 mt-1">
            {activeItems.map((item) => {
              const itemCountText = `${item.transactionCount} ${
                item.transactionCount === 1 ? 'item' : 'items'
              }`;
              const fillWidth = `${Math.max(4, Math.min(100, item.percentage))}%` as const;

              return (
                <Pressable
                  key={`${activeType}-${item.categoryId}`}
                  className="min-h-[44px] py-1 active:opacity-75"
                  disabled={!onCategoryPress}
                  onPress={() => onCategoryPress?.(item, activeType)}
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
                      <ThemedText className="text-sm font-bold font-mono text-slate-900 dark:text-white">
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
