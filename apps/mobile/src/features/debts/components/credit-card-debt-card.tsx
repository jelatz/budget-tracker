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
  formatPeriodMonthShort,
  getCommitmentDueStatus,
  isCommitmentPaidOff,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  resolveCreditCardDueDateForAccount,
  resolveTargetPeriodForCreditCardAdvance,
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
  isUnpaying?: boolean;
  isUnpayingBill?: boolean;
  onAddInstallment: (cardAccountId: string) => void;
  onPayInstallment: (
    commitment: RecurringCommitment,
    mode: 'pay' | 'advance',
  ) => void;
  onEditInstallment: (commitment: RecurringCommitment) => void;
  onDeleteInstallment: (commitmentId: string) => void;
  onUnpayInstallment: (commitment: RecurringCommitment) => void;
  onUnpayBill: (account: Account) => void;
  onBillPaid: (message: string) => void;
}

const CARD_MONTH_PRESETS = [1, 2, 3, 6] as const;

export function CreditCardDebtCard({
  summary,
  liquidAccounts,
  isUnpaying = false,
  isUnpayingBill = false,
  onAddInstallment,
  onPayInstallment,
  onEditInstallment,
  onDeleteInstallment,
  onUnpayInstallment,
  onUnpayBill,
  onBillPaid,
}: CreditCardDebtCardProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const payBillMutation = usePayCreditCardBill();

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState(
    liquidAccounts[0]?.id ?? '',
  );
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [isPayOffFull, setIsPayOffFull] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(() =>
    formatCalendarDateString(new Date()),
  );
  const [payError, setPayError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [confirmUndoCard, setConfirmUndoCard] = useState(false);
  const currentPeriod = formatCalendarDateString(new Date()).slice(0, 7);

  const { account } = summary;
  const currency = account.currency;
  const eligiblePayAccounts = liquidAccounts.filter(
    (a) => a.currency === account.currency,
  );
  const canUndoLastCardPayment = Boolean(
    account.lastPaymentTransactionId ||
      account.lastPaymentInstallmentTxPrefix ||
      account.paidThroughPeriod,
  );
  const maxMonths =
    summary.isPaydownPlan &&
    summary.remainingPaymentsCount !== null &&
    summary.remainingPaymentsCount > 0
      ? summary.remainingPaymentsCount
      : 120;
  const monthPresets = CARD_MONTH_PRESETS.filter((n) => n <= maxMonths);

  const isAdvanceCardMode =
    summary.totalCardDebtMinor > 0 &&
    (summary.isPaidForCurrentMonth ||
      summary.isPaidAhead ||
      summary.upcomingBillMinor === 0 ||
      Boolean(summary.dueDate && summary.dueDate.slice(0, 7) > currentPeriod));

  const computeSuggestedAmountMinor = (months: number, fullPayoff: boolean): number => {
    if (fullPayoff) {
      return summary.totalCardDebtMinor;
    }
    if (summary.isPaydownPlan && summary.monthlyPaymentTargetMinor) {
      if (!isAdvanceCardMode && summary.upcomingBillMinor > 0) {
        return Math.min(
          summary.totalCardDebtMinor,
          summary.upcomingBillMinor +
            summary.monthlyPaymentTargetMinor * Math.max(0, months - 1),
        );
      }
      return Math.min(
        summary.totalCardDebtMinor,
        summary.monthlyPaymentTargetMinor * months,
      );
    }
    const instMinor = summary.installments
      .filter((c) => c.isActive && !isCommitmentPaidOff(c))
      .reduce((sum, c) => {
        const remaining =
          typeof c.totalInstallments === 'number' && c.totalInstallments > 0
            ? Math.max(0, c.totalInstallments - c.paidInstallments)
            : months;
        const cycles =
          isAdvanceCardMode || months > 1
            ? Math.min(months, remaining)
            : c.lastPaidPeriod && c.lastPaidPeriod >= currentPeriod
              ? 0
              : Math.min(1, remaining);
        return sum + c.amountMinor * cycles;
      }, 0);
    return Math.min(summary.totalCardDebtMinor, summary.swipesOwedMinor + instMinor);
  };

  const handleOpenPayModal = () => {
    const defaultAmount =
      !isAdvanceCardMode && summary.upcomingBillMinor > 0
        ? summary.upcomingBillMinor
        : computeSuggestedAmountMinor(1, false) || summary.totalCardDebtMinor;
    setPaymentAccountId(eligiblePayAccounts[0]?.id ?? '');
    setAdvanceMonths(1);
    setIsPayOffFull(false);
    setAmountInput(minorUnitsToDecimalInput(defaultAmount));
    setDateInput(formatCalendarDateString(new Date()));
    setPayError(null);
    setPayModalOpen(true);
  };

  const handleSelectMonths = (nextMonths: number) => {
    const clamped = Math.max(1, Math.min(maxMonths, Math.trunc(nextMonths)));
    setIsPayOffFull(false);
    setAdvanceMonths(clamped);
    const suggested =
      computeSuggestedAmountMinor(clamped, false) || summary.totalCardDebtMinor;
    setAmountInput(minorUnitsToDecimalInput(suggested));
    if (payError) setPayError(null);
  };

  const handleSelectPayOffFull = () => {
    setIsPayOffFull(true);
    setAmountInput(minorUnitsToDecimalInput(summary.totalCardDebtMinor));
    if (payError) setPayError(null);
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

    const activeInstallments = summary.installments.filter(
      (c) => c.isActive && !isCommitmentPaidOff(c),
    );
    const payOffMonths =
      activeInstallments.length > 0
        ? Math.max(
            1,
            ...activeInstallments.map((c) =>
              typeof c.totalInstallments === 'number' && c.totalInstallments > 0
                ? Math.max(1, c.totalInstallments - c.paidInstallments)
                : 1,
            ),
          )
        : undefined;

    const effectiveAdvanceMonths = isPayOffFull
      ? payOffMonths
      : isAdvanceCardMode || advanceMonths > 1
        ? advanceMonths
        : undefined;

    const shouldOverrideAmount =
      isPayOffFull ||
      summary.isPaydownPlan ||
      effectiveAdvanceMonths !== undefined ||
      parsedMinor !==
        summary.swipesOwedMinor + summary.installmentsDueThisPeriodMinor;

    setPayError(null);
    try {
      await payBillMutation.mutateAsync({
        creditCardAccountId: account.id,
        paymentAccountId,
        paidAtIso: paidIso,
        amountOverrideMinor: shouldOverrideAmount ? parsedMinor : undefined,
        ...(effectiveAdvanceMonths !== undefined
          ? { advanceMonths: effectiveAdvanceMonths }
          : {}),
      });
      setPayModalOpen(false);
      onBillPaid(
        isPayOffFull
          ? `Paid off ${account.name} (${formatMinorUnits(parsedMinor, currency)}).`
          : effectiveAdvanceMonths !== undefined
            ? `Advance paid ${account.name} (${effectiveAdvanceMonths} ${
                effectiveAdvanceMonths === 1 ? 'month' : 'months'
              } · ${formatMinorUnits(parsedMinor, currency)}).`
            : summary.isPaydownPlan
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

  const parsedModalDateIso = parseDateInputToIso(dateInput);
  const modalRefDate = parsedModalDateIso ? new Date(parsedModalDateIso) : new Date();
  const modalBasePeriod = formatCalendarDateString(modalRefDate).slice(0, 7);
  const previewPaidThrough = !isPayOffFull
    ? resolveTargetPeriodForCreditCardAdvance({
        account,
        upcomingBillMinor: summary.upcomingBillMinor,
        isPaidForCurrentMonth: summary.isPaidForCurrentMonth,
        basePeriodMonth: modalBasePeriod,
        advanceMonths,
        referenceDate: modalRefDate,
      })
    : null;
  const previewNextDueDate =
    !isPayOffFull && previewPaidThrough
      ? resolveCreditCardDueDateForAccount(
          { ...account, paidThroughPeriod: previewPaidThrough },
          {
            upcomingBillMinor: summary.upcomingBillMinor,
            isPaidForCurrentMonth: true,
            referenceDate: modalRefDate,
          },
        )
      : null;

  const scheduleText = summary.dueScheduleLabel
    ? summary.dueDate
      ? summary.isPaidAhead && summary.paidThroughPeriod
        ? `${summary.dueScheduleLabel} · Paid thru ${formatPeriodMonthShort(summary.paidThroughPeriod)} · Next due ${formatCalendarDateShort(summary.dueDate)}`
        : summary.isPaidForCurrentMonth
          ? `${summary.dueScheduleLabel} · Paid this month · Next due ${formatCalendarDateShort(summary.dueDate)}`
          : `${summary.dueScheduleLabel} · Due ${formatCalendarDateShort(summary.dueDate)}`
      : summary.dueScheduleLabel
    : summary.dueDate
      ? summary.isPaidAhead && summary.paidThroughPeriod
        ? `Paid thru ${formatPeriodMonthShort(summary.paidThroughPeriod)} · Next due ${formatCalendarDateShort(summary.dueDate)}`
        : `Due ${formatCalendarDateShort(summary.dueDate)}`
      : summary.isPaidAhead && summary.paidThroughPeriod
        ? `Paid thru ${formatPeriodMonthShort(summary.paidThroughPeriod)}`
        : 'Due date not set';

  const payButtonLabel =
    summary.totalCardDebtMinor <= 0
      ? `Settled (${formatMinorUnits(0, currency)})`
      : isAdvanceCardMode
        ? 'Advance Pay'
        : summary.isPaydownPlan
          ? `Pay ${formatMinorUnits(summary.upcomingBillMinor, currency)}`
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
              const instStatus = getCommitmentDueStatus(inst);
              const isPaidThisMonth = instStatus.isPaid;
              const canUndoPaid =
                (isPaidThisMonth || progress.isPaidOff) &&
                Boolean(inst.lastPaidPeriod || inst.lastPaidTransactionId);
              const canPayOrAdvance = !progress.isPaidOff;
              const isAdvanceInst =
                instStatus.isPaid || instStatus.state === 'FUTURE_MONTH';
              const isConfirming = confirmDeleteId === inst.id;
              const isConfirmingUndo = confirmUndoId === inst.id;
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
                        {progress.isPaidOff
                          ? ' · Paid Off'
                          : instStatus.isPaidAhead && instStatus.paidThroughPeriod
                            ? ` · Paid thru ${formatPeriodMonthShort(instStatus.paidThroughPeriod)}`
                            : isPaidThisMonth
                              ? ' · Paid this month'
                              : ''}
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

                  <View className="flex-row flex-wrap justify-end gap-2">
                    {isConfirmingUndo ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmUndoId(null)}
                          disabled={isUnpaying}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel undo installment payment"
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setConfirmUndoId(null);
                            onUnpayInstallment(inst);
                          }}
                          disabled={isUnpaying}
                          accessibilityRole="button"
                          accessibilityLabel={`Confirm undo payment for ${inst.name}`}
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-ochre dark:bg-ledger-ochre-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm Undo
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : isConfirming ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmDeleteId(null)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel delete installment"
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
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
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-terracotta dark:bg-ledger-terracotta-dark justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        {canPayOrAdvance ? (
                          <Pressable
                            onPress={() =>
                              onPayInstallment(
                                inst,
                                isAdvanceInst ? 'advance' : 'pay',
                              )
                            }
                            accessibilityRole="button"
                            accessibilityLabel={
                              isAdvanceInst
                                ? `Advance pay ${inst.name}`
                                : `Pay ${inst.name}`
                            }
                            className={`min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg justify-center ${
                              isAdvanceInst
                                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-500 dark:border-brand-400'
                                : 'bg-brand-500 dark:bg-brand-400'
                            }`}
                          >
                            <ThemedText
                              className={`text-xs font-bold ${
                                isAdvanceInst
                                  ? 'text-brand-500 dark:text-brand-400'
                                  : 'text-ledger-canvas dark:text-brand-900'
                              }`}
                            >
                              {isAdvanceInst ? 'Advance Pay' : 'Pay'}
                            </ThemedText>
                          </Pressable>
                        ) : null}
                        {canUndoPaid ? (
                          <Pressable
                            onPress={() => {
                              setConfirmDeleteId(null);
                              setConfirmUndoId(inst.id);
                            }}
                            disabled={isUnpaying}
                            accessibilityRole="button"
                            accessibilityLabel={`Undo payment for ${inst.name}`}
                            className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                          >
                            <AppIcon name="undo" size={13} color={theme.warning} />
                            <ThemedText className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark">
                              Undo Paid
                            </ThemedText>
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => onEditInstallment(inst)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${inst.name}`}
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                            Edit
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setConfirmUndoId(null);
                            setConfirmDeleteId(inst.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${inst.name}`}
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark justify-center"
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
          {confirmUndoCard ? (
            <>
              <Pressable
                onPress={() => setConfirmUndoCard(false)}
                disabled={isUnpayingBill}
                accessibilityRole="button"
                accessibilityLabel="Cancel undo credit card payment"
                className="flex-1 min-w-[120px] min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmUndoCard(false);
                  onUnpayBill(account);
                }}
                disabled={isUnpayingBill}
                accessibilityRole="button"
                accessibilityLabel={`Confirm undo payment for ${account.name}`}
                className="flex-1 min-w-[140px] min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-ochre dark:bg-ledger-ochre-dark items-center justify-center active:opacity-85"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Confirm Undo
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
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

              {canUndoLastCardPayment ? (
                <Pressable
                  onPress={() => setConfirmUndoCard(true)}
                  disabled={isUnpayingBill}
                  accessibilityRole="button"
                  accessibilityLabel={`Undo last payment for ${account.name}`}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                >
                  <AppIcon name="undo" size={14} color={theme.warning} />
                  <ThemedText className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark">
                    Undo Paid
                  </ThemedText>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleOpenPayModal}
                disabled={summary.totalCardDebtMinor <= 0 || eligiblePayAccounts.length === 0}
                accessibilityRole="button"
                accessibilityLabel={
                  isAdvanceCardMode
                    ? `Advance pay ${account.name}`
                    : summary.isPaydownPlan
                      ? `Pay ${account.name}`
                      : `Pay full bill for ${account.name}`
                }
                className={`flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center ${
                  summary.totalCardDebtMinor <= 0 || eligiblePayAccounts.length === 0
                    ? 'opacity-45'
                    : 'active:opacity-90'
                }`}
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                  {payButtonLabel}
                </ThemedText>
              </Pressable>
            </>
          )}
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
                      {isAdvanceCardMode
                        ? 'Advance Pay Credit Card'
                        : summary.isPaydownPlan
                          ? 'Pay Credit Card'
                          : 'Pay Full Card Bill'}
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {isAdvanceCardMode
                        ? `${account.name} · covers upcoming month(s) and reduces balance`
                        : summary.isPaydownPlan
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

                {/* Months to Cover / Advance Pay Selector */}
                <View className="gap-2">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Months to Cover / Advance Pay
                  </ThemedText>

                  <View className="flex-row flex-wrap items-center gap-2">
                    {monthPresets.map((preset) => {
                      const isSelected = !isPayOffFull && advanceMonths === preset;
                      return (
                        <Pressable
                          key={preset}
                          onPress={() => handleSelectMonths(preset)}
                          disabled={payBillMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Cover ${preset} ${preset === 1 ? 'month' : 'months'}`}
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

                    <Pressable
                      onPress={handleSelectPayOffFull}
                      disabled={payBillMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Pay off full card balance"
                      accessibilityState={{ selected: isPayOffFull }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                        isPayOffFull
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          isPayOffFull
                            ? 'text-brand-500 dark:text-brand-400'
                            : 'text-ledger-ink dark:text-ledger-ink-dark'
                        }`}
                      >
                        Pay Off Full
                      </ThemedText>
                    </Pressable>

                    <View className="flex-row items-center gap-1 ml-auto">
                      <Pressable
                        onPress={() => handleSelectMonths(advanceMonths - 1)}
                        disabled={payBillMutation.isPending || advanceMonths <= 1}
                        accessibilityRole="button"
                        accessibilityLabel="Decrease advance months"
                        className={`min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center ${
                          advanceMonths <= 1 ? 'opacity-40' : 'active:opacity-75'
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
                        {advanceMonths}
                      </ThemedText>
                      <Pressable
                        onPress={() => handleSelectMonths(advanceMonths + 1)}
                        disabled={payBillMutation.isPending || advanceMonths >= maxMonths}
                        accessibilityRole="button"
                        accessibilityLabel="Increase advance months"
                        className={`min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center ${
                          advanceMonths >= maxMonths ? 'opacity-40' : 'active:opacity-75'
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
                      {isPayOffFull
                        ? `Settles full card balance (${formatMinorUnits(summary.totalCardDebtMinor, currency)})`
                        : previewPaidThrough
                          ? `Covers through ${formatPeriodMonthShort(previewPaidThrough)}${
                              previewNextDueDate
                                ? ` · Next due ${formatCalendarDateShort(previewNextDueDate)}`
                                : ''
                            }`
                          : 'Applies payment directly to your card balance'}
                    </ThemedText>
                  </View>
                </View>

                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {isPayOffFull
                      ? `Payoff Amount (${currency})`
                      : isAdvanceCardMode || advanceMonths > 1
                        ? `Advance Payment Amount (${currency})`
                        : `Bill Amount (${currency})`}
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
                  {(() => {
                    const parsedModalAmount = parseDecimalToMinorUnits(amountInput);
                    const suggestedModalAmount = computeSuggestedAmountMinor(
                      advanceMonths,
                      false,
                    );
                    if (
                      !isPayOffFull &&
                      advanceMonths > 1 &&
                      parsedModalAmount !== null &&
                      parsedModalAmount > 0 &&
                      parsedModalAmount !== suggestedModalAmount
                    ) {
                      return (
                        <ThemedText
                          numeric
                          className="text-xs font-semibold text-ledger-teal dark:text-ledger-teal-dark"
                        >
                          ≈{' '}
                          {formatMinorUnits(
                            Math.round(parsedModalAmount / advanceMonths),
                            currency,
                          )}{' '}
                          / mo
                        </ThemedText>
                      );
                    }
                    return null;
                  })()}
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
                    accessibilityLabel={
                      isPayOffFull
                        ? 'Confirm pay off full card balance'
                        : isAdvanceCardMode || advanceMonths > 1
                          ? 'Confirm advance card payment'
                          : 'Confirm pay card bill'
                    }
                    className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center"
                  >
                    {payBillMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                        {isPayOffFull
                          ? 'Pay Off Full'
                          : isAdvanceCardMode || advanceMonths > 1
                            ? `Advance Pay (${advanceMonths})`
                            : summary.isPaydownPlan
                              ? 'Confirm Payment'
                              : 'Pay Full Bill'}
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
