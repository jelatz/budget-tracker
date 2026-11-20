import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import {
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type BudgetSummary,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface BudgetProgressCardProps {
  budget: BudgetSummary;
  currency?: string;
  onUpdateBudget: (newBudgetMinor: number) => Promise<unknown>;
  isUpdating?: boolean;
}

const PRESETS: Array<{ label: string; minor: number }> = [
  { label: '₱15,000', minor: 1500000 },
  { label: '₱30,000', minor: 3000000 },
  { label: '₱50,000', minor: 5000000 },
  { label: '₱80,000', minor: 8000000 },
];

export function BudgetProgressCard({
  budget,
  currency = 'PHP',
  onUpdateBudget,
  isUpdating = false,
}: BudgetProgressCardProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isBusy = isUpdating || isSaving;
  const clampedPercent = Math.min(100, Math.max(0, budget.utilizationPercent));

  // Semantic color tokens for progress bar & badge
  const isDanger = budget.isOverBudget || budget.utilizationPercent >= 100;
  const isWarning = !isDanger && budget.utilizationPercent >= 75;

  const barColorClass = isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
  const badgeBgClass = isDanger
    ? 'bg-rose-50 dark:bg-rose-950/60'
    : isWarning
      ? 'bg-amber-50 dark:bg-amber-950/60'
      : 'bg-emerald-50 dark:bg-emerald-950/60';
  const badgeTextClass = isDanger
    ? 'text-rose-600 dark:text-rose-400'
    : isWarning
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const handleOpenModal = () => {
    setTargetInput(minorUnitsToDecimalInput(budget.budgetMinor));
    setErrorMessage(null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    if (!isBusy) {
      setModalVisible(false);
      setErrorMessage(null);
    }
  };

  const handleSelectPreset = (minor: number) => {
    setTargetInput(minorUnitsToDecimalInput(minor));
    setErrorMessage(null);
  };

  const handleSave = async () => {
    const parsedMinor = parseDecimalToMinorUnits(targetInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setErrorMessage('Please enter a valid positive peso amount.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onUpdateBudget(parsedMinor);
      setModalVisible(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to update target. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="rounded-3xl p-5 bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm">
      {/* 1. Header Row */}
      <View className="flex-row justify-between items-center mb-3">
        <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Monthly Spending Target
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit Target"
          onPress={handleOpenModal}
          disabled={isBusy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#171f33] border border-slate-200/70 dark:border-slate-800 active:opacity-75 items-center justify-center"
        >
          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Edit Target
          </ThemedText>
        </Pressable>
      </View>

      {/* 2. Main Figures & Percentage Badge */}
      <View className="flex-row justify-between items-center mb-2 gap-2">
        <ThemedText
          className="flex-1 mr-2 text-sm sm:text-base font-bold text-slate-900 dark:text-white"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Spent{' '}
          <ThemedText className="text-sm sm:text-base font-mono font-bold text-slate-900 dark:text-white">
            {formatMinorUnits(budget.spentMinor, currency)}
          </ThemedText>{' '}
          of{' '}
          <ThemedText className="text-sm sm:text-base font-mono font-bold text-slate-900 dark:text-white">
            {formatMinorUnits(budget.budgetMinor, currency)}
          </ThemedText>
        </ThemedText>

        <View className={`px-2.5 py-1 rounded-lg ${badgeBgClass}`}>
          <ThemedText className={`text-xs font-bold font-mono ${badgeTextClass}`}>
            {`${budget.utilizationPercent}%`}
          </ThemedText>
        </View>
      </View>

      {/* 3. Horizontal Progress Bar */}
      <View className="h-3 rounded-full bg-slate-100 dark:bg-[#171f33] overflow-hidden mb-3">
        <View
          className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </View>

      {/* 4. Footer Text */}
      <View className="flex-row justify-start">
        <ThemedText
          className={`text-xs ${
            budget.isOverBudget
              ? 'font-semibold text-rose-600 dark:text-rose-400'
              : 'font-medium text-slate-500 dark:text-slate-400'
          }`}
        >
          {budget.isOverBudget ? (
            <>
              Over budget by{' '}
              <ThemedText className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                {formatMinorUnits(Math.abs(budget.remainingMinor), currency)}
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                {formatMinorUnits(budget.remainingMinor, currency)}
              </ThemedText>{' '}
              remaining this month
            </>
          )}
        </ThemedText>
      </View>

      {/* 5. Edit Target Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-center items-center p-4"
        >
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={handleCloseModal}
          />

          <View className="w-full max-w-[420px] rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <ThemedText className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Monthly Spending Target
            </ThemedText>
            <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Set your target spending budget for the month.
            </ThemedText>

            {/* Target Amount Input */}
            <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1326] rounded-2xl px-4 py-3 mb-4">
              <ThemedText className="text-2xl font-bold font-mono text-slate-400 dark:text-slate-500 mr-2">
                ₱
              </ThemedText>
              <TextInput
                className="flex-1 text-2xl font-bold font-mono text-slate-900 dark:text-white p-0"
                value={targetInput}
                onChangeText={(text) => {
                  setTargetInput(text);
                  if (errorMessage) setErrorMessage(null);
                }}
                keyboardType="decimal-pad"
                placeholder="30000"
                placeholderTextColor="#94A3B8"
                autoFocus
                editable={!isBusy}
              />
            </View>

            {/* Quick 1-Tap Presets */}
            <View className="mb-4">
              <ThemedText className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Quick Presets:
              </ThemedText>
              <View className="flex-row gap-2 flex-wrap">
                {PRESETS.map((preset) => {
                  const isSelected =
                    parseDecimalToMinorUnits(targetInput) === preset.minor;
                  return (
                    <Pressable
                      key={preset.label}
                      accessibilityRole="button"
                      accessibilityLabel={`Set target to ${preset.label}`}
                      onPress={() => handleSelectPreset(preset.minor)}
                      disabled={isBusy}
                      className={`min-h-[44px] justify-center items-center py-2 px-3.5 rounded-xl border ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-transparent active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-mono ${
                          isSelected
                            ? 'font-bold text-white'
                            : 'font-semibold text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {preset.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Error Message */}
            {errorMessage && (
              <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-3">
                {errorMessage}
              </ThemedText>
            )}

            {/* Actions */}
            <View className="flex-row justify-end gap-3 mt-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={handleCloseModal}
                disabled={isBusy}
                className="min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 active:opacity-75 items-center justify-center"
              >
                <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Cancel
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save target"
                onPress={handleSave}
                disabled={isBusy}
                className={`min-h-[44px] py-2.5 px-5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center min-w-[110px] ${
                  isBusy ? 'opacity-60' : ''
                }`}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ThemedText className="text-xs font-bold text-white">
                    Save Target
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
