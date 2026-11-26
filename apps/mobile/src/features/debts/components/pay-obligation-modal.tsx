import React, { useEffect, useState } from 'react';
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
  formatCalendarDateString,
  formatMinorUnits,
  getAccountTypeLabel,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
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
  accounts: readonly Account[];
  onClose: () => void;
  onPaid: (message: string) => void;
}

export function PayObligationModal({
  visible,
  commitment,
  accounts,
  onClose,
  onPaid,
}: PayObligationModalProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const modalWidth = Math.min(Math.max(windowWidth - 32, 280), 520);

  const payMutation = usePayRecurringCommitment();

  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(() =>
    formatCalendarDateString(new Date()),
  );
  const [accountId, setAccountId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const payAccounts = accounts.filter((a) =>
    commitment?.kind === 'CREDIT_CARD_INSTALLMENT'
      ? a.id === commitment.accountId
      : a.accountType !== 'CREDIT_CARD' || a.id === commitment?.accountId,
  );

  useEffect(() => {
    if (!visible || !commitment) {
      return;
    }
    setAmountInput(minorUnitsToDecimalInput(commitment.amountMinor));
    setDateInput(formatCalendarDateString(new Date()));
    const fallbackAccount =
      payAccounts.find((a) => a.id === commitment.accountId)?.id ??
      payAccounts[0]?.id ??
      commitment.accountId;
    setAccountId(fallbackAccount);
    setErrorMsg(null);
  }, [visible, commitment, payAccounts]);

  if (!commitment) {
    return null;
  }

  const isVariableBill = commitment.kind === 'BILL';

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

    setErrorMsg(null);
    try {
      await payMutation.mutateAsync({
        commitmentId: commitment.id,
        paidAtIso: paidIso,
        accountId: accountId || commitment.accountId,
        actualAmountMinor:
          parsedMinor !== commitment.amountMinor ? parsedMinor : undefined,
      });
      onPaid(
        `Paid ${commitment.name} (${formatMinorUnits(
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
                    Record Payment
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {commitment.name}
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

              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  {isVariableBill
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
                    Estimated baseline:{' '}
                    {formatMinorUnits(commitment.amountMinor, commitment.currency)}.
                    Changing this amount logs today&apos;s exact bill without changing
                    your monthly estimate.
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
                  accessibilityLabel="Confirm Payment"
                  className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center ${
                    payMutation.isPending ? 'opacity-70' : ''
                  }`}
                >
                  {payMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.onPrimary} />
                  ) : (
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      Confirm Payment
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
