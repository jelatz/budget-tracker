import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { formatMinorUnits, summarizeCategoryBudgets } from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAllCategories,
  useCategoryBudgets,
} from '@/features/transactions/hooks/use-transactions';

export interface EnvelopeBudgetsCardProps {
  onPress?: () => void;
}

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatPeriodDisplay(periodMonth: string): string {
  try {
    const [yearStr, monthStr] = periodMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const d = new Date(year, month, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return periodMonth;
  }
}

export function EnvelopeBudgetsCard({ onPress }: EnvelopeBudgetsCardProps) {
  const theme = useTheme();
  const currentPeriod = useMemo(() => getCurrentPeriod(), []);

  const { data: envelopes = [], isLoading, isError } = useCategoryBudgets(currentPeriod);
  const { categories } = useAllCategories();

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, color: c.color });
    }
    return map;
  }, [categories]);

  const summary = useMemo(() => summarizeCategoryBudgets(envelopes), [envelopes]);
  const visibleEnvelopes = envelopes.slice(0, 4);
  const hiddenCount = Math.max(0, envelopes.length - visibleEnvelopes.length);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel="Category Envelopes. Manage envelopes in Expenses"
      className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5 active:opacity-85"
    >
      {/* 1. Header */}
      <View className="flex-row items-center justify-between gap-2 flex-wrap">
        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
          Category Envelopes
        </ThemedText>

        <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText
            numeric
            className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
          >
            {formatPeriodDisplay(currentPeriod)}
          </ThemedText>
        </View>
      </View>

      {/* 2. Content by Async State */}
      {isLoading ? (
        <View className="py-6 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Loading envelopes...
          </ThemedText>
        </View>
      ) : isError ? (
        <View className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load category envelopes. Tap to open Expenses.
          </ThemedText>
        </View>
      ) : envelopes.length === 0 ? (
        <View className="py-5 px-4 items-center justify-center rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary leading-5">
            No envelopes configured for this month. Tap to set up in Expenses.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Summary Strip */}
          <View className="flex-row gap-2 bg-ledger-subtle dark:bg-ledger-subtle-dark p-3 rounded-xl border border-ledger-border dark:border-ledger-border-dark">
            <View className="flex-1 min-w-0">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Assigned
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark mt-0.5"
                numberOfLines={1}
              >
                {formatMinorUnits(summary.totalAssignedMinor)}
              </ThemedText>
            </View>

            <View className="flex-1 min-w-0 items-center">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Spent
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5"
                numberOfLines={1}
              >
                {formatMinorUnits(summary.totalSpentMinor)}
              </ThemedText>
            </View>

            <View className="flex-1 min-w-0 items-end">
              <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Remaining
              </ThemedText>
              <ThemedText
                numeric
                className={`text-xs font-bold mt-0.5 ${
                  summary.totalRemainingMinor < 0
                    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                    : 'text-ledger-pine dark:text-ledger-pine-dark'
                }`}
                numberOfLines={1}
              >
                {formatMinorUnits(summary.totalRemainingMinor)}
              </ThemedText>
            </View>
          </View>

          {/* Compact Envelope Rows (up to 4) */}
          <View className="gap-2.5">
            {visibleEnvelopes.map((env) => {
              const cat = categoryMap.get(env.categoryId);
              const catName = cat?.name ?? 'Category';
              const dotColor = cat?.color ?? theme.primary;
              const percent = env.utilizationPercent;
              const clampedPercent = Math.min(100, Math.max(0, percent));

              let barColor = 'bg-ledger-pine dark:bg-ledger-pine-dark';
              if (env.isOverspent || percent > 100) {
                barColor = 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark';
              } else if (percent >= 75) {
                barColor = 'bg-ledger-ochre dark:bg-ledger-ochre-dark';
              }

              return (
                <View key={env.id ?? env.categoryId} className="gap-1.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-row items-center gap-2 flex-1 min-w-0">
                      <View
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark flex-1"
                        numberOfLines={1}
                      >
                        {catName}
                      </ThemedText>
                    </View>

                    <ThemedText
                      numeric
                      className={`text-xs font-semibold shrink-0 ${
                        env.isOverspent
                          ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                          : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                      }`}
                    >
                      {env.isOverspent
                        ? `${formatMinorUnits(Math.abs(env.remainingMinor))} overspent`
                        : `${formatMinorUnits(env.remainingMinor)} left`}
                    </ThemedText>
                  </View>

                  <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
                    <View
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${clampedPercent}%` }}
                    />
                  </View>

                  <ThemedText
                    numeric
                    className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                  >
                    {`${formatMinorUnits(env.spentMinor)} of ${formatMinorUnits(env.effectiveBudgetMinor)}`}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          {hiddenCount > 0 && (
            <ThemedText
              numeric
              className="text-xs font-semibold text-brand-500 dark:text-brand-400"
            >
              {`+${hiddenCount} more ${hiddenCount === 1 ? 'envelope' : 'envelopes'}`}
            </ThemedText>
          )}
        </>
      )}
    </Pressable>
  );
}
