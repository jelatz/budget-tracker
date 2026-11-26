import React from 'react';
import { Pressable, View } from 'react-native';
import {
  DEFAULT_CURRENCY,
  formatCalendarDateShort,
  formatMinorUnits,
  getCommitmentDueStatus,
  resolveCommitmentDueDate,
  type CreditCardBillSummary,
  type RecurringCommitment,
  type UpcomingPayday,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface RemainingPayablesCardProps {
  nextPayday: UpcomingPayday | null;
  nextPaydayDate: string | null;
  dueCards: readonly CreditCardBillSummary[];
  dueObligations: readonly RecurringCommitment[];
  currency?: string;
  onReceivePayday: (payday: UpcomingPayday) => void;
  onSetupPaydays: () => void;
  onPayCard: () => void;
  onPayObligation: (commitment: RecurringCommitment) => void;
  onViewAllDebts: () => void;
}

export function RemainingPayablesCard({
  nextPayday,
  nextPaydayDate,
  dueCards,
  dueObligations,
  currency = DEFAULT_CURRENCY,
  onReceivePayday,
  onSetupPaydays,
  onPayCard,
  onPayObligation,
  onViewAllDebts,
}: RemainingPayablesCardProps) {
  const theme = useTheme();

  const urgentObligations = dueObligations.filter((c) => {
    const status = getCommitmentDueStatus(c);
    if (status.isPaid || status.isPaidOff || !status.isDueThisMonth) {
      return false;
    }
    const dueDate = resolveCommitmentDueDate(c);
    return !nextPaydayDate || dueDate <= nextPaydayDate;
  });

  const urgentCards = dueCards.filter(
    (cc) => cc.upcomingBillMinor > 0 && cc.isDueBeforeNextPayday,
  );

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <AppIcon name="calendar" size={16} color={theme.primary} />
          <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Next Payday &amp; Upcoming Dues
          </ThemedText>
        </View>

        <Pressable
          onPress={onViewAllDebts}
          accessibilityRole="button"
          accessibilityLabel="View all in Debts"
          className="min-h-[44px] px-2 justify-center"
        >
          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
            All Debts
          </ThemedText>
        </Pressable>
      </View>

      {/* Next Payday Row */}
      {nextPayday ? (
        <View className="p-3.5 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-1 min-w-[160px] gap-0.5">
            <View className="flex-row items-center gap-2">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: nextPayday.source.color }}
              />
              <ThemedText
                className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                numberOfLines={1}
              >
                Next Payday: {nextPayday.source.name}
              </ThemedText>
            </View>
            <ThemedText
              numeric
              className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {nextPayday.isToday
                ? 'Today'
                : `${formatCalendarDateShort(nextPayday.date)} · In ${nextPayday.daysUntil} ${
                    nextPayday.daysUntil === 1 ? 'day' : 'days'
                  }`}{' '}
              {nextPayday.expectedAmountMinor > 0
                ? `· Est. ${formatMinorUnits(
                    nextPayday.expectedAmountMinor,
                    nextPayday.source.currency,
                  )}`
                : ''}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => onReceivePayday(nextPayday)}
            accessibilityRole="button"
            accessibilityLabel={`Receive pay for ${nextPayday.source.name}`}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-90"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
              Receive Pay
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
              Set up your two pay schedules
            </ThemedText>
            <ThemedText className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Add 15th/30th or 2nd &amp; 4th Friday paydays so Safe to Spend tracks your horizon
            </ThemedText>
          </View>
          <Pressable
            onPress={onSetupPaydays}
            accessibilityRole="button"
            accessibilityLabel="Set up Paydays"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
          >
            <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
              Set Paydays
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Due Before Payday List */}
      {urgentCards.length === 0 && urgentObligations.length === 0 ? (
        <View className="p-3.5 rounded-xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2.5">
          <AppIcon name="checkCircle" size={16} color={theme.positive} />
          <ThemedText className="flex-1 text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
            All bills and cards due before next payday are settled!
          </ThemedText>
        </View>
      ) : (
        <View className="gap-2">
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            Due Before Payday ({urgentCards.length + urgentObligations.length})
          </ThemedText>

          {urgentCards.map((cc) => (
            <View
              key={cc.account.id}
              className="p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2.5"
            >
              <View className="flex-1 min-w-0">
                <ThemedText
                  className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  numberOfLines={1}
                >
                  {cc.account.name} (Card Bill)
                </ThemedText>
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-xs text-ledger-terracotta dark:text-ledger-terracotta-dark font-semibold"
                >
                  {formatMinorUnits(cc.upcomingBillMinor, cc.account.currency)}
                  {cc.dueDate ? ` · Due ${formatCalendarDateShort(cc.dueDate)}` : ''}
                </ThemedText>
              </View>

              <Pressable
                onPress={onPayCard}
                accessibilityRole="button"
                accessibilityLabel={`Pay bill for ${cc.account.name}`}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                  Pay Bill
                </ThemedText>
              </Pressable>
            </View>
          ))}

          {urgentObligations.slice(0, 4).map((item) => {
            const dueDate = resolveCommitmentDueDate(item);
            const dueStatus = getCommitmentDueStatus(item);
            return (
              <View
                key={item.id}
                className="p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2.5"
              >
                <View className="flex-1 min-w-0">
                  <ThemedText
                    className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    numberOfLines={1}
                  >
                    {item.name}
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className={`text-xs font-semibold ${
                      dueStatus.isOverdue
                        ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    {formatMinorUnits(item.amountMinor, item.currency)} ·{' '}
                    {dueStatus.isOverdue
                      ? `Overdue (${formatCalendarDateShort(dueDate)})`
                      : `Due ${formatCalendarDateShort(dueDate)}`}
                  </ThemedText>
                </View>

                <Pressable
                  onPress={() => onPayObligation(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${item.name}`}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                    Pay
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
