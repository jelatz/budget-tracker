import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  computeInstallmentProgress,
  formatCalendarDateShort,
  formatMinorUnits,
  getCommitmentDueStatus,
  type Account,
  type Category,
  type CommitmentFrequency,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

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

export function ScheduledExpenseCard({
  commitment,
  categories,
  accounts,
  currentPeriod: _currentPeriod,
  currentDay: _currentDay,
  monthName,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
  isBusy,
}: ScheduledExpenseCardProps) {
  const theme = useTheme();
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
  const isFutureMonth = dueStatus.state === 'FUTURE_MONTH';
  const customDueLabel = commitment.dueLabel?.trim();
  const nextDueShort = commitment.nextDueDate
    ? formatCalendarDateShort(commitment.nextDueDate, currentYear)
    : null;

  let statusBadgeBg = 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft';
  let statusBadgeText = 'text-ledger-ochre dark:text-ledger-ochre-dark';
  let statusLabel = `Due ${monthName} ${commitment.dueDay}`;

  if (isPaidOff) {
    statusBadgeBg = 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
    statusBadgeText = 'text-ledger-pine dark:text-ledger-pine-dark';
    statusLabel = 'Paid Off';
  } else if (isPaid) {
    statusBadgeBg = 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
    statusBadgeText = 'text-ledger-pine dark:text-ledger-pine-dark';
    statusLabel = `Paid (${monthName})`;
  } else if (nextDueShort) {
    if (dueStatus.state === 'OVERDUE') {
      statusBadgeBg = 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft';
      statusBadgeText = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
      statusLabel = `Overdue (${nextDueShort})`;
    } else if (dueStatus.state === 'DUE_TODAY') {
      statusBadgeBg = 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft';
      statusBadgeText = 'text-ledger-ochre dark:text-ledger-ochre-dark';
      statusLabel = `Due Today (${nextDueShort})`;
    } else if (dueStatus.state === 'FUTURE_MONTH') {
      statusBadgeBg = 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft';
      statusBadgeText = 'text-ledger-teal dark:text-ledger-teal-dark';
      statusLabel = `Next ${nextDueShort}`;
    } else {
      statusLabel = `Due ${nextDueShort}`;
    }
  } else if (customDueLabel) {
    statusBadgeBg = 'bg-ledger-subtle dark:bg-ledger-subtle-dark';
    statusBadgeText = 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary';
    statusLabel =
      customDueLabel.toLowerCase() === 'weekly' ||
      customDueLabel.toLowerCase() === 'no fixed date'
        ? customDueLabel
        : `Due ${customDueLabel}`;
  } else if (dueStatus.isDueToday) {
    statusBadgeBg = 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft';
    statusBadgeText = 'text-ledger-ochre dark:text-ledger-ochre-dark';
    statusLabel = 'Due Today';
  } else if (dueStatus.isOverdue) {
    statusBadgeBg = 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft';
    statusBadgeText = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
    statusLabel = `Overdue (${monthName} ${commitment.dueDay})`;
  }

  const metadataParts = [
    category?.name ?? null,
    account?.name ?? null,
    FREQUENCY_LABELS[commitment.frequency],
    isInstallment ? 'Loan' : null,
    commitment.isAutoPaid ? 'Auto-pay' : 'Manual',
    isPaid && nextDueShort ? `Next ${nextDueShort}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <View className="flex-1 justify-between p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5">
      <View className="gap-3">
        {/* Top Row: Title + Single Status Pill + Amount */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0 gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <ThemedText
                className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                numberOfLines={2}
              >
                {commitment.name}
              </ThemedText>

              <View className={`px-2.5 py-0.5 rounded-full ${statusBadgeBg}`}>
                <ThemedText className={`text-[11px] font-semibold ${statusBadgeText}`}>
                  {statusLabel}
                </ThemedText>
              </View>
            </View>

            <ThemedText
              className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              numberOfLines={2}
            >
              {metadataParts.join(' · ')}
            </ThemedText>
          </View>

          <ThemedText
            numeric
            className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark shrink-0"
          >
            {formatMinorUnits(commitment.amountMinor, commitment.currency)}
          </ThemedText>
        </View>

        {/* Installment Terms Progress */}
        {progress && progress.totalCount > 0 && (
          <View className="gap-1.5">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <ThemedText
                numeric
                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              >
                {progress.paidCount} of {progress.totalCount} paid · {progress.remainingCount}{' '}
                remaining
              </ThemedText>
              <ThemedText
                numeric
                className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              >
                {progress.isPaidOff
                  ? 'Settled'
                  : `${formatMinorUnits(progress.remainingBalanceMinor, commitment.currency)} left (${progress.progressPercent}%)`}
              </ThemedText>
            </View>
            <View className="h-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden">
              <View
                className={`h-full rounded-full ${
                  progress.isPaidOff
                    ? 'bg-ledger-pine dark:bg-ledger-pine-dark'
                    : 'bg-brand-500 dark:bg-brand-400'
                }`}
                style={{ width: `${progress.progressPercent}%` }}
              />
            </View>
          </View>
        )}

        {/* Compact Note */}
        {commitment.notes ? (
          <View className="flex-row items-center gap-1.5">
            <AppIcon name="note" size={13} color={theme.textMuted} />
            <ThemedText
              className="flex-1 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              numberOfLines={1}
            >
              {commitment.notes}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Bottom Action Row */}
      <View className="border-t border-ledger-border dark:border-ledger-border-dark pt-3 flex-row flex-wrap items-center justify-end gap-2">
        {confirmingDelete ? (
          <>
            <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark mr-auto">
              Delete this schedule?
            </ThemedText>
            <Pressable
              onPress={() => setConfirmingDelete(false)}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete scheduled expense"
              className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDelete(commitment.id)}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={`Confirm delete ${commitment.name}`}
              className={`min-h-[44px] px-3.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85 ${
                isBusy ? 'opacity-60' : ''
              }`}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
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
                accessibilityRole="button"
                accessibilityLabel={
                  isPaid
                    ? `Undo paid status for ${commitment.name}`
                    : isFutureMonth
                      ? `Pay ${commitment.name} early`
                      : `Pay and deduct ${commitment.name}`
                }
                className={`min-h-[44px] px-3.5 rounded-xl flex-row items-center justify-center gap-1.5 mr-auto ${
                  isPaid
                    ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                    : isFutureMonth
                      ? 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                      : 'bg-brand-500 active:bg-brand-600 dark:bg-brand-400'
                } ${isBusy ? 'opacity-60' : ''}`}
              >
                <AppIcon
                  name={isPaid ? 'undo' : 'checkCircle'}
                  size={15}
                  color={
                    isPaid
                      ? theme.positive
                      : isFutureMonth
                        ? theme.info
                        : theme.onPrimary
                  }
                />
                <ThemedText
                  className={`text-xs font-bold ${
                    isPaid
                      ? 'text-ledger-pine dark:text-ledger-pine-dark'
                      : isFutureMonth
                        ? 'text-ledger-teal dark:text-ledger-teal-dark'
                        : 'text-ledger-canvas dark:text-brand-900'
                  }`}
                >
                  {isPaid ? 'Undo Paid' : isFutureMonth ? 'Pay Early' : 'Pay & Deduct'}
                </ThemedText>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                setConfirmingDelete(false);
                onEdit(commitment);
              }}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${commitment.name}`}
              className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            >
              <AppIcon name="edit" size={14} color={theme.textSecondary} />
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Edit
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setConfirmingDelete(true)}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${commitment.name}`}
              className="min-h-[44px] px-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            >
              <AppIcon name="delete" size={14} color={theme.negative} />
              <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                Delete
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
