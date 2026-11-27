import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  computeInstallmentProgress,
  formatCalendarDateShort,
  formatMinorUnits,
  getCommitmentDueStatus,
  resolveCommitmentDueDate,
  type Account,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface ObligationCardProps {
  commitment: RecurringCommitment;
  account?: Account;
  nextPaydayDate: string | null;
  isDeleting?: boolean;
  isUnpaying?: boolean;
  onPay: () => void;
  onUnpay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ObligationCard({
  commitment,
  account,
  nextPaydayDate,
  isDeleting = false,
  isUnpaying = false,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
}: ObligationCardProps) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const dueStatus = getCommitmentDueStatus(commitment);
  const canUndoPaid =
    (dueStatus.isPaid || dueStatus.isPaidOff) &&
    Boolean(commitment.lastPaidPeriod || commitment.lastPaidTransactionId);
  const dueDate = resolveCommitmentDueDate(commitment);
  const isDueBeforePayday =
    !dueStatus.isPaid &&
    !dueStatus.isPaidOff &&
    Boolean(!nextPaydayDate || dueDate <= nextPaydayDate);

  const isLoan = commitment.kind === 'LOAN';
  const progress =
    commitment.totalInstallments && commitment.totalInstallments > 0
      ? computeInstallmentProgress(commitment)
      : null;

  let statusLabel = `Due ${formatCalendarDateShort(dueDate)}`;
  let statusTone =
    'bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary';

  if (dueStatus.isPaidOff) {
    statusLabel = 'Paid Off';
    statusTone =
      'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft text-ledger-pine dark:text-ledger-pine-dark';
  } else if (dueStatus.isPaid) {
    statusLabel = 'Paid This Month';
    statusTone =
      'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft text-ledger-pine dark:text-ledger-pine-dark';
  } else if (dueStatus.isOverdue) {
    statusLabel = `Overdue · ${formatCalendarDateShort(dueDate)}`;
    statusTone =
      'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft text-ledger-terracotta dark:text-ledger-terracotta-dark';
  } else if (dueStatus.isDueToday) {
    statusLabel = 'Due Today';
    statusTone =
      'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft text-ledger-ochre dark:text-ledger-ochre-dark';
  } else if (isDueBeforePayday) {
    statusLabel = `Due Before Payday · ${formatCalendarDateShort(dueDate)}`;
    statusTone =
      'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft text-ledger-ochre dark:text-ledger-ochre-dark';
  }

  return (
    <View className="flex-1 justify-between rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-3">
      <View className="gap-3">
        {/* Header Row */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0 gap-1">
          <View className="flex-row items-center gap-2 flex-wrap">
            <AppIcon
              name={isLoan ? 'loan' : 'calendar'}
              size={15}
              color={isLoan ? theme.info : theme.textSecondary}
            />
            <ThemedText
              className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark flex-shrink"
              numberOfLines={1}
            >
              {commitment.name}
            </ThemedText>
            {commitment.isAutoPaid ? (
              <View className="px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                <ThemedText className="text-[10px] font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Auto-pay
                </ThemedText>
              </View>
            ) : null}
          </View>

          <ThemedText
            className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            numberOfLines={1}
          >
            {account?.name ?? 'Account'} · Monthly
          </ThemedText>
        </View>

        <View className="items-end shrink-0">
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className="text-base font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
          >
            {formatMinorUnits(commitment.amountMinor, commitment.currency)}
          </ThemedText>
          <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            {isLoan ? '/ month' : 'est. / mo'}
          </ThemedText>
        </View>
      </View>

      {/* Loan Payoff Bar */}
      {progress ? (
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between gap-2">
            <ThemedText
              numeric
              className="flex-1 min-w-0 text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            >
              {progress.paidCount} of {progress.totalCount} months paid
            </ThemedText>
            <ThemedText
              numeric
              style={TABULAR_NUMS_STYLE}
              className="shrink-0 text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
            >
              {formatMinorUnits(progress.remainingBalanceMinor, commitment.currency)}{' '}
              left
            </ThemedText>
          </View>
          <View className="h-2 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden">
            <View
              className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
              style={{ width: `${progress.progressPercent}%` }}
            />
          </View>
        </View>
      ) : null}
      </View>

      {/* Status + Actions Row */}
      <View className="flex-row flex-wrap items-center justify-between gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
        <View className={`px-2.5 py-1 rounded-full ${statusTone.split(' ').slice(0, 2).join(' ')}`}>
          <ThemedText
            numeric
            className={`text-[11px] font-bold ${statusTone.split(' ').slice(2).join(' ')}`}
          >
            {statusLabel}
          </ThemedText>
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          {!dueStatus.isPaid && !dueStatus.isPaidOff && !confirmDelete && !confirmUndo ? (
            <Pressable
              onPress={onPay}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${commitment.name}`}
              className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-90"
            >
              <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                Pay Now
              </ThemedText>
            </Pressable>
          ) : null}

          {canUndoPaid && !confirmDelete && !confirmUndo ? (
            <Pressable
              onPress={() => {
                setConfirmDelete(false);
                setConfirmUndo(true);
              }}
              disabled={isUnpaying}
              accessibilityRole="button"
              accessibilityLabel={`Undo payment for ${commitment.name}`}
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            >
              <AppIcon name="undo" size={14} color={theme.warning} />
              <ThemedText className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark">
                Undo Paid
              </ThemedText>
            </Pressable>
          ) : null}

          {confirmUndo ? (
            <>
              <Pressable
                onPress={() => setConfirmUndo(false)}
                disabled={isUnpaying}
                accessibilityRole="button"
                accessibilityLabel="Cancel undo payment"
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmUndo(false);
                  onUnpay();
                }}
                disabled={isUnpaying}
                accessibilityRole="button"
                accessibilityLabel={`Confirm undo payment for ${commitment.name}`}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-ochre dark:bg-ledger-ochre-dark items-center justify-center active:opacity-85"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Confirm Undo
                </ThemedText>
              </Pressable>
            </>
          ) : !confirmDelete ? (
            <>
              <Pressable
                onPress={onEdit}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${commitment.name}`}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                  Edit
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setConfirmUndo(false);
                  setConfirmDelete(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${commitment.name}`}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  Delete
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setConfirmDelete(false)}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel delete"
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete"
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Confirm
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
