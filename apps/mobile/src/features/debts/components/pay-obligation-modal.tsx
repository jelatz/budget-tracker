import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceNextDueDateByCycles,
  formatCalendarDateShort,
  formatCalendarDateString,
  formatMinorUnits,
  formatPeriodMonthShort,
  getAccountTypeLabel,
  MAX_SAFE_MONEY_MINOR,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  resolveEffectiveCommitmentCycles,
  resolveTargetPeriodForCommitmentPay,
  type Account,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import { usePayRecurringCommitment } from '@/features/transactions/hooks/use-transactions';

export interface PayObligationModalProps {
  visible: boolean;
  commitment: RecurringCommitment | null;
  mode?: 'pay' | 'advance';
  accounts: readonly Account[];
  onClose: () => void;
  onPaid: (message: string) => void;
}

const CYCLE_PRESETS = [1, 2, 3, 6] as const;

export function PayObligationModal({
  visible,
  commitment,
  mode = 'pay',
  accounts,
  onClose,
  onPaid,
}: PayObligationModalProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const modalWidth = Math.min(Math.max(windowWidth - 32, 280), 520);

  const payMutation = usePayRecurringCommitment();

  const [cyclesCount, setCyclesCount] = useState(1);
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(() =>
    formatCalendarDateString(new Date()),
  );
  const [accountId, setAccountId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initializedKeyRef = useRef<string | null>(null);

  const payAccounts = useMemo(
    () =>
      accounts.filter((a) =>
        commitment?.kind === 'CREDIT_CARD_INSTALLMENT'
          ? a.id === commitment.accountId
          : a.accountType !== 'CREDIT_CARD' || a.id === commitment?.accountId,
      ),
    [accounts, commitment],
  );

  useEffect(() => {
    if (!visible || !commitment) {
      initializedKeyRef.current = null;
      return;
    }
    const initKey = `${commitment.id}:${mode}`;
    if (initializedKeyRef.current === initKey) {
      return;
    }
    initializedKeyRef.current = initKey;
    setCyclesCount(1);
    setAmountInput(minorUnitsToDecimalInput(commitment.amountMinor));
    setDateInput(formatCalendarDateString(new Date()));
    const fallbackAccount =
      payAccounts.find((a) => a.id === commitment.accountId)?.id ??
      payAccounts[0]?.id ??
      commitment.accountId;
    setAccountId(fallbackAccount);
    setErrorMsg(null);
  }, [visible, commitment, mode, payAccounts]);

  if (!commitment) {
    return null;
  }

  const isVariableBill = commitment.kind === 'BILL';
  const remainingTerms =
    typeof commitment.totalInstallments === 'number' &&
    commitment.totalInstallments > 0
      ? Math.max(0, commitment.totalInstallments - commitment.paidInstallments)
      : null;
  const maxCycles = remainingTerms !== null ? Math.max(1, remainingTerms) : 120;
  const effectiveCycles = Math.min(cyclesCount, maxCycles);
  const isAdvanceMode = mode === 'advance' || effectiveCycles > 1;
  const cyclePresets = CYCLE_PRESETS.filter((n) => n <= maxCycles);

  const parsedDateIso = parseDateInputToIso(dateInput);
  const basePeriod = formatCalendarDateString(
    parsedDateIso ? new Date(parsedDateIso) : new Date(),
  ).slice(0, 7);
  const resolvedEffective = Math.max(
    1,
    resolveEffectiveCommitmentCycles(commitment, effectiveCycles),
  );
  const targetPeriod = resolveTargetPeriodForCommitmentPay(
    commitment,
    basePeriod,
    resolvedEffective,
  );
  const willPayOff =
    remainingTerms !== null && resolvedEffective >= remainingTerms;
  const previewNextDue =
    commitment.nextDueDate && !willPayOff
      ? advanceNextDueDateByCycles(
          commitment.nextDueDate,
          commitment.frequency,
          resolvedEffective,
          commitment.dueDay,
        )
      : null;

  const handleSelectCycles = (nextCount: number) => {
    const clamped = Math.max(1, Math.min(maxCycles, Math.trunc(nextCount)));
    setCyclesCount(clamped);
    setAmountInput(
      minorUnitsToDecimalInput(
        Math.min(MAX_SAFE_MONEY_MINOR, commitment.amountMinor * clamped),
      ),
    );
    if (errorMsg) setErrorMsg(null);
  };

  const parsedInputMinor = parseDecimalToMinorUnits(amountInput);
  const expectedMultiMinor = Math.min(
    MAX_SAFE_MONEY_MINOR,
    commitment.amountMinor * effectiveCycles,
  );
  const showPerCycleEquivalent =
    effectiveCycles > 1 &&
    parsedInputMinor !== null &&
    parsedInputMinor > 0 &&
    parsedInputMinor !== expectedMultiMinor;

  const handleConfirm = async () => {
    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setErrorMsg('Please enter an amount greater than 0.');
      return;
    }

    const paidIso = parseDateInputToIso(dateInput);
    if (!paidIso) {
      setErrorMsg('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    const expectedDefaultMinor = commitment.amountMinor * effectiveCycles;
    setErrorMsg(null);
    try {
      await payMutation.mutateAsync({
        commitmentId: commitment.id,
        paidAtIso: paidIso,
        accountId: accountId || commitment.accountId,
        cyclesCount: effectiveCycles,
        isAdvancePayment: isAdvanceMode,
        actualAmountMinor:
          parsedMinor !== expectedDefaultMinor ? parsedMinor : undefined,
      });
      onPaid(
        isAdvanceMode
          ? `Advance paid ${commitment.name} (${effectiveCycles} ${
              effectiveCycles === 1 ? 'cycle' : 'cycles'
            } · ${formatMinorUnits(parsedMinor, commitment.currency)}).`
          : `Paid ${commitment.name} (${formatMinorUnits(
              parsedMinor,
              commitment.currency,
            )}).`,
      );
      onClose();
    } catch (error: unknown) {
      setErrorMsg(
        getUserErrorMessage(error, 'Could not record payment. Please try again.'),
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!payMutation.isPending) onClose();
      }}
    >
      <SafeAreaView
        className="flex-1 bg-black/50"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={() => {
              if (!payMutation.isPending) onClose();
            }}
            disabled={payMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Close payment dialog"
            className="absolute inset-0"
          />

          <View
            style={{ width: modalWidth, maxHeight: '90%' }}
            className="relative z-10 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: isWide ? 24 : 20,
                gap: 16,
              }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {mode === 'advance' ? 'Advance Pay' : 'Record Payment'}
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {commitment.name}
                    {mode === 'advance' ? ' · Pay upcoming cycle(s) ahead' : ''}
                  </ThemedText>
                </View>

                <Pressable
                  onPress={onClose}
                  disabled={payMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              {errorMsg ? (
                <View
                  accessibilityRole="alert"
                  className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    {errorMsg}
                  </ThemedText>
                </View>
              ) : null}

              {/* Cycles / Months Selector */}
              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {mode === 'advance'
                      ? 'Cycles to Advance Pay'
                      : 'Cycles / Months to Pay'}
                  </ThemedText>
                  {remainingTerms !== null ? (
                    <ThemedText
                      numeric
                      className="text-[11px] font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {remainingTerms} left
                    </ThemedText>
                  ) : null}
                </View>

                <View className="flex-row flex-wrap items-center gap-2">
                  {cyclePresets.map((preset) => {
                    const isSelected = effectiveCycles === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => handleSelectCycles(preset)}
                        disabled={payMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Pay ${preset} ${preset === 1 ? 'month' : 'months'}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                        }`}
                      >
                        <ThemedText
                          numeric
                          className={`text-xs font-bold ${
                            isSelected
                              ? 'text-brand-500 dark:text-brand-400'
                              : 'text-ledger-ink dark:text-ledger-ink-dark'
                          }`}
                        >
                          {preset === 1 ? '1 mo' : `${preset} mos`}
                        </ThemedText>
                      </Pressable>
                    );
                  })}

                  {remainingTerms !== null && remainingTerms > 1 ? (
                    <Pressable
                      onPress={() => handleSelectCycles(remainingTerms)}
                      disabled={payMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay off all ${remainingTerms} remaining months`}
                      accessibilityState={{
                        selected: effectiveCycles === remainingTerms,
                      }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                        effectiveCycles === remainingTerms
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        numeric
                        className={`text-xs font-bold ${
                          effectiveCycles === remainingTerms
                            ? 'text-brand-500 dark:text-brand-400'
                            : 'text-ledger-ink dark:text-ledger-ink-dark'
                        }`}
                      >
                        Pay Off All ({remainingTerms})
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  <View className="flex-row items-center gap-1 ml-auto">
                    <Pressable
                      onPress={() => handleSelectCycles(effectiveCycles - 1)}
                      disabled={payMutation.isPending || effectiveCycles <= 1}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease cycles"
                      className={`min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center ${
                        effectiveCycles <= 1 ? 'opacity-40' : 'active:opacity-75'
                      }`}
                    >
                      <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        -
                      </ThemedText>
                    </Pressable>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="min-w-[28px] text-center text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {effectiveCycles}
                    </ThemedText>
                    <Pressable
                      onPress={() => handleSelectCycles(effectiveCycles + 1)}
                      disabled={payMutation.isPending || effectiveCycles >= maxCycles}
                      accessibilityRole="button"
                      accessibilityLabel="Increase cycles"
                      className={`min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center ${
                        effectiveCycles >= maxCycles
                          ? 'opacity-40'
                          : 'active:opacity-75'
                      }`}
                    >
                      <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        +
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                <View className="px-3 py-2 rounded-xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark">
                  <ThemedText className="text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                    {willPayOff && commitment.totalInstallments
                      ? `Pays off all ${remainingTerms} remaining months (${commitment.totalInstallments}/${commitment.totalInstallments} paid)`
                      : `Covers through ${formatPeriodMonthShort(targetPeriod)}${
                          previewNextDue
                            ? ` · Next due ${formatCalendarDateShort(previewNextDue)}`
                            : ''
                        }`}
                  </ThemedText>
                </View>
              </View>

              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  {isVariableBill && effectiveCycles === 1
                    ? `Actual Bill Amount (${commitment.currency})`
                    : `Payment Amount (${commitment.currency})`}
                </ThemedText>
                <TextInput
                  value={amountInput}
                  onChangeText={(text) => {
                    setAmountInput(normalizeDecimalInput(text));
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel="Actual payment amount"
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  editable={!payMutation.isPending}
                  style={TABULAR_NUMS_STYLE}
                  className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                />
                {isVariableBill ? (
                  <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {effectiveCycles === 1
                      ? `Estimated baseline: ${formatMinorUnits(commitment.amountMinor, commitment.currency)}. Changing this amount logs today's exact bill without changing your monthly estimate.`
                      : `Estimated total: ${formatMinorUnits(expectedMultiMinor, commitment.currency)} (${formatMinorUnits(commitment.amountMinor, commitment.currency)} × ${effectiveCycles} mos). Edit the total if your advance bill differs — your monthly estimate stays unchanged.`}
                  </ThemedText>
                ) : null}
                {showPerCycleEquivalent && parsedInputMinor !== null ? (
                  <ThemedText
                    numeric
                    className="text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark"
                  >
                    ≈{' '}
                    {formatMinorUnits(
                      Math.round(parsedInputMinor / effectiveCycles),
                      commitment.currency,
                    )}{' '}
                    / cycle
                  </ThemedText>
                ) : null}
              </View>

              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Payment Date (YYYY-MM-DD)
                </ThemedText>
                <TextInput
                  value={dateInput}
                  onChangeText={(text) => {
                    setDateInput(text);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel="Payment date"
                  keyboardType="numbers-and-punctuation"
                  editable={!payMutation.isPending}
                  style={TABULAR_NUMS_STYLE}
                  className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm font-medium"
                />
              </View>

              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Pay From Account
                </ThemedText>
                <View className="flex-row flex-wrap gap-2">
                  {payAccounts.map((acc) => {
                    const isSelected = accountId === acc.id;
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => setAccountId(acc.id)}
                        disabled={payMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Pay from ${acc.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border justify-center ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-semibold ${
                            isSelected
                              ? 'text-brand-500 dark:text-brand-400'
                              : 'text-ledger-ink dark:text-ledger-ink-dark'
                          }`}
                        >
                          {acc.name} · {getAccountTypeLabel(acc.accountType)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="flex-row gap-2.5 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                <Pressable
                  onPress={onClose}
                  disabled={payMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel payment"
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                    Cancel
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={handleConfirm}
                  disabled={payMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isAdvanceMode ? 'Confirm Advance Payment' : 'Confirm Payment'
                  }
                  className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center ${
                    payMutation.isPending ? 'opacity-70' : ''
                  }`}
                >
                  {payMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.onPrimary} />
                  ) : (
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      {isAdvanceMode
                        ? `Advance Pay (${effectiveCycles})`
                        : 'Confirm Payment'}
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
