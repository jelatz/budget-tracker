import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  DEFAULT_CURRENCY_SYMBOL,
  formatDateInputValue,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  type Account,
  type IncomeSource,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';

export interface LogPaydayModalProps {
  visible: boolean;
  source: IncomeSource | null;
  accounts: readonly Account[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (params: {
    sourceId: string;
    amountMinor: number;
    accountId: string;
    occurredAt: string;
    note?: string;
  }) => Promise<unknown>;
}

export function LogPaydayModal({
  visible,
  source,
  accounts,
  isSubmitting,
  onClose,
  onSubmit,
}: LogPaydayModalProps) {
  const theme = useTheme();
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dateInput, setDateInput] = useState(() =>
    formatDateInputValue(new Date().toISOString()),
  );
  const [noteInput, setNoteInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !source) {
      return;
    }

    const defaultMinor =
      source.typicalPayoutMinor && source.typicalPayoutMinor > 0
        ? source.typicalPayoutMinor
        : source.expectedMonthlyMinor > 0 && source.paySchedule === 'MONTHLY'
          ? source.expectedMonthlyMinor
          : 0;

    setAmountInput(defaultMinor > 0 ? minorUnitsToDecimalInput(defaultMinor) : '');
    setAccountId(source.accountId);
    setDateInput(formatDateInputValue(new Date().toISOString()));
    setNoteInput('');
    setFormError(null);
  }, [visible, source]);

  if (!source) {
    return null;
  }

  const compatibleAccounts = accounts.filter((a) => a.currency === source.currency);

  const handleConfirm = async () => {
    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setFormError('Please enter a valid positive payday amount.');
      return;
    }

    const todayStr = formatDateInputValue(new Date().toISOString());
    const preserveIso = dateInput.trim() === todayStr ? new Date().toISOString() : undefined;
    const occurredAt = parseDateInputToIso(dateInput, preserveIso);
    if (!occurredAt) {
      setFormError('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    if (!accountId) {
      setFormError('Please select a deposit account.');
      return;
    }

    setFormError(null);
    try {
      await onSubmit({
        sourceId: source.id,
        amountMinor: parsedMinor,
        accountId,
        occurredAt,
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
      });
      onClose();
    } catch (error: unknown) {
      setFormError(getUserErrorMessage(error, 'Could not record payday.'));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <SafeAreaView
        className="flex-1 bg-black/55"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1 justify-center items-center p-4"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss log payday dialog"
            onPress={() => {
              if (!isSubmitting) onClose();
            }}
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
                  Log Payday
                </ThemedText>
                <ThemedText
                  className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                  numberOfLines={1}
                >
                  {source.name}
                </ThemedText>
              </View>

              <Pressable
                onPress={onClose}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <AppIcon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            {formError ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
              >
                <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            <ScrollView
              className="max-h-[420px]"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                {/* Amount */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {`Take-Home Pay (${DEFAULT_CURRENCY_SYMBOL} ${source.currency})`}
                  </ThemedText>
                  <View className="flex-row items-center border border-ledger-border-strong dark:border-ledger-border-strong-dark bg-ledger-subtle dark:bg-ledger-subtle-dark rounded-xl px-4 py-3">
                    <ThemedText className="text-2xl font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                      {DEFAULT_CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      className="flex-1 text-2xl font-bold text-ledger-ink dark:text-ledger-ink-dark p-0"
                      style={TABULAR_NUMS_STYLE}
                      value={amountInput}
                      onChangeText={(t) => {
                        setAmountInput(normalizeDecimalInput(t));
                        if (formError) setFormError(null);
                      }}
                      accessibilityLabel="Payday take-home amount"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                      autoFocus
                      editable={!isSubmitting}
                    />
                  </View>
                </View>

                {/* Date */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Pay Date (YYYY-MM-DD)
                  </ThemedText>
                  <TextInput
                    value={dateInput}
                    onChangeText={(t) => {
                      setDateInput(t);
                      if (formError) setFormError(null);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Payday date in YYYY-MM-DD format"
                    keyboardType="numbers-and-punctuation"
                    style={TABULAR_NUMS_STYLE}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-medium text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>

                {/* Deposit Account */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Deposit To
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {compatibleAccounts.map((acc) => {
                      const isSelected = accountId === acc.id;
                      return (
                        <Pressable
                          key={acc.id}
                          onPress={() => setAccountId(acc.id)}
                          disabled={isSubmitting}
                          accessibilityRole="button"
                          accessibilityLabel={`Deposit into ${acc.name}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            numeric
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {`${acc.name} (${formatMinorUnits(acc.balanceMinor, acc.currency)})`}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Note */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Note (Optional)
                  </ThemedText>
                  <TextInput
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="e.g. 15th cutoff, bonus included"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Payday note"
                    maxLength={280}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="flex-row gap-2.5 pt-1">
              <Pressable
                onPress={onClose}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Cancel
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Record Payday"
                className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85 ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                    Record Payday
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
