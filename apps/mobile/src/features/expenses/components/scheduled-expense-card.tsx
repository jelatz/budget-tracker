import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  computeInstallmentProgress,
  formatCalendarDateShort,
  formatMinorUnits,
  getAccountTypeLabel,
  getCommitmentDueStatus,
  isCommitmentPaidOff,
  type Account,
  type Category,
  type CommitmentFrequency,
  type RecurringCommitment,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';

export interface ScheduledExpenseCardProps {
  commitment: RecurringCommitment;
  categories: readonly Category[];
  accounts: readonly Account[];
  currentPeriod: string;
  currentDay: number;
  monthName: string;
  onPay: (commitment: RecurringCommitment) => void;
  onUnpay: (commitment: RecurringCommitment) => void;
  onEdit: (commitment: RecurringCommitment) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
}

const FREQUENCY_LABELS: Record<CommitmentFrequency, string> = {
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-Weekly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

const COMPACT_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

export function ScheduledExpenseCard({
  commitment,
  categories,
  accounts,
  currentPeriod,
  currentDay,
  monthName,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
  isBusy,
}: ScheduledExpenseCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [commitment.id]);

  const category = categories.find((c) => c.id === commitment.categoryId);
  const account = accounts.find((a) => a.id === commitment.accountId);
  const isInstallment = commitment.kind === 'INSTALLMENT';
  const hasTerms =
    typeof commitment.totalInstallments === 'number' &&
    commitment.totalInstallments > 0;
  const progress = hasTerms ? computeInstallmentProgress(commitment) : null;
  const dueStatus = getCommitmentDueStatus(commitment);
  const currentYear = new Date().getFullYear();
  const isPaidOff = dueStatus.isPaidOff;
  const isPaid = dueStatus.isPaid;
  const customDueLabel = commitment.dueLabel?.trim();
  const nextDueShort = commitment.nextDueDate
    ? formatCalendarDateShort(commitment.nextDueDate, currentYear)
    : null;

  let statusBadgeBg = 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  let statusBadgeText = 'text-slate-700 dark:text-slate-300';
  let statusLabel = `Due ${monthName} ${commitment.dueDay}`;

  if (isPaidOff) {
    statusBadgeBg = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70';
    statusBadgeText = 'text-emerald-700 dark:text-emerald-300';
    statusLabel = '✓ Paid Off';
  } else if (isPaid) {
    statusBadgeBg = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70';
    statusBadgeText = 'text-emerald-700 dark:text-emerald-300';
    statusLabel = `✓ Paid (${monthName})`;
  } else if (nextDueShort) {
    if (dueStatus.state === 'OVERDUE') {
      statusBadgeBg = 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70';
      statusBadgeText = 'text-rose-700 dark:text-rose-300';
      statusLabel = `Overdue (${nextDueShort})`;
    } else if (dueStatus.state === 'DUE_TODAY') {
      statusBadgeBg = 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70';
      statusBadgeText = 'text-amber-700 dark:text-amber-300';
      statusLabel = `Due Today (${nextDueShort})`;
    } else if (dueStatus.state === 'FUTURE_MONTH') {
      statusBadgeBg = 'bg-brand-50 dark:bg-brand-900/40 border-brand-200 dark:border-brand-800/70';
      statusBadgeText = 'text-brand-700 dark:text-brand-300';
      statusLabel = `Next: ${nextDueShort}`;
    } else {
      statusLabel = `Due ${nextDueShort}`;
    }
  } else if (customDueLabel) {
    statusLabel =
      customDueLabel.toLowerCase() === 'weekly' ||
      customDueLabel.toLowerCase() === 'no fixed date'
        ? customDueLabel
        : `Due ${customDueLabel}`;
  } else if (dueStatus.isDueToday) {
    statusBadgeBg = 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70';
    statusBadgeText = 'text-amber-700 dark:text-amber-300';
    statusLabel = 'Due Today';
  } else if (dueStatus.isOverdue) {
    statusBadgeBg = 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70';
    statusBadgeText = 'text-rose-700 dark:text-rose-300';
    statusLabel = `Overdue (${monthName} ${commitment.dueDay})`;
  }

  return (
    <View className="flex-1 justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-3">
      <View className="gap-3">
        {/* Top Row: Category Icon + Title/Badges + Amount */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-start gap-3 flex-1 min-w-0">
            <View className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 items-center justify-center shrink-0">
              <ThemedText className="text-xl">{category?.icon ?? '📅'}</ThemedText>
            </View>

            <View className="flex-1 min-w-0 gap-1.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <ThemedText
                  className="text-base font-bold text-slate-900 dark:text-white"
                  numberOfLines={2}
                >
                  {commitment.name}
                </ThemedText>

                <View className={`px-2 py-0.5 rounded-full border ${statusBadgeBg}`}>
                  <ThemedText className={`text-[11px] font-bold ${statusBadgeText}`}>
                    {statusLabel}
                  </ThemedText>
                </View>
              </View>

              <View className="flex-row flex-wrap items-center gap-1.5">
                {category ? (
                  <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <ThemedText className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {category.icon} {category.name}
                    </ThemedText>
                  </View>
                ) : null}

                {account ? (
                  <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 border border-brand-200/80 dark:border-brand-800/70">
                    <ThemedText className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      {account.icon} {account.name} • {getAccountTypeLabel(account.accountType)}
                    </ThemedText>
                  </View>
                ) : null}

                <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <ThemedText className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {FREQUENCY_LABELS[commitment.frequency]}
                  </ThemedText>
                </View>

                {isInstallment && (
                  <View className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/70">
                    <ThemedText className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      🏦 Loan
                    </ThemedText>
                  </View>
                )}

                {commitment.isAutoPaid && (
                  <View className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/70">
                    <ThemedText className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ⚡ Auto-pay
                    </ThemedText>
                  </View>
                )}

                {isPaid && nextDueShort && (
                  <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 border border-brand-200/80 dark:border-brand-800/70">
                    <ThemedText className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      📅 Next: {nextDueShort}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          </View>

          <ThemedText className="text-base font-extrabold font-mono text-slate-900 dark:text-white shrink-0">
            {formatMinorUnits(commitment.amountMinor, commitment.currency)}
          </ThemedText>
        </View>

        {/* Total & Remaining Terms Progress */}
        {progress && progress.totalCount > 0 && (
          <View className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <View className="flex-row flex-wrap items-center gap-1.5">
                <View className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                  <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Total Terms: {progress.totalCount}
                  </ThemedText>
                </View>
                <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40">
                  <ThemedText className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                    Remaining Terms: {progress.remainingCount}
                  </ThemedText>
                </View>
              </View>
              <ThemedText className="text-xs font-semibold font-mono text-slate-600 dark:text-slate-300">
                {progress.isPaidOff
                  ? 'Balance settled'
                  : `${formatMinorUnits(progress.remainingBalanceMinor, commitment.currency)} remaining`}
              </ThemedText>
            </View>
            <View className="flex-row items-center justify-between gap-2">
              <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                {progress.paidCount} of {progress.totalCount} terms paid
              </ThemedText>
              <ThemedText className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {progress.progressPercent}%
              </ThemedText>
            </View>
            <View className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <View
                className={`h-full rounded-full ${
                  progress.isPaidOff ? 'bg-emerald-500' : 'bg-brand-500'
                }`}
                style={{ width: `${progress.progressPercent}%` }}
              />
            </View>
          </View>
        )}

        {/* Notes Pill */}
        {commitment.notes ? (
          <View className="flex-row flex-wrap">
            <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 max-w-full">
              <ThemedText
                className="text-xs font-medium text-slate-600 dark:text-slate-300"
                numberOfLines={1}
              >
                📝 {commitment.notes}
              </ThemedText>
            </View>
          </View>
        ) : null}
      </View>

      {/* Bottom Action Row */}
      <View className="border-t border-slate-100 dark:border-slate-800/80 pt-2.5 flex-row flex-wrap items-center justify-end gap-1.5">
        {confirmingDelete ? (
          <>
            <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400 mr-auto">
              Delete this schedule?
            </ThemedText>
            <Pressable
              onPress={() => setConfirmingDelete(false)}
              disabled={isBusy}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete scheduled expense"
              className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDelete(commitment.id)}
              disabled={isBusy}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Confirm delete ${commitment.name}`}
              className={`h-8 px-3 rounded-lg bg-rose-600 active:bg-rose-700 items-center justify-center ${
                isBusy ? 'opacity-60' : ''
              }`}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color={Colors.dark.text} />
              ) : (
                <ThemedText className="text-xs font-bold text-white">
                  Confirm Delete
                </ThemedText>
              )}
            </Pressable>
          </>
        ) : (
          <>
            {!isPaidOff && (
              <Pressable
                onPress={() => (isPaid ? onUnpay(commitment) : onPay(commitment))}
                disabled={isBusy}
                hitSlop={COMPACT_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={
                  isPaid
                    ? `Undo paid status for ${commitment.name}`
                    : `Pay and deduct ${commitment.name}`
                }
                className={`h-8 px-3 rounded-lg items-center justify-center mr-auto ${
                  isPaid
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 active:opacity-75'
                    : 'bg-brand-500 active:bg-brand-600 shadow-sm shadow-brand-500/20'
                } ${isBusy ? 'opacity-60' : ''}`}
              >
                <ThemedText
                  className={`text-xs font-bold ${
                    isPaid ? 'text-emerald-700 dark:text-emerald-300' : 'text-white'
                  }`}
                >
                  {isPaid ? 'Undo Paid' : 'Pay & Deduct'}
                </ThemedText>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                setConfirmingDelete(false);
                onEdit(commitment);
              }}
              disabled={isBusy}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${commitment.name}`}
              className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Edit
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setConfirmingDelete(true)}
              disabled={isBusy}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${commitment.name}`}
              className="h-8 px-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/50 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Delete
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
