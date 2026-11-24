import React from 'react';
import { Pressable, View } from 'react-native';
import { DEFAULT_CURRENCY, formatMinorUnits, type TagSpendItem } from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

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
  const theme = useTheme();

  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
      {/* Card Header */}
      <View className="mb-3">
        <View className="flex-row items-center gap-2 mb-0.5">
          <AppIcon name="tag" size={16} color={theme.primary} />
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Top #Tags Spending
          </ThemedText>
        </View>
        <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Track #vacation, #reimbursable, and custom tags
        </ThemedText>
      </View>

      {/* Empty State vs Tag Pills Grid */}
      {items.length === 0 ? (
        <View className="items-center justify-center py-6 gap-2.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <View className="w-11 h-11 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
            <AppIcon name="tag" size={20} color={theme.textMuted} />
          </View>
          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[280px] px-4">
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
                className="flex-grow flex-1 basis-[48%] min-w-[130px] min-h-[44px] p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-between active:bg-ledger-selected dark:active:bg-ledger-selected-dark"
                disabled={!onTagPress}
                onPress={() => onTagPress?.(item)}
                accessibilityRole={onTagPress ? 'button' : undefined}
                accessibilityLabel={`${displayTag}, ${formatMinorUnits(
                  item.amountMinor,
                  currency,
                )}, ${txCountText}`}
              >
                <View className="flex-row items-center justify-between gap-1.5 mb-1.5">
                  <ThemedText
                    className="text-xs font-bold text-brand-500 dark:text-brand-400 flex-shrink"
                    numberOfLines={1}
                  >
                    {displayTag}
                  </ThemedText>
                  <View className="px-2 py-0.5 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark shrink-0">
                    <ThemedText
                      numeric
                      className="text-[11px] font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {txCountText}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText
                  numeric
                  className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
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
