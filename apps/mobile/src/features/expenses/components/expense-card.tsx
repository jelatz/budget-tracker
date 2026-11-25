import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  classifyRecordedExpense,
  formatMinorUnits,
  getAccountTypeLabel,
  type Account,
  type Category,
  type Transaction,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

export interface ExpenseCardProps {
  expense: Transaction;
  categories: readonly Category[];
  accounts: readonly Account[];
  onEdit: (expense: Transaction) => void;
  onDelete: (expenseId: string) => void;
  isDeleting: boolean;
}

function formatExpenseDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
      return isoString;
    }
    return `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })} · ${d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error: unknown) {
    return isoString;
  }
}

export function ExpenseCard({
  expense,
  categories,
  accounts,
  onEdit,
  onDelete,
  isDeleting,
}: ExpenseCardProps) {
  const theme = useTheme();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [expense.id]);

  const account = accounts.find((a) => a.id === expense.accountId);
  const isSplit = Boolean(expense.splits && expense.splits.length > 0);
  const singleCategory =
    !isSplit && expense.categoryId
      ? categories.find((c) => c.id === expense.categoryId)
      : undefined;

  const categoryLabel = isSplit
    ? `Split (${expense.splits?.length ?? 0} categories)`
    : (singleCategory?.name ?? 'Uncategorized');

  const trimmedMerchant = expense.merchant?.trim() ?? '';
  const primaryTitle = trimmedMerchant.length > 0 ? trimmedMerchant : categoryLabel;
  const formattedAmount = `-${formatMinorUnits(expense.amountMinor, expense.currency)}`;
  const expenseOrigin = classifyRecordedExpense(expense);

  const metadataParts = [
    trimmedMerchant.length > 0 ? categoryLabel : null,
    account ? `${account.name} (${getAccountTypeLabel(account.accountType)})` : null,
    formatExpenseDate(expense.occurredAt),
  ].filter((part): part is string => Boolean(part));

  return (
    <View className="flex-1 justify-between p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
      <View className="gap-2.5">
        {/* Top Row: Category Avatar + Title/Metadata + Amount */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-start gap-3 flex-1 min-w-0">
            <View className="w-10 h-10 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
              {isSplit ? (
                <AppIcon name="split" size={18} color={theme.negative} />
              ) : singleCategory?.icon ? (
                <ThemedText className="text-lg">{singleCategory.icon}</ThemedText>
              ) : (
                <AppIcon name="tag" size={18} color={theme.textSecondary} />
              )}
            </View>

            <View className="flex-1 min-w-0 gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <ThemedText
                  className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  numberOfLines={2}
                >
                  {primaryTitle}
                </ThemedText>

                {expenseOrigin === 'LOAN' ? (
                  <View className="px-2 py-0.5 rounded-full bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="text-[11px] font-semibold text-ledger-ochre dark:text-ledger-ochre-dark">
                      Loan
                    </ThemedText>
                  </View>
                ) : expenseOrigin === 'RECURRING' ? (
                  <View className="px-2 py-0.5 rounded-full bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="text-[11px] font-semibold text-ledger-teal dark:text-ledger-teal-dark">
                      Recurring
                    </ThemedText>
                  </View>
                ) : null}

                {expense.receiptUri ? (
                  <View className="px-2 py-0.5 rounded-full bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1">
                    <AppIcon name="receipt" size={11} color={theme.positive} />
                    <ThemedText className="text-[11px] font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                      Receipt
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <ThemedText
                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                numberOfLines={2}
              >
                {metadataParts.join(' · ')}
              </ThemedText>
            </View>
          </View>

          <ThemedText
            numeric
            className="text-base font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark shrink-0"
          >
            {formattedAmount}
          </ThemedText>
        </View>

        {/* Split Category Breakdown */}
        {isSplit && expense.splits && expense.splits.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {expense.splits.map((split) => {
              const splitCat = categories.find((c) => c.id === split.categoryId);
              return (
                <View
                  key={split.id}
                  className="px-2.5 py-1 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1"
                >
                  {splitCat?.icon ? (
                    <ThemedText className="text-xs">{splitCat.icon}</ThemedText>
                  ) : (
                    <AppIcon name="tag" size={11} color={theme.textMuted} />
                  )}
                  <ThemedText
                    numeric
                    className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  >
                    {splitCat?.name ?? 'Category'}:{' '}
                    {formatMinorUnits(split.amountMinor, expense.currency)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )}

        {/* Compact Note & Tags */}
        {(expense.tags.length > 0 || Boolean(expense.note)) && (
          <View className="gap-1 pt-0.5">
            {expense.note ? (
              <View className="flex-row items-center gap-1.5">
                <AppIcon name="note" size={13} color={theme.textMuted} />
                <ThemedText
                  className="flex-1 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  numberOfLines={1}
                >
                  {expense.note}
                </ThemedText>
              </View>
            ) : null}

            {expense.tags.length > 0 ? (
              <View className="flex-row items-center gap-1.5">
                <AppIcon name="tag" size={13} color={theme.textMuted} />
                <ThemedText
                  className="flex-1 text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                  numberOfLines={1}
                >
                  {expense.tags.map((tag) => `#${tag}`).join(' · ')}
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Bottom Action Row */}
      <View className="border-t border-ledger-border dark:border-ledger-border-dark pt-3 flex-row flex-wrap items-center justify-end gap-2">
        {confirmingDelete ? (
          <>
            <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark mr-auto">
              Delete this expense?
            </ThemedText>
            <Pressable
              onPress={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete expense"
              className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDelete(expense.id)}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel={`Confirm delete ${primaryTitle}`}
              className={`min-h-[44px] px-3.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85 ${
                isDeleting ? 'opacity-60' : ''
              }`}
            >
              {isDeleting ? (
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
            <Pressable
              onPress={() => {
                setConfirmingDelete(false);
                onEdit(expense);
              }}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${primaryTitle}`}
              className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            >
              <AppIcon name="edit" size={14} color={theme.textSecondary} />
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Edit
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setConfirmingDelete(true)}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${primaryTitle}`}
              className="min-h-[44px] px-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
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
