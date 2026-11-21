import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type TagSpendItem } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface TagInsightsCardProps {
  items: readonly TagSpendItem[];
  currency?: string;
  onTagPress?: (item: TagSpendItem) => void;
}

export function TagInsightsCard({
  items,
  currency = DEFAULT_CURRENCY,
  onTagPress,
}: TagInsightsCardProps) {
  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
      {/* Card Header */}
      <View className="mb-3">
        <ThemedText className="text-base font-bold text-slate-900 dark:text-white mb-0.5">
          🏷️ Top #Tags Spending
        </ThemedText>
        <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
          Track #vacation, #reimbursable, and custom tags
        </ThemedText>
      </View>

      {/* Empty State vs Tag Pills Grid */}
      {items.length === 0 ? (
        <View className="items-center justify-center py-6 gap-2">
          <ThemedText className="text-3xl mb-1">🏷️</ThemedText>
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[280px]">
            Add #tags when capturing transactions to track project or trip spending
          </ThemedText>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2 mt-1">
          {items.map((item) => {
            const displayTag = item.tag.startsWith('#') ? item.tag : `#${item.tag}`;
            const txCountText = `${item.transactionCount} ${
              item.transactionCount === 1 ? 'tx' : 'txs'
            }`;

            return (
              <Pressable
                key={item.tag}
                className="flex-grow flex-1 basis-[48%] min-w-[125px] p-2.5 sm:p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 justify-between active:opacity-75"
                disabled={!onTagPress}
                onPress={() => onTagPress?.(item)}
                accessibilityRole={onTagPress ? 'button' : undefined}
                accessibilityLabel={`${displayTag}, ${formatMinorUnits(
                  item.amountMinor,
                  currency,
                )}, ${txCountText}`}
              >
                <View className="flex-row items-center justify-between gap-1 mb-1.5">
                  <ThemedText
                    className="text-xs font-bold text-brand-500 flex-shrink"
                    numberOfLines={1}
                  >
                    {displayTag}
                  </ThemedText>
                  <View className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700/60">
                    <ThemedText className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {txCountText}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatMinorUnits(item.amountMinor, currency)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
