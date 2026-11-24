import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  computeSplitRemainder,
  DEFAULT_CURRENCY,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  rebalanceTwoWaySplit,
  splitEvenly,
  type Category,
  type TransactionSplit,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface SplitEditorModalProps {
  visible: boolean;
  totalAmountMinor: number;
  currency?: string;
  categories: readonly Category[];
  initialCategoryId?: string;
  initialSplits?: readonly TransactionSplit[];
  onClose: () => void;
  onApplySplits: (splits: TransactionSplit[], updatedTotalMinor?: number) => void;
  onClearSplits: () => void;
}

interface SplitRowDraft {
  id: string;
  categoryId: string;
  amountMinor: number;
  amountInput: string;
  note: string;
}

function generateSplitId(): string {
  return `split-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function SplitEditorModal({
  visible,
  totalAmountMinor,
  currency = DEFAULT_CURRENCY,
  categories,
  initialCategoryId,
  initialSplits,
  onClose,
  onApplySplits,
  onClearSplits,
}: SplitEditorModalProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<SplitRowDraft[]>([]);
  const [activeCategoryPickerRowId, setActiveCategoryPickerRowId] = useState<string | null>(null);

  // Initialize or reset draft rows whenever the modal becomes visible
  useEffect(() => {
    if (!visible) {
      return;
    }

    if (initialSplits && initialSplits.length >= 2) {
      setRows(
        initialSplits.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          amountInput: minorUnitsToDecimalInput(s.amountMinor),
          note: s.note ?? '',
        })),
      );
    } else {
      const firstCatId = initialCategoryId ?? categories[0]?.id ?? '';
      const secondCat = categories.find((c) => c.id !== firstCatId) ?? categories[0];
      const secondCatId = secondCat?.id ?? firstCatId;

      const [r1Minor, r2Minor] = rebalanceTwoWaySplit(totalAmountMinor, totalAmountMinor);

      setRows([
        {
          id: generateSplitId(),
          categoryId: firstCatId,
          amountMinor: r1Minor,
          amountInput: minorUnitsToDecimalInput(r1Minor),
          note: '',
        },
        {
          id: generateSplitId(),
          categoryId: secondCatId,
          amountMinor: r2Minor,
          amountInput: minorUnitsToDecimalInput(r2Minor),
          note: '',
        },
      ]);
    }
    setActiveCategoryPickerRowId(null);
  }, [visible, initialSplits, initialCategoryId, categories, totalAmountMinor]);

  // Calculations
  const sumMinor = useMemo(() => {
    return rows.reduce((acc, row) => acc + row.amountMinor, 0);
  }, [rows]);

  const remainderMinor = useMemo(() => {
    return computeSplitRemainder(
      totalAmountMinor,
      rows.map((r) => r.amountMinor),
    );
  }, [totalAmountMinor, rows]);

  const allAmountsPositive = useMemo(() => {
    return rows.length >= 2 && rows.every((r) => r.amountMinor > 0 && r.categoryId.trim().length > 0);
  }, [rows]);

  const isBalanced = remainderMinor === 0 && allAmountsPositive;
  const canUpdateTotalShortcut = remainderMinor !== 0 && sumMinor > 0 && allAmountsPositive;

  // Handle amount text changes with auto-remainder
  const handleAmountChange = (index: number, input: string) => {
    const parsed = parseDecimalToMinorUnits(input);
    const parsedMinor = parsed !== null && parsed >= 0 ? parsed : 0;

    setRows((prev) => {
      if (prev.length === 2) {
        if (index === 0) {
          const [, rebalancedSecondMinor] = rebalanceTwoWaySplit(
            totalAmountMinor,
            parsedMinor,
          );
          return [
            {
              ...prev[0],
              amountMinor: parsedMinor,
              amountInput: input,
            },
            {
              ...prev[1],
              amountMinor: rebalancedSecondMinor,
              amountInput: minorUnitsToDecimalInput(rebalancedSecondMinor),
            },
          ];
        }
      }

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        amountMinor: parsedMinor,
        amountInput: input,
      };
      return updated;
    });
  };

  const handleNoteChange = (index: number, note: string) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], note };
      return updated;
    });
  };

  const handleSelectCategoryForRow = (rowId: string, categoryId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, categoryId } : r)),
    );
    setActiveCategoryPickerRowId(null);
  };

  const handleAddSplitLine = () => {
    const currentAllocated = rows.map((r) => r.amountMinor);
    const remainder = Math.max(
      0,
      computeSplitRemainder(totalAmountMinor, currentAllocated),
    );

    const usedIds = new Set(rows.map((r) => r.categoryId));
    const nextCat = categories.find((c) => !usedIds.has(c.id)) ?? categories[0];

    const newLine: SplitRowDraft = {
      id: generateSplitId(),
      categoryId: nextCat?.id ?? '',
      amountMinor: remainder,
      amountInput: minorUnitsToDecimalInput(remainder),
      note: '',
    };

    setRows((prev) => [...prev, newLine]);
  };

  const handleRemoveSplitLine = (index: number) => {
    if (rows.length <= 2) {
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAutoBalanceRemainder = () => {
    if (remainderMinor === 0 || rows.length === 0) {
      return;
    }
    const targetIndex = rows.length - 1;
    const targetRow = rows[targetIndex];
    const newAmount = Math.max(0, targetRow.amountMinor + remainderMinor);
    setRows((prev) => {
      const updated = [...prev];
      updated[targetIndex] = {
        ...updated[targetIndex],
        amountMinor: newAmount,
        amountInput: minorUnitsToDecimalInput(newAmount),
      };
      return updated;
    });
  };

  const handleSplitEvenly = () => {
    if (rows.length === 0 || totalAmountMinor <= 0) {
      return;
    }
    const amounts = splitEvenly(totalAmountMinor, rows.length);

    setRows((prev) =>
      prev.map((row, index) => {
        const amountMinor = amounts[index] ?? 0;
        return {
          ...row,
          amountMinor,
          amountInput: minorUnitsToDecimalInput(amountMinor),
        };
      }),
    );
  };

  const buildTransactionSplits = (): TransactionSplit[] => {
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      amountMinor: r.amountMinor,
      note: r.note.trim() ? r.note.trim() : undefined,
    }));
  };

  const handleApply = () => {
    if (!isBalanced) {
      return;
    }
    onApplySplits(buildTransactionSplits());
    onClose();
  };

  const handleApplyWithUpdatedTotal = () => {
    if (!canUpdateTotalShortcut) {
      return;
    }
    onApplySplits(buildTransactionSplits(), sumMinor);
    onClose();
  };

  const handleClear = () => {
    onClearSplits();
    onClose();
  };

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark pt-4">
            {/* Header */}
            <View className="flex-row justify-between items-center px-4 mb-3">
              <View>
                <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Split Transaction
                </ThemedText>
                <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                  Split Across Categories
                </ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close split editor"
                className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                onPress={onClose}
              >
                <AppIcon name="close" size={14} color={theme.textSecondary} />
                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>

            {/* Live Remainder & Status Bar */}
            <View
              className={`mx-4 p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border mb-3 ${
                isBalanced
                  ? 'border-ledger-pine dark:border-ledger-pine-dark'
                  : remainderMinor > 0
                    ? 'border-ledger-ochre dark:border-ledger-ochre-dark'
                    : 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              }`}
            >
              <View className="flex-row justify-between items-center">
                <View className="items-center">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                    Total
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(totalAmountMinor, currency)}
                  </ThemedText>
                </View>

                <ThemedText className="text-ledger-border-strong dark:text-ledger-border-strong-dark font-bold">
                  ·
                </ThemedText>

                <View className="items-center">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                    Allocated
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(sumMinor, currency)}
                  </ThemedText>
                </View>

                <ThemedText className="text-ledger-border-strong dark:text-ledger-border-strong-dark font-bold">
                  ·
                </ThemedText>

                <View className="items-center">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                    Remaining
                  </ThemedText>
                  <ThemedText
                    numeric
                    className={`text-sm font-bold ${
                      isBalanced
                        ? 'text-ledger-pine dark:text-ledger-pine-dark'
                        : remainderMinor > 0
                          ? 'text-ledger-ochre dark:text-ledger-ochre-dark'
                          : 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                    }`}
                  >
                    {formatMinorUnits(remainderMinor, currency)}
                  </ThemedText>
                </View>
              </View>

              {/* Action buttons: Split Evenly & Auto-balance Remainder */}
              <View className="flex-row gap-2 mt-2.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Split total evenly among categories"
                  className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:scale-[0.98]"
                  onPress={handleSplitEvenly}
                >
                  <AppIcon name="reconcile" size={15} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Split Evenly
                  </ThemedText>
                </Pressable>

                {remainderMinor !== 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Auto-balance remainder to last split category"
                    className="flex-1 min-h-[44px] py-2 px-3 rounded-xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:scale-[0.98]"
                    onPress={handleAutoBalanceRemainder}
                  >
                    <AppIcon name="sparkle" size={15} color={theme.warning} />
                    <ThemedText className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark">
                      Auto-balance
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              {/* 1-tap shortcut if total mismatch */}
              {canUpdateTotalShortcut && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Update total amount to match sum"
                  className="mt-2.5 min-h-[44px] bg-ledger-pine dark:bg-ledger-pine-dark active:opacity-90 rounded-xl py-2 px-3 flex-row items-center justify-center gap-1.5 active:scale-[0.98]"
                  onPress={handleApplyWithUpdatedTotal}
                >
                  <AppIcon name="autopay" size={15} color={theme.onPrimary} />
                  <ThemedText
                    numeric
                    className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark"
                  >
                    Update Total to {formatMinorUnits(sumMinor, currency)} & Apply
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {/* Split Rows */}
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-4 pb-8 gap-3"
              keyboardShouldPersistTaps="handled"
            >
              {rows.map((row, index) => {
                const currentCat = categoryMap.get(row.categoryId);
                const isPickerOpen = activeCategoryPickerRowId === row.id;

                return (
                  <View
                    key={row.id}
                    className="p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark"
                    style={
                      currentCat?.color
                        ? { borderColor: `${currentCat.color}80` }
                        : undefined
                    }
                  >
                    {/* Row Header: Category Selector + Delete (if > 2) */}
                    <View className="flex-row justify-between items-center mb-3 gap-2">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Change category for split line ${index + 1}`}
                        className="min-h-[44px] flex-row items-center gap-2 px-3 py-1.5 rounded-xl border active:opacity-75"
                        style={{
                          backgroundColor: currentCat?.color ? `${currentCat.color}15` : undefined,
                          borderColor: currentCat?.color ?? theme.borderStrong,
                        }}
                        onPress={() =>
                          setActiveCategoryPickerRowId(isPickerOpen ? null : row.id)
                        }
                      >
                        {currentCat?.icon ? (
                          <ThemedText className="text-lg">{currentCat.icon}</ThemedText>
                        ) : (
                          <AppIcon name="tag" size={16} color={theme.textSecondary} />
                        )}
                        <ThemedText
                          className="text-sm font-bold max-w-[160px] text-ledger-ink dark:text-ledger-ink-dark"
                          style={currentCat?.color ? { color: currentCat.color } : undefined}
                          numberOfLines={1}
                        >
                          {currentCat?.name ?? 'Select Category'}
                        </ThemedText>
                        <AppIcon
                          name={isPickerOpen ? 'chevronUp' : 'chevronDown'}
                          size={14}
                          color={theme.textMuted}
                        />
                      </Pressable>

                      {rows.length > 2 && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete split line ${index + 1}`}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft flex-row items-center justify-center gap-1 active:opacity-75"
                          onPress={() => handleRemoveSplitLine(index)}
                        >
                          <AppIcon name="close" size={13} color={theme.negative} />
                          <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                            Remove
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Inline Category Quick Chooser (when expanded) */}
                    {isPickerOpen && (
                      <View className="mb-3">
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerClassName="gap-1.5 py-1"
                        >
                          {categories.map((cat) => (
                            <Pressable
                              key={cat.id}
                              accessibilityRole="button"
                              accessibilityLabel={`Choose ${cat.name}`}
                              className="min-h-[44px] flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl border active:scale-95 bg-ledger-subtle dark:bg-ledger-subtle-dark"
                              style={{
                                backgroundColor:
                                  row.categoryId === cat.id
                                    ? `${cat.color}20`
                                    : undefined,
                                borderColor:
                                  row.categoryId === cat.id ? cat.color : theme.border,
                              }}
                              onPress={() => handleSelectCategoryForRow(row.id, cat.id)}
                            >
                              <ThemedText className="text-base">{cat.icon}</ThemedText>
                              <ThemedText
                                className={`text-xs ${
                                  row.categoryId === cat.id
                                    ? 'font-bold'
                                    : 'font-medium text-ledger-ink dark:text-ledger-ink-dark'
                                }`}
                                style={row.categoryId === cat.id ? { color: cat.color } : undefined}
                                numberOfLines={1}
                              >
                                {cat.name}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Inputs: Amount and Note */}
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1">
                          Amount ({currency})
                        </ThemedText>
                        <TextInput
                          className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3 text-base font-bold bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark"
                          style={TABULAR_NUMS_STYLE}
                          keyboardType="decimal-pad"
                          inputMode="decimal"
                          autoCorrect={false}
                          spellCheck={false}
                          autoComplete="off"
                          value={row.amountInput}
                          onChangeText={(val) => handleAmountChange(index, normalizeDecimalInput(val))}
                          placeholder="0.00"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>

                      <View className="flex-[1.5]">
                        <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1">
                          Note (optional)
                        </ThemedText>
                        <TextInput
                          className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3 text-sm bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark"
                          value={row.note}
                          onChangeText={(val) => handleNoteChange(index, val)}
                          placeholder="e.g. personal share"
                          placeholderTextColor={theme.textMuted}
                          maxLength={120}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Add Split Line Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add another split line"
                className="min-h-[48px] rounded-2xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark p-3.5 flex-row items-center justify-center gap-1.5 active:scale-[0.99] mt-1 bg-ledger-subtle dark:bg-ledger-subtle-dark"
                onPress={handleAddSplitLine}
              >
                <AppIcon name="add" size={15} color={theme.primary} />
                <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                  Add Split Line
                </ThemedText>
              </Pressable>
            </ScrollView>

            {/* Footer Actions */}
            <View className="px-4 pt-3 pb-4 border-t border-ledger-border dark:border-ledger-border-dark items-center gap-2 bg-ledger-surface dark:bg-ledger-surface-dark">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apply split changes"
                disabled={!isBalanced}
                className={`w-full min-h-[48px] h-12 rounded-xl items-center justify-center active:scale-[0.98] ${
                  isBalanced
                    ? 'bg-brand-500 dark:bg-brand-400 active:opacity-90'
                    : 'bg-ledger-selected dark:bg-ledger-selected-dark border border-ledger-border dark:border-ledger-border-dark opacity-70'
                }`}
                onPress={handleApply}
              >
                <ThemedText
                  numeric
                  className={`text-base font-bold ${
                    isBalanced
                      ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                      : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
                  }`}
                >
                  Apply Split ({rows.length} categories)
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove splits and revert to single category"
                className="min-h-[44px] px-4 items-center justify-center active:opacity-75"
                onPress={handleClear}
              >
                <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted underline">
                  Remove Split (Revert to Single Category)
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
