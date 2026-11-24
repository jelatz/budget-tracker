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
  type Account,
  type Category,
  type RecurringCommitment,
  type Transaction,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

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
  currentDay: _currentDay,
  monthName,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
  isBusy,
}: ScheduledExpensesTableProps) {
  const theme = useTheme();
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
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 min-w-[980px]">
          {/* Header Row */}
          <View className="flex-row items-center gap-2 px-3 py-3 bg-ledger-subtle dark:bg-ledger-subtle-dark border-b border-ledger-border dark:border-ledger-border-dark">
            <View className="w-[140px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Category
              </ThemedText>
            </View>
            <View className="flex-1 min-w-[210px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Obligation Name
              </ThemedText>
            </View>
            <View className="w-[120px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Due Date
              </ThemedText>
            </View>
            <View className="w-[86px] items-center">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-center">
                Total Terms
              </ThemedText>
            </View>
            <View className="w-[100px] items-center">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-center">
                Remaining
              </ThemedText>
            </View>
            <View className="w-[132px] items-end">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-right">
                Monthly Amount
              </ThemedText>
            </View>
            <View className="w-[228px] items-end">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-right">
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

            let duePillBg = 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark';
            let duePillText = 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary';
            let dueLabelText = formatDueOrdinal(commitment.dueDay);
            let showPaidCheck = false;

            if (isPaidOff) {
              duePillBg =
                'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-border dark:border-ledger-border-dark';
              duePillText = 'text-ledger-pine dark:text-ledger-pine-dark';
              dueLabelText = 'Paid Off';
              showPaidCheck = true;
            } else if (isPaid) {
              duePillBg =
                'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-border dark:border-ledger-border-dark';
              duePillText = 'text-ledger-pine dark:text-ledger-pine-dark';
              dueLabelText = 'Paid';
              showPaidCheck = true;
            } else if (nextDueShort) {
              if (dueStatus.state === 'OVERDUE') {
                duePillBg =
                  'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-border dark:border-ledger-border-dark';
                duePillText = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
                dueLabelText = `${nextDueShort} · Late`;
              } else if (dueStatus.state === 'DUE_TODAY') {
                duePillBg =
                  'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border-ledger-border dark:border-ledger-border-dark';
                duePillText = 'text-ledger-ochre dark:text-ledger-ochre-dark';
                dueLabelText = `${nextDueShort} · Today`;
              } else if (dueStatus.state === 'FUTURE_MONTH') {
                duePillBg =
                  'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border-ledger-border dark:border-ledger-border-dark';
                duePillText = 'text-ledger-teal dark:text-ledger-teal-dark';
                dueLabelText = nextDueShort;
              } else {
                dueLabelText = nextDueShort;
              }
            } else if (customDueLabel) {
              dueLabelText = customDueLabel;
            } else if (dueStatus.isOverdue) {
              duePillBg =
                'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-border dark:border-ledger-border-dark';
              duePillText = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
              dueLabelText = `${formatDueOrdinal(commitment.dueDay)} · Late`;
            } else if (dueStatus.isDueToday) {
              duePillBg =
                'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border-ledger-border dark:border-ledger-border-dark';
              duePillText = 'text-ledger-ochre dark:text-ledger-ochre-dark';
              dueLabelText = `${formatDueOrdinal(commitment.dueDay)} · Today`;
            }

            const isConfirmingDelete = confirmDeleteId === commitment.id;
            const rowBg =
              index % 2 === 0
                ? 'bg-ledger-surface dark:bg-ledger-surface-dark'
                : 'bg-ledger-canvas/60 dark:bg-ledger-subtle-dark/40';

            const rowMetaParts = [
              account ? `${account.name} (${getAccountTypeLabel(account.accountType)})` : null,
              isInstallment ? 'Loan' : null,
              commitment.isAutoPaid ? 'Auto-pay' : null,
            ].filter((part): part is string => Boolean(part));

            return (
              <View
                key={commitment.id}
                className={`flex-row items-center gap-2 px-3 py-2.5 border-b border-ledger-border dark:border-ledger-border-dark ${rowBg}`}
              >
                {/* Category */}
                <View className="w-[140px] flex-row items-center">
                  <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1 max-w-full">
                    {category?.icon ? (
                      <ThemedText className="text-xs">{category.icon}</ThemedText>
                    ) : (
                      <AppIcon name="tag" size={12} color={theme.textSecondary} />
                    )}
                    <ThemedText
                      className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                      numberOfLines={1}
                    >
                      {category?.name ?? 'Expense'}
                    </ThemedText>
                  </View>
                </View>

                {/* Obligation Name & Middot Metadata */}
                <View className="flex-1 min-w-[210px] gap-0.5">
                  <ThemedText
                    className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    numberOfLines={2}
                  >
                    {commitment.name}
                  </ThemedText>
                  {rowMetaParts.length > 0 && (
                    <ThemedText
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      numberOfLines={1}
                    >
                      {rowMetaParts.join(' · ')}
                    </ThemedText>
                  )}
                </View>

                {/* Due Date / Schedule Label */}
                <View className="w-[120px] gap-0.5 justify-center">
                  <View
                    className={`px-2.5 py-1 rounded-full border self-start max-w-full flex-row items-center gap-1 ${duePillBg}`}
                  >
                    {showPaidCheck && (
                      <AppIcon name="check" size={11} color={theme.positive} />
                    )}
                    <ThemedText
                      className={`text-[11px] font-semibold ${duePillText}`}
                      numberOfLines={1}
                    >
                      {dueLabelText}
                    </ThemedText>
                  </View>
                  {isPaid && nextDueShort && (
                    <ThemedText
                      className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                      numberOfLines={1}
                    >
                      Next: {nextDueShort}
                    </ThemedText>
                  )}
                </View>

                {/* Total Terms */}
                <View className="w-[86px] items-center justify-center">
                  <ThemedText
                    numeric
                    className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  >
                    {progress ? progress.totalCount : '—'}
                  </ThemedText>
                </View>

                {/* Remaining Terms */}
                <View className="w-[100px] items-center justify-center">
                  {progress ? (
                    <View
                      className={`px-2.5 py-0.5 rounded-full ${
                        progress.remainingCount === 0
                          ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft'
                          : 'bg-brand-50 dark:bg-ledger-pine-dark-soft'
                      }`}
                    >
                      <ThemedText
                        numeric
                        className={`text-xs font-bold ${
                          progress.remainingCount === 0
                            ? 'text-ledger-pine dark:text-ledger-pine-dark'
                            : 'text-brand-500 dark:text-brand-400'
                        }`}
                      >
                        {progress.remainingCount}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      —
                    </ThemedText>
                  )}
                </View>

                {/* Monthly Amount */}
                <View className="w-[132px] items-end gap-0.5">
                  <ThemedText
                    numeric
                    className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(commitment.amountMinor, commitment.currency)}
                  </ThemedText>
                  {progress && !progress.isPaidOff && (
                    <ThemedText
                      numeric
                      className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                    >
                      {formatMinorUnits(progress.remainingBalanceMinor, commitment.currency)} left
                    </ThemedText>
                  )}
                </View>

                {/* Actions */}
                <View className="w-[228px] flex-row items-center justify-end gap-1.5">
                  {isConfirmingDelete ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setConfirmDeleteId(null);
                          onDelete(commitment.id);
                        }}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete ${commitment.name}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={theme.onPrimary} />
                        ) : (
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm
                          </ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(null)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel delete ${commitment.name}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
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
                          accessibilityRole="button"
                          accessibilityLabel={
                            isPaid ? `Undo payment for ${commitment.name}` : `Pay ${commitment.name}`
                          }
                          className={`min-h-[44px] px-3 rounded-xl items-center justify-center border ${
                            isPaid
                              ? 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                              : 'bg-brand-500 border-brand-500 active:bg-brand-600 dark:bg-brand-400 dark:border-brand-400'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold ${
                              isPaid
                                ? 'text-ledger-ink dark:text-ledger-ink-dark'
                                : 'text-ledger-canvas dark:text-brand-900'
                            }`}
                          >
                            {isPaid ? 'Undo' : 'Pay'}
                          </ThemedText>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => onEdit(commitment)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${commitment.name}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                          Edit
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(commitment.id)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${commitment.name}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                          Del
                        </ThemedText>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          {/* Summary Footer Rows */}
          <View className="flex-row items-center justify-between px-3 py-2.5 bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-b border-ledger-border dark:border-ledger-border-dark">
            <ThemedText numeric className="text-xs font-bold uppercase tracking-wider text-ledger-pine dark:text-ledger-pine-dark">
              Total Paid ({monthName}) — {summaryTotals.paidCount}{' '}
              {summaryTotals.paidCount === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText numeric className="text-sm font-bold text-ledger-pine dark:text-ledger-pine-dark">
              {formatMinorUnits(summaryTotals.paidMinor)}
            </ThemedText>
          </View>

          <View className="flex-row items-center justify-between px-3 py-2.5 bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-b border-ledger-border dark:border-ledger-border-dark">
            <ThemedText numeric className="text-xs font-bold uppercase tracking-wider text-ledger-terracotta dark:text-ledger-terracotta-dark">
              Remaining Due ({monthName}) — {summaryTotals.unpaidCount}{' '}
              {summaryTotals.unpaidCount === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText numeric className="text-sm font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
              {formatMinorUnits(summaryTotals.unpaidMinor)}
            </ThemedText>
          </View>

          <View className="flex-row items-center justify-between px-3 py-3 bg-ledger-subtle dark:bg-ledger-subtle-dark">
            <ThemedText numeric className="text-xs font-bold uppercase tracking-wider text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Filtered Total ({commitments.length}{' '}
              {commitments.length === 1 ? 'item' : 'items'}
              {summaryTotals.totalRemainingTerms > 0
                ? ` · ${summaryTotals.totalRemainingTerms} remaining terms`
                : ''}
              )
            </ThemedText>
            <ThemedText numeric className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
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
  const theme = useTheme();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totalMinor = useMemo(
    () => expenses.reduce((sum, tx) => sum + tx.amountMinor, 0),
    [expenses],
  );

  return (
    <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 min-w-[820px]">
          {/* Header Row */}
          <View className="flex-row items-center gap-2 px-3 py-3 bg-ledger-subtle dark:bg-ledger-subtle-dark border-b border-ledger-border dark:border-ledger-border-dark">
            <View className="w-[116px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Date
              </ThemedText>
            </View>
            <View className="w-[148px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Category
              </ThemedText>
            </View>
            <View className="flex-1 min-w-[200px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Merchant / Note
              </ThemedText>
            </View>
            <View className="w-[140px]">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Account
              </ThemedText>
            </View>
            <View className="w-[128px] items-end">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-right">
                Amount
              </ThemedText>
            </View>
            <View className="w-[172px] items-end">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-right">
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

            const categoryLabel = isSplit
              ? `Split (${expense.splits?.length ?? 0})`
              : (singleCategory?.name ?? 'Uncategorized');

            const trimmedMerchant = expense.merchant?.trim() ?? '';
            const primaryTitle = trimmedMerchant.length > 0 ? trimmedMerchant : categoryLabel;
            const trimmedNote = expense.note?.trim() ?? '';
            const isConfirmingDelete = confirmDeleteId === expense.id;
            const rowBg =
              index % 2 === 0
                ? 'bg-ledger-surface dark:bg-ledger-surface-dark'
                : 'bg-ledger-canvas/60 dark:bg-ledger-subtle-dark/40';

            return (
              <View
                key={expense.id}
                className={`flex-row items-center gap-2 px-3 py-2.5 border-b border-ledger-border dark:border-ledger-border-dark ${rowBg}`}
              >
                {/* Date */}
                <View className="w-[116px]">
                  <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {formatExpenseTableDate(expense.occurredAt)}
                  </ThemedText>
                </View>

                {/* Category */}
                <View className="w-[148px] flex-row items-center">
                  <View className="px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1 max-w-full">
                    {isSplit ? (
                      <AppIcon name="split" size={12} color={theme.negative} />
                    ) : singleCategory?.icon ? (
                      <ThemedText className="text-xs">{singleCategory.icon}</ThemedText>
                    ) : (
                      <AppIcon name="tag" size={12} color={theme.textSecondary} />
                    )}
                    <ThemedText
                      className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                      numberOfLines={1}
                    >
                      {categoryLabel}
                    </ThemedText>
                  </View>
                </View>

                {/* Merchant / Note */}
                <View className="flex-1 min-w-[200px] gap-0.5">
                  <ThemedText
                    className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    numberOfLines={1}
                  >
                    {primaryTitle}
                  </ThemedText>
                  {(trimmedNote.length > 0 || expense.tags.length > 0) && (
                    <ThemedText
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      numberOfLines={1}
                    >
                      {[trimmedNote, ...expense.tags.map((t) => `#${t}`)]
                        .filter((v) => v.length > 0)
                        .join(' · ')}
                    </ThemedText>
                  )}
                </View>

                {/* Account */}
                <View className="w-[140px]">
                  {account ? (
                    <ThemedText
                      className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      numberOfLines={1}
                    >
                      {account.icon} {account.name}
                    </ThemedText>
                  ) : (
                    <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      —
                    </ThemedText>
                  )}
                </View>

                {/* Amount */}
                <View className="w-[128px] items-end">
                  <ThemedText
                    numeric
                    className="text-sm font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                  >
                    -{formatMinorUnits(expense.amountMinor, expense.currency)}
                  </ThemedText>
                </View>

                {/* Actions */}
                <View className="w-[172px] flex-row items-center justify-end gap-1.5">
                  {isConfirmingDelete ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setConfirmDeleteId(null);
                          onDelete(expense.id);
                        }}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm delete ${primaryTitle}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                          Confirm
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel delete ${primaryTitle}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                          Cancel
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onEdit(expense)}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${primaryTitle}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                          Edit
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(expense.id)}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${primaryTitle}`}
                        className="min-h-[44px] px-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
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
          <View className="flex-row items-center justify-between px-3 py-3 bg-ledger-subtle dark:bg-ledger-subtle-dark">
            <ThemedText numeric className="text-xs font-bold uppercase tracking-wider text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Total ({expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'})
            </ThemedText>
            <ThemedText numeric className="text-sm font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
              -{formatMinorUnits(totalMinor)}
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
