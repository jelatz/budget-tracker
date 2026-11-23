import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ThemedText } from '@/common/components/themed-text';
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

const AMOUNT_PRESETS = [5000, 10000, 25000, 50000]; // in cents: $50, $100, $250, $500

export function EnvelopeBudgetsCard() {
  const [periodMonth, setPeriodMonth] = useState<string>(getCurrentPeriod);

  // Queries & Mutations
  const { data: envelopes = [], isLoading } = useCategoryBudgets(periodMonth);
  const { categories } = useAllCategories();
  const upsertMutation = useUpsertCategoryBudget();
  const deleteMutation = useDeleteCategoryBudget();

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<CategoryBudgetStatus | null>(null);

  // Form Fields
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [assignedInput, setAssignedInput] = useState('');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isSubmitting = upsertMutation.isPending || deleteMutation.isPending;

  // Category map for quick lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; color?: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, icon: c.icon, color: c.color });
    }
    return map;
  }, [categories]);

  // Totals for this period
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

  // Categories available for new envelopes
  const availableCategories = useMemo(() => {
    const usedCategoryIds = new Set(envelopes.map((e) => e.categoryId));
    return categories.filter((c) => c.type === 'EXPENSE' && !usedCategoryIds.has(c.id));
  }, [categories, envelopes]);

  const handleOpenCreateModal = () => {
    setEditingEnvelope(null);
    setSelectedCategoryId(availableCategories[0]?.id ?? (categories[0]?.id ?? ''));
    setAssignedInput('100');
    setRolloverEnabled(true);
    setNotes('');
    setFormError(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (envelope: CategoryBudgetStatus) => {
    setEditingEnvelope(envelope);
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save envelope budget.';
      setFormError(msg);
    }
  };

  const handleDeleteEnvelope = () => {
    if (!editingEnvelope) return;

    const catName = categoryMap.get(editingEnvelope.categoryId)?.name ?? 'envelope';
    const doDelete = async () => {
      try {
        if (editingEnvelope.id) {
          await deleteMutation.mutateAsync(editingEnvelope.id);
        }
        setModalVisible(false);
        setEditingEnvelope(null);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Failed to delete envelope.';
        setFormError(msg);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Delete the "${catName}" envelope for ${formatPeriodDisplay(periodMonth)}?`)) {
        void doDelete();
      }
    } else {
      Alert.alert(
        'Delete Envelope',
        `Are you sure you want to remove the "${catName}" envelope for ${formatPeriodDisplay(periodMonth)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
        ],
      );
    }
  };

  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
      {/* 1. Header */}
      <View className="flex-row items-center justify-between flex-wrap gap-2">
        <View className="gap-0.5 flex-1 min-w-[140px] mr-2">
          <ThemedText className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Category Envelopes
          </ThemedText>
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
            Dedicated monthly pots with rollovers
          </ThemedText>
        </View>

        <Pressable
          onPress={handleOpenCreateModal}
          accessibilityRole="button"
          accessibilityLabel="Create New Envelope"
          className="bg-brand-500 active:bg-brand-600 px-3 py-1.5 rounded-full flex-row items-center gap-1 shadow-sm"
        >
          <ThemedText className="text-white text-xs font-bold">+ New Envelope</ThemedText>
        </Pressable>
      </View>

      {/* 2. Month Selector & Summary Bar */}
      <View className="flex-row flex-wrap items-center justify-between gap-1.5 bg-slate-50 dark:bg-slate-950 p-2 sm:p-2.5 rounded-2xl border border-slate-200/60 dark:border-slate-800/80">
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous Month"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-slate-600 dark:text-slate-300">
              ◀
            </ThemedText>
          </Pressable>

          <View className="px-2 py-0.5">
            <ThemedText className="text-xs font-bold text-slate-900 dark:text-white">
              {formatPeriodDisplay(periodMonth)}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => setPeriodMonth((prev) => shiftPeriodMonth(prev, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next Month"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-slate-600 dark:text-slate-300">
              ▶
            </ThemedText>
          </Pressable>

          {periodMonth !== getCurrentPeriod() && (
            <Pressable
              onPress={() => setPeriodMonth(getCurrentPeriod())}
              accessibilityRole="button"
              accessibilityLabel="Reset to Current Month"
              className="px-2 py-1 rounded-md bg-slate-200/70 dark:bg-slate-800 active:opacity-75 ml-1"
            >
              <ThemedText className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                Today
              </ThemedText>
            </Pressable>
          )}
        </View>

        {envelopes.length > 0 && (
          <View className="flex-row items-center gap-2">
            <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
              Assigned:{' '}
              <ThemedText className="font-semibold text-slate-700 dark:text-slate-300">
                {formatMinorUnits(totals.totalAssigned)}
              </ThemedText>
            </ThemedText>
          </View>
        )}
      </View>

      {/* 3. List of Envelopes */}
      {isLoading ? (
        <View className="py-8 items-center justify-center">
          <ActivityIndicator size="small" color="#0ea5e9" />
          <ThemedText className="text-xs text-slate-400 mt-2">Loading envelopes...</ThemedText>
        </View>
      ) : envelopes.length === 0 ? (
        <View className="py-6 items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <ThemedText className="text-3xl">✉️</ThemedText>
          <ThemedText className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No envelopes for {formatPeriodDisplay(periodMonth)}
          </ThemedText>
          <ThemedText className="text-xs text-center text-slate-500 dark:text-slate-400 max-w-[260px]">
            Create category envelopes to set monthly spending boundaries with automatic rollover.
          </ThemedText>
          <Pressable
            onPress={handleOpenCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create First Envelope"
            className="mt-1 px-3 py-1.5 rounded-xl bg-brand-500 active:bg-brand-600"
          >
            <ThemedText className="text-white text-xs font-bold">+ Create Envelope</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {envelopes.map((env) => {
            const cat = categoryMap.get(env.categoryId) ?? {
              name: 'Category',
              icon: '🏷️',
            };

            const percent = env.utilizationPercent;
            const clampedPercent = Math.min(100, Math.max(0, percent));

            // Bar color logic: emerald for <75%, amber for 75-100%, rose for >100%
            let barColor = 'bg-emerald-500';
            if (env.isOverspent || percent > 100) {
              barColor = 'bg-rose-500';
            } else if (percent >= 75) {
              barColor = 'bg-amber-500';
            }

            return (
              <Pressable
                key={env.id ?? env.categoryId}
                onPress={() => handleOpenEditModal(env)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${cat.name} envelope`}
                className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 active:opacity-80"
              >
                {/* Row 1: Icon, Title, Rollover Status & Amount */}
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                    <View className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 items-center justify-center shadow-xs">
                      <ThemedText className="text-base">{cat.icon}</ThemedText>
                    </View>
                    <View className="flex-1">
                      <ThemedText
                        className="text-sm font-bold text-slate-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {cat.name}
                      </ThemedText>
                      <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
                        Assigned: {formatMinorUnits(env.assignedMinor)}
                        {env.rolloverEnabled && env.carriedOverMinor !== 0 && (
                          <ThemedText className="text-[11px] text-slate-400">
                            {' '}
                            (Eff: {formatMinorUnits(env.effectiveBudgetMinor)})
                          </ThemedText>
                        )}
                      </ThemedText>
                    </View>
                  </View>

                  <View className="items-end">
                    <ThemedText
                      className={`text-sm font-bold ${
                        env.isOverspent
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatMinorUnits(env.remainingMinor)}
                    </ThemedText>
                    <ThemedText className="text-[10px] text-slate-400">
                      {env.isOverspent ? 'overspent' : 'remaining'}
                    </ThemedText>
                  </View>
                </View>

                {/* Row 2: Progress Bar */}
                <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden mb-2">
                  <View
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${clampedPercent}%` }}
                  />
                </View>

                {/* Row 3: Spent info & Rollover Badges */}
                <View className="flex-row items-center justify-between flex-wrap gap-1.5">
                  <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
                    Spent: {formatMinorUnits(env.spentMinor)} ({percent}%)
                  </ThemedText>

                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    {/* Rollover Carryover Badge */}
                    {env.rolloverEnabled && env.carriedOverMinor > 0 && (
                      <View className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80">
                        <ThemedText className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          +{formatMinorUnits(env.carriedOverMinor)} rolled over
                        </ThemedText>
                      </View>
                    )}

                    {env.rolloverEnabled && env.carriedOverMinor < 0 && (
                      <View className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200/80 dark:border-rose-800/80">
                        <ThemedText className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                          -{formatMinorUnits(Math.abs(env.carriedOverMinor))} deficit
                        </ThemedText>
                      </View>
                    )}

                    {/* Rollover Status Badge */}
                    <View
                      className={`px-2 py-0.5 rounded-full border ${
                        env.rolloverEnabled
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200/80 dark:border-indigo-800/80'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <ThemedText
                        className={`text-[10px] font-semibold ${
                          env.rolloverEnabled
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-500 dark:text-slate-400'
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
          className="flex-1 justify-center items-center p-4 bg-black/60"
        >
          <Pressable className="absolute inset-0" onPress={handleCloseModal} />

          <View className="w-full max-w-[440px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl gap-4">
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <View>
                <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingEnvelope ? 'Edit Envelope' : 'New Envelope'}
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                  {formatPeriodDisplay(periodMonth)}
                </ThemedText>
              </View>

              <Pressable
                onPress={handleCloseModal}
                accessibilityRole="button"
                accessibilityLabel="Close Modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs text-slate-500 font-bold">✕</ThemedText>
              </Pressable>
            </View>

            {formError && (
              <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                <ThemedText className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {formError}
                </ThemedText>
              </View>
            )}

            <ScrollView className="max-h-[420px]" showsVerticalScrollIndicator={false}>
              <View className="gap-4">
                {/* Category Selection */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Category
                  </ThemedText>

                  {editingEnvelope ? (
                    <View className="flex-row items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <ThemedText className="text-xl">
                        {categoryMap.get(editingEnvelope.categoryId)?.icon ?? '🏷️'}
                      </ThemedText>
                      <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                        {categoryMap.get(editingEnvelope.categoryId)?.name ?? 'Category'}
                      </ThemedText>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="gap-2 py-1"
                    >
                      {availableCategories.map((cat) => {
                        const isSelected = selectedCategoryId === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => setSelectedCategoryId(cat.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${cat.name}`}
                            className={`px-3 py-2 rounded-xl flex-row items-center gap-1.5 border ${
                              isSelected
                                ? 'bg-brand-500 border-brand-500'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <ThemedText className="text-sm">{cat.icon}</ThemedText>
                            <ThemedText
                              className={`text-xs font-semibold ${
                                isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'
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
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Monthly Assigned Budget ({DEFAULT_CURRENCY_SYMBOL})
                  </ThemedText>

                  <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-4 py-3">
                    <ThemedText className="text-2xl font-bold text-slate-400 dark:text-slate-500 mr-2">
                      {DEFAULT_CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      className="flex-1 text-2xl font-bold text-slate-900 dark:text-white p-0"
                      value={assignedInput}
                      onChangeText={(t) => {
                        setAssignedInput(normalizeDecimalInput(t));
                        if (formError) setFormError(null);
                      }}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="100"
                      placeholderTextColor="#94A3B8"
                      editable={!isSubmitting}
                    />
                  </View>

                  {/* Amount Presets */}
                  <View className="flex-row gap-2 mt-1">
                    {AMOUNT_PRESETS.map((presetMinor) => (
                      <Pressable
                        key={presetMinor}
                        onPress={() => setAssignedInput(minorUnitsToDecimalInput(presetMinor))}
                        accessibilityRole="button"
                        accessibilityLabel={`Set budget to ${formatMinorUnits(presetMinor)}`}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 active:opacity-75"
                      >
                        <ThemedText className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {formatMinorUnits(presetMinor)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Rollover Switch */}
                <View className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 gap-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                        Rollover Surplus / Deficit
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Roll unspent surplus or overspending into next month
                      </ThemedText>
                    </View>
                    <Switch
                      value={rolloverEnabled}
                      onValueChange={setRolloverEnabled}
                      trackColor={{ false: '#cbd5e1', true: '#0ea5e9' }}
                    />
                  </View>
                </View>

                {/* Optional Notes */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Notes (Optional)
                  </ThemedText>
                  <TextInput
                    className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 text-sm text-slate-900 dark:text-white"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Weekly grocery runs + bulk pantry"
                    placeholderTextColor="#94A3B8"
                    maxLength={280}
                    editable={!isSubmitting}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="gap-2 pt-2">
              <Pressable
                onPress={handleSaveEnvelope}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Save Envelope"
                className="bg-brand-500 active:bg-brand-600 py-3 rounded-2xl items-center justify-center shadow-md shadow-brand-500/20"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText className="text-white font-bold text-sm">
                    {editingEnvelope ? 'Update Envelope' : 'Create Envelope'}
                  </ThemedText>
                )}
              </Pressable>

              {editingEnvelope && (
                <Pressable
                  onPress={handleDeleteEnvelope}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete Envelope"
                  className="py-2.5 rounded-2xl items-center justify-center border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 active:opacity-75"
                >
                  <ThemedText className="text-rose-600 dark:text-rose-400 font-bold text-xs">
                    Delete Envelope
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
