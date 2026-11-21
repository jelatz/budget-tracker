import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  computeInstallmentProgress,
  formatCalendarDateShort,
  formatMinorUnits,
  getAccountTypeLabel,
  getCommitmentDueStatus,
  isCommitmentPaidOff,
  type Account,
  type Category,
  type RecurringCommitment,
  type Transaction,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';

const COMPACT_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

export interface ScheduledExpensesTableProps {
  commitments: readonly RecurringCommitment[];
  categories: readonly Category[];
  accounts: readonly Account[];
  currentPeriod: string;
  currentDay: number;
  monthName: string;
  onPay: (commitment: RecurringCommitment) => void;
  onUnpay: (commitment: RecurringCommitment) => void;
  onEdit: (commitment: RecurringCommitment) => void;
  onDelete: (commitmentId: string) => void;
  isBusy: boolean;
}

export interface RecordedExpensesTableProps {
  expenses: readonly Transaction[];
  categories: readonly Category[];
  accounts: readonly Account[];
  onEdit: (expense: Transaction) => void;
  onDelete: (expenseId: string) => void;
  isDeleting: boolean;
}

function formatDueOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`;
  }
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatExpenseTableDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
      return isoString;
    }
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (error: unknown) {
    return isoString;
  }
}

export function ScheduledExpensesTable({
  commitments,
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
}: ScheduledExpensesTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const summaryTotals = useMemo(() => {
    let paidCount = 0;
    let paidMinor = 0;
    let unpaidCount = 0;
    let unpaidMinor = 0;
    let totalMonthlyMinor = 0;
    let totalRemainingTerms = 0;

    for (const c of commitments) {
      totalMonthlyMinor += c.amountMinor;
      const dueStatus = getCommitmentDueStatus(c);

      if (dueStatus.isPaid) {
        paidCount += 1;
        paidMinor += c.amountMinor;
      } else if (c.isActive && dueStatus.isDueThisMonth) {
        unpaidCount += 1;
        unpaidMinor += c.amountMinor;
      }

      if (typeof c.totalInstallments === 'number' && c.totalInstallments > 0) {
        totalRemainingTerms += computeInstallmentProgress(c).remainingCount;
      }
    }

    return {
      paidCount,
      paidMinor,
      unpaidCount,
      unpaidMinor,
      totalMonthlyMinor,
      totalRemainingTerms,
    };
  }, [commitments, currentPeriod]);

  return (
    <View className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 min-w-[940px]">
          {/* Header Row */}
          <View className="flex-row items-center gap-2 px-3 py-3 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
            <View className="w-[140px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Category
              </ThemedText>
            </View>
            <View className="flex-1 min-w-[210px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Obligation Name
              </ThemedText>
            </View>
            <View className="w-[120px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Due Date
              </ThemedText>
            </View>
            <View className="w-[86px] items-center">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-center">
                Total Terms
              </ThemedText>
            </View>
            <View className="w-[100px] items-center">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-center">
                Remaining
              </ThemedText>
            </View>
            <View className="w-[132px] items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right">
                Monthly Amount
              </ThemedText>
            </View>
            <View className="w-[196px] items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right">
                Actions
              </ThemedText>
            </View>
          </View>

          {/* Body Rows */}
          {commitments.map((commitment, index) => {
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

            let duePillBg = 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
            let duePillText = 'text-slate-700 dark:text-slate-200';
            let dueLabelText = formatDueOrdinal(commitment.dueDay);

            if (isPaidOff) {
              duePillBg =
                'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70';
              duePillText = 'text-emerald-700 dark:text-emerald-300';
              dueLabelText = 'Paid Off';
            } else if (isPaid) {
              duePillBg =
                'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70';
              duePillText = 'text-emerald-700 dark:text-emerald-300';
              dueLabelText = '✓ Paid';
            } else if (nextDueShort) {
              if (dueStatus.state === 'OVERDUE') {
                duePillBg =
                  'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70';
                duePillText = 'text-rose-700 dark:text-rose-300';
                dueLabelText = `${nextDueShort} · Late`;
              } else if (dueStatus.state === 'DUE_TODAY') {
                duePillBg =
                  'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70';
                duePillText = 'text-amber-700 dark:text-amber-300';
                dueLabelText = `${nextDueShort} · Today`;
              } else if (dueStatus.state === 'FUTURE_MONTH') {
                duePillBg =
                  'bg-brand-50 dark:bg-brand-900/40 border-brand-200 dark:border-brand-800/70';
                duePillText = 'text-brand-700 dark:text-brand-300';
                dueLabelText = nextDueShort;
              } else {
                dueLabelText = nextDueShort;
              }
            } else if (customDueLabel) {
              dueLabelText = customDueLabel;
            } else if (dueStatus.isOverdue) {
              duePillBg =
                'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70';
              duePillText = 'text-rose-700 dark:text-rose-300';
              dueLabelText = `${formatDueOrdinal(commitment.dueDay)} · Late`;
            } else if (dueStatus.isDueToday) {
              duePillBg =
                'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70';
              duePillText = 'text-amber-700 dark:text-amber-300';
              dueLabelText = `${formatDueOrdinal(commitment.dueDay)} · Today`;
            }

            const isConfirmingDelete = confirmDeleteId === commitment.id;
            const rowBg =
              index % 2 === 0
                ? 'bg-white dark:bg-slate-900'
                : 'bg-slate-50/70 dark:bg-slate-900/60';

            return (
              <View
                key={commitment.id}
                className={`flex-row items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/80 ${rowBg}`}
              >
                {/* Category */}
                <View className="w-[140px] flex-row items-center">
                  <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex-row items-center gap-1 max-w-full">
                    <ThemedText className="text-xs">{category?.icon ?? '📦'}</ThemedText>
                    <ThemedText
                      className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                      numberOfLines={1}
                    >
                      {category?.name ?? 'Expense'}
                    </ThemedText>
                  </View>
                </View>

                {/* Obligation Name & Account/Tags */}
                <View className="flex-1 min-w-[210px] gap-0.5">
                  <ThemedText
                    className="text-sm font-bold text-slate-900 dark:text-white"
                    numberOfLines={2}
                  >
                    {commitment.name}
                  </ThemedText>
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    {account && (
                      <ThemedText
                        className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
                        numberOfLines={1}
                      >
                        {account.icon} {account.name} ({getAccountTypeLabel(account.accountType)})
                      </ThemedText>
                    )}
                    {isInstallment && (
                      <View className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60">
                        <ThemedText className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          Loan
                        </ThemedText>
                      </View>
                    )}
                    {commitment.isAutoPaid && (
                      <View className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60">
                        <ThemedText className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          Auto-pay
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>

                {/* Due Date / Schedule Label */}
                <View className="w-[120px] gap-0.5 justify-center">
                  <View className={`px-2 py-1 rounded-full border self-start max-w-full ${duePillBg}`}>
                    <ThemedText className={`text-[11px] font-bold ${duePillText}`} numberOfLines={1}>
                      {dueLabelText}
                    </ThemedText>
                  </View>
                  {isPaid && nextDueShort && (
                    <ThemedText
                      className="text-[10px] font-medium text-slate-500 dark:text-slate-400"
                      numberOfLines={1}
                    >
                      Next: {nextDueShort}
                    </ThemedText>
                  )}
                </View>

                {/* Total Terms */}
                <View className="w-[86px] items-center justify-center">
                  <ThemedText className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                    {progress ? progress.totalCount : '—'}
                  </ThemedText>
                </View>

                {/* Remaining Terms */}
                <View className="w-[100px] items-center justify-center">
                  {progress ? (
                    <View
                      className={`px-2.5 py-0.5 rounded-full ${
                        progress.remainingCount === 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/50'
                          : 'bg-brand-50 dark:bg-brand-900/40'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold font-mono ${
                          progress.remainingCount === 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-brand-700 dark:text-brand-300'
                        }`}
                      >
                        {progress.remainingCount}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText className="text-xs font-mono text-slate-400 dark:text-slate-600">
                      —
                    </ThemedText>
                  )}
                </View>

                {/* Monthly Amount */}
                <View className="w-[132px] items-end gap-0.5">
                  <ThemedText className="text-sm font-extrabold font-mono text-slate-900 dark:text-white">
                    {formatMinorUnits(commitment.amountMinor, commitment.currency)}
                  </ThemedText>
                  {progress && !progress.isPaidOff && (
                    <ThemedText className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {formatMinorUnits(progress.remainingBalanceMinor, commitment.currency)} left
                    </ThemedText>
                  )}
                </View>

                {/* Actions */}
                <View className="w-[196px] flex-row items-center justify-end gap-1.5">
                  {isConfirmingDelete ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setConfirmDeleteId(null);
                          onDelete(commitment.id);
                        }}
                        disabled={isBusy}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete ${commitment.name}`}
                        className="h-8 px-2.5 rounded-lg bg-rose-600 active:bg-rose-700 items-center justify-center"
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={Colors.dark.text} />
                        ) : (
                          <ThemedText className="text-xs font-bold text-white">Confirm</ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(null)}
                        disabled={isBusy}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel delete ${commitment.name}`}
                        className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Cancel
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      {(!isPaidOff || isPaid) && (
                        <Pressable
                          onPress={() => (isPaid ? onUnpay(commitment) : onPay(commitment))}
                          disabled={isBusy}
                          hitSlop={COMPACT_HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isPaid ? `Undo payment for ${commitment.name}` : `Pay ${commitment.name}`
                          }
                          className={`h-8 px-2.5 rounded-lg items-center justify-center border ${
                            isPaid
                              ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
                              : 'bg-brand-500 border-brand-500 active:bg-brand-600'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold ${
                              isPaid ? 'text-slate-700 dark:text-slate-200' : 'text-white'
                            }`}
                          >
                            {isPaid ? 'Undo' : 'Pay'}
                          </ThemedText>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => onEdit(commitment)}
                        disabled={isBusy}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${commitment.name}`}
                        className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Edit
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(commitment.id)}
                        disabled={isBusy}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${commitment.name}`}
                        className="h-8 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                          Del
                        </ThemedText>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          {/* Spreadsheet-style Summary Footer Rows */}
          <View className="flex-row items-center justify-between px-3 py-2.5 bg-emerald-50/90 dark:bg-emerald-950/40 border-b border-emerald-200/70 dark:border-emerald-900/50">
            <ThemedText className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              TOTAL PAID ({monthName}) — {summaryTotals.paidCount}{' '}
              {summaryTotals.paidCount === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText className="text-sm font-extrabold font-mono text-emerald-800 dark:text-emerald-300">
              {formatMinorUnits(summaryTotals.paidMinor)}
            </ThemedText>
          </View>

          <View className="flex-row items-center justify-between px-3 py-2.5 bg-rose-50/90 dark:bg-rose-950/40 border-b border-rose-200/70 dark:border-rose-900/50">
            <ThemedText className="text-xs font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300">
              REMAINING DUE ({monthName}) — {summaryTotals.unpaidCount}{' '}
              {summaryTotals.unpaidCount === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText className="text-sm font-extrabold font-mono text-rose-800 dark:text-rose-300">
              {formatMinorUnits(summaryTotals.unpaidMinor)}
            </ThemedText>
          </View>

          <View className="flex-row items-center justify-between px-3 py-3 bg-slate-100 dark:bg-slate-800/90">
            <ThemedText className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              FILTERED TOTAL ({commitments.length}{' '}
              {commitments.length === 1 ? 'item' : 'items'}
              {summaryTotals.totalRemainingTerms > 0
                ? ` • ${summaryTotals.totalRemainingTerms} remaining terms`
                : ''}
              )
            </ThemedText>
            <ThemedText className="text-sm font-extrabold font-mono text-slate-900 dark:text-white">
              {formatMinorUnits(summaryTotals.totalMonthlyMinor)}
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function RecordedExpensesTable({
  expenses,
  categories,
  accounts,
  onEdit,
  onDelete,
  isDeleting,
}: RecordedExpensesTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totalMinor = useMemo(
    () => expenses.reduce((sum, tx) => sum + tx.amountMinor, 0),
    [expenses],
  );

  return (
    <View className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 min-w-[780px]">
          {/* Header Row */}
          <View className="flex-row items-center gap-2 px-3 py-3 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
            <View className="w-[116px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Date
              </ThemedText>
            </View>
            <View className="w-[148px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Category
              </ThemedText>
            </View>
            <View className="flex-1 min-w-[200px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Merchant / Note
              </ThemedText>
            </View>
            <View className="w-[140px]">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Account
              </ThemedText>
            </View>
            <View className="w-[128px] items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right">
                Amount
              </ThemedText>
            </View>
            <View className="w-[148px] items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right">
                Actions
              </ThemedText>
            </View>
          </View>

          {/* Body Rows */}
          {expenses.map((expense, index) => {
            const account = accounts.find((a) => a.id === expense.accountId);
            const isSplit = Boolean(expense.splits && expense.splits.length > 0);
            const singleCategory =
              !isSplit && expense.categoryId
                ? categories.find((c) => c.id === expense.categoryId)
                : undefined;

            const categoryIcon = isSplit ? '🔀' : (singleCategory?.icon ?? '🏷️');
            const categoryLabel = isSplit
              ? `Split (${expense.splits?.length ?? 0})`
              : (singleCategory?.name ?? 'Uncategorized');

            const trimmedMerchant = expense.merchant?.trim() ?? '';
            const primaryTitle = trimmedMerchant.length > 0 ? trimmedMerchant : categoryLabel;
            const trimmedNote = expense.note?.trim() ?? '';
            const isConfirmingDelete = confirmDeleteId === expense.id;
            const rowBg =
              index % 2 === 0
                ? 'bg-white dark:bg-slate-900'
                : 'bg-slate-50/70 dark:bg-slate-900/60';

            return (
              <View
                key={expense.id}
                className={`flex-row items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/80 ${rowBg}`}
              >
                {/* Date */}
                <View className="w-[116px]">
                  <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {formatExpenseTableDate(expense.occurredAt)}
                  </ThemedText>
                </View>

                {/* Category */}
                <View className="w-[148px] flex-row items-center">
                  <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex-row items-center gap-1 max-w-full">
                    <ThemedText className="text-xs">{categoryIcon}</ThemedText>
                    <ThemedText
                      className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                      numberOfLines={1}
                    >
                      {categoryLabel}
                    </ThemedText>
                  </View>
                </View>

                {/* Merchant / Note */}
                <View className="flex-1 min-w-[200px] gap-0.5">
                  <ThemedText
                    className="text-sm font-bold text-slate-900 dark:text-white"
                    numberOfLines={1}
                  >
                    {primaryTitle}
                  </ThemedText>
                  {(trimmedNote.length > 0 || expense.tags.length > 0) && (
                    <ThemedText
                      className="text-[11px] text-slate-500 dark:text-slate-400"
                      numberOfLines={1}
                    >
                      {[trimmedNote, ...expense.tags.map((t) => `#${t}`)]
                        .filter((v) => v.length > 0)
                        .join(' • ')}
                    </ThemedText>
                  )}
                </View>

                {/* Account */}
                <View className="w-[140px]">
                  {account ? (
                    <ThemedText
                      className="text-xs font-medium text-slate-600 dark:text-slate-300"
                      numberOfLines={1}
                    >
                      {account.icon} {account.name}
                    </ThemedText>
                  ) : (
                    <ThemedText className="text-xs text-slate-400 dark:text-slate-600">
                      —
                    </ThemedText>
                  )}
                </View>

                {/* Amount */}
                <View className="w-[128px] items-end">
                  <ThemedText className="text-sm font-extrabold font-mono text-rose-600 dark:text-rose-400">
                    -{formatMinorUnits(expense.amountMinor, expense.currency)}
                  </ThemedText>
                </View>

                {/* Actions */}
                <View className="w-[148px] flex-row items-center justify-end gap-1.5">
                  {isConfirmingDelete ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setConfirmDeleteId(null);
                          onDelete(expense.id);
                        }}
                        disabled={isDeleting}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete ${primaryTitle}`}
                        className="h-8 px-2.5 rounded-lg bg-rose-600 active:bg-rose-700 items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-white">Confirm</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel delete ${primaryTitle}`}
                        className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Cancel
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onEdit(expense)}
                        disabled={isDeleting}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${primaryTitle}`}
                        className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Edit
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(expense.id)}
                        disabled={isDeleting}
                        hitSlop={COMPACT_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${primaryTitle}`}
                        className="h-8 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                          Del
                        </ThemedText>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          {/* Totals Footer Row */}
          <View className="flex-row items-center justify-between px-3 py-3 bg-slate-100 dark:bg-slate-800/90">
            <ThemedText className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              TOTAL ({expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'})
            </ThemedText>
            <ThemedText className="text-sm font-extrabold font-mono text-rose-600 dark:text-rose-400">
              -{formatMinorUnits(totalMinor)}
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
