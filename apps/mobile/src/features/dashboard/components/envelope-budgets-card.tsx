import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type CategoryBudget,
  type CategoryBudgetStatus,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAllCategories,
  useCategoryBudgets,
  useDeleteCategoryBudget,
  useUpsertCategoryBudget,
} from '@/features/transactions/hooks/use-transactions';

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatPeriodDisplay(periodMonth: string): string {
  try {
    const [yearStr, monthStr] = periodMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const d = new Date(year, month, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch (error: unknown) {
    return periodMonth;
  }
}

function shiftPeriodMonth(periodMonth: string, delta: number): string {
  const [yearStr, monthStr] = periodMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

const AMOUNT_PRESETS = [5000, 10000, 25000, 50000];

export function EnvelopeBudgetsCard() {
  const theme = useTheme();
  const [periodMonth, setPeriodMonth] = useState<string>(getCurrentPeriod);

  // Queries & Mutations
  const { data: envelopes = [], isLoading } = useCategoryBudgets(periodMonth);
  const { categories } = useAllCategories();
  const upsertMutation = useUpsertCategoryBudget();
  const deleteMutation = useDeleteCategoryBudget();

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<CategoryBudgetStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Form Fields
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [assignedInput, setAssignedInput] = useState('');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isSubmitting = upsertMutation.isPending || deleteMutation.isPending;

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; color?: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, icon: c.icon, color: c.color });
    }
    return map;
  }, [categories]);

  const totals = useMemo(() => {
    let totalAssigned = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    for (const env of envelopes) {
      totalAssigned += env.assignedMinor;
      totalSpent += env.spentMinor;
      totalRemaining += env.remainingMinor;
    }
    return { totalAssigned, totalSpent, totalRemaining };
  }, [envelopes]);

  const availableCategories = useMemo(() => {
    const usedCategoryIds = new Set(envelopes.map((e) => e.categoryId));
    return categories.filter((c) => c.type === 'EXPENSE' && !usedCategoryIds.has(c.id));
  }, [categories, envelopes]);

  const handleOpenCreateModal = () => {
    setEditingEnvelope(null);
    setConfirmingDelete(false);
    setSelectedCategoryId(availableCategories[0]?.id ?? (categories[0]?.id ?? ''));
    setAssignedInput('100');
    setRolloverEnabled(true);
    setNotes('');
    setFormError(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (envelope: CategoryBudgetStatus) => {
    setEditingEnvelope(envelope);
    setConfirmingDelete(false);
    setSelectedCategoryId(envelope.categoryId);
    setAssignedInput(minorUnitsToDecimalInput(envelope.assignedMinor));
    setRolloverEnabled(envelope.rolloverEnabled);
    setNotes(envelope.notes ?? '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setModalVisible(false);
      setEditingEnvelope(null);
      setConfirmingDelete(false);
      setFormError(null);
    }
  };

  const handleSaveEnvelope = async () => {
    const minorUnits = parseDecimalToMinorUnits(assignedInput);
    if (minorUnits === null || minorUnits < 0) {
      setFormError('Please enter a valid non-negative amount.');
      return;
    }

    if (!selectedCategoryId) {
      setFormError('Please select a category.');
      return;
    }

    try {
      setFormError(null);
      const budgetPayload: Omit<CategoryBudget, 'id'> & { id?: string } = {
        categoryId: selectedCategoryId,
        periodMonth,
        assignedMinor: minorUnits,
        rolloverEnabled,
        notes: notes.trim() || undefined,
      };

      if (editingEnvelope?.id) {
        budgetPayload.id = editingEnvelope.id;
      }

      await upsertMutation.mutateAsync(budgetPayload);
      setModalVisible(false);
      setEditingEnvelope(null);
      setConfirmingDelete(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save envelope budget.';
      setFormError(msg);
    }
  };

  const handleConfirmDeleteEnvelope = async () => {
    if (!editingEnvelope) return;
    try {
      setFormError(null);
      if (editingEnvelope.id) {
        await deleteMutation.mutateAsync(editingEnvelope.id);
      }
      setModalVisible(false);
      setEditingEnvelope(null);
      setConfirmingDelete(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete envelope.';
      setFormError(msg);
    }
  };

  const editingCategory = editingEnvelope ? categoryMap.get(editingEnvelope.categoryId) : undefined;
  const editingCategoryName = editingCategory?.name ?? 'envelope';

  return (
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
      {/* 1. Header */}
      <View className="flex-row items-start justify-between flex-wrap gap-3">
        <View className="gap-0.5 flex-1 min-w-[140px]">
          <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Category Envelopes
          </ThemedText>
          <ThemedText className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Dedicated monthly pots with rollovers
          </ThemedText>
        </View>

        <Pressable
          onPress={handleOpenCreateModal}
          accessibilityRole="button"
          accessibilityLabel="Create New Envelope"
          className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 shrink-0"
        >
          <AppIcon name="add" size={15} color={theme.onPrimary} />
          <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark text-xs font-bold">
            New Envelope
          </ThemedText>
        </Pressable>
      </View>

      {/* 2. Month Selector & Summary Bar */}
      <View className="flex-row flex-wrap items-center justify-between gap-2 bg-ledger-subtle dark:bg-ledger-subtle-dark p-2 rounded-xl border border-ledger-border dark:border-ledger-border-dark">
        <View className="flex-row items-center gap-1.5">
          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous Month"
            className="w-11 h-11 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <AppIcon name="chevronLeft" size={16} color={theme.textSecondary} />
          </Pressable>

          <View className="px-2 py-1">
            <ThemedText
              numeric
              className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
            >
              {formatPeriodDisplay(periodMonth)}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next Month"
            className="w-11 h-11 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
          </Pressable>

          {periodMonth !== getCurrentPeriod() && (
            <Pressable
              onPress={() => setPeriodMonth(getCurrentPeriod())}
              accessibilityRole="button"
              accessibilityLabel="Reset to Current Month"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75 ml-1"
            >
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Today
              </ThemedText>
            </Pressable>
          )}
        </View>

        {envelopes.length > 0 && (
          <View className="flex-row items-center px-2">
            <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Assigned:{' '}
              <ThemedText
                numeric
                className="font-bold text-ledger-ink dark:text-ledger-ink-dark"
              >
                {formatMinorUnits(totals.totalAssigned)}
              </ThemedText>
            </ThemedText>
          </View>
        )}
      </View>

      {/* 3. List of Envelopes */}
      {isLoading ? (
        <View className="py-8 items-center justify-center">
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-2">
            Loading envelopes...
          </ThemedText>
        </View>
      ) : envelopes.length === 0 ? (
        <View className="py-6 px-4 items-center justify-center gap-2.5 bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-2xl border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
          <View className="w-11 h-11 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
            <AppIcon name="envelope" size={20} color={theme.textMuted} />
          </View>
          <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark text-center">
            {`No envelopes for ${formatPeriodDisplay(periodMonth)}`}
          </ThemedText>
          <ThemedText className="text-xs text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary max-w-[260px]">
            Create category envelopes to set monthly spending boundaries with automatic rollover.
          </ThemedText>
          <Pressable
            onPress={handleOpenCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create First Envelope"
            className="mt-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-85 flex-row items-center gap-1.5"
          >
            <AppIcon name="add" size={15} color={theme.onPrimary} />
            <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark text-xs font-bold">
              Create Envelope
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {envelopes.map((env) => {
            const cat = categoryMap.get(env.categoryId);
            const catName = cat?.name ?? 'Category';

            const percent = env.utilizationPercent;
            const clampedPercent = Math.min(100, Math.max(0, percent));

            let barColor = 'bg-ledger-pine dark:bg-ledger-pine-dark';
            if (env.isOverspent || percent > 100) {
              barColor = 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark';
            } else if (percent >= 75) {
              barColor = 'bg-ledger-ochre dark:bg-ledger-ochre-dark';
            }

            return (
              <Pressable
                key={env.id ?? env.categoryId}
                onPress={() => handleOpenEditModal(env)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${catName} envelope`}
                className="min-h-[44px] p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-80"
              >
                {/* Row 1: Icon, Title, Assigned & Remaining */}
                <View className="flex-row items-center justify-between mb-2.5 gap-2">
                  <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                    <View className="w-9 h-9 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
                      {cat ? (
                        <ThemedText className="text-base">{cat.icon}</ThemedText>
                      ) : (
                        <AppIcon name="tag" size={16} color={theme.textSecondary} />
                      )}
                    </View>
                    <View className="flex-1 min-w-0">
                      <ThemedText
                        className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {catName}
                      </ThemedText>
                      <ThemedText
                        numeric
                        className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      >
                        {`Assigned: ${formatMinorUnits(env.assignedMinor)}${
                          env.rolloverEnabled && env.carriedOverMinor !== 0
                            ? ` · Eff: ${formatMinorUnits(env.effectiveBudgetMinor)}`
                            : ''
                        }`}
                      </ThemedText>
                    </View>
                  </View>

                  <View className="items-end shrink-0">
                    <ThemedText
                      numeric
                      className={`text-sm font-bold ${
                        env.isOverspent
                          ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                          : 'text-ledger-ink dark:text-ledger-ink-dark'
                      }`}
                    >
                      {formatMinorUnits(env.remainingMinor)}
                    </ThemedText>
                    <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      {env.isOverspent ? 'overspent' : 'remaining'}
                    </ThemedText>
                  </View>
                </View>

                {/* Row 2: Progress Bar */}
                <View className="h-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden mb-2.5">
                  <View
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${clampedPercent}%` }}
                  />
                </View>

                {/* Row 3: Spent info & Rollover Badges (max 2 badges) */}
                <View className="flex-row items-center justify-between flex-wrap gap-1.5">
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  >
                    {`Spent: ${formatMinorUnits(env.spentMinor)} (${percent}%)`}
                  </ThemedText>

                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    {env.rolloverEnabled && env.carriedOverMinor > 0 && (
                      <View className="px-2 py-0.5 rounded-full bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft">
                        <ThemedText
                          numeric
                          className="text-[11px] font-semibold text-ledger-pine dark:text-ledger-pine-dark"
                        >
                          {`+${formatMinorUnits(env.carriedOverMinor)} rolled over`}
                        </ThemedText>
                      </View>
                    )}

                    {env.rolloverEnabled && env.carriedOverMinor < 0 && (
                      <View className="px-2 py-0.5 rounded-full bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft">
                        <ThemedText
                          numeric
                          className="text-[11px] font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                        >
                          {`-${formatMinorUnits(Math.abs(env.carriedOverMinor))} deficit`}
                        </ThemedText>
                      </View>
                    )}

                    <View
                      className={`px-2 py-0.5 rounded-full ${
                        env.rolloverEnabled
                          ? 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft'
                          : 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      }`}
                    >
                      <ThemedText
                        className={`text-[11px] font-semibold ${
                          env.rolloverEnabled
                            ? 'text-ledger-teal dark:text-ledger-teal-dark'
                            : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
                        }`}
                      >
                        {env.rolloverEnabled ? 'Rollover ON' : 'Rollover OFF'}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 4. Envelope Create / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4 bg-black/55"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss envelope dialog"
            onPress={handleCloseModal}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[440px] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-6 gap-4"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText
                  accessibilityRole="header"
                  className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {editingEnvelope ? 'Edit Envelope' : 'New Envelope'}
                </ThemedText>
                <ThemedText
                  numeric
                  className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {formatPeriodDisplay(periodMonth)}
                </ThemedText>
              </View>

              <Pressable
                onPress={handleCloseModal}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Close envelope modal"
                className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <AppIcon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            {formError && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
              >
                <AppIcon name="error" size={15} color={theme.negative} />
                <ThemedText className="text-xs text-ledger-terracotta dark:text-ledger-terracotta-dark font-semibold flex-1">
                  {formError}
                </ThemedText>
              </View>
            )}

            <ScrollView
              className="max-h-[420px]"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                {/* Category Selection */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Category
                  </ThemedText>

                  {editingEnvelope ? (
                    <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                      {editingCategory ? (
                        <ThemedText className="text-xl">{editingCategory.icon}</ThemedText>
                      ) : (
                        <AppIcon name="tag" size={18} color={theme.textSecondary} />
                      )}
                      <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        {editingCategoryName}
                      </ThemedText>
                    </View>
                  ) : availableCategories.length === 0 ? (
                    <View className="p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        All expense categories already have envelopes for this month.
                      </ThemedText>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="gap-2 py-0.5"
                    >
                      {availableCategories.map((cat) => {
                        const isSelected = selectedCategoryId === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => setSelectedCategoryId(cat.id)}
                            disabled={isSubmitting}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={`Select ${cat.name}`}
                            className={`min-h-[44px] px-3 py-2 rounded-xl flex-row items-center gap-1.5 border ${
                              isSelected
                                ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                            }`}
                          >
                            <ThemedText className="text-sm">{cat.icon}</ThemedText>
                            <ThemedText
                              className={`text-xs font-semibold ${
                                isSelected
                                  ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                                  : 'text-ledger-ink dark:text-ledger-ink-dark'
                              }`}
                            >
                              {cat.name}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                {/* Assigned Amount */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {`Monthly Assigned Budget (${DEFAULT_CURRENCY_SYMBOL})`}
                  </ThemedText>

                  <View className="flex-row items-center border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-3">
                    <ThemedText className="text-2xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                      {DEFAULT_CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      className="flex-1 text-2xl font-bold text-ledger-ink dark:text-ledger-ink-dark p-0"
                      style={TABULAR_NUMS_STYLE}
                      value={assignedInput}
                      onChangeText={(t) => {
                        setAssignedInput(normalizeDecimalInput(t));
                        if (formError) setFormError(null);
                      }}
                      accessibilityLabel="Monthly assigned budget amount"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="100"
                      placeholderTextColor={theme.textMuted}
                      editable={!isSubmitting}
                    />
                  </View>

                  {/* Amount Presets */}
                  <View className="flex-row gap-2 flex-wrap mt-1">
                    {AMOUNT_PRESETS.map((presetMinor) => (
                      <Pressable
                        key={presetMinor}
                        onPress={() => {
                          setAssignedInput(minorUnitsToDecimalInput(presetMinor));
                          if (formError) setFormError(null);
                        }}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={`Set budget to ${formatMinorUnits(presetMinor)}`}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:bg-ledger-selected dark:active:bg-ledger-selected-dark"
                      >
                        <ThemedText
                          numeric
                          className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                        >
                          {formatMinorUnits(presetMinor)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Rollover Switch */}
                <View className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Rollover Surplus / Deficit
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                        Roll unspent surplus or overspending into next month
                      </ThemedText>
                    </View>
                    <Switch
                      value={rolloverEnabled}
                      onValueChange={setRolloverEnabled}
                      disabled={isSubmitting}
                      accessibilityLabel="Rollover Surplus or Deficit"
                      trackColor={{ false: theme.borderStrong, true: theme.primary }}
                      thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                    />
                  </View>
                </View>

                {/* Optional Notes */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Notes (Optional)
                  </ThemedText>
                  <TextInput
                    className="min-h-[44px] border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl p-3 text-sm text-ledger-ink dark:text-ledger-ink-dark"
                    value={notes}
                    onChangeText={setNotes}
                    accessibilityLabel="Envelope notes"
                    placeholder="e.g. Weekly grocery runs + bulk pantry"
                    placeholderTextColor={theme.textMuted}
                    maxLength={280}
                    editable={!isSubmitting}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="gap-2.5 pt-2">
              <Pressable
                onPress={handleSaveEnvelope}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Save Envelope"
                className={`min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-85 py-3 rounded-xl items-center justify-center ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
              >
                {upsertMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark font-bold text-sm">
                    {editingEnvelope ? 'Update Envelope' : 'Create Envelope'}
                  </ThemedText>
                )}
              </Pressable>

              {editingEnvelope && !confirmingDelete && (
                <Pressable
                  onPress={() => setConfirmingDelete(true)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete Envelope"
                  className="min-h-[44px] py-2.5 rounded-xl items-center justify-center flex-row gap-1.5 border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft active:opacity-75"
                >
                  <AppIcon name="delete" size={15} color={theme.negative} />
                  <ThemedText className="text-ledger-terracotta dark:text-ledger-terracotta-dark font-bold text-xs">
                    Delete Envelope
                  </ThemedText>
                </Pressable>
              )}

              {editingEnvelope && confirmingDelete && (
                <View className="p-3.5 rounded-2xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft gap-3">
                  <View className="flex-row items-start gap-2">
                    <AppIcon name="warning" size={16} color={theme.negative} />
                    <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      {`Delete the "${editingCategoryName}" envelope for ${formatPeriodDisplay(
                        periodMonth,
                      )}?`}
                    </ThemedText>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setConfirmingDelete(false)}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel deleting envelope"
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Cancel
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleConfirmDeleteEnvelope()}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm delete envelope"
                      className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center ${
                        deleteMutation.isPending ? 'opacity-60' : ''
                      }`}
                    >
                      {deleteMutation.isPending ? (
                        <ActivityIndicator size="small" color={theme.background} />
                      ) : (
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                          Confirm Delete
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
