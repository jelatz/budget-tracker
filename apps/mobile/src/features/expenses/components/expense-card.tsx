import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type Account,
  type Category,
  type Transaction,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';

const COMPACT_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

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
    })} • ${d.toLocaleTimeString(undefined, {
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [expense.id]);

  const account = accounts.find((a) => a.id === expense.accountId);
  const isSplit = Boolean(expense.splits && expense.splits.length > 0);
  const singleCategory = !isSplit && expense.categoryId
    ? categories.find((c) => c.id === expense.categoryId)
    : undefined;

  const categoryIcon = isSplit ? '🔀' : (singleCategory?.icon ?? '🏷️');
  const categoryLabel = isSplit
    ? `Split (${expense.splits?.length ?? 0} categories)`
    : (singleCategory?.name ?? 'Uncategorized');

  const trimmedMerchant = expense.merchant?.trim() ?? '';
  const primaryTitle = trimmedMerchant.length > 0 ? trimmedMerchant : categoryLabel;
  const formattedAmount = `-${formatMinorUnits(expense.amountMinor, expense.currency)}`;

  return (
    <View className="flex-1 justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-3">
      <View className="gap-3">
        {/* Top Row: Icon + Title/Meta + Amount */}
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-start gap-3 flex-1 min-w-0">
            <View className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-100 dark:border-rose-900/40 items-center justify-center shrink-0">
              <ThemedText className="text-xl">{categoryIcon}</ThemedText>
            </View>

            <View className="flex-1 min-w-0 gap-1">
              <ThemedText
                className="text-base font-bold text-slate-900 dark:text-white"
                numberOfLines={2}
              >
                {primaryTitle}
              </ThemedText>

              <View className="flex-row flex-wrap items-center gap-1.5">
                {trimmedMerchant.length > 0 && (
                  <View className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <ThemedText className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {categoryIcon} {categoryLabel}
                    </ThemedText>
                  </View>
                )}

                {account ? (
                  <View className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 border border-brand-200/80 dark:border-brand-800/70">
                    <ThemedText className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      {account.icon} {account.name} • {getAccountTypeLabel(account.accountType)}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {formatExpenseDate(expense.occurredAt)}
              </ThemedText>
            </View>
          </View>

          <ThemedText className="text-base font-extrabold font-mono text-rose-600 dark:text-rose-400 shrink-0">
            {formattedAmount}
          </ThemedText>
        </View>

        {/* Split Category Chips */}
        {isSplit && expense.splits && expense.splits.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {expense.splits.map((split) => {
              const splitCat = categories.find((c) => c.id === split.categoryId);
              return (
                <View
                  key={split.id}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70"
                >
                  <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {splitCat?.icon ?? '🏷️'} {splitCat?.name ?? 'Category'}:{' '}
                    {formatMinorUnits(split.amountMinor, expense.currency)}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )}

        {/* Metadata Pills (Tags, Note, Receipt) */}
        {(expense.tags.length > 0 || Boolean(expense.note) || Boolean(expense.receiptUri)) && (
          <View className="flex-row flex-wrap gap-1.5">
            {expense.tags.map((tag) => (
              <View
                key={tag}
                className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90"
              >
                <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  #{tag}
                </ThemedText>
              </View>
            ))}

            {expense.note ? (
              <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/90 max-w-full">
                <ThemedText
                  className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  numberOfLines={1}
                >
                  📝 {expense.note}
                </ThemedText>
              </View>
            ) : null}

            {expense.receiptUri ? (
              <View className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60">
                <ThemedText className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  📷 Receipt ✓
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Bottom Action Row */}
      <View className="border-t border-slate-100 dark:border-slate-800/80 pt-2.5 flex-row flex-wrap items-center justify-end gap-1.5">
        {confirmingDelete ? (
          <>
            <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400 mr-auto">
              Delete this expense?
            </ThemedText>
            <Pressable
              onPress={() => setConfirmingDelete(false)}
              disabled={isDeleting}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete expense"
              className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDelete(expense.id)}
              disabled={isDeleting}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Confirm delete ${primaryTitle}`}
              className={`h-8 px-3 rounded-lg bg-rose-600 active:bg-rose-700 items-center justify-center ${
                isDeleting ? 'opacity-60' : ''
              }`}
            >
              {isDeleting ? (
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
            <Pressable
              onPress={() => {
                setConfirmingDelete(false);
                onEdit(expense);
              }}
              disabled={isDeleting}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${primaryTitle}`}
              className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Edit
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setConfirmingDelete(true)}
              disabled={isDeleting}
              hitSlop={COMPACT_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${primaryTitle}`}
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
