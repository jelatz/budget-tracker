import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  formatCalendarDateShort,
  formatMinorUnits,
  summarizeMonthlyPayables,
  type MonthlyPayableItem,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';
import { useRecurringCommitments } from '@/features/transactions/hooks/use-transactions';

const MAX_VISIBLE_ITEMS = 3;

export interface RemainingPayablesCardProps {
  onPress?: () => void;
}

function formatDueLabel(item: MonthlyPayableItem): string {
  if (item.state === 'DUE_TODAY') return 'Due today';
  if (item.state === 'CUSTOM_SCHEDULE' && item.commitment.dueLabel) {
    return item.commitment.dueLabel;
  }
  const date = formatCalendarDateShort(item.dueDate);
  return item.state === 'OVERDUE' ? `Overdue · ${date}` : `Due ${date}`;
}

export function RemainingPayablesCard({ onPress }: RemainingPayablesCardProps) {
  const theme = useTheme();
  const { data: commitments = [], isLoading, isError } = useRecurringCommitments();

  const summary = useMemo(() => summarizeMonthlyPayables(commitments), [commitments]);
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });

  const visibleItems = summary.remainingItems.slice(0, MAX_VISIBLE_ITEMS);
  const hiddenCount = summary.remainingCount - visibleItems.length;
  const hasOverdue = summary.overdueCount > 0;
  const isAllPaid = summary.totalDueMinor > 0 && summary.remainingCount === 0;

  const badge = hasOverdue
    ? {
        bg: 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft',
        text: 'text-ledger-terracotta dark:text-ledger-terracotta-dark',
        label: `${summary.overdueCount} overdue`,
      }
    : isAllPaid
      ? {
          bg: 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft',
          text: 'text-ledger-pine dark:text-ledger-pine-dark',
          label: 'All paid',
        }
      : {
          bg: 'bg-ledger-subtle dark:bg-ledger-subtle-dark',
          text: 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary',
          label: `${summary.remainingCount} left`,
        };

  const accessibilityLabel =
    isLoading || isError
      ? `Remaining payables for ${monthName}. View scheduled expenses`
      : `Remaining payables for ${monthName}: ${formatMinorUnits(summary.remainingMinor)} across ${
          summary.remainingCount
        } ${summary.remainingCount === 1 ? 'bill' : 'bills'}${
          hasOverdue ? `, ${summary.overdueCount} overdue` : ''
        }. View scheduled expenses`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5 active:opacity-85"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between gap-2 flex-wrap">
        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
          {`Payables Left · ${monthName}`}
        </ThemedText>

        {!isLoading && !isError && summary.totalDueMinor > 0 && (
          <View
            className={`px-2.5 py-1 rounded-full border border-ledger-border dark:border-ledger-border-dark ${badge.bg}`}
          >
            <ThemedText numeric className={`text-xs font-semibold ${badge.text}`}>
              {badge.label}
            </ThemedText>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="py-6 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Loading payables...
          </ThemedText>
        </View>
      ) : isError ? (
        <View className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
            Could not load payables. Tap to open scheduled expenses.
          </ThemedText>
        </View>
      ) : summary.totalDueMinor === 0 ? (
        <View className="py-5 px-4 items-center justify-center rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary leading-5">
            {`No bills scheduled for ${monthName}. Tap to add recurring bills or installments.`}
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Hero remaining amount + paid progress */}
          <View className="gap-2.5">
            <View>
              <ThemedText
                numeric
                className={`text-3xl font-extrabold tracking-tight ${
                  hasOverdue
                    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                    : isAllPaid
                      ? 'text-ledger-pine dark:text-ledger-pine-dark'
                      : 'text-ledger-ink dark:text-ledger-ink-dark'
                }`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatMinorUnits(summary.remainingMinor)}
              </ThemedText>
              <ThemedText
                numeric
                className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-1"
              >
                {`${formatMinorUnits(summary.paidMinor)} of ${formatMinorUnits(
                  summary.totalDueMinor,
                )} paid · ${summary.paidPercent}%`}
              </ThemedText>
            </View>

            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="h-2 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
            >
              <View
                className="h-full rounded-full bg-ledger-pine dark:bg-ledger-pine-dark"
                style={{ width: `${summary.paidPercent}%` }}
              />
            </View>
          </View>

          {/* Next bills */}
          {visibleItems.length > 0 && (
            <View className="pt-3 border-t border-ledger-border dark:border-ledger-border-dark gap-2.5">
              {visibleItems.map((item) => {
                const isOverdue = item.state === 'OVERDUE';
                return (
                  <View
                    key={item.commitment.id}
                    className="flex-row items-center justify-between gap-3"
                  >
                    <View className="flex-1 min-w-0">
                      <ThemedText
                        className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {item.commitment.name}
                      </ThemedText>
                      <ThemedText
                        className={`text-[11px] font-medium ${
                          isOverdue
                            ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                            : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
                        }`}
                        numberOfLines={1}
                      >
                        {formatDueLabel(item)}
                      </ThemedText>
                    </View>
                    <ThemedText
                      numeric
                      className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark shrink-0"
                    >
                      {formatMinorUnits(item.commitment.amountMinor, item.commitment.currency)}
                    </ThemedText>
                  </View>
                );
              })}

              {hiddenCount > 0 && (
                <ThemedText
                  numeric
                  className="text-xs font-semibold text-brand-500 dark:text-brand-400"
                >
                  {`+${hiddenCount} more ${hiddenCount === 1 ? 'bill' : 'bills'}`}
                </ThemedText>
              )}
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}
