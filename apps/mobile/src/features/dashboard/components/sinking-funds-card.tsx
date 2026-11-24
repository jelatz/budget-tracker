import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { formatMinorUnits, summarizeSinkingFunds } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';
import { useSinkingFunds } from '@/features/transactions/hooks/use-transactions';

export interface SinkingFundsCardProps {
  onPress?: () => void;
}

export function SinkingFundsCard({ onPress }: SinkingFundsCardProps) {
  const theme = useTheme();
  const { data: sinkingFunds = [], isLoading, isError } = useSinkingFunds();

  const summary = useMemo(() => summarizeSinkingFunds(sinkingFunds), [sinkingFunds]);
  const overallPercent = Math.min(100, Math.max(0, summary.utilizationPercent));
  const visibleFunds = sinkingFunds.slice(0, 4);
  const hiddenCount = Math.max(0, sinkingFunds.length - visibleFunds.length);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Sinking Funds. Manage sinking funds in Accounts"
      className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5 active:opacity-85"
    >
      {/* 1. Header */}
      <View className="flex-row items-center justify-between gap-2 flex-wrap">
        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
          Sinking Funds
        </ThemedText>

        {!isLoading && !isError && sinkingFunds.length > 0 && (
          <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
            <ThemedText
              numeric
              className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {summary.completedCount > 0
                ? `${summary.activeCount} active · ${summary.completedCount} done`
                : `${summary.activeCount} active`}
            </ThemedText>
          </View>
        )}
      </View>

      {/* 2. Content by Async State */}
      {isLoading ? (
        <View className="py-6 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Loading sinking funds...
          </ThemedText>
        </View>
      ) : isError ? (
        <View className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load sinking funds. Tap to open Accounts.
          </ThemedText>
        </View>
      ) : sinkingFunds.length === 0 ? (
        <View className="py-5 px-4 items-center justify-center rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary leading-5">
            No sinking funds yet. Tap to set up in Accounts.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Summary & Overall Progress Bar */}
          <View className="bg-ledger-subtle dark:bg-ledger-subtle-dark p-3.5 rounded-xl border border-ledger-border dark:border-ledger-border-dark gap-2.5">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 min-w-0">
                <ThemedText className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Total Saved
                </ThemedText>
                <ThemedText
                  numeric
                  className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
                  numberOfLines={1}
                >
                  {formatMinorUnits(summary.totalSavedMinor)}
                </ThemedText>
              </View>

              <View className="items-end shrink-0">
                <ThemedText className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Combined Target
                </ThemedText>
                <ThemedText
                  numeric
                  className="text-sm font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
                  numberOfLines={1}
                >
                  {formatMinorUnits(summary.totalTargetMinor)}
                </ThemedText>
              </View>
            </View>

            <View className="h-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
              <View
                className="h-full rounded-full bg-ledger-pine dark:bg-ledger-pine-dark"
                style={{ width: `${overallPercent}%` }}
              />
            </View>
          </View>

          {/* Compact Vault Rows (up to 4) */}
          <View className="gap-2.5">
            {visibleFunds.map((fund) => {
              const percent =
                fund.targetAmountMinor > 0
                  ? Math.round((fund.currentSavedMinor * 100) / fund.targetAmountMinor)
                  : 0;
              const dotColor = fund.color || theme.primary;

              return (
                <View key={fund.id} className="flex-row items-center justify-between gap-2">
                  <View className="flex-row items-center gap-2 flex-1 min-w-0">
                    <View
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <ThemedText
                      className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                      numberOfLines={1}
                    >
                      {fund.name}
                    </ThemedText>
                  </View>

                  <View className="flex-row items-center gap-2 shrink-0">
                    <ThemedText
                      numeric
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {`${formatMinorUnits(fund.currentSavedMinor)} / ${formatMinorUnits(
                        fund.targetAmountMinor,
                      )}`}
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark min-w-[34px] text-right"
                    >
                      {`${percent}%`}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </View>

          {hiddenCount > 0 && (
            <ThemedText
              numeric
              className="text-xs font-semibold text-brand-500 dark:text-brand-400"
            >
              {`+${hiddenCount} more ${hiddenCount === 1 ? 'vault' : 'vaults'}`}
            </ThemedText>
          )}
        </>
      )}
    </Pressable>
  );
}
