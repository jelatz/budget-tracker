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
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type BudgetSummary,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export interface BudgetProgressCardProps {
  budget: BudgetSummary;
  currency?: string;
  onUpdateBudget: (newBudgetMinor: number) => Promise<unknown>;
  isUpdating?: boolean;
}

const PRESET_AMOUNTS_MINOR = [150000, 250000, 400000, 500000] as const;

export function BudgetProgressCard({
  budget,
  currency = DEFAULT_CURRENCY,
  onUpdateBudget,
  isUpdating = false,
}: BudgetProgressCardProps) {
  const theme = useTheme();
  const presets = PRESET_AMOUNTS_MINOR.map((minor) => ({
    minor,
    label: formatMinorUnits(minor, currency).replace(/\.00$/, ''),
  }));
  const [modalVisible, setModalVisible] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isBusy = isUpdating || isSaving;
  const clampedPercent = Math.min(100, Math.max(0, budget.utilizationPercent));

  const isDanger = budget.isOverBudget || budget.utilizationPercent >= 100;
  const isWarning = !isDanger && budget.utilizationPercent >= 75;

  const barColorClass = isDanger
    ? 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark'
    : isWarning
      ? 'bg-ledger-ochre dark:bg-ledger-ochre-dark'
      : 'bg-ledger-pine dark:bg-ledger-pine-dark';
  const badgeBgClass = isDanger
    ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft'
    : isWarning
      ? 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft'
      : 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft';
  const badgeTextClass = isDanger
    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
    : isWarning
      ? 'text-ledger-ochre dark:text-ledger-ochre-dark'
      : 'text-ledger-pine dark:text-ledger-pine-dark';

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
      setErrorMessage('Please enter a valid positive amount.');
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
    <View className="rounded-2xl p-5 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
      {/* 1. Header Row */}
      <View className="flex-row justify-between items-center gap-2 mb-3">
        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted flex-1">
          Monthly Spending Target
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit monthly spending target"
          onPress={handleOpenModal}
          disabled={isBusy}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5 active:bg-ledger-selected dark:active:bg-ledger-selected-dark"
        >
          <AppIcon name="edit" size={14} color={theme.textSecondary} />
          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
            Edit Target
          </ThemedText>
        </Pressable>
      </View>

      {/* 2. Main Figures & Percentage Badge */}
      <View className="flex-row justify-between items-center mb-2.5 gap-2">
        <ThemedText
          numeric
          className="flex-1 mr-2 text-sm sm:text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {`Spent ${formatMinorUnits(budget.spentMinor, currency)} of ${formatMinorUnits(budget.budgetMinor, currency)}`}
        </ThemedText>

        <View className={`px-2.5 py-1 rounded-full ${badgeBgClass}`}>
          <ThemedText numeric className={`text-xs font-bold ${badgeTextClass}`}>
            {`${budget.utilizationPercent}%`}
          </ThemedText>
        </View>
      </View>

      {/* 3. Horizontal Progress Bar */}
      <View className="h-2.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden mb-3">
        <View
          className={`h-full rounded-full ${barColorClass}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </View>

      {/* 4. Footer Text */}
      <View className="flex-row items-center gap-1.5">
        {budget.isOverBudget ? (
          <>
            <AppIcon name="warning" size={14} color={theme.negative} />
            <ThemedText
              numeric
              className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1"
            >
              {`Over budget by ${formatMinorUnits(Math.abs(budget.remainingMinor), currency)}`}
            </ThemedText>
          </>
        ) : (
          <ThemedText
            numeric
            className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
          >
            {`${formatMinorUnits(budget.remainingMinor, currency)} remaining this month`}
          </ThemedText>
        )}
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
          className="flex-1 justify-center items-center p-4 bg-black/55"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss dialog"
            onPress={handleCloseModal}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[420px] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-6 gap-4"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <ThemedText
                  accessibilityRole="header"
                  className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Monthly Spending Target
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                  Set your target spending budget for the month.
                </ThemedText>
              </View>

              <Pressable
                onPress={handleCloseModal}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Close monthly target modal"
                className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <AppIcon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Target Amount Input */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                {`Target Amount (${DEFAULT_CURRENCY_SYMBOL} ${currency})`}
              </ThemedText>
              <View className="flex-row items-center border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-3">
                <ThemedText className="text-2xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                  {DEFAULT_CURRENCY_SYMBOL}
                </ThemedText>
                <TextInput
                  className="flex-1 text-2xl font-bold text-ledger-ink dark:text-ledger-ink-dark p-0"
                  style={TABULAR_NUMS_STYLE}
                  value={targetInput}
                  onChangeText={(text) => {
                    setTargetInput(normalizeDecimalInput(text));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  accessibilityLabel={`Target amount in ${currency}`}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="2500"
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                  editable={!isBusy}
                />
              </View>
            </View>

            {/* Quick 1-Tap Presets */}
            <View className="gap-2">
              <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Quick Presets
              </ThemedText>
              <View className="flex-row gap-2 flex-wrap">
                {presets.map((preset) => {
                  const isSelected = parseDecimalToMinorUnits(targetInput) === preset.minor;
                  return (
                    <Pressable
                      key={preset.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Set monthly target to ${preset.label}`}
                      onPress={() => handleSelectPreset(preset.minor)}
                      disabled={isBusy}
                      className={`min-h-[44px] py-2 px-3.5 rounded-xl border items-center justify-center ${
                        isSelected
                          ? 'bg-brand-500 dark:bg-brand-400 border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:bg-ledger-selected dark:active:bg-ledger-selected-dark'
                      }`}
                    >
                      <ThemedText
                        numeric
                        className={`text-xs ${
                          isSelected
                            ? 'font-bold text-ledger-canvas dark:text-ledger-canvas-dark'
                            : 'font-semibold text-ledger-ink dark:text-ledger-ink-dark'
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
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
              >
                <AppIcon name="error" size={15} color={theme.negative} />
                <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1">
                  {errorMessage}
                </ThemedText>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row justify-end gap-2.5 pt-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={handleCloseModal}
                disabled={isBusy}
                className="min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75 items-center justify-center"
              >
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Cancel
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Target"
                onPress={handleSave}
                disabled={isBusy}
                className={`min-h-[44px] py-2.5 px-5 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-85 items-center justify-center min-w-[120px] ${
                  isBusy ? 'opacity-60' : ''
                }`}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
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
