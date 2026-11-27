import React, { useState } from 'react';
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
  computeInstallmentProgress,
  formatCalendarDateShort,
  formatCalendarDateString,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  type Account,
  type CreditCardBillSummary,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import { usePayCreditCardBill } from '@/features/transactions/hooks/use-transactions';

export interface CreditCardDebtCardProps {
  summary: CreditCardBillSummary;
  liquidAccounts: readonly Account[];
  onAddInstallment: (cardAccountId: string) => void;
  onEditInstallment: (commitment: RecurringCommitment) => void;
  onDeleteInstallment: (commitmentId: string) => void;
  onBillPaid: (message: string) => void;
}

export function CreditCardDebtCard({
  summary,
  liquidAccounts,
  onAddInstallment,
  onEditInstallment,
  onDeleteInstallment,
  onBillPaid,
}: CreditCardDebtCardProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const payBillMutation = usePayCreditCardBill();

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState(
    liquidAccounts[0]?.id ?? '',
  );
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(() =>
    formatCalendarDateString(new Date()),
  );
  const [payError, setPayError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { account } = summary;
  const currency = account.currency;
  const eligiblePayAccounts = liquidAccounts.filter(
    (a) => a.currency === account.currency,
  );

  const handleOpenPayModal = () => {
    const defaultAmount =
      summary.upcomingBillMinor > 0
        ? summary.upcomingBillMinor
        : summary.totalCardDebtMinor;
    setPaymentAccountId(eligiblePayAccounts[0]?.id ?? '');
    setAmountInput(minorUnitsToDecimalInput(defaultAmount));
    setDateInput(formatCalendarDateString(new Date()));
    setPayError(null);
    setPayModalOpen(true);
  };

  const handleConfirmPayBill = async () => {
    if (!paymentAccountId) {
      setPayError('Select a bank or e-wallet account to pay from.');
      return;
    }

    const parsedMinor = parseDecimalToMinorUnits(amountInput);
    if (parsedMinor === null || parsedMinor <= 0) {
      setPayError('Enter a payment amount greater than 0.');
      return;
    }

    const paidIso = parseDateInputToIso(dateInput);
    if (!paidIso) {
      setPayError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setPayError(null);
    try {
      await payBillMutation.mutateAsync({
        creditCardAccountId: account.id,
        paymentAccountId,
        paidAtIso: paidIso,
        amountOverrideMinor:
          parsedMinor !== summary.swipesOwedMinor + summary.installmentsDueThisPeriodMinor
            ? parsedMinor
            : undefined,
      });
      setPayModalOpen(false);
      onBillPaid(
        summary.isPaydownPlan
          ? `Paid ${account.name} (${formatMinorUnits(parsedMinor, currency)}).`
          : `Paid ${account.name} full bill (${formatMinorUnits(parsedMinor, currency)}).`,
      );
    } catch (error: unknown) {
      setPayError(
        getUserErrorMessage(error, 'Could not pay credit card bill.'),
      );
    }
  };

  const modalWidth = Math.min(Math.max(windowWidth - 32, 280), 520);

  const scheduleText = summary.dueScheduleLabel
    ? summary.dueDate
      ? summary.isPaidForCurrentMonth
        ? `${summary.dueScheduleLabel} · Paid this month · Next due ${formatCalendarDateShort(summary.dueDate)}`
        : `${summary.dueScheduleLabel} · Due ${formatCalendarDateShort(summary.dueDate)}`
      : summary.dueScheduleLabel
    : summary.dueDate
      ? `Due ${formatCalendarDateShort(summary.dueDate)}`
      : 'Due date not set';

  const payButtonLabel =
    summary.totalCardDebtMinor <= 0
      ? `Settled (${formatMinorUnits(0, currency)})`
      : summary.isPaydownPlan
        ? summary.isPaidForCurrentMonth
          ? 'Pay Extra'
          : `Pay ${formatMinorUnits(summary.upcomingBillMinor, currency)}`
        : 'Pay Full Bill';

  const utilizationBarTone =
    (summary.utilizationPercent ?? 0) >= 80
      ? 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark'
      : (summary.utilizationPercent ?? 0) >= 50
        ? 'bg-ledger-ochre dark:bg-ledger-ochre-dark'
        : 'bg-brand-500 dark:bg-brand-400';

  return (
    <>
      <View className="flex-1 justify-between rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-4 gap-3.5">
        <View className="gap-3.5">
          {/* Card Header */}
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 min-w-0 gap-1">
              <View className="flex-row items-center gap-2">
                <AppIcon name="creditCard" size={16} color={theme.info} />
                <ThemedText
                  className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  numberOfLines={1}
                >
                  {account.name}
                </ThemedText>
              </View>
              <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                {scheduleText}
                {summary.isDueBeforeNextPayday ? ' · Due before next payday' : ''}
              </ThemedText>
            </View>

            <View className="items-end shrink-0">
              <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                {summary.isPaydownPlan ? 'Next Payment' : 'Upcoming Bill'}
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className={`text-xl font-extrabold ${
                  summary.upcomingBillMinor > 0
                    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                    : 'text-ledger-pine dark:text-ledger-pine-dark'
                }`}
              >
                {formatMinorUnits(summary.upcomingBillMinor, currency)}
              </ThemedText>
            </View>
          </View>

          {/* Credit Limit & Utilization Bar */}
          {summary.creditLimitMinor !== null ? (
            <View className="gap-1.5">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  Used {formatMinorUnits(summary.totalCardDebtMinor, currency)} /{' '}
                  {formatMinorUnits(summary.creditLimitMinor, currency)} (
                  {summary.utilizationPercent ?? 0}%)
                </ThemedText>
                <ThemedText
                  numeric
                  style={TABULAR_NUMS_STYLE}
                  className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
                >
                  Avail {formatMinorUnits(summary.availableCreditMinor ?? 0, currency)}
                </ThemedText>
              </View>
              <View className="h-2 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark overflow-hidden">
                <View
                  className={`h-full rounded-full ${utilizationBarTone}`}
                  style={{ width: `${summary.utilizationPercent ?? 0}%` }}
                />
              </View>
            </View>
          ) : null}

          {/* Breakdown Pill Box */}
          <View className="p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-1.5">
            {summary.isPaydownPlan ? (
              <>
                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Balance owed
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className="shrink-0 text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(summary.totalCardDebtMinor, currency)}
                  </ThemedText>
                </View>

                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Monthly paydown plan
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className="shrink-0 text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(summary.monthlyPaymentTargetMinor ?? 0, currency)} / mo
                  </ThemedText>
                </View>

                {summary.remainingPaymentsCount !== null &&
                summary.remainingPaymentsCount > 0 ? (
                  <View className="flex-row items-center justify-between gap-2 pt-1.5 border-t border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Estimated payoff
                    </ThemedText>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="shrink-0 text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark"
                    >
                      {summary.remainingPaymentsCount}{' '}
                      {summary.remainingPaymentsCount === 1 ? 'payment' : 'payments'} left
                      {summary.finalPaymentMinor !== null &&
                      summary.finalPaymentMinor !== summary.monthlyPaymentTargetMinor
                        ? ` · final ${formatMinorUnits(summary.finalPaymentMinor, currency)}`
                        : ''}
                    </ThemedText>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Day-to-day swipes owed
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className="shrink-0 text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(summary.swipesOwedMinor, currency)}
                  </ThemedText>
                </View>

                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Monthly installment slices due ({summary.unpaidInstallmentsThisPeriod.length})
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className="shrink-0 text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {formatMinorUnits(summary.installmentsDueThisPeriodMinor, currency)}
                  </ThemedText>
                </View>

                {summary.futureInstallmentsRemainingMinor > 0 ? (
                  <View className="flex-row items-center justify-between gap-2 pt-1.5 border-t border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="flex-1 min-w-0 text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Future installment months remaining
                    </ThemedText>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="shrink-0 text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark"
                    >
                      {formatMinorUnits(summary.futureInstallmentsRemainingMinor, currency)}
                    </ThemedText>
                  </View>
                ) : null}
              </>
            )}
          </View>

        {/* Active Card Installments List */}
        {summary.installments.length > 0 ? (
          <View className="gap-2">
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Card Installments
            </ThemedText>
            {summary.installments.map((inst) => {
              const progress = computeInstallmentProgress(inst);
              const isConfirming = confirmDeleteId === inst.id;
              return (
                <View
                  key={inst.id}
                  className="p-3 rounded-xl bg-ledger-canvas dark:bg-ledger-canvas-dark border border-ledger-border dark:border-ledger-border-dark gap-2"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-1 min-w-0">
                      <ThemedText
                        className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        numberOfLines={1}
                      >
                        {inst.name}
                      </ThemedText>
                      <ThemedText
                        numeric
                        className="text-[11px] text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      >
                        {progress.totalCount > 0
                          ? `${progress.paidCount}/${progress.totalCount} months paid`
                          : 'Ongoing monthly'}
                        {progress.isPaidOff ? ' · Paid Off' : ''}
                      </ThemedText>
                    </View>
                    <ThemedText
                      numeric
                      style={TABULAR_NUMS_STYLE}
                      className="text-xs font-extrabold text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {formatMinorUnits(inst.amountMinor, inst.currency)} / mo
                    </ThemedText>
                  </View>

                  <View className="flex-row justify-end gap-2">
                    {isConfirming ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmDeleteId(null)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel delete installment"
                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setConfirmDeleteId(null);
                            onDeleteInstallment(inst.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm delete installment"
                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-ledger-terracotta dark:bg-ledger-terracotta-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => onEditInstallment(inst)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${inst.name}`}
                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                            Edit
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmDeleteId(inst.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${inst.name}`}
                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                            Delete
                          </ThemedText>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        </View>

        {/* Card Action Footer */}
        <View className="flex-row flex-wrap gap-2 pt-1">
          <Pressable
            onPress={() => onAddInstallment(account.id)}
            accessibilityRole="button"
            accessibilityLabel={`Add installment to ${account.name}`}
            className="flex-1 min-w-[140px] min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
              + Add Installment
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleOpenPayModal}
            disabled={summary.totalCardDebtMinor <= 0 || eligiblePayAccounts.length === 0}
            accessibilityRole="button"
            accessibilityLabel={
              summary.isPaydownPlan
                ? `Pay ${account.name}`
                : `Pay full bill for ${account.name}`
            }
            className={`flex-1 min-w-[150px] min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center ${
              summary.totalCardDebtMinor <= 0 || eligiblePayAccounts.length === 0
                ? 'opacity-45'
                : 'active:opacity-90'
            }`}
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
              {payButtonLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Pay Full Credit Card Bill Modal */}
      <Modal
        visible={payModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!payBillMutation.isPending) setPayModalOpen(false);
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
                if (!payBillMutation.isPending) setPayModalOpen(false);
              }}
              disabled={payBillMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              className="absolute inset-0"
            />

            <View
              style={{ width: modalWidth, maxHeight: '90%' }}
              className="relative z-10 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, gap: 16 }}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <ThemedText
                      accessibilityRole="header"
                      className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {summary.isPaydownPlan
                        ? 'Pay Credit Card'
                        : 'Pay Full Card Bill'}
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {summary.isPaydownPlan
                        ? `${account.name} · reduces your owed card balance`
                        : `${account.name} · settles swipes and this month's installment slices`}
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={() => setPayModalOpen(false)}
                    disabled={payBillMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Close dialog"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                  >
                    <AppIcon name="close" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                {payError ? (
                  <View
                    accessibilityRole="alert"
                    className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                  >
                    <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      {payError}
                    </ThemedText>
                  </View>
                ) : null}

                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Bill Amount ({currency})
                  </ThemedText>
                  <TextInput
                    value={amountInput}
                    onChangeText={(text) => {
                      setAmountInput(normalizeDecimalInput(text));
                      if (payError) setPayError(null);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Credit card bill payment amount"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    editable={!payBillMutation.isPending}
                    style={TABULAR_NUMS_STYLE}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                  />
                </View>

                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Payment Date (YYYY-MM-DD)
                  </ThemedText>
                  <TextInput
                    value={dateInput}
                    onChangeText={setDateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Payment date"
                    editable={!payBillMutation.isPending}
                    style={TABULAR_NUMS_STYLE}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm font-medium"
                  />
                </View>

                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Pay From Salary / Bank Account
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {eligiblePayAccounts.map((acc) => {
                      const isSelected = paymentAccountId === acc.id;
                      return (
                        <Pressable
                          key={acc.id}
                          onPress={() => setPaymentAccountId(acc.id)}
                          disabled={payBillMutation.isPending}
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
                            {acc.name} ({formatMinorUnits(acc.balanceMinor, acc.currency)})
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="flex-row gap-2.5 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                  <Pressable
                    onPress={() => setPayModalOpen(false)}
                    disabled={payBillMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel payment"
                    className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Cancel
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={handleConfirmPayBill}
                    disabled={payBillMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm pay full bill"
                    className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center"
                  >
                    {payBillMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                        {summary.isPaydownPlan ? 'Confirm Payment' : 'Pay Full Bill'}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
